-- 매사 성과 2단계 결재 워크플로우
--   기존(1단계): 작업자/팀장 입력 → pending → 관리자 검토
--   변경(2단계):
--     작업자 입력 → 팀장 검토(pending_leader) → 관리자 검토(pending_admin) → 승인(approved)
--     팀장 본인 입력분은 팀장 단계를 건너뛰고 바로 pending_admin (팀장=작업자 불변규칙)
--   급여 반영은 approved 만 (현행 유지). 출역(attendance) 결재 패턴을 매사에 복제.

-- ============================================================
-- 1) 상태 모델 확장
--   pending_leader  작업자 제출 → 팀장 검토 대기 (작업자 수정 가능)
--   pending_admin   팀장 제출   → 관리자 검토 대기 (팀장 수정 가능, 작업자 잠금)
--   approved        관리자 승인 → 급여 반영
--   rejected_leader 팀장이 작업자에게 반려
--   rejected_admin  관리자가 팀장에게 반려
-- ============================================================
alter table yeseong_masonry_volumes
  drop constraint if exists yeseong_masonry_volumes_approval_status_check;

-- 기존 데이터 변환 (제약 추가 전): 기존 'pending'은 관리자 검토 대기였으므로 pending_admin
update yeseong_masonry_volumes set approval_status = 'pending_admin'  where approval_status = 'pending';
update yeseong_masonry_volumes set approval_status = 'rejected_admin' where approval_status = 'rejected';

-- 관리자 노임대장 직접입력(yeseong_replace_masonry_volumes 직접 호출)은 default 를 따른다.
-- 기존 default 'pending'(=관리자 검토 대기)과 동일 의미인 pending_admin 으로 유지.
alter table yeseong_masonry_volumes
  alter column approval_status set default 'pending_admin';

alter table yeseong_masonry_volumes
  add constraint yeseong_masonry_volumes_approval_status_check
  check (approval_status in ('pending_leader','pending_admin','approved','rejected_leader','rejected_admin'));

