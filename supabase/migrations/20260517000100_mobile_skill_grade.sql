-- 모바일 작업자앱 — 구분(skill_grade) 입력 지원
--   1) yeseong_mobile_signup_full v4: p_skill_grade 추가
--   2) yeseong_mobile_update_profile v2: p_skill_grade 추가
--   3) yeseong_mobile_get_me: 응답에 skill_grade 추가

-- ============================================================
-- 1) yeseong_mobile_signup_full v4 — p_skill_grade 추가
--    시그니처 변경 → drop 후 재정의
-- ============================================================
drop function if exists yeseong_mobile_signup_full(
  text, text, text, text, text, text, text, text, integer, text, boolean, text, text, text
);

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
  p_visa_status text default null,
  p_skill_grade text default null
) returns uuid
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

  select * into w from yeseong_workers where auth_user_id = v_user_id;

  if w.id is null then
    select * into w from yeseong_workers
     where phone = v_phone and auth_user_id is null
     limit 1;
  end if;

  if w.id is not null and coalesce(w.is_active, true) = false then
    raise exception 'worker archived — contact admin to restore';
  end if;

  if w.id is not null then
    if w.rrn_plain is null and w.rrn_encrypted is null and v_rrn_clean is null then
      raise exception 'rrn required';
    end if;

    update yeseong_workers
       set name             = coalesce(nullif(btrim(p_name), ''), name),
           pin              = p_pin,
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
           skill_grade      = coalesce(nullif(btrim(p_skill_grade), ''), skill_grade),
           is_foreign       = coalesce(p_is_foreign, is_foreign),
           name_english     = coalesce(nullif(btrim(p_name_english), ''), name_english),
           nationality      = coalesce(nullif(btrim(p_nationality), ''), nationality),
           visa_status      = coalesce(nullif(btrim(p_visa_status), ''), visa_status),
           auth_user_id     = v_user_id
     where id = w.id;
    return w.id;
  end if;

  if v_rrn_clean is null then
    raise exception 'rrn required';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'name required';
  end if;

  insert into yeseong_workers (
    name, phone, pin,
    rrn_plain, rrn_prefix, rrn_gender_digit,
    address, bank_name, account_number, account_holder,
    default_wage, default_trade, skill_grade,
    is_foreign, name_english, nationality, visa_status,
    auth_user_id
  ) values (
    btrim(p_name), v_phone, p_pin,
    v_rrn_clean, v_prefix, v_gender,
    nullif(btrim(p_address), ''), nullif(btrim(p_bank_name), ''),
    nullif(btrim(p_account_number), ''), nullif(btrim(p_account_holder), ''),
    coalesce(p_default_wage, 0), nullif(btrim(p_default_trade), ''), nullif(btrim(p_skill_grade), ''),
    coalesce(p_is_foreign, false),
    nullif(btrim(p_name_english), ''), nullif(btrim(p_nationality), ''), nullif(btrim(p_visa_status), ''),
    v_user_id
  )
  returning id into w.id;

  return w.id;
end $$;

grant execute on function yeseong_mobile_signup_full(
  text, text, text, text, text, text, text, text, integer, text, boolean, text, text, text, text
) to authenticated;


-- ============================================================
-- 2) yeseong_mobile_update_profile v2 — p_skill_grade 추가
-- ============================================================
drop function if exists yeseong_mobile_update_profile(text, text, text, text, text, text);

create or replace function yeseong_mobile_update_profile(
  p_name text default null,
  p_default_trade text default null,
  p_bank_name text default null,
  p_account_number text default null,
  p_account_holder text default null,
  p_address text default null,
  p_skill_grade text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
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
    skill_grade = case
      when p_skill_grade is null then skill_grade
      when btrim(p_skill_grade) = '' then null
      else btrim(p_skill_grade)
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
  where auth_user_id = v_user_id;

  if not found then
    raise exception 'profile not found';
  end if;
end $$;

grant execute on function yeseong_mobile_update_profile(text, text, text, text, text, text, text) to authenticated;


-- ============================================================
-- 3) yeseong_mobile_get_me — 응답에 skill_grade 추가
-- ============================================================
create or replace function yeseong_mobile_get_me()
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
    'worker', jsonb_build_object(
      'id', w.id,
      'name', w.name,
      'phone', w.phone,
      'default_trade', w.default_trade,
      'skill_grade', w.skill_grade,
      'default_worksite_id', w.default_worksite_id,
      'default_subcontractor_id', w.default_subcontractor_id,
      'bank_name', w.bank_name,
      'account_number', w.account_number,
      'account_holder', w.account_holder,
      'address', w.address
    ),
    'worksite', case when ws.id is not null then jsonb_build_object('id', ws.id, 'name', ws.name) end,
    'subcontractor', case when sc.id is not null then jsonb_build_object('id', sc.id, 'name', sc.name) end,
    'recent', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'work_date', a.work_date,
        'hours', a.hours,
        'approval_status', a.approval_status,
        'rejection_reason', a.rejection_reason
      ) order by a.work_date desc), '[]'::jsonb)
      from yeseong_attendance a
      join yeseong_payroll_workers pw on pw.id = a.payroll_worker_id
      where pw.worker_id = w.id
        and a.work_date >= current_date - interval '7 days'
    )
  ) into result
  from yeseong_workers w
  left join yeseong_worksites ws on ws.id = w.default_worksite_id
  left join yeseong_subcontractors sc on sc.id = w.default_subcontractor_id
  where w.auth_user_id = v_user_id;

  return result;
end $$;
