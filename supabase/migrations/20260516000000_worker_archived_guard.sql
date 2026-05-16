-- 보관된(is_active=false) 작업자가 모바일/매니저 가입·출역 등록을 다시 활성화시키지 못하게 가드 추가.
-- 관리자가 /workers에서 작업자를 보관하면 phone 매칭 흐름에서 차단되어야 함.
-- 과거 노임대장·출역 데이터는 그대로 유지.

-- ============================================================
-- 1) yeseong_check_phone_full — 보관된 워커 매칭 여부 함께 반환
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

  select id, name, is_active, auth_user_id is not null as has_auth
    into v_worker
    from yeseong_workers
   where phone = v_phone
   limit 1;

  select exists (
    select 1 from yeseong_site_managers
     where phone = v_phone and auth_user_id is not null
  ) into v_manager_exists;

  return jsonb_build_object(
    'has_worker', v_worker.id is not null and coalesce(v_worker.is_active, false),
    'worker_archived', v_worker.id is not null and v_worker.is_active = false,
    'worker_has_auth', coalesce(v_worker.has_auth, false),
    'worker_name', v_worker.name,
    'has_manager', v_manager_exists
  );
end $$;

grant execute on function yeseong_check_phone_full(text) to anon, authenticated;

-- ============================================================
-- 2) yeseong_mobile_signup_or_link — 비활성 워커 매칭 시 에러
-- ============================================================
create or replace function yeseong_mobile_signup_or_link(
  p_phone text,
  p_name text
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_worker_id uuid;
  v_is_active boolean;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;
  if p_phone is null or length(p_phone) < 10 then
    raise exception 'invalid phone';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid name';
  end if;

  -- 이미 연결된 worker 있으면 그대로 리턴 (보관된 경우도 본인 데이터 조회는 허용 — get_me 동작 유지)
  select id into v_worker_id from yeseong_workers
   where auth_user_id = v_user_id;
  if v_worker_id is not null then
    return v_worker_id;
  end if;

  -- phone 매칭 시도
  select id, is_active into v_worker_id, v_is_active from yeseong_workers
   where phone = p_phone and auth_user_id is null;

  if v_worker_id is not null then
    if v_is_active = false then
      raise exception 'worker archived — contact admin to restore';
    end if;
    update yeseong_workers
       set auth_user_id = v_user_id,
           name = coalesce(nullif(name, ''), p_name)
     where id = v_worker_id;
  else
    insert into yeseong_workers (name, phone, default_wage, auth_user_id)
    values (p_name, p_phone, 0, v_user_id)
    returning id into v_worker_id;
  end if;

  return v_worker_id;
end $$;

grant execute on function yeseong_mobile_signup_or_link(text, text) to authenticated;

-- ============================================================
-- 3) yeseong_mobile_signup_full — 비활성 워커 매칭 차단
-- ============================================================
create or replace function yeseong_mobile_signup_full(
  p_phone text,
  p_pin text,
  p_name text,
  p_rrn text,
  p_address text,
  p_bank_name text,
  p_account_number text,
  p_account_holder text,
  p_default_wage integer,
  p_default_trade text,
  p_is_foreign boolean default false,
  p_name_english text default null,
  p_nationality text default null,
  p_visa_status text default null
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_rrn_clean text;
  v_prefix text;
  v_gender text;
  v_worker_id uuid;
  v_is_active boolean;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;
  if p_phone is null or length(p_phone) < 10 then
    raise exception 'invalid phone';
  end if;
  if p_pin is null or p_pin !~ '^\d{4}$' then
    raise exception 'invalid pin';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid name';
  end if;

  v_rrn_clean := regexp_replace(coalesce(p_rrn, ''), '\D', '', 'g');
  if length(v_rrn_clean) <> 13 then
    raise exception 'invalid rrn';
  end if;
  v_prefix := substring(v_rrn_clean, 1, 6);
  v_gender := substring(v_rrn_clean, 7, 1);

  select id, is_active into v_worker_id, v_is_active from yeseong_workers
   where auth_user_id = v_user_id;

  if v_worker_id is null then
    select id, is_active into v_worker_id, v_is_active from yeseong_workers
     where phone = p_phone and auth_user_id is null;
  end if;

  if v_worker_id is not null and v_is_active = false then
    raise exception 'worker archived — contact admin to restore';
  end if;

  if v_worker_id is not null then
    update yeseong_workers
       set name = p_name,
           pin = p_pin,
           rrn_plain = v_rrn_clean,
           rrn_prefix = v_prefix,
           rrn_gender_digit = v_gender,
           address = p_address,
           bank_name = p_bank_name,
           account_number = p_account_number,
           account_holder = p_account_holder,
           default_wage = coalesce(p_default_wage, 0),
           default_trade = p_default_trade,
           is_foreign = coalesce(p_is_foreign, false),
           name_english = p_name_english,
           nationality = p_nationality,
           visa_status = p_visa_status,
           auth_user_id = v_user_id
     where id = v_worker_id;
  else
    insert into yeseong_workers (
      name, phone, pin,
      rrn_plain, rrn_prefix, rrn_gender_digit,
      address, bank_name, account_number, account_holder,
      default_wage, default_trade,
      is_foreign, name_english, nationality, visa_status,
      auth_user_id
    ) values (
      p_name, p_phone, p_pin,
      v_rrn_clean, v_prefix, v_gender,
      p_address, p_bank_name, p_account_number, p_account_holder,
      coalesce(p_default_wage, 0), p_default_trade,
      coalesce(p_is_foreign, false), p_name_english, p_nationality, p_visa_status,
      v_user_id
    )
    returning id into v_worker_id;
  end if;

  return v_worker_id;
end $$;

grant execute on function yeseong_mobile_signup_full(
  text, text, text, text, text, text, text, text, integer, text, boolean, text, text, text
) to authenticated;

-- ============================================================
-- 4) yeseong_manager_attach_worker_and_signup (v2) — 비활성 워커 차단
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

  select id, name, is_active into v_worker
    from yeseong_workers where phone = v_phone limit 1;
  if v_worker.id is null then
    raise exception 'worker not found for phone';
  end if;
  if v_worker.is_active = false then
    raise exception 'worker archived — contact admin to restore';
  end if;

  select id into v_manager_id from yeseong_site_managers where auth_user_id = v_user_id;
  if v_manager_id is not null then
    update yeseong_site_managers
       set name = v_worker.name, phone = v_phone, pin = p_pin
     where id = v_manager_id;
  else
    select id into v_manager_id from yeseong_site_managers where phone = v_phone;
    if v_manager_id is not null then
      update yeseong_site_managers
         set auth_user_id = v_user_id, name = v_worker.name, pin = p_pin
       where id = v_manager_id;
    else
      insert into yeseong_site_managers (auth_user_id, phone, name, pin)
      values (v_user_id, v_phone, v_worker.name, p_pin)
      returning id into v_manager_id;
    end if;
  end if;

  return jsonb_build_object('worker_id', v_worker.id, 'manager_id', v_manager_id);