-- ============================================================
-- 2) replace_volumes_me — 제출자(팀원/팀장)에 따라 결재 단계 진입
--    팀원: pending_leader (팀장 검토 대기) / 팀장·단독: pending_admin (관리자 검토 대기)
--    상위 단계로 넘어간 성과는 모바일에서 덮어쓸 수 없음(잠금)
--    (base: 20260612001100_volumes_follow_team_leader)
-- ============================================================
create or replace function yeseong_mobile_replace_volumes_me(
  p_year_month text,
  p_worksite_id uuid,
  p_items jsonb
) returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_worker_id uuid;
  v_worker record;
  v_category text;
  v_target_last date;
  v_current_ws uuid;
  v_is_current boolean;
  v_has_slot boolean;
  v_is_team_member boolean;
  v_period_id uuid;
  v_slot_id uuid;
  v_next_slot smallint;
  v_sub uuid;
  v_count int;
  v_item jsonb;
  v_price_id uuid;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  if p_year_month !~ '^\d{4}-\d{2}$' then raise exception 'invalid year_month'; end if;
  if p_worksite_id is null then raise exception '현장이 지정되지 않았습니다'; end if;

  v_worker_id := yeseong_resolve_worker_id(v_uid);
  if v_worker_id is null then raise exception 'worker not linked'; end if;

  select id, name, wage_type, default_trade, default_worksite_id, default_wage, is_active, team_leader_id
    into v_worker
    from yeseong_workers where id = v_worker_id;
  if v_worker.is_active = false then raise exception 'worker archived'; end if;

  if v_worker.wage_type is distinct from '월급/일급' then
    raise exception '월급/일급 작업자만 입력 가능합니다';
  end if;
  v_category := yeseong_trade_to_volume_category(v_worker.default_trade);
  if v_category is null then
    raise exception '직종이 매사 성과 입력 대상이 아닙니다. 관리자에게 문의하세요';
  end if;

  -- 팀원 = team_leader_id(담당 팀장 site_manager) 지정됨. 팀장/단독은 null.
  v_is_team_member := v_worker.team_leader_id is not null;

  -- 팀장 추종 현장 기준으로 현재 현장 판정
  select tc.worksite_id into v_current_ws
    from yeseong_worker_team_context(v_worker.id) tc;
  v_is_current := (p_worksite_id = v_current_ws);

  select exists (
    select 1 from yeseong_payroll_workers pw
      join yeseong_payroll_periods p on p.id = pw.period_id
     where p.worksite_id = p_worksite_id and p.year_month = p_year_month
       and pw.worker_id = v_worker.id
  ) into v_has_slot;

  if not v_is_current and not v_has_slot then
    raise exception '이 현장은 입력 대상이 아닙니다';
  end if;

  v_target_last := (to_date(p_year_month || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;

  -- 단가는 이 현장 + 직종 카테고리만 허용
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_price_id := (v_item->>'masonry_price_id')::uuid;
    if v_price_id is null then continue; end if;
    perform 1 from yeseong_masonry_prices
     where id = v_price_id and worksite_id = p_worksite_id
       and category = v_category and is_active = true;
    if not found then
      raise exception '유효하지 않은 단가입니다 (현장·분류 불일치)';
    end if;
  end loop;

  -- 전문건설사 = 현장 1:1
  select subcontractor_id into v_sub from yeseong_worksites where id = p_worksite_id;

  insert into yeseong_payroll_periods (worksite_id, year_month, period_start, period_end)
  values (
    p_worksite_id, p_year_month,
    (to_date(p_year_month || '-01', 'YYYY-MM-DD'))::date,
    v_target_last
  )
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
      (v_period_id, v_worker.id, v_next_slot, v_worker.default_wage, v_worker.default_trade, v_sub)
    returning id into v_slot_id;
  end if;

  -- 잠금: 이미 상위 결재 단계로 넘어간 성과는 모바일에서 덮어쓸 수 없음
  if v_is_team_member then
    perform 1 from yeseong_masonry_volumes
      where payroll_worker_id = v_slot_id and approval_status in ('pending_admin','approved');
    if found then
      raise exception '팀장이 이미 검토/제출한 성과입니다. 팀장에게 문의하세요';
    end if;
  else
    perform 1 from yeseong_masonry_volumes
      where payroll_worker_id = v_slot_id and approval_status = 'approved';
    if found then
      raise exception '이미 승인된 성과입니다. 관리자에게 문의하세요';
    end if;
  end if;

  -- 전체 교체(default = pending_admin 으로 insert)
  select yeseong_replace_masonry_volumes(v_slot_id, p_items) into v_count;

  -- 팀원 제출분은 팀장 검토 대기로 강등
  if v_is_team_member then
    update yeseong_masonry_volumes
       set approval_status = 'pending_leader'
     where payroll_worker_id = v_slot_id;
  end if;

  return v_count;
end $$;

grant execute on function yeseong_mobile_replace_volumes_me(text, uuid, jsonb) to authenticated;

-- ============================================================
-- 3) get_payroll(모바일 본인 급여) — 상태 리터럴 사이드이펙트 수정
--    매사 총액: 반려(rejected_*) 제외 / volumes_pending: 검토중(pending_*) 포함
--    (base: 20260612001300_payroll_resolve_and_masonry_total)
-- ============================================================
create or replace function yeseong_mobile_get_payroll()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
  v_wage_type text;
  v_default_wage integer;
  v_result jsonb;
begin
  v_worker_id := yeseong_resolve_worker_id(auth.uid());
  if v_worker_id is null then
    raise exception 'worker not found';
  end if;

  select w.wage_type, w.default_wage
    into v_wage_type, v_default_wage
    from yeseong_workers w
   where w.id = v_worker_id;

  select coalesce(jsonb_agg(m order by m->>'year_month' desc), '[]'::jsonb)
    into v_result
    from (
      select jsonb_build_object(
        'year_month', p.year_month,
        'wage_type', v_wage_type,
        'approved_hours', coalesce(sum(a.hours) filter (where a.approval_status = 'approved'), 0),
        'pending_hours', coalesce(sum(a.hours) filter (where a.approval_status = 'pending'), 0),
        'total_amount', case
          when v_wage_type is null or v_wage_type = '일급'
            then floor(coalesce(sum(a.hours * pw.daily_wage) filter (where a.approval_status = 'approved'), 0))
          when v_wage_type = '월급'
            then v_default_wage
          when v_wage_type = '월급/일급'
            then (
              select floor(sum(v.amount))
                from yeseong_masonry_volumes v
                join yeseong_payroll_workers pw2 on pw2.id = v.payroll_worker_id
                join yeseong_payroll_periods p2 on p2.id = pw2.period_id
               where pw2.worker_id = v_worker_id
                 and p2.year_month = p.year_month
                 and v.approval_status not in ('rejected_leader','rejected_admin')
            )
          else null
        end,
        'volumes_pending', case
          when v_wage_type = '월급/일급' then exists (
            select 1
              from yeseong_masonry_volumes v
              join yeseong_payroll_workers pw2 on pw2.id = v.payroll_worker_id
              join yeseong_payroll_periods p2 on p2.id = pw2.period_id
             where pw2.worker_id = v_worker_id
               and p2.year_month = p.year_month
               and v.approval_status in ('pending_leader','pending_admin')
          )
          else false
        end,
        'entries', coalesce(
          jsonb_agg(
            jsonb_build_object(
              'work_date', a.work_date,
              'hours', a.hours,
              'status', a.approval_status,
              'worksite_name', ws.name,
              'daily_wage', pw.daily_wage
            ) order by a.work_date desc
          ) filter (where a.id is not null),
          '[]'::jsonb
        )
      ) as m
      from yeseong_payroll_workers pw
      join yeseong_payroll_periods p on p.id = pw.period_id
      left join yeseong_attendance a on a.payroll_worker_id = pw.id
      left join yeseong_worksites ws on ws.id = coalesce(a.worksite_id, p.worksite_id)
      where pw.worker_id = v_worker_id
        and p.year_month >= to_char((now() at time zone 'Asia/Seoul') - interval '5 months', 'YYYY-MM')
      group by p.year_month
    ) sub;

  return v_result;
end;
$$;

grant execute on function yeseong_mobile_get_payroll() to authenticated;

-- ============================================================
-- 4) 팀장: 팀원 제출(pending_leader) 성과 목록 — 작업자×현장×월 슬롯 단위
-- ============================================================
create or replace function yeseong_manager_list_pending_volumes()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_manager_id uuid;
  result jsonb;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;

  select id into v_manager_id from yeseong_site_managers where auth_user_id = v_uid;
  if v_manager_id is null then raise exception 'manager not linked'; end if;

  select coalesce(jsonb_agg(grp order by grp->>'year_month' desc, grp->>'worker_name'), '[]'::jsonb)
    into result
  from (
    select jsonb_build_object(
      'payroll_worker_id', pw.id,
      'worker_id', w.id,
      'worker_name', w.name,
      'worker_phone', w.phone,
      'year_month', pp.year_month,
      'worksite_id', ws.id,
      'worksite_name', ws.name,
      'category', max(v.category),
      'total_amount', coalesce(sum(v.amount), 0),
      'items', coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'category', v.category, 'type_name', v.type_name,
        'size_spec', v.size_spec, 'unit', v.unit, 'quantity', v.quantity,
        'unit_price', v.unit_price, 'amount', v.amount
      ) order by v.created_at), '[]'::jsonb),
      'prices', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', mp.id, 'category', mp.category, 'type_name', mp.type_name,
          'size_spec', mp.size_spec, 'unit', mp.unit, 'unit_price', mp.unit_price
        ) order by mp.type_name, mp.size_spec), '[]'::jsonb)
        from yeseong_masonry_prices mp
        where mp.worksite_id = ws.id
          and mp.category = yeseong_trade_to_volume_category(w.default_trade)
          and mp.is_active = true
      )
    ) as grp
    from yeseong_masonry_volumes v
    join yeseong_payroll_workers pw on pw.id = v.payroll_worker_id
    join yeseong_payroll_periods pp on pp.id = pw.period_id
    join yeseong_workers w on w.id = pw.worker_id
    join yeseong_worksites ws on ws.id = pp.worksite_id
    where v.approval_status = 'pending_leader'
      and w.team_leader_id = v_manager_id
    group by pw.id, w.id, w.name, w.phone, w.default_trade, pp.year_month, ws.id, ws.name
  ) t;

  return result;
