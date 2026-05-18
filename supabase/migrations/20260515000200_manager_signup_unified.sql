-- 팀장앱 가입 흐름 통합:
-- 1) yeseong_check_phone_full: phone 입력 후 흐름 분기 위한 통합 조회
-- 2) yeseong_manager_attach_worker_and_signup: 작업자 마스터에 phone 있는 경우 auth+pin 연결 + 매니저 row 생성
-- 3) yeseong_manager_get_me 확장: workers JOIN으로 본인 작업자 정보 동봉

-- ============================================================
-- 1) phone 종합 체크 (RLS bypass — SECURITY DEFINER, anon 호출 가능)
-- ============================================================
create or replace function yeseong_check_phone_full(p_phone text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_phone text;
  v_worker record;
  v_manager_exists boolean;
begin
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_phone) < 10 then
    raise exception 'invalid phone';
  end if;

  select id, name, auth_user_id is not null as has_auth
    into v_worker
    from yeseong_workers
   where phone = v_phone
   limit 1;

  select exists (
    select 1 from yeseong_site_managers
     where phone = v_phone and auth_user_id is not null
  ) into v_manager_exists;

  return jsonb_build_object(
    'has_worker', v_worker.id is not null,
    'worker_has_auth', coalesce(v_worker.has_auth, false),
    'worker_name', v_worker.name,
    'has_manager', v_manager_exists
  );
end $$;

grant execute on function yeseong_check_phone_full(text) to anon, authenticated;

-- ============================================================
-- 2) 작업자 매칭 → 매니저 연결
--    호출 시점: 클라이언트가 /api/m/auth/signup로 auth user 만들고
--    signInWithPassword 완료한 직후 (auth.uid() 사용 가능)
-- ============================================================
create or replace function yeseong_manager_attach_worker_and_signup(
  p_phone text,
  p_pin text
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_phone text;
  v_worker record;
  v_manager_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_phone) < 10 then
    raise exception 'invalid phone';
  end if;
  if p_pin is null or p_pin !~ '^\d{4}$' then
    raise exception 'invalid pin';
  end if;

  -- 작업자 마스터에서 phone 매칭 (없으면 에러)
  select id, name, auth_user_id
    into v_worker
    from yeseong_workers
   where phone = v_phone
   limit 1;
  if v_worker.id is null then
    raise exception 'worker not found for phone';
  end if;

  -- 다른 사용자가 이미 작업자 row와 연결되어 있으면 차단
  if v_worker.auth_user_id is not null and v_worker.auth_user_id <> v_user_id then
    raise exception 'worker already linked to another account';
  end if;

  -- workers.auth_user_id + pin 갱신
  update yeseong_workers
     set auth_user_id = v_user_id,
         pin = p_pin
   where id = v_worker.id;

  -- 매니저 row UPSERT (yeseong_manager_signup_or_link 패턴 재사용)
  select id into v_manager_id from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_manager_id is not null then
    update yeseong_site_managers
       set name = v_worker.name,
           phone = v_phone,
           pin = p_pin
     where id = v_manager_id;
  else
    -- 동일 phone shell 처리
    select id into v_manager_id from yeseong_site_managers where phone = v_phone;
    if v_manager_id is not null then
      update yeseong_site_managers
         set auth_user_id = v_user_id,
             name = v_worker.name,
             pin = p_pin
       where id = v_manager_id;
    else
      insert into yeseong_site_managers (auth_user_id, phone, name, pin)
      values (v_user_id, v_phone, v_worker.name, p_pin)
      returning id into v_manager_id;
    end if;
  end if;

  return jsonb_build_object(
    'worker_id', v_worker.id,
    'manager_id', v_manager_id
  );
end $$;

grant execute on function yeseong_manager_attach_worker_and_signup(text, text) to authenticated;

-- ============================================================
-- 3) yeseong_manager_get_me 확장 — worker 정보 포함
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
    'worker', (
      select jsonb_build_object(
        'id', w.id,
        'name', w.name,
        'phone', w.phone,
        'default_trade', w.default_trade,
        'default_wage', w.default_wage,
        'bank_name', w.bank_name,
        'account_number', w.account_number,
        'account_holder', w.account_holder,
        'address', w.address
      )
      from yeseong_workers w
      where w.phone = m.phone
      limit 1
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
