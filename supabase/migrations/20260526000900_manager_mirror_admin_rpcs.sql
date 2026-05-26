-- 관리자 웹: 팀장앱 화면 미러링 (보기 전용)
--   기존 팀장 self RPC(auth.uid() 기준)를 p_manager_id 파라미터 버전으로 복제.
--   권한 체크는 호출하는 서버 API(isAdminEmail)가 담당하며,
--   이 함수들은 service_role 에만 grant → 팀장/작업자 세션으로는 직접 호출 불가.

-- ============================================================
-- 1) get_me — 선택한 팀장의 본인 정보 + 연결 worker + 배정 현장
-- ============================================================
create or replace function yeseong_admin_manager_get_me(p_manager_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if p_manager_id is null then
    raise exception 'manager id required';
  end if;

  select jsonb_build_object(
    'manager', jsonb_build_object(
      'id', m.id,
      'name', m.name,
      'phone', m.phone
    ),
    'worker', (
      select jsonb_build_object(
        'id', w.id,
        'name', w.name,
        'phone', w.phone,
        'default_trade', w.default_trade,
        'default_wage', w.default_wage,
        'default_worksite_id', w.default_worksite_id,
        'bank_name', w.bank_name,
        'account_number', w.account_number,
        'account_holder', w.account_holder,
        'address', w.address
      )
      from yeseong_workers w
      where w.phone = m.phone
      limit 1
    ),
    'worksites', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name) order by w.name)
        from yeseong_site_manager_assignments a
        join yeseong_worksites w on w.id = a.worksite_id
       where a.site_manager_id = m.id
    ), '[]'::jsonb)
  ) into result
  from yeseong_site_managers m
  where m.id = p_manager_id;

  return result;
end $$;

-- ============================================================
-- 2) list_pending_attendance — 선택한 팀장에게 올라온 승인 대기 출역
-- ============================================================
create or replace function yeseong_admin_manager_list_pending_attendance(p_manager_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if p_manager_id is null then
    raise exception 'manager id required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'attendance_id', a.id,
    'work_date', a.work_date,
    'hours', a.hours,
    'source', a.source,
    'worker_name', w.name,
    'worker_phone', w.phone,
    'worksite_id', ws.id,
    'worksite_name', ws.name,
    'subcontractor_name', sc.name,
    'created_at', a.created_at
  ) order by a.work_date desc, a.created_at desc), '[]'::jsonb)
  into result
  from yeseong_attendance a
  join yeseong_payroll_workers pw on pw.id = a.payroll_worker_id
  join yeseong_workers w on w.id = pw.worker_id
  join yeseong_worksites ws on ws.id = a.worksite_id
  left join yeseong_subcontractors sc on sc.id = a.subcontractor_id
  where a.approval_status = 'pending'
    and w.team_leader_id = p_manager_id;

  return result;
end $$;

-- ============================================================
-- 3) list_team_members — 선택한 팀장의 팀원 목록 (본인 제외)
-- ============================================================
create or replace function yeseong_admin_manager_list_team_members(p_manager_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_phone text;
  result jsonb;
begin
  if p_manager_id is null then
    raise exception 'manager id required';
  end if;

  select phone into v_phone
    from yeseong_site_managers
   where id = p_manager_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id,
    'name', w.name,
    'phone', w.phone,
    'default_trade', w.default_trade
  ) order by w.name), '[]'::jsonb) into result
    from yeseong_workers w
   where w.team_leader_id = p_manager_id
     and coalesce(w.is_active, true) = true
     and (v_phone is null or w.phone is distinct from v_phone);

  return result;
end $$;

