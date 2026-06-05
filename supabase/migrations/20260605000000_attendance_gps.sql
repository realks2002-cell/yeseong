-- 출역 레코드에 GPS 좌표 + 현장까지 거리 저장
-- 작업자가 출역 제출 시 앱에서 보낸 좌표를 기록하고,
-- 현장 좌표와의 거리(m)를 서버에서 계산하여 저장한다.

alter table yeseong_attendance
  add column submit_latitude numeric(10,7),
  add column submit_longitude numeric(10,7),
  add column gps_distance_m integer;  -- 현장 좌표까지 거리(미터). null = GPS 미사용

-- ============================================================
-- Haversine 거리 계산 함수 (미터 단위)
-- ============================================================
create or replace function yeseong_haversine(
  lat1 numeric, lon1 numeric,
  lat2 numeric, lon2 numeric
) returns integer
language sql immutable parallel safe
as $$
  select (
    6371000 * 2 * asin(sqrt(
      sin(radians((lat2 - lat1) / 2)) ^ 2 +
      cos(radians(lat1)) * cos(radians(lat2)) *
      sin(radians((lon2 - lon1) / 2)) ^ 2
    ))
  )::integer;
$$;

-- ============================================================
-- yeseong_mobile_register_attendance — GPS 좌표 파라미터 추가
--   p_latitude, p_longitude: 작업자 앱에서 보낸 좌표 (nullable)
--   현장에 좌표가 등록되어 있으면 거리를 계산하여 gps_distance_m에 저장
--   거리가 geofence_radius 초과 시에도 출역은 등록하되 거리 기록 (팀장 판단)
-- ============================================================
create or replace function yeseong_mobile_register_attendance(
  p_work_date date,
  p_hours numeric,
  p_worksite_id uuid default null,
  p_subcontractor_id uuid default null,
  p_latitude numeric default null,
  p_longitude numeric default null
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
  v_distance integer;
  v_site_lat numeric;
  v_site_lng numeric;
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

  -- GPS 거리 계산
  if p_latitude is not null and p_longitude is not null then
    select latitude, longitude into v_site_lat, v_site_lng
      from yeseong_worksites where id = v_worksite;
    if v_site_lat is not null and v_site_lng is not null then
      v_distance := yeseong_haversine(p_latitude, p_longitude, v_site_lat, v_site_lng);
    end if;
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
    (payroll_worker_id, work_date, hours, source, worksite_id, subcontractor_id,
     submit_latitude, submit_longitude, gps_distance_m)
  values
    (v_slot_id, p_work_date, p_hours, 'mobile', v_worksite, v_subcontractor,
     p_latitude, p_longitude, v_distance)
  on conflict (payroll_worker_id, work_date) do update
    set hours = excluded.hours,
        worksite_id = excluded.worksite_id,
        subcontractor_id = excluded.subcontractor_id,
        source = 'mobile',
        submit_latitude = excluded.submit_latitude,
        submit_longitude = excluded.submit_longitude,
        gps_distance_m = excluded.gps_distance_m,
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

grant execute on function yeseong_mobile_register_attendance(date, numeric, uuid, uuid, numeric, numeric) to authenticated;