end $$;

grant execute on function yeseong_manager_attach_worker_and_signup(text, text) to authenticated;

-- ============================================================
-- 5) yeseong_manager_signup_full (v2) — 비활성 워커 매칭 차단
-- ============================================================
create or replace function yeseong_manager_signup_full(
  p_phone text,
  p_pin text,
  p_name text,
  p_rrn text,
  p_address text,
  p_bank_name text,
  p_account_number text,
  p_account_holder text,
  p_default_wage integer,
  p_default_trade text,
  p_is_foreign boolean default false,
  p_name_english text default null,
  p_nationality text default null,
  p_visa_status text default null
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_phone text;
  v_rrn_clean text;
  v_prefix text;
  v_gender text;
  v_worker_id uuid;
  v_is_active boolean;
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
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid name';
  end if;

  v_rrn_clean := regexp_replace(coalesce(p_rrn, ''), '\D', '', 'g');
  if length(v_rrn_clean) <> 13 then
    raise exception 'invalid rrn';
  end if;
  v_prefix := substring(v_rrn_clean, 1, 6);
  v_gender := substring(v_rrn_clean, 7, 1);

  select id, is_active into v_worker_id, v_is_active from yeseong_workers
   where phone = v_phone limit 1;
  if v_worker_id is not null and v_is_active = false then
    raise exception 'worker archived — contact admin to restore';
  end if;

  if v_worker_id is not null then
    update yeseong_workers
       set name = trim(p_name),
           rrn_plain = v_rrn_clean,
           rrn_prefix = v_prefix,
           rrn_gender_digit = v_gender,
           address = p_address,
           bank_name = p_bank_name,
           account_number = p_account_number,
           account_holder = p_account_holder,
           default_wage = coalesce(p_default_wage, 0),
           default_trade = p_default_trade,
           is_foreign = coalesce(p_is_foreign, false),
           name_english = p_name_english,
           nationality = p_nationality,
           visa_status = p_visa_status
     where id = v_worker_id;
  else
    insert into yeseong_workers (
      name, phone,
      rrn_plain, rrn_prefix, rrn_gender_digit,
      address, bank_name, account_number, account_holder,
      default_wage, default_trade,
      is_foreign, name_english, nationality, visa_status
    ) values (
      trim(p_name), v_phone,
      v_rrn_clean, v_prefix, v_gender,
      p_address, p_bank_name, p_account_number, p_account_holder,
      coalesce(p_default_wage, 0), p_default_trade,
      coalesce(p_is_foreign, false), p_name_english, p_nationality, p_visa_status
    )
    returning id into v_worker_id;
  end if;

  select id into v_manager_id from yeseong_site_managers where auth_user_id = v_user_id;
  if v_manager_id is not null then
    update yeseong_site_managers
       set name = trim(p_name), phone = v_phone, pin = p_pin
     where id = v_manager_id;
  else
    select id into v_manager_id from yeseong_site_managers where phone = v_phone;
    if v_manager_id is not null then
      update yeseong_site_managers
         set auth_user_id = v_user_id, name = trim(p_name), pin = p_pin
       where id = v_manager_id;
    else
      insert into yeseong_site_managers (auth_user_id, phone, name, pin)
      values (v_user_id, v_phone, trim(p_name), p_pin)
      returning id into v_manager_id;
    end if;
  end if;

  return jsonb_build_object('worker_id', v_worker_id, 'manager_id', v_manager_id);
end $$;

grant execute on function yeseong_manager_signup_full(
  text, text, text, text, text, text, text, text, integer, text, boolean, text, text, text
) to authenticated;

-- ============================================================
-- 6) yeseong_mobile_register_attendance — 비활성 워커는 새 출역 등록 차단
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
  v_default_worksite uuid;
  v_default_sub uuid;
  v_worksite uuid;
  v_subcontractor uuid;
  v_year_month text;
  v_period_id uuid;
  v_slot_id uuid;
  v_attendance_id uuid;
  v_next_slot smallint;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;
  if p_hours is null or p_hours <= 0 or p_hours > 3.0 then
    raise exception 'invalid hours';
  end if;

  select id, is_active, default_wage, default_trade, default_worksite_id, default_subcontractor_id
    into v_worker_id, v_is_active, v_default_wage, v_default_trade, v_default_worksite, v_default_sub
    from yeseong_workers where auth_user_id = v_user_id;
  if v_worker_id is null then
    raise exception 'worker not linked to auth user';
  end if;
  if v_is_active = false then
    raise exception 'worker archived — contact admin';
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

  insert into yeseong_attendance
    (payroll_worker_id, work_date, hours, source, worksite_id, subcontractor_id)
  values
    (v_slot_id, p_work_date, p_hours, 'mobile', v_worksite, v_subcontractor)
  on conflict (payroll_worker_id, work_date) do update
    set hours = excluded.hours,
        worksite_id = excluded.worksite_id,
        subcontractor_id = excluded.subcontractor_id,
        source = 'mobile',
        updated_at = now()
  returning id into v_attendance_id;

  return v_attendance_id;
end $$;

grant execute on function yeseong_mobile_register_attendance(date, numeric, uuid, uuid) to authenticated;
