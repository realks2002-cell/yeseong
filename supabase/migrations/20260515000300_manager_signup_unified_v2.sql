-- 매니저 가입 RPC 보정:
-- 1) attach_worker_and_signup: workers.auth_user_id/pin은 건드리지 않음 (작업자 앱 가입은 별도)
-- 2) signup_full: 신규 매니저용 9단계 정보로 workers INSERT(auth_user_id NULL) + site_managers INSERT
-- 3) update_my_worker_info: 매니저 본인 phone의 workers row 수정 (RLS 우회 SECURITY DEFINER)

-- ============================================================
-- 1) 기존 attach_worker_and_signup 보정: workers 미수정
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

  select id, name into v_worker
    from yeseong_workers where phone = v_phone limit 1;
  if v_worker.id is null then
    raise exception 'worker not found for phone';
  end if;

  -- site_managers UPSERT
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
-- 2) 신규 매니저 가입 — workers + site_managers 동시 생성
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

  -- 1. workers UPSERT (auth_user_id는 NULL 유지 — 작업자 앱 가입은 별도)
  select id into v_worker_id from yeseong_workers where phone = v_phone limit 1;
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

  -- 2. site_managers UPSERT
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
-- 3) 매니저 본인 phone에 매칭된 workers row 정보 수정
--    auth.uid() → site_managers.phone → workers.phone 동일 row만 수정
-- ============================================================
create or replace function yeseong_manager_update_my_worker_info(
  p_name text default null,
  p_default_trade text default null,
  p_bank_name text default null,
  p_account_number text default null,
  p_account_holder text default null,
  p_address text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_phone text;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select phone into v_phone from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_phone is null then
    raise exception 'manager not found';
  end if;

  update yeseong_workers
  set
    name = case
      when p_name is null then name
      when btrim(p_name) = '' then name
      else btrim(p_name)
    end,
    default_trade = case
      when p_default_trade is null then default_trade
      when btrim(p_default_trade) = '' then null
      else btrim(p_default_trade)
    end,
    bank_name = case
      when p_bank_name is null then bank_name
      when btrim(p_bank_name) = '' then null
      else btrim(p_bank_name)
    end,
    account_number = case
      when p_account_number is null then account_number
      when btrim(p_account_number) = '' then null
      else btrim(p_account_number)
    end,
    account_holder = case
      when p_account_holder is null then account_holder
      when btrim(p_account_holder) = '' then null
      else btrim(p_account_holder)
    end,
    address = case
      when p_address is null then address
      when btrim(p_address) = '' then null
      else btrim(p_address)
    end
  where phone = v_phone;

  -- site_managers.name도 동기화 (이름 변경 시)
  if p_name is not null and btrim(p_name) <> '' then
    update yeseong_site_managers
       set name = btrim(p_name)
     where auth_user_id = v_user_id;
  end if;
end $$;

grant execute on function yeseong_manager_update_my_worker_info(text, text, text, text, text, text) to authenticated;
