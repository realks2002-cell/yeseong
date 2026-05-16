-- 모바일 가입 — 작업자 마스터에 일부 정보만 있을 때 결측 필드만 받아 채우는 흐름
--   1) yeseong_mobile_signup_status: phone 매칭 + 결측 필드 + prefill 반환
--   2) yeseong_mobile_signup_full v3: 입력 NULL이면 기존 값 유지(부분 업데이트)
--      - RRN은 마스터에 있으면 입력 생략 가능

-- ============================================================
-- 1) 결측 필드 계산 (worker row → text[])
-- ============================================================
create or replace function yeseong_compute_worker_missing(w yeseong_workers)
returns text[]
language plpgsql immutable
as $$
declare
  result text[] := '{}';
begin
  if w.name is null or btrim(w.name) = '' then
    result := array_append(result, 'identity');
  end if;
  if w.rrn_plain is null and w.rrn_encrypted is null then
    result := array_append(result, 'rrn');
  end if;
  if coalesce(w.is_foreign, false) and w.nationality is null then
    result := array_append(result, 'foreign');
  end if;
  if w.address is null then
    result := array_append(result, 'address');
  end if;
  if w.bank_name is null or w.account_number is null or w.account_holder is null then
    result := array_append(result, 'account');
  end if;
  if w.default_trade is null or coalesce(w.default_wage, 0) = 0 then
    result := array_append(result, 'work');
  end if;
  if w.default_worksite_id is null or w.default_subcontractor_id is null then
    result := array_append(result, 'belonging');
  end if;
  return result;
end $$;

-- ============================================================
-- 2) yeseong_mobile_signup_status — phone으로 매칭 상태 + 결측 필드
--    응답:
--      mode: 'login' | 'signup_partial' | 'signup_new'
--      worker_id: uuid (partial인 경우)
--      missing: text[] — 진행할 결측 단계 (PIN은 항상 받음)
--      prefilled: jsonb { name, is_foreign } — UI에 미리 채워줄 값
-- ============================================================
create or replace function yeseong_mobile_signup_status(p_phone text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_phone text;
  w yeseong_workers;
begin
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_phone) < 10 then
    raise exception 'invalid phone';
  end if;

  select * into w
    from yeseong_workers
   where phone = v_phone
     and coalesce(is_active, true)
   limit 1;

  if w.id is null then
    return jsonb_build_object(
      'mode', 'signup_new',
      'missing', array['identity','rrn','address','account','work','belonging']::text[]
    );
  end if;

  if w.auth_user_id is not null then
    return jsonb_build_object('mode', 'login');
  end if;

  return jsonb_build_object(
    'mode', 'signup_partial',
    'worker_id', w.id,
    'missing', yeseong_compute_worker_missing(w),
    'prefilled', jsonb_build_object(
      'name', w.name,
      'is_foreign', coalesce(w.is_foreign, false)
    )
  );
end $$;

grant execute on function yeseong_mobile_signup_status(text) to anon, authenticated;

-- ============================================================
-- 3) yeseong_mobile_signup_full v3 — NULL/빈 입력은 기존 값 유지
--    동일 시그니처 유지. 클라이언트가 결측 필드만 채워 보내고 나머지는 null 전송.
--    PIN은 항상 새로 설정. RRN은 마스터에 이미 있으면 입력 생략 가능.
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

  -- RRN 입력은 선택 (마스터에 이미 있으면 생략 가능). 입력 시 길이 검증.
  v_rrn_clean := nullif(regexp_replace(coalesce(p_rrn, ''), '\D', '', 'g'), '');
  if v_rrn_clean is not null and length(v_rrn_clean) <> 13 then
    raise exception 'invalid rrn';
  end if;
  v_prefix := case when v_rrn_clean is null then null else substring(v_rrn_clean, 1, 6) end;
  v_gender := case when v_rrn_clean is null then null else substring(v_rrn_clean, 7, 1) end;

  -- auth_user_id로 이미 연결된 워커
  select * into w from yeseong_workers where auth_user_id = v_user_id;

  -- phone으로 매칭
  if w.id is null then
    select * into w from yeseong_workers
     where phone = v_phone and auth_user_id is null
     limit 1;
  end if;

  if w.id is not null and coalesce(w.is_active, true) = false then
    raise exception 'worker archived — contact admin to restore';
  end if;

  -- 매칭된 워커 — 결측만 채우는 UPDATE
  if w.id is not null then
    -- RRN은 워커에 없을 때만 입력 필수
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
           is_foreign       = coalesce(p_is_foreign, is_foreign),
           name_english     = coalesce(nullif(btrim(p_name_english), ''), name_english),
           nationality      = coalesce(nullif(btrim(p_nationality), ''), nationality),
           visa_status      = coalesce(nullif(btrim(p_visa_status), ''), visa_status),
           auth_user_id     = v_user_id
     where id = w.id;
    return w.id;
  end if;

  -- 신규 INSERT — RRN 필수
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
    default_wage, default_trade,
    is_foreign, name_english, nationality, visa_status,
    auth_user_id
  ) values (
    btrim(p_name), v_phone, p_pin,
    v_rrn_clean, v_prefix, v_gender,
    nullif(btrim(p_address), ''), nullif(btrim(p_bank_name), ''),
    nullif(btrim(p_account_number), ''), nullif(btrim(p_account_holder), ''),
    coalesce(p_default_wage, 0), nullif(btrim(p_default_trade), ''),
    coalesce(p_is_foreign, false),
    nullif(btrim(p_name_english), ''), nullif(btrim(p_nationality), ''), nullif(btrim(p_visa_status), ''),
    v_user_id
  )
  returning id into w.id;

  return w.id;
end $$;

grant execute on function yeseong_mobile_signup_full(
  text, text, text, text, text, text, text, text, integer, text, boolean, text, text, text
) to authenticated;
