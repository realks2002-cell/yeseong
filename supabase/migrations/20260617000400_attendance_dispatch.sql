-- 출역 파견(임시 타현장 근무) — 작업자/팀장이 앱에서 그날 현장을 직접 골라 출역
--   평소: 팀장 추종 현장으로 출역(현행). 파견: 선택한 현장의 period/slot에 붙고 그 현장 협력사로 스냅샷.
--   per-day 단위 → 부분 파견(작업자만/팀장만/일부만) 자연 처리. 파견 출역은 is_dispatch=true 로 표시.
--   (base: 20260605000000_attendance_gps / 20260607000200_manager_self_attendance)

-- 1) 파견 표시 플래그
alter table yeseong_attendance
  add column if not exists is_dispatch boolean not null default false;

-- 2) 모바일 현장 목록 (파견 드롭다운용)
create or replace function yeseong_mobile_list_worksites()
returns table (id uuid, name text)
language sql stable security definer
set search_path = public
as $$
  select id, name from yeseong_worksites where is_active = true order by name;
$$;
grant execute on function yeseong_mobile_list_worksites() to authenticated;

-- 3) 작업자 출역 — p_dispatch 추가 (구 6인자 시그니처 제거 후 재생성)
drop function if exists yeseong_mobile_register_attendance(date, numeric, uuid, uuid, numeric, numeric);

create or replace function yeseong_mobile_register_attendance(
  p_work_date date,
  p_hours numeric,
  p_worksite_id uuid default null,
  p_subcontractor_id uuid default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_dispatch boolean default false
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
  v_ws_active boolean;
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

  if p_dispatch then
    -- 파견: 선택 현장 사용, 협력사는 그 현장(1:1)에서 파생
    if p_worksite_id is null then
      raise exception '파견 현장을 선택하세요';
    end if;
    select subcontractor_id, is_active into v_subcontractor, v_ws_active
      from yeseong_worksites where id = p_worksite_id;
    if v_ws_active is null then
      raise exception '현장을 찾을 수 없습니다';
    end if;
    if v_ws_active = false then
      raise exception '비활성 현장입니다';
    end if;
    v_worksite := p_worksite_id;
  else
    -- 평소: 팀장 컨텍스트(동적). 인자(p_worksite_id 등)는 무시
    select * into v_ctx from yeseong_worker_team_context(v_worker_id);
    v_worksite := v_ctx.worksite_id;
    v_subcontractor := v_ctx.subcontractor_id;
    if v_worksite is null then
      raise exception 'worksite required (no default set)';
    end if;
  end if;

  -- GPS 거리 계산 (대상 현장 기준)
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
     submit_latitude, submit_longitude, gps_distance_m, is_dispatch)
  values
    (v_slot_id, p_work_date, p_hours, 'mobile', v_worksite, v_subcontractor,
     p_latitude, p_longitude, v_distance, p_dispatch)
  on conflict (payroll_worker_id, work_date) do update
    set hours = excluded.hours,
        worksite_id = excluded.worksite_id,
        subcontractor_id = excluded.subcontractor_id,
        source = 'mobile',
        submit_latitude = excluded.submit_latitude,
        submit_longitude = excluded.submit_longitude,
        gps_distance_m = excluded.gps_distance_m,
        is_dispatch = excluded.is_dispatch,
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

grant execute on function yeseong_mobile_register_attendance(date, numeric, uuid, uuid, numeric, numeric, boolean) to authenticated;

-- 4) 팀장 본인 출역 — p_worksite_id + p_dispatch 추가 (구 4인자 제거 후 재생성)
drop function if exists yeseong_manager_register_my_attendance(date, numeric, numeric, numeric);