end $$;

grant execute on function yeseong_manager_list_pending_volumes() to authenticated;

-- ============================================================
-- 5) 팀장: 팀원 성과 직접 수정(덮어쓰기) — 검토 중(pending_leader)만, 본인 팀원만
-- ============================================================
create or replace function yeseong_manager_replace_team_volumes(
  p_payroll_worker_id uuid,
  p_items jsonb
) returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_manager_id uuid;
  v_leader uuid;
  v_worksite_id uuid;
  v_category text;
  v_count int;
  v_item jsonb;
  v_price_id uuid;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  if p_payroll_worker_id is null then raise exception 'payroll_worker_id required'; end if;

  select id into v_manager_id from yeseong_site_managers where auth_user_id = v_uid;
  if v_manager_id is null then raise exception 'manager not linked'; end if;

  -- 소유 검증: 슬롯의 작업자가 내 팀원인지 + 현장/직종 카테고리
  select w.team_leader_id, pp.worksite_id, yeseong_trade_to_volume_category(w.default_trade)
    into v_leader, v_worksite_id, v_category
    from yeseong_payroll_workers pw
    join yeseong_payroll_periods pp on pp.id = pw.period_id
    join yeseong_workers w on w.id = pw.worker_id
   where pw.id = p_payroll_worker_id;

  if v_leader is null or v_leader <> v_manager_id then
    raise exception '본인 팀원의 성과만 수정할 수 있습니다';
  end if;

  -- 이미 관리자에게 제출/승인된 건 팀장도 수정 불가 (관리자가 반려해야 함)
  perform 1 from yeseong_masonry_volumes
    where payroll_worker_id = p_payroll_worker_id and approval_status in ('approved')
    limit 1;
  if found then raise exception '이미 승인된 성과는 수정할 수 없습니다'; end if;

  -- 단가는 이 현장 + 직종 카테고리만 허용
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_price_id := (v_item->>'masonry_price_id')::uuid;
    if v_price_id is null then continue; end if;
    perform 1 from yeseong_masonry_prices
     where id = v_price_id and worksite_id = v_worksite_id
       and category = v_category and is_active = true;
    if not found then
      raise exception '유효하지 않은 단가입니다 (현장·분류 불일치)';
    end if;
  end loop;

  select yeseong_replace_masonry_volumes(p_payroll_worker_id, p_items) into v_count;

  -- 팀장이 수정한 것도 아직 검토 중 → pending_leader 유지
  update yeseong_masonry_volumes
     set approval_status = 'pending_leader'
   where payroll_worker_id = p_payroll_worker_id;

  return v_count;
