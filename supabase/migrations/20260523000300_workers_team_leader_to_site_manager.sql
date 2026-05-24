-- 팀장 시스템 통일: workers.team_leader_id FK 를 yeseong_workers → yeseong_site_managers 로 변경
--   배경: 사이드메뉴 "팀장" = yeseong_site_managers (과거 "소장")
--   workers.team_leader_id 자기참조였던 게 의미 불명확해서 site_manager 직접 참조로 정리
--
--   출역 승인 흐름:
--     작업자앱(/m) 출역 제출 → 팀장앱(/m/manager) 팀원 pending 목록 → 승인 → approved

-- ============================================================
-- 1) workers.team_leader_id FK 재정의 (workers → site_managers)
--    기존 자기참조 값은 의미 사라지므로 일괄 NULL 처리 후 새 매핑은 후속 스크립트로
-- ============================================================
alter table yeseong_workers drop constraint if exists yeseong_workers_team_leader_id_fkey;

update yeseong_workers set team_leader_id = null;

alter table yeseong_workers
  add constraint yeseong_workers_team_leader_id_fkey
  foreign key (team_leader_id)
  references yeseong_site_managers(id)
  on delete set null;

comment on column yeseong_workers.team_leader_id is
  '담당 팀장 (yeseong_site_managers.id). 작업자가 출역 제출 시 이 팀장이 승인';


-- ============================================================
-- 2) yeseong_manager_list_pending_attendance — manager_id 직접 비교
-- ============================================================
create or replace function yeseong_manager_list_pending_attendance()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manager_id uuid;
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select id into v_manager_id
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
    and w.team_leader_id = v_manager_id;

  return result;
end $$;


-- ============================================================
-- 3) yeseong_manager_approve_attendance — manager_id 직접 비교
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
  v_worker_leader uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select id into v_manager_id
    from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_manager_id is null then
    raise exception 'manager not linked';
  end if;

  -- 출역 레코드의 작업자가 이 팀장 소속인지 확인
  select w.team_leader_id into v_worker_leader
    from yeseong_attendance a
    join yeseong_payroll_workers pw on pw.id = a.payroll_worker_id
    join yeseong_workers w on w.id = pw.worker_id
   where a.id = p_attendance_id;

  if v_worker_leader is null or v_worker_leader != v_manager_id then
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
-- 4) yeseong_manager_approve_all_pending — manager_id 직접 비교
-- ============================================================
create or replace function yeseong_manager_approve_all_pending()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manager_id uuid;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select id into v_manager_id
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
       where w.team_leader_id = v_manager_id
     );

  get diagnostics v_count = row_count;
  return v_count;
end $$;
