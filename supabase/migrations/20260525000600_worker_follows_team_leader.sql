-- 작업자 소속 = 팀장 따라가기 (현장·협력사 동적 추종)
-- 배경: 작업자가 가입/소속에서 팀장·현장·협력사를 각각 직접 골라 데이터가 어긋남.
--       작업자는 yeseong_workers.team_leader_id(관리자 지정)만 따르고, 현장·협력사는
--       팀장의 값을 항상 동적으로 따라가도록 변경. 작업자는 선택 없이 표시만.
-- 팀장은 곧 worker(phone 연결). 팀장의 현장/협력사 = 팀장 worker 행의
--   default_worksite_id / default_subcontractor_id (관리자 /managers 에서 설정).

-- ============================================================
-- 헬퍼: 작업자의 유효 현장/협력사/팀장 컨텍스트
--   team_leader_id 있으면 → 팀장(worker) 값, 없으면 → 본인 default_*
-- ============================================================
create or replace function yeseong_worker_team_context(p_worker_id uuid)
returns table (
  worksite_id uuid,
  worksite_name text,
  subcontractor_id uuid,
  subcontractor_name text,
  team_leader_id uuid,
  team_leader_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tl uuid;
  v_own_ws uuid;
  v_own_sc uuid;
  v_eff_ws uuid;
  v_eff_sc uuid;
  v_tl_id uuid;
  v_tl_name text;
  v_sm_phone text;
begin
  select w.team_leader_id, w.default_worksite_id, w.default_subcontractor_id
    into v_tl, v_own_ws, v_own_sc
    from yeseong_workers w
   where w.id = p_worker_id;

  if v_tl is not null then
    select sm.id, sm.name, sm.phone
      into v_tl_id, v_tl_name, v_sm_phone
      from yeseong_site_managers sm
     where sm.id = v_tl;

    -- 팀장 worker 행(phone 매칭)의 현장·협력사를 따라감
    select lw.default_worksite_id, lw.default_subcontractor_id
      into v_eff_ws, v_eff_sc
      from yeseong_workers lw
     where lw.phone = v_sm_phone
     limit 1;
  else
    -- 팀장 본인 또는 미배정: 본인 값
    v_eff_ws := v_own_ws;
    v_eff_sc := v_own_sc;
  end if;

  return query
    select
      v_eff_ws,
      (select name from yeseong_worksites where id = v_eff_ws),
      v_eff_sc,
      (select name from yeseong_subcontractors where id = v_eff_sc),
      v_tl_id,
      v_tl_name;
end $$;

grant execute on function yeseong_worker_team_context(uuid) to authenticated;

-- ============================================================
-- yeseong_mobile_get_me — 현장·협력사를 팀장 컨텍스트로, team_leader 추가
-- ============================================================
create or replace function yeseong_mobile_get_me()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_worker_id uuid;
  v_ctx record;
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select id into v_worker_id from yeseong_workers where auth_user_id = v_user_id;
  if v_worker_id is null then
    return null;
  end if;

  select * into v_ctx from yeseong_worker_team_context(v_worker_id);

  select jsonb_build_object(
    'worker', jsonb_build_object(
      'id', w.id,
      'name', w.name,
      'phone', w.phone,
      'default_trade', w.default_trade,
      'skill_grade', w.skill_grade,
      'default_worksite_id', w.default_worksite_id,
      'default_subcontractor_id', w.default_subcontractor_id,
      'bank_name', w.bank_name,
      'account_number', w.account_number,
      'account_holder', w.account_holder,
      'address', w.address
    ),
    'worksite', case when v_ctx.worksite_id is not null
      then jsonb_build_object('id', v_ctx.worksite_id, 'name', v_ctx.worksite_name) end,
    'subcontractor', case when v_ctx.subcontractor_id is not null
      then jsonb_build_object('id', v_ctx.subcontractor_id, 'name', v_ctx.subcontractor_name) end,
    'team_leader', case when v_ctx.team_leader_id is not null
      then jsonb_build_object('id', v_ctx.team_leader_id, 'name', v_ctx.team_leader_name) end,
    'recent', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'work_date', a.work_date,
        'hours', a.hours,
        'approval_status', a.approval_status,
        'rejection_reason', a.rejection_reason
      ) order by a.work_date desc), '[]'::jsonb)
      from yeseong_attendance a
      join yeseong_payroll_workers pw on pw.id = a.payroll_worker_id
      where pw.worker_id = w.id
        and a.work_date >= current_date - interval '7 days'
    )
  ) into result
  from yeseong_workers w
  where w.id = v_worker_id;

  return result;
