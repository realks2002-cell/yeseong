-- 모바일 가입 통합 RPC — 노임대장 필요 정보 모두 1콜에 저장
-- phone 매칭 worker 있으면 update + auth_user_id 연결, 없으면 신규 INSERT
-- RRN 평문 저장 (사용자 결정), prefix/gender_digit는 검색용으로 자동 추출

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

  -- 본인이 이미 연결돼 있으면 그대로 update
  select id into v_worker_id from yeseong_workers
   where auth_user_id = v_user_id;

  if v_worker_id is null then
    -- phone 매칭 시도 (관리자가 시드해둔 worker 매칭)
    select id into v_worker_id from yeseong_workers
     where phone = p_phone and auth_user_id is null;
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
