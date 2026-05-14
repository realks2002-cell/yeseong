-- M3: yeseong_mobile_register_attendance에서 이미 approved된 출역을 작업자가
-- 재제출로 pending에 되돌리는 경합 차단.
--   - UPSERT do update에 where approval_status <> 'approved' 가드 추가
--   - RETURNING이 비면 명시적 예외 발생 (이미 approved)

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
  v_default_wage integer;
  v_default_trade text;
  v_default_worksite uuid;
  v_default_sub uuid;
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

  select id, default_wage, default_trade, default_worksite_id, default_subcontractor_id
    into v_worker_id, v_default_wage, v_default_trade, v_default_worksite, v_default_sub
    from yeseong_workers where auth_user_id = v_user_id;
  if v_worker_id is null then
    raise exception 'worker not linked to auth user';
  end if;

  v_worksite := coalesce(p_worksite_id, v_default_worksite);
  v_subcontractor := coalesce(p_subcontractor_id, v_default_sub);
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
    if v_next_slot > 26 then
      raise exception 'slot full (26 max)';
    end if;
    insert into yeseong_payroll_workers
      (period_id, worker_id, slot_number, daily_wage, trade, subcontractor_id)
    values
      (v_period_id, v_worker_id, v_next_slot, v_default_wage, v_default_trade, v_subcontractor)
    returning id into v_slot_id;
  end if;

  -- 이미 approved된 행이면 재제출 차단
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