end $$;

grant execute on function yeseong_manager_replace_team_volumes(uuid, jsonb) to authenticated;

-- ============================================================
-- 6) 팀장: 팀원 성과 관리자 제출(승인) / 작업자 반려 — 슬롯 단위 일괄
--    p_approve=true  : pending_leader → pending_admin (관리자 검토 대기)
--    p_approve=false : pending_leader → rejected_leader (작업자 재입력)
-- ============================================================
create or replace function yeseong_manager_decide_volumes(
  p_payroll_worker_ids uuid[],
  p_approve boolean,
  p_reason text default null
) returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_manager_id uuid;
  v_count int;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  if p_payroll_worker_ids is null or array_length(p_payroll_worker_ids, 1) is null then
    return 0;
  end if;

  select id into v_manager_id from yeseong_site_managers where auth_user_id = v_uid;
  if v_manager_id is null then raise exception 'manager not linked'; end if;

  update yeseong_masonry_volumes v
     set approval_status = case when p_approve then 'pending_admin' else 'rejected_leader' end,
         rejection_reason = case when p_approve then null else p_reason end
   where v.payroll_worker_id = any(p_payroll_worker_ids)
     and v.approval_status = 'pending_leader'
     and exists (
       select 1 from yeseong_payroll_workers pw
         join yeseong_workers w on w.id = pw.worker_id
        where pw.id = v.payroll_worker_id and w.team_leader_id = v_manager_id
     );

  get diagnostics v_count = row_count;
  return v_count;
