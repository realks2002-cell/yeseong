-- 팀장앱 가입도 결측 단계만 진행하도록 통합
--   1) yeseong_check_phone_full v2: missing/prefilled 추가
--   2) yeseong_manager_signup_full v3: NULL coalesce로 부분 업데이트

-- ============================================================
-- 1) check_phone_full v2 — missing/prefilled 추가
-- ============================================================
create or replace function yeseong_check_phone_full(p_phone text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_phone text;
  w yeseong_workers;
  v_manager_exists boolean;
begin
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_phone) < 10 then
    raise exception 'invalid phone';
  end if;

  select * into w from yeseong_workers
   where phone = v_phone
   limit 1;

  select exists (
    select 1 from yeseong_site_managers
     where phone = v_phone and auth_user_id is not null
  ) into v_manager_exists;

  return jsonb_build_object(
    'has_worker', w.id is not null and coalesce(w.is_active, true),
    'worker_archived', w.id is not null and w.is_active = false,
    'worker_has_auth', w.id is not null and w.auth_user_id is not null,
    'worker_name', w.name,
    'has_manager', v_manager_exists,
    'missing', case
      when w.id is null or coalesce(w.is_active, true) = false
        then array['identity','rrn','address','account','work','belonging']::text[]
      else yeseong_compute_worker_missing(w)
    end,
    'prefilled', case
      when w.id is null then null
      else jsonb_build_object(
        'name', w.name,
        'is_foreign', coalesce(w.is_foreign, false)
      )
    end
  );
end $$;

grant execute on function yeseong_check_phone_full(text) to anon, authenticated;

-- ============================================================
-- 2) manager_signup_full v3 — NULL coalesce로 부분 업데이트
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
  w yeseong_workers;
  v_manager_id uuid;
  v_resolved_name text;
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

  v_rrn_clean := nullif(regexp_replace(coalesce(p_rrn, ''), '\D', '', 'g'), '');
  if v_rrn_clean is not null and length(v_rrn_clean) <> 13 then
    raise exception 'invalid rrn';
  end if;
  v_prefix := case when v_rrn_clean is null then null else substring(v_rrn_clean, 1, 6) end;
  v_gender := case when v_rrn_clean is null then null else substring(v_rrn_clean, 7, 1) end;

  select * into w from yeseong_workers where phone = v_phone limit 1;

  if w.id is not null and coalesce(w.is_active, true) = false then
    raise exception 'worker archived — contact admin to restore';
  end if;

  if w.id is not null then
    if w.rrn_plain is null and w.rrn_encrypted is null and v_rrn_clean is null then
      raise exception 'rrn required';
    end if;

    update yeseong_workers
       set name             = coalesce(nullif(btrim(p_name), ''), name),
           phone            = coalesce(phone, v_phone),
           rrn_plain        = coalesce(v_rrn_clean, rrn_plain),
           rrn_prefix       = coalesce(v_prefix, rrn_prefix),
           rrn_gender_digit = coalesce(v_gender, rrn_gender_digit),
           address          = coalesce(nullif(btrim(p_address), ''), address),
           bank_name        = coalesce(nullif(btrim(p_bank_name), ''), bank_name),
           account_number   = coalesce(nullif(btrim(p_account_number), ''), account_number),
           account_holder   = coalesce(nullif(btrim(p_account_holder), ''), account_holder),
           default_wage     = case
                                when coalesce(p_default_wage, 0) > 0 then p_default_wage
                                else default_wage
                              end,
           default_trade    = coalesce(nullif(btrim(p_default_trade), ''), default_trade),
           is_foreign       = coalesce(p_is_foreign, is_foreign),
           name_english     = coalesce(nullif(btrim(p_name_english), ''), name_english),
           nationality      = coalesce(nullif(btrim(p_nationality), ''), nationality),
           visa_status      = coalesce(nullif(btrim(p_visa_status), ''), visa_status)
     where id = w.id
     returning name into v_resolved_name;
  else
    if v_rrn_clean is null then
      raise exception 'rrn required';
    end if;
    if p_name is null or btrim(p_name) = '' then
      raise exception 'name required';
    end if;

    insert into yeseong_workers (
      name, phone,
      rrn_plain, rrn_prefix, rrn_gender_digit,
      address, bank_name, account_number, account_holder,
      default_wage, default_trade,
      is_foreign, name_english, nationality, visa_status
    ) values (
      btrim(p_name), v_phone,
      v_rrn_clean, v_prefix, v_gender,
      nullif(btrim(p_address), ''), nullif(btrim(p_bank_name), ''),
      nullif(btrim(p_account_number), ''), nullif(btrim(p_account_holder), ''),
      coalesce(p_default_wage, 0), nullif(btrim(p_default_trade), ''),
      coalesce(p_is_foreign, false),
      nullif(btrim(p_name_english), ''), nullif(btrim(p_nationality), ''), nullif(btrim(p_visa_status), '')
    )
    returning id, name into w.id, v_resolved_name;
  end if;

  -- site_manager upsert
  select id into v_manager_id from yeseong_site_managers where auth_user_id = v_user_id;
  if v_manager_id is not null then
    update yeseong_site_managers
       set name = v_resolved_name, phone = v_phone, pin = p_pin
     where id = v_manager_id;
  else
    select id into v_manager_id from yeseong_site_managers where phone = v_phone;
    if v_manager_id is not null then
      update yeseong_site_managers
         set auth_user_id = v_user_id, name = v_resolved_name, pin = p_pin
       where id = v_manager_id;
    else
      insert into yeseong_site_managers (auth_user_id, phone, name, pin)
      values (v_user_id, v_phone, v_resolved_name, p_pin)
      returning id into v_manager_id;
    end if;
  end if;

  return jsonb_build_object('worker_id', w.id, 'manager_id', v_manager_id);
end $$;

grant execute on function yeseong_manager_signup_full(
  text, text, text, text, text, text, text, text, integer, text, boolean, text, text, text
) to authenticated;
