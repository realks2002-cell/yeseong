-- 출역 승인 흐름 변경: 현장(worksite) 기반 → 팀장(team_leader_id) 기반
-- 작업자가 출역 제출 → 해당 작업자의 team_leader_id에 해당하는 팀장만 승인 가능

-- 1) 팀장의 팀원 pending 출역 목록
create or replace function yeseong_manager_list_pending_attendance()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manager_id uuid;
  v_manager_phone text;
  v_leader_worker_id uuid;
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select id, phone into v_manager_id, v_manager_phone
    from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_manager_id is null then
    raise exception 'manager not linked';
  end if;

  -- 팀장의 worker 레코드 찾기 (phone 매칭)
  select id into v_leader_worker_id
    from yeseong_workers
   where phone = v_manager_phone and is_active = true
   limit 1;

  if v_leader_worker_id is null then
    return '[]'::jsonb;
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
    and w.team_leader_id = v_leader_worker_id;

  return result;
end $$;

-- 2) 단건 승인/반려 — 팀원 여부 확인
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
  v_manager_phone text;
  v_leader_worker_id uuid;
  v_worker_leader uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select id, phone into v_manager_id, v_manager_phone
    from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_manager_id is null then
    raise exception 'manager not linked';
  end if;

  -- 팀장의 worker ID
  select id into v_leader_worker_id
    from yeseong_workers
   where phone = v_manager_phone and is_active = true
   limit 1;

  -- 출역 레코드의 작업자가 이 팀장 소속인지 확인
  select w.team_leader_id into v_worker_leader
    from yeseong_attendance a
    join yeseong_payroll_workers pw on pw.id = a.payroll_worker_id
    join yeseong_workers w on w.id = pw.worker_id
   where a.id = p_attendance_id;

  if v_worker_leader is null or v_worker_leader != v_leader_worker_id then
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

-- 3) 모두 승인 — 팀원 pending만
create or replace function yeseong_manager_approve_all_pending()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manager_id uuid;
  v_manager_phone text;
  v_leader_worker_id uuid;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select id, phone into v_manager_id, v_manager_phone
    from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_manager_id is null then
    raise exception 'manager not linked';
  end if;

  select id into v_leader_worker_id
    from yeseong_workers
   where phone = v_manager_phone and is_active = true
   limit 1;

  if v_leader_worker_id is null then
    return 0;
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
       where w.team_leader_id = v_leader_worker_id
     );

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- 4) 매니저당 1현장 제약 제거 (한 현장에 다수 팀장 가능)
alter table yeseong_site_manager_assignments
  drop constraint if exists yeseong_site_manager_assignments_one_per_manager;
