-- 현장 팀장 모바일 앱 (별도 APK com.yeseong.manager)
--
-- 결정 사항 (2026-05-12):
--   1) 작업자(yeseong_workers)와 분리된 yeseong_site_managers 테이블
--      "팀장 앱을 설치하는 사람이 팀장" — role 분기 X
--   2) 팀장 ↔ 현장 다대다 매핑 (yeseong_site_manager_assignments)
--   3) yeseong_attendance 에 승인 컬럼 추가 (approval_status, approved_at, approved_by, rejection_reason)
--   4) 기존 출역 데이터 백필: source != 'mobile'은 'approved'로 일괄
--      (출시 이전 manual/vision/import 출역은 관리자가 노임대장 작성용으로 이미 검증)
--   5) RPC 5종 (signup/set_assignments/get_me/list_pending/approve) 전부 SECURITY DEFINER

-- ============================================================
-- 1) yeseong_site_managers
-- ============================================================
create table yeseong_site_managers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null references auth.users(id) on delete cascade,
  phone text not null,
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index yeseong_site_managers_phone_key
  on yeseong_site_managers (phone);

create trigger trg_site_managers_updated_at
  before update on yeseong_site_managers
  for each row execute function yeseong_set_updated_at();

alter table yeseong_site_managers enable row level security;
create policy "site_managers_self" on yeseong_site_managers for all
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- ============================================================
-- 2) yeseong_site_manager_assignments (팀장 ↔ 담당 현장)
-- ============================================================
create table yeseong_site_manager_assignments (
  id uuid primary key default gen_random_uuid(),
  site_manager_id uuid not null references yeseong_site_managers(id) on delete cascade,
  worksite_id uuid not null references yeseong_worksites(id) on delete cascade,
  created_at timestamptz default now(),
  unique (site_manager_id, worksite_id)
);
create index on yeseong_site_manager_assignments (site_manager_id);
create index on yeseong_site_manager_assignments (worksite_id);

alter table yeseong_site_manager_assignments enable row level security;
create policy "assignments_self" on yeseong_site_manager_assignments for all
  using (site_manager_id in (
    select id from yeseong_site_managers where auth_user_id = auth.uid()
  ))
  with check (site_manager_id in (
    select id from yeseong_site_managers where auth_user_id = auth.uid()
  ));

-- ============================================================
-- 3) yeseong_attendance 승인 컬럼
-- ============================================================
alter table yeseong_attendance
  add column approval_status text not null default 'pending'
    check (approval_status in ('pending','approved','rejected'));
alter table yeseong_attendance
  add column approved_at timestamptz;
alter table yeseong_attendance
  add column approved_by uuid references auth.users(id) on delete set null;
alter table yeseong_attendance
  add column rejection_reason text;

create index yeseong_attendance_pending_idx
  on yeseong_attendance (worksite_id, approval_status, work_date desc);

-- 백필: 모바일 외 소스는 사전 검증 완료로 간주
update yeseong_attendance
   set approval_status = 'approved',
       approved_at = coalesce(updated_at, created_at)
 where source <> 'mobile';

-- ============================================================
-- 4) RPC — 가입/링크
-- ============================================================
create or replace function yeseong_manager_signup_or_link(
  p_phone text,
  p_name text
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manager_id uuid;
  v_phone text;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_phone) < 10 then
    raise exception 'invalid phone';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid name';
  end if;

  select id into v_manager_id from yeseong_site_managers
   where auth_user_id = v_user_id;

  if v_manager_id is not null then
    update yeseong_site_managers
       set name = trim(p_name),
           phone = v_phone
     where id = v_manager_id;
    return v_manager_id;
  end if;

  if exists (select 1 from yeseong_site_managers where phone = v_phone) then
    raise exception 'phone already taken';
  end if;

  insert into yeseong_site_managers (auth_user_id, phone, name)
  values (v_user_id, v_phone, trim(p_name))
  returning id into v_manager_id;

  return v_manager_id;
end $$;

grant execute on function yeseong_manager_signup_or_link(text, text) to authenticated;

-- ============================================================
-- RPC — 담당 현장 설정 (전체 교체)
-- ============================================================
create or replace function yeseong_manager_set_assignments(
  p_worksite_ids uuid[]
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manager_id uuid;
  v_ws uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select id into v_manager_id from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_manager_id is null then
    raise exception 'manager not linked';
  end if;

  delete from yeseong_site_manager_assignments
   where site_manager_id = v_manager_id;

  if p_worksite_ids is not null then
    foreach v_ws in array p_worksite_ids loop
      insert into yeseong_site_manager_assignments (site_manager_id, worksite_id)
      values (v_manager_id, v_ws);
    end loop;
  end if;
end $$;

grant execute on function yeseong_manager_set_assignments(uuid[]) to authenticated;

-- ============================================================
-- RPC — 본인 정보 + 담당 현장
-- ============================================================
create or replace function yeseong_manager_get_me()
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

  select jsonb_build_object(
    'manager', jsonb_build_object(
      'id', m.id,
      'name', m.name,
      'phone', m.phone
    ),
    'worksites', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name) order by w.name)
        from yeseong_site_manager_assignments a
        join yeseong_worksites w on w.id = a.worksite_id
       where a.site_manager_id = m.id
    ), '[]'::jsonb)
  ) into result
  from yeseong_site_managers m
  where m.auth_user_id = v_user_id;

  return result;
end $$;

grant execute on function yeseong_manager_get_me() to authenticated;

-- ============================================================
-- RPC — 담당 현장의 pending 출역 목록
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
  select id into v_manager_id from yeseong_site_managers
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
    and a.worksite_id in (
      select worksite_id from yeseong_site_manager_assignments
       where site_manager_id = v_manager_id
    );

  return result;
end $$;

grant execute on function yeseong_manager_list_pending_attendance() to authenticated;

-- ============================================================
-- RPC — 승인/반려
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
  v_worksite uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select id into v_manager_id from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_manager_id is null then
    raise exception 'manager not linked';
  end if;

  select worksite_id into v_worksite from yeseong_attendance
   where id = p_attendance_id;
  if v_worksite is null then
    raise exception 'attendance not found';
  end if;

  if not exists (
    select 1 from yeseong_site_manager_assignments
     where site_manager_id = v_manager_id and worksite_id = v_worksite
  ) then
    raise exception 'not your worksite';
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

grant execute on function yeseong_manager_approve_attendance(uuid, boolean, text) to authenticated;
