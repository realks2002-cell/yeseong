-- 팀장 본인 출역 제출
--   배경: 팀장도 작업자(phone 매칭 worker 행)로서 출역해야 한다.
--   흐름: 팀장앱 홈 '내 출역' 0.5/1일 제출 → 본인 출역이 검토 대기 리스트에 포함 →
--         팀원들과 함께 승인 (모두 승인 포함)
--
--   1) yeseong_manager_register_my_attendance — 본인 worker 행으로 출역 등록
--   2) yeseong_manager_my_attendance — 본인 특정일 출역 상태 조회
--   3) list/approve/approve_all — team_leader_id 매칭 외에 본인(phone 매칭) 행도 포함

-- ============================================================
-- 1) 팀장 본인 출역 등록 (worker RPC와 동일 로직, 본인 worker 행은 phone 매칭)
-- ============================================================
create or replace function yeseong_manager_register_my_attendance(
  p_work_date date,
  p_hours numeric,
  p_latitude numeric default null,
  p_longitude numeric default null
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

  -- 본인 worker 행 (phone 매칭)
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

  -- 현장·협력사는 팀장 컨텍스트(본인 기본 현장)에서 결정
  select * into v_ctx from yeseong_worker_team_context(v_worker_id);
  v_worksite := v_ctx.worksite_id;
  v_subcontractor := v_ctx.subcontractor_id;
  if v_worksite is null then
    raise exception '기본 현장이 설정되지 않았습니다. 내 정보에서 현장을 선택하세요.';
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

grant execute on function yeseong_manager_register_my_attendance(date, numeric, numeric, numeric) to authenticated;


-- ============================================================
-- 2) 팀장 본인 특정일 출역 상태 조회
-- ============================================================
create or replace function yeseong_manager_my_attendance(p_work_date date)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_phone text;
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select phone into v_phone from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_phone is null then
    raise exception 'manager not linked';
  end if;

  select jsonb_build_object(
    'attendance_id', a.id,
    'work_date', a.work_date,
    'hours', a.hours,
    'approval_status', a.approval_status,
    'rejection_reason', a.rejection_reason,
    'worksite_name', ws.name
  )
  into result
  from yeseong_attendance a
  join yeseong_payroll_workers pw on pw.id = a.payroll_worker_id
  join yeseong_workers w on w.id = pw.worker_id
  join yeseong_worksites ws on ws.id = a.worksite_id
  where w.phone = v_phone
    and a.work_date = p_work_date
  order by a.created_at desc
  limit 1;

  return result;  -- 없으면 null
end $$;

grant execute on function yeseong_manager_my_attendance(date) to authenticated;


-- ============================================================
-- 3) 검토 대기 리스트 — 본인(phone 매칭) 출역 포함 + worker_trade 복원
-- ============================================================
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


-- ============================================================
-- 4) 승인/반려 — 본인(phone 매칭) 출역도 허용
-- ============================================================
create or replace function yeseong_manager_approve_attendance(
  p_attendance_id uuid,
  p_approve boolean,
  p_reason text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manager_id uuid;
  v_phone text;
  v_worker_leader uuid;
  v_worker_phone text;
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

  -- 출역 레코드의 작업자가 이 팀장 소속이거나 본인인지 확인
  select w.team_leader_id, w.phone into v_worker_leader, v_worker_phone
    from yeseong_attendance a
    join yeseong_payroll_workers pw on pw.id = a.payroll_worker_id
    join yeseong_workers w on w.id = pw.worker_id
   where a.id = p_attendance_id;

  if (v_worker_leader is null or v_worker_leader != v_manager_id)
     and (v_worker_phone is null or v_worker_phone != v_phone) then
    raise exception 'not your team member';
  end if;

  if p_approve then
    update yeseong_attendance
       set approval_status = 'approved',
           approved_at = now(),
           approved_by = v_user_id,
           rejection_reason = null
     where id = p_attendance_id;
  else
    update yeseong_attendance
       set approval_status = 'rejected',
           approved_at = now(),
           approved_by = v_user_id,
           rejection_reason = p_reason
     where id = p_attendance_id;
  end if;
end $$;


-- ============================================================
-- 5) 모두 승인 — 본인(phone 매칭) 출역 포함
-- ============================================================
create or replace function yeseong_manager_approve_all_pending()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manager_id uuid;
  v_phone text;
  v_count integer;
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

  update yeseong_attendance
     set approval_status = 'approved',
         approved_at = now(),
         approved_by = v_user_id,
         rejection_reason = null
   where approval_status = 'pending'
     and payroll_worker_id in (
       select pw.id from yeseong_payroll_workers pw
       join yeseong_workers w on w.id = pw.worker_id
       where w.team_leader_id = v_manager_id or w.phone = v_phone
     );

  get diagnostics v_count = row_count;
  return v_count;
end $$;
