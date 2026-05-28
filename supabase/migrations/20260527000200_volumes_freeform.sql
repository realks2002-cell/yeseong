-- 매사(masonry) 자유화 2/3 — 작업자 성과 입력: 직종→공종 매핑 제거, 작업자 직접 선택
--   get_volumes_me: 현장에 등록된 모든 활성 단가를 공종 무관 로드(작업자가 직접 공종/항목 선택)
--   replace_volumes_me: 단가 검증에서 공종 일치 조건 제거(현장·활성만 확인)
--   admin_manager_get_volumes(미러): 동일 로직으로 일치
--   form_type: 'eligible' | 'not_eligible' | 'no_worker_link' (trade_unknown 폐지)

-- ============================================================
-- 1) get_volumes_me — 현장 전체 활성 단가 로드
-- ============================================================
create or replace function yeseong_mobile_get_volumes_me(p_year_month text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
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
begin
  if v_user_id is null then raise exception 'unauthenticated'; end if;

  v_worker_id := yeseong_resolve_worker_id(v_user_id);
  if v_worker_id is null then
    return jsonb_build_object('form_type', 'no_worker_link');
  end if;

  select id, name, wage_type, default_trade, default_worksite_id, is_active
    into v_worker from yeseong_workers where id = v_worker_id;
  if v_worker.is_active = false then
    return jsonb_build_object('form_type', 'no_worker_link', 'archived', true);
  end if;

  if v_worker.wage_type is distinct from '월급/일급' then
    v_form_type := 'not_eligible';
  else
    v_form_type := 'eligible';
  end if;

  v_target := coalesce(p_year_month, yeseong_current_input_target());
  if v_target is not null and v_target ~ '^\d{4}-\d{2}$' then
    v_target_last := (to_date(v_target || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
    v_input_start := v_target_last;
    v_input_end := v_target_last + interval '10 days';
    v_is_open := v_today >= v_input_start and v_today <= v_input_end;
  end if;

  if v_target is not null and v_worker.default_worksite_id is not null then
    select p.id into v_period_id from yeseong_payroll_periods p
     where p.worksite_id = v_worker.default_worksite_id and p.year_month = v_target;
    if v_period_id is not null then
      select pw.id into v_slot_id from yeseong_payroll_workers pw
       where pw.period_id = v_period_id and pw.worker_id = v_worker.id;
    end if;
    if v_slot_id is not null then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'category', v.category, 'type_name', v.type_name,
        'size_spec', v.size_spec, 'quantity', v.quantity, 'unit_price', v.unit_price,
        'amount', v.amount, 'note', v.note, 'unit', v.unit,
        'approval_status', v.approval_status, 'rejection_reason', v.rejection_reason
      )), '[]'::jsonb) into v_existing
        from yeseong_masonry_volumes v where v.payroll_worker_id = v_slot_id;
    end if;
  end if;

  if v_form_type = 'eligible' and v_worker.default_worksite_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', mp.id, 'category', mp.category, 'type_name', mp.type_name,
      'size_spec', mp.size_spec, 'unit', mp.unit, 'unit_price', mp.unit_price
    ) order by mp.category, mp.type_name, mp.size_spec, mp.unit), '[]'::jsonb) into v_prices
      from yeseong_masonry_prices mp
     where mp.worksite_id = v_worker.default_worksite_id and mp.is_active = true;
  end if;

  return jsonb_build_object(
    'form_type', v_form_type,
    'worker', jsonb_build_object('id', v_worker.id, 'name', v_worker.name,
      'wage_type', v_worker.wage_type, 'default_trade', v_worker.default_trade),
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
grant execute on function yeseong_mobile_get_volumes_me(text) to authenticated;

-- ============================================================
-- 2) replace_volumes_me — 공종 일치 검증 제거
-- ============================================================
create or replace function yeseong_mobile_replace_volumes_me(p_year_month text, p_items jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_worker_id uuid;
  v_worker record;
  v_target_last date;
  v_input_start date;
  v_input_end date;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_period_id uuid;
  v_slot_id uuid;
  v_next_slot smallint;
  v_count int;
  v_item jsonb;
  v_price_id uuid;
begin
  if v_user_id is null then raise exception 'unauthenticated'; end if;
  if p_year_month !~ '^\d{4}-\d{2}$' then raise exception 'invalid year_month'; end if;

  v_worker_id := yeseong_resolve_worker_id(v_user_id);
  if v_worker_id is null then raise exception 'worker not linked'; end if;

  select id, name, wage_type, default_trade, default_worksite_id, default_wage,
         default_subcontractor_id, is_active
    into v_worker from yeseong_workers where id = v_worker_id;
  if v_worker.is_active = false then raise exception 'worker archived'; end if;

  if v_worker.wage_type is distinct from '월급/일급' then
    raise exception '월급/일급 작업자만 입력 가능합니다';
  end if;
  if v_worker.default_worksite_id is null then
    raise exception '기본 현장이 설정되지 않았습니다';
  end if;

  v_target_last := (to_date(p_year_month || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
  v_input_start := v_target_last;
  v_input_end := v_target_last + interval '10 days';
  if v_today < v_input_start or v_today > v_input_end then
    raise exception '입력 가능 기간이 아닙니다 (% ~ %)', v_input_start, v_input_end;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_price_id := (v_item->>'masonry_price_id')::uuid;
    if v_price_id is null then continue; end if;
    perform 1 from yeseong_masonry_prices
     where id = v_price_id
       and worksite_id = v_worker.default_worksite_id
       and is_active = true;
    if not found then
      raise exception '유효하지 않은 단가입니다 (현장 불일치)';
    end if;
  end loop;

  insert into yeseong_payroll_periods (worksite_id, year_month, period_start, period_end)
  values (v_worker.default_worksite_id, p_year_month,
    (to_date(p_year_month || '-01', 'YYYY-MM-DD'))::date, v_target_last)
  on conflict (worksite_id, year_month) do update set updated_at = now()
  returning id into v_period_id;

  select id into v_slot_id from yeseong_payroll_workers
   where period_id = v_period_id and worker_id = v_worker.id;
  if v_slot_id is null then
    select coalesce(max(slot_number), 0) + 1 into v_next_slot
      from yeseong_payroll_workers where period_id = v_period_id;
    if v_next_slot > 32 then raise exception '슬롯이 가득 찼습니다 (32 max)'; end if;
    insert into yeseong_payroll_workers
      (period_id, worker_id, slot_number, daily_wage, trade, subcontractor_id)
    values
      (v_period_id, v_worker.id, v_next_slot, v_worker.default_wage,
       v_worker.default_trade, v_worker.default_subcontractor_id)
    returning id into v_slot_id;
  end if;

  select yeseong_replace_masonry_volumes(v_slot_id, p_items) into v_count;
  return v_count;
end $$;
grant execute on function yeseong_mobile_replace_volumes_me(text, jsonb) to authenticated;

-- ============================================================
-- 3) admin_manager_get_volumes(미러) — get_volumes_me와 동일 로직
-- ============================================================
create or replace function yeseong_admin_manager_get_volumes(p_manager_id uuid, p_year_month text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
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
begin
  if p_manager_id is null then raise exception 'manager id required'; end if;

  select w.id into v_worker_id
    from yeseong_workers w
    join yeseong_site_managers m on m.phone = w.phone
   where m.id = p_manager_id and m.phone is not null
   limit 1;
  if v_worker_id is null then
    return jsonb_build_object('form_type', 'no_worker_link');
  end if;

  select id, name, wage_type, default_trade, default_worksite_id, is_active
    into v_worker from yeseong_workers where id = v_worker_id;
  if v_worker.is_active = false then
    return jsonb_build_object('form_type', 'no_worker_link', 'archived', true);
  end if;

  if v_worker.wage_type is distinct from '월급/일급' then
    v_form_type := 'not_eligible';
  else
    v_form_type := 'eligible';
  end if;

  v_target := coalesce(p_year_month, yeseong_current_input_target());
  if v_target is not null and v_target ~ '^\d{4}-\d{2}$' then
    v_target_last := (to_date(v_target || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
    v_input_start := v_target_last;
    v_input_end := v_target_last + interval '10 days';
    v_is_open := v_today >= v_input_start and v_today <= v_input_end;
  end if;

  if v_target is not null and v_worker.default_worksite_id is not null then
    select p.id into v_period_id from yeseong_payroll_periods p
     where p.worksite_id = v_worker.default_worksite_id and p.year_month = v_target;
    if v_period_id is not null then
      select pw.id into v_slot_id from yeseong_payroll_workers pw
       where pw.period_id = v_period_id and pw.worker_id = v_worker.id;
    end if;
    if v_slot_id is not null then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'category', v.category, 'type_name', v.type_name,
        'size_spec', v.size_spec, 'quantity', v.quantity, 'unit_price', v.unit_price,
        'amount', v.amount, 'note', v.note, 'unit', v.unit,
        'approval_status', v.approval_status, 'rejection_reason', v.rejection_reason
      )), '[]'::jsonb) into v_existing
        from yeseong_masonry_volumes v where v.payroll_worker_id = v_slot_id;
    end if;
  end if;

  if v_form_type = 'eligible' and v_worker.default_worksite_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', mp.id, 'category', mp.category, 'type_name', mp.type_name,
      'size_spec', mp.size_spec, 'unit', mp.unit, 'unit_price', mp.unit_price
    ) order by mp.category, mp.type_name, mp.size_spec, mp.unit), '[]'::jsonb) into v_prices
      from yeseong_masonry_prices mp
     where mp.worksite_id = v_worker.default_worksite_id and mp.is_active = true;
  end if;

  return jsonb_build_object(
    'form_type', v_form_type,
    'worker', jsonb_build_object('id', v_worker.id, 'name', v_worker.name,
      'wage_type', v_worker.wage_type, 'default_trade', v_worker.default_trade),
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
revoke all on function yeseong_admin_manager_get_volumes(uuid, text) from public;
grant execute on function yeseong_admin_manager_get_volumes(uuid, text) to service_role;

-- 직종→공종 매핑 함수 폐기 (작업자가 직접 공종 선택 → 불필요)
drop function if exists yeseong_trade_to_volume_category(text);