-- ============================================================
-- 4) get_volumes — 선택한 팀장(=작업자) 본인의 매사 성과
--    worker resolve: manager.phone → worker (팀장도 작업자)
-- ============================================================
create or replace function yeseong_admin_manager_get_volumes(p_manager_id uuid, p_year_month text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
  v_worker record;
  v_form_type text;
  v_target text;
  v_target_last date;
  v_input_start date;
  v_input_end date;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_is_open boolean := false;
  v_period_id uuid;
  v_slot_id uuid;
  v_existing jsonb := '[]'::jsonb;
  v_prices jsonb := '[]'::jsonb;
  v_filter_category text;
begin
  if p_manager_id is null then
    raise exception 'manager id required';
  end if;

  select w.id into v_worker_id
    from yeseong_workers w
    join yeseong_site_managers m on m.phone = w.phone
   where m.id = p_manager_id
     and m.phone is not null
   limit 1;

  if v_worker_id is null then
    return jsonb_build_object('form_type', 'no_worker_link');
  end if;

  select id, name, wage_type, default_trade, default_worksite_id, is_active
    into v_worker
    from yeseong_workers
   where id = v_worker_id;

  if v_worker.is_active = false then
    return jsonb_build_object('form_type', 'no_worker_link', 'archived', true);
  end if;

  if v_worker.wage_type is distinct from '월급/일급' then
    v_form_type := 'not_eligible';
  else
    v_filter_category := yeseong_trade_to_volume_category(v_worker.default_trade);
    if v_filter_category is null then
      v_form_type := 'trade_unknown';
    else
      v_form_type := v_filter_category;
    end if;
  end if;

  v_target := coalesce(p_year_month, yeseong_current_input_target());

  if v_target is not null and v_target ~ '^\d{4}-\d{2}$' then
    v_target_last := (to_date(v_target || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
    v_input_start := v_target_last;
    v_input_end := v_target_last + interval '10 days';
    v_is_open := v_today >= v_input_start and v_today <= v_input_end;
  end if;

  if v_target is not null and v_worker.default_worksite_id is not null then
    select p.id into v_period_id
      from yeseong_payroll_periods p
     where p.worksite_id = v_worker.default_worksite_id
       and p.year_month = v_target;

    if v_period_id is not null then
      select pw.id into v_slot_id
        from yeseong_payroll_workers pw
       where pw.period_id = v_period_id and pw.worker_id = v_worker.id;
    end if;

    if v_slot_id is not null then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id,
        'category', v.category,
        'type_name', v.type_name,
        'size_spec', v.size_spec,
        'quantity', v.quantity,
        'unit_price', v.unit_price,
        'amount', v.amount,
        'note', v.note,
        'unit', v.unit,
        'approval_status', v.approval_status,
        'rejection_reason', v.rejection_reason
      )), '[]'::jsonb) into v_existing
        from yeseong_masonry_volumes v
       where v.payroll_worker_id = v_slot_id;
    end if;
  end if;

  if v_filter_category is not null and v_worker.default_worksite_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', mp.id,
      'category', mp.category,
      'type_name', mp.type_name,
      'size_spec', mp.size_spec,
      'unit', mp.unit,
      'unit_price', mp.unit_price
    ) order by mp.type_name, mp.size_spec, mp.unit), '[]'::jsonb) into v_prices
      from yeseong_masonry_prices mp
     where mp.worksite_id = v_worker.default_worksite_id
       and mp.category = v_filter_category
       and mp.is_active = true;
  end if;

  return jsonb_build_object(
    'form_type', v_form_type,
    'worker', jsonb_build_object(
      'id', v_worker.id,
      'name', v_worker.name,
      'wage_type', v_worker.wage_type,
      'default_trade', v_worker.default_trade
    ),
    'worksite_id', v_worker.default_worksite_id,
    'target_year_month', v_target,
    'is_input_open', v_is_open,
    'input_window', case when v_target_last is not null then
      jsonb_build_object('start', v_input_start, 'end', v_input_end) else null end,
    'today', v_today,
    'existing', v_existing,
    'prices', v_prices
  );
end $$;

-- service_role 전용 (관리자 서버 API 경유). 팀장/작업자 직접 호출 차단.
revoke all on function yeseong_admin_manager_get_me(uuid) from public;
revoke all on function yeseong_admin_manager_list_pending_attendance(uuid) from public;
revoke all on function yeseong_admin_manager_list_team_members(uuid) from public;
revoke all on function yeseong_admin_manager_get_volumes(uuid, text) from public;

grant execute on function yeseong_admin_manager_get_me(uuid) to service_role;
grant execute on function yeseong_admin_manager_list_pending_attendance(uuid) to service_role;
grant execute on function yeseong_admin_manager_list_team_members(uuid) to service_role;
grant execute on function yeseong_admin_manager_get_volumes(uuid, text) to service_role;