end $$;

grant execute on function yeseong_manager_decide_volumes(uuid[], boolean, text) to authenticated;

-- ============================================================
-- 7) 관리자 검토 목록 — 팀장 손을 떠난 것만 (pending_leader/rejected_leader 제외)
--    (base: 20260526000600_volumes_categories_approval)
-- ============================================================
create or replace function yeseong_admin_list_volumes_review(
  p_year_month text default null,
  p_status text default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'category', v.category,
    'type_name', v.type_name,
    'size_spec', v.size_spec,
    'quantity', v.quantity,
    'unit', v.unit,
    'unit_price', v.unit_price,
    'amount', v.amount,
    'approval_status', v.approval_status,
    'rejection_reason', v.rejection_reason,
    'approved_at', v.approved_at,
    'created_at', v.created_at,
    'year_month', pp.year_month,
    'worker_id', w.id,
    'worker_name', w.name,
    'worker_phone', w.phone,
    'worksite_id', ws.id,
    'worksite_name', ws.name,
    'subcontractor_name', sc.name
  ) order by pp.year_month desc, w.name, v.created_at desc), '[]'::jsonb)
  into result
  from yeseong_masonry_volumes v
  join yeseong_payroll_workers pw on pw.id = v.payroll_worker_id
  join yeseong_payroll_periods pp on pp.id = pw.period_id
  join yeseong_workers w on w.id = pw.worker_id
  join yeseong_worksites ws on ws.id = pp.worksite_id
  left join yeseong_subcontractors sc on sc.id = pw.subcontractor_id
  where v.approval_status in ('pending_admin','approved','rejected_admin')
    and (p_year_month is null or pp.year_month = p_year_month)
    and (p_status is null or v.approval_status = p_status);

  return result;
end $$;

grant execute on function yeseong_admin_list_volumes_review(text, text) to authenticated;

-- ============================================================
-- 8) 관리자 승인/반려 — 반려는 rejected_admin (팀장에게 되돌림)
--    (base: 20260526000600_volumes_categories_approval)
-- ============================================================
create or replace function yeseong_admin_bulk_approve_volumes(
  p_ids uuid[],
  p_approve boolean,
  p_reason text default null
)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  if p_approve then
    update yeseong_masonry_volumes
       set approval_status = 'approved',
           approved_at = now(),
           approved_by = v_user_id,
           rejection_reason = null
     where id = any(p_ids);
  else
    update yeseong_masonry_volumes
       set approval_status = 'rejected_admin',
           approved_at = now(),
           approved_by = v_user_id,
           rejection_reason = p_reason
     where id = any(p_ids);
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

grant execute on function yeseong_admin_bulk_approve_volumes(uuid[], boolean, text) to authenticated;