create or replace function yeseong_manager_register_my_attendance(
  p_work_date date,
  p_hours numeric,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_worksite_id uuid default null,
  p_dispatch boolean default false
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_phone text;
  v_worker_id uuid;
  v_is_active boolean;
  v_default_wage integer;
  v_default_trade text;
  v_ctx record;
  v_worksite uuid;
  v_subcontractor uuid;
  v_ws_active boolean;
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

  select phone into v_phone from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_phone is null then
    raise exception 'manager not linked';
  end if;

  select w.id, w.is_active, w.default_wage, w.default_trade
    into v_worker_id, v_is_active, v_default_wage, v_default_trade
    from yeseong_workers w
   where w.phone = v_phone
   limit 1;
  if v_worker_id is null then
    raise exception '작업자 정보가 없습니다. 관리자에게 문의하세요.';
  end if;
  if v_is_active = false then
    raise exception 'worker archived — contact admin';
  end if;

  if p_dispatch then
    if p_worksite_id is null then
      raise exception '파견 현장을 선택하세요';
    end if;
    select subcontractor_id, is_active into v_subcontractor, v_ws_active
      from yeseong_worksites where id = p_worksite_id;
    if v_ws_active is null then
      raise exception '현장을 찾을 수 없습니다';
    end if;
    if v_ws_active = false then
      raise exception '비활성 현장입니다';
    end if;
    v_worksite := p_worksite_id;
  else
    select * into v_ctx from yeseong_worker_team_context(v_worker_id);
    v_worksite := v_ctx.worksite_id;
    v_subcontractor := v_ctx.subcontractor_id;
    if v_worksite is null then
      raise exception '기본 현장이 설정되지 않았습니다. 내 정보에서 현장을 선택하세요.';
    end if;
  end if;

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
     submit_latitude, submit_longitude, gps_distance_m, is_dispatch)
  values
    (v_slot_id, p_work_date, p_hours, 'mobile', v_worksite, v_subcontractor,
     p_latitude, p_longitude, v_distance, p_dispatch)
  on conflict (payroll_worker_id, work_date) do update
    set hours = excluded.hours,
        worksite_id = excluded.worksite_id,
        subcontractor_id = excluded.subcontractor_id,
        source = 'mobile',
        submit_latitude = excluded.submit_latitude,
        submit_longitude = excluded.submit_longitude,
        gps_distance_m = excluded.gps_distance_m,
        is_dispatch = excluded.is_dispatch,
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

grant execute on function yeseong_manager_register_my_attendance(date, numeric, numeric, numeric, uuid, boolean) to authenticated;

-- 5) 팀장 검토 목록에 is_dispatch 노출 (파견 배지)
create or replace function yeseong_manager_list_pending_attendance()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manager_id uuid;
  v_phone text;
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select id, phone into v_manager_id, v_phone
    from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_manager_id is null then
    raise exception 'manager not linked';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'attendance_id', a.id,
    'work_date', a.work_date,
    'hours', a.hours,
    'source', a.source,
    'worker_name', w.name,
    'worker_phone', w.phone,
    'worker_trade', w.default_trade,
    'is_self', (w.phone = v_phone),
    'is_dispatch', a.is_dispatch,
    'worksite_id', ws.id,
    'worksite_name', ws.name,
    'subcontractor_name', sc.name,
    'created_at', a.created_at
  ) order by a.work_date desc, (w.phone = v_phone) desc, a.created_at desc), '[]'::jsonb)
  into result
  from yeseong_attendance a
  join yeseong_payroll_workers pw on pw.id = a.payroll_worker_id
  join yeseong_workers w on w.id = pw.worker_id
  join yeseong_worksites ws on ws.id = a.worksite_id
  left join yeseong_subcontractors sc on sc.id = a.subcontractor_id
  where a.approval_status = 'pending'
    and (w.team_leader_id = v_manager_id or w.phone = v_phone);

  return result;
end $$;

grant execute on function yeseong_manager_list_pending_attendance() to authenticated;

-- 6) 관리자 출역검토 목록에 is_dispatch 노출 (파견 배지)
create or replace function yeseong_admin_list_attendance_review(
  p_days integer default 30,
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
    'id', a.id,
    'work_date', a.work_date,
    'hours', a.hours,
    'source', a.source,
    'approval_status', a.approval_status,
    'rejection_reason', a.rejection_reason,
    'approved_at', a.approved_at,
    'created_at', a.created_at,
    'worker_id', w.id,
    'worker_name', w.name,
    'worker_phone', w.phone,
    'is_dispatch', a.is_dispatch,
    'worksite_id', ws.id,
    'worksite_name', ws.name,
    'subcontractor_name', sc.name,
    'approver_name', sm.name
  ) order by a.work_date desc, a.created_at desc), '[]'::jsonb)
  into result
  from yeseong_attendance a
  join yeseong_payroll_workers pw on pw.id = a.payroll_worker_id
  join yeseong_workers w on w.id = pw.worker_id
  join yeseong_worksites ws on ws.id = a.worksite_id
  left join yeseong_subcontractors sc on sc.id = pw.subcontractor_id
  left join yeseong_site_managers sm on sm.auth_user_id = a.approved_by
  where a.work_date >= current_date - (p_days || ' days')::interval
    and (p_status is null or a.approval_status = p_status);

  return result;
end $$;

grant execute on function yeseong_admin_list_attendance_review(integer, text) to authenticated;
