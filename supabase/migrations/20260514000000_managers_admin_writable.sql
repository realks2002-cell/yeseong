-- 관리자 웹에서 소장 추가/수정 가능하도록 스키마/RPC 확장
--
-- 변경:
--   1) auth_user_id nullable — 관리자가 모바일 가입 전 미리 생성 가능
--   2) pin text 컬럼 추가 — 작업자(yeseong_workers.pin)와 동일 패턴, 관리자 가시성
--   3) signup_or_link RPC: 동일 phone shell 존재 시 링크
--   4) RLS: 인증된 사용자도 select 가능하도록 보강 (관리자가 본인 외 소장 조회 필요)
--      → 기존 'site_managers_self' 정책은 mutate에만 적용, select는 분리 정책

alter table yeseong_site_managers
  alter column auth_user_id drop not null;

alter table yeseong_site_managers
  add column if not exists pin text;

-- 기존 mutate 정책에 select 분리
drop policy if exists "site_managers_self" on yeseong_site_managers;

create policy "site_managers_select_all" on yeseong_site_managers
  for select using (auth.uid() is not null);

create policy "site_managers_self_modify" on yeseong_site_managers
  for insert with check (auth_user_id = auth.uid());

create policy "site_managers_self_update" on yeseong_site_managers
  for update using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

create policy "site_managers_self_delete" on yeseong_site_managers
  for delete using (auth_user_id = auth.uid());

-- assignments: 인증된 사용자 select 가능
drop policy if exists "assignments_self" on yeseong_site_manager_assignments;

create policy "assignments_select_all" on yeseong_site_manager_assignments
  for select using (auth.uid() is not null);

create policy "assignments_self_modify" on yeseong_site_manager_assignments
  for insert with check (
    site_manager_id in (select id from yeseong_site_managers where auth_user_id = auth.uid())
  );

create policy "assignments_self_delete" on yeseong_site_manager_assignments
  for delete using (
    site_manager_id in (select id from yeseong_site_managers where auth_user_id = auth.uid())
  );

-- RPC 갱신: 동일 phone shell 있으면 링크
drop function if exists yeseong_manager_signup_or_link(text, text);

create or replace function yeseong_manager_signup_or_link(
  p_phone text,
  p_name text,
  p_pin text default null
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manager_id uuid;
  v_phone text;
  v_existing record;
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

  -- 본인 기존 행 → 업데이트
  select id into v_manager_id from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_manager_id is not null then
    update yeseong_site_managers
       set name = trim(p_name),
           phone = v_phone,
           pin = coalesce(p_pin, pin)
     where id = v_manager_id;
    return v_manager_id;
  end if;

  -- 동일 phone shell (auth_user_id null) → 링크
  select * into v_existing from yeseong_site_managers where phone = v_phone;
  if v_existing.id is not null then
    if v_existing.auth_user_id is not null then
      raise exception 'phone already taken';
    end if;
    update yeseong_site_managers
       set auth_user_id = v_user_id,
           name = trim(p_name),
           pin = coalesce(p_pin, pin)
     where id = v_existing.id;
    return v_existing.id;
  end if;

  insert into yeseong_site_managers (auth_user_id, phone, name, pin)
  values (v_user_id, v_phone, trim(p_name), p_pin)
  returning id into v_manager_id;

  return v_manager_id;
end $$;

grant execute on function yeseong_manager_signup_or_link(text, text, text) to authenticated;