end $$;

grant execute on function yeseong_mobile_get_me() to authenticated;

-- ============================================================
-- yeseong_mobile_register_attendance — 현장·협력사를 팀장 컨텍스트로 스냅샷
--   (slot 32 / archived / approved 재제출 가드는 그대로 유지)
--   p_worksite_id/p_subcontractor_id 인자는 시그니처 호환 위해 유지하나 무시(팀장 컨텍스트 우선)
-- ============================================================
create or replace function yeseong_mobile_register_attendance(
  p_work_date date,
  p_hours numeric,
  p_worksite_id uuid default null,
  p_subcontractor_id uuid default null
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_worker_id uuid;
  v_is_active boolean;
  v_default_wage integer;
  v_default_trade text;
  v_ctx record;
  v_worksite uuid;
  v_subcontractor uuid;
  v_year_month text;
  v_period_id uuid;
  v_slot_id uuid;
  v_attendance_id uuid;
  v_next_slot smallint;
  v_existing_status text;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;
  if p_hours is null or p_hours <= 0 or p_hours > 3.0 then
    raise exception 'invalid hours';
  end if;

  select id, is_active, default_wage, default_trade
    into v_worker_id, v_is_active, v_default_wage, v_default_trade
    from yeseong_workers where auth_user_id = v_user_id;
  if v_worker_id is null then
    raise exception 'worker not linked to auth user';
  end if;
  if v_is_active = false then
    raise exception 'worker archived — contact admin';
  end if;

  -- 현장·협력사는 팀장 컨텍스트(동적)에서 결정 — 인자는 무시
  select * into v_ctx from yeseong_worker_team_context(v_worker_id);
  v_worksite := v_ctx.worksite_id;
  v_subcontractor := v_ctx.subcontractor_id;
  if v_worksite is null then
    raise exception 'worksite required (no default set)';
  end if;

  v_year_month := to_char(p_work_date, 'YYYY-MM');

  insert into yeseong_payroll_periods (worksite_id, year_month, period_start, period_end)
  values (
    v_worksite,
    v_year_month,
    date_trunc('month', p_work_date)::date,
    (date_trunc('month', p_work_date) + interval '1 month - 1 day')::date
  )
  on conflict (worksite_id, year_month) do update set updated_at = now()
  returning id into v_period_id;

  select id into v_slot_id from yeseong_payroll_workers
   where period_id = v_period_id and worker_id = v_worker_id;

  if v_slot_id is null then
    select coalesce(max(slot_number), 0) + 1 into v_next_slot
      from yeseong_payroll_workers where period_id = v_period_id;
    if v_next_slot > 32 then
      raise exception 'slot full (32 max)';
    end if;
    insert into yeseong_payroll_workers
      (period_id, worker_id, slot_number, daily_wage, trade, subcontractor_id)
    values
      (v_period_id, v_worker_id, v_next_slot, v_default_wage, v_default_trade, v_subcontractor)
    returning id into v_slot_id;
  end if;

  select approval_status into v_existing_status
    from yeseong_attendance
   where payroll_worker_id = v_slot_id and work_date = p_work_date;

  if v_existing_status = 'approved' then
    raise exception 'already approved';
  end if;

  insert into yeseong_attendance
    (payroll_worker_id, work_date, hours, source, worksite_id, subcontractor_id)
  values
    (v_slot_id, p_work_date, p_hours, 'mobile', v_worksite, v_subcontractor)
  on conflict (payroll_worker_id, work_date) do update
    set hours = excluded.hours,
        worksite_id = excluded.worksite_id,
        subcontractor_id = excluded.subcontractor_id,
        source = 'mobile',
        approval_status = 'pending',
        rejection_reason = null,
        approved_at = null,
        approved_by = null,
        updated_at = now()
    where yeseong_attendance.approval_status <> 'approved'
  returning id into v_attendance_id;

  if v_attendance_id is null then
    raise exception 'already approved';
  end if;

  return v_attendance_id;
end $$;

grant execute on function yeseong_mobile_register_attendance(date, numeric, uuid, uuid) to authenticated;
