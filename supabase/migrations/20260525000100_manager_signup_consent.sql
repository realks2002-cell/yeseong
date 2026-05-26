-- 팀장(매니저) 가입에도 개인정보 수집 동의 적용 (PIPA §15, §24, §24조의2, §17)
-- 배경: 팀장 가입은 yeseong_workers 행에 주민번호·계좌·주소 등 민감정보를 저장하면서도
--       동의 절차가 없었음. 작업자 가입(yeseong_mobile_signup_full v5, 20260523000000)과 동일하게
--       동의 파라미터를 받아 worker 행에 기록하고, 필수 동의 누락 시 차단.
--
-- 저장 위치: 동의 컬럼은 이미 yeseong_workers 에 존재 (consent_*_at, consent_version).
--            팀장의 PII도 worker 행에 저장되므로 추가 컬럼 불필요.
--
-- 기존 로직(20260525000000)은 그대로 유지하고 동의만 추가:
--   - worker 매칭/생성 (UPDATE/INSERT 양쪽에 동의 기록)
--   - site_manager 매칭/생성 + is_active 재활성화
--   - 이름 fallback / placeholder 매칭

-- 시그니처 변경(파라미터 추가) → 기존 14-arg 버전 drop 후 재정의
drop function if exists yeseong_manager_signup_full(
  text, text, text, text, text, text, text, text, integer, text, boolean, text, text, text
);

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
  p_visa_status text default null,
  p_consent_personal boolean default false,
  p_consent_rrn boolean default false,
  p_consent_foreign_id boolean default false,
  p_consent_third_party boolean default false,
  p_consent_version text default '1.0'
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
  v_now timestamptz := now();
  w yeseong_workers;
  v_manager_id uuid;
  v_resolved_name text;
  v_name_candidate_count int;
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

  -- 필수 동의 검증 (PIPA 위반 방지) — 작업자 가입과 동일
  if coalesce(p_consent_personal, false) = false then
    raise exception 'consent_personal_required';
  end if;
  if coalesce(p_consent_rrn, false) = false then
    raise exception 'consent_rrn_required';
  end if;
  if coalesce(p_is_foreign, false) = true and coalesce(p_consent_foreign_id, false) = false then
    raise exception 'consent_foreign_id_required';
  end if;

  v_rrn_clean := nullif(regexp_replace(coalesce(p_rrn, ''), '\D', '', 'g'), '');
  if v_rrn_clean is not null and length(v_rrn_clean) <> 13 then
    raise exception 'invalid rrn';
  end if;
  v_prefix := case when v_rrn_clean is null then null else substring(v_rrn_clean, 1, 6) end;
  v_gender := case when v_rrn_clean is null then null else substring(v_rrn_clean, 7, 1) end;

  -- worker 처리
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
           default_wage     = case when coalesce(p_default_wage, 0) > 0 then p_default_wage else default_wage end,
           default_trade    = coalesce(nullif(btrim(p_default_trade), ''), default_trade),
           is_foreign       = coalesce(p_is_foreign, is_foreign),
           name_english     = coalesce(nullif(btrim(p_name_english), ''), name_english),
           nationality      = coalesce(nullif(btrim(p_nationality), ''), nationality),
           visa_status      = coalesce(nullif(btrim(p_visa_status), ''), visa_status),
           consent_personal_at    = coalesce(consent_personal_at, v_now),
           consent_rrn_at         = coalesce(consent_rrn_at, v_now),
           consent_foreign_id_at  = case
                                      when coalesce(p_consent_foreign_id, false) then coalesce(consent_foreign_id_at, v_now)
                                      else consent_foreign_id_at
                                    end,
           consent_third_party_at = case
                                      when coalesce(p_consent_third_party, false) then coalesce(consent_third_party_at, v_now)
                                      else consent_third_party_at
                                    end,
           consent_version        = coalesce(p_consent_version, consent_version)
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
      is_foreign, name_english, nationality, visa_status,
      consent_personal_at, consent_rrn_at,
      consent_foreign_id_at, consent_third_party_at, consent_version
    ) values (
      btrim(p_name), v_phone,
      v_rrn_clean, v_prefix, v_gender,
      nullif(btrim(p_address), ''), nullif(btrim(p_bank_name), ''),
      nullif(btrim(p_account_number), ''), nullif(btrim(p_account_holder), ''),
      coalesce(p_default_wage, 0), nullif(btrim(p_default_trade), ''),
      coalesce(p_is_foreign, false),
      nullif(btrim(p_name_english), ''), nullif(btrim(p_nationality), ''), nullif(btrim(p_visa_status), ''),
      v_now, v_now,
      case when coalesce(p_consent_foreign_id, false) then v_now else null end,
      case when coalesce(p_consent_third_party, false) then v_now else null end,
      p_consent_version
    )
    returning id, name into w.id, v_resolved_name;
  end if;

  -- site_manager 매칭/생성
  -- (1) 이미 본인 가입 — auth_user_id
  select id into v_manager_id from yeseong_site_managers where auth_user_id = v_user_id;

  if v_manager_id is not null then
    update yeseong_site_managers
       set name = v_resolved_name, phone = v_phone, pin = p_pin,
           is_active = true   -- 비활성 처리됐던 팀장이 재가입하면 자동 복원
     where id = v_manager_id;
  else
    -- (2) 관리자가 phone 입력해서 미리 만든 row
    select id into v_manager_id from yeseong_site_managers where phone = v_phone;

    if v_manager_id is null then
      -- (3) 관리자가 이름만 등록한 placeholder (phone is null, auth 없음)
      select count(*) into v_name_candidate_count
        from yeseong_site_managers
       where name = v_resolved_name
         and phone is null
         and auth_user_id is null;

      if v_name_candidate_count = 1 then
        select id into v_manager_id
          from yeseong_site_managers
         where name = v_resolved_name
           and phone is null
           and auth_user_id is null
         limit 1;
      end if;
      -- 동명이인 placeholder 여러 개면 자동 매칭 불가 → 새 row INSERT (관리자가 수동 정리)
    end if;

    if v_manager_id is not null then
      update yeseong_site_managers
         set auth_user_id = v_user_id, name = v_resolved_name, phone = v_phone, pin = p_pin,
             is_active = true   -- 비활성 처리됐던 팀장이 재가입하면 자동 복원
       where id = v_manager_id;
    else
      -- (4) 최종 fallback — 새 row 생성 (default is_active = true)
      insert into yeseong_site_managers (auth_user_id, phone, name, pin)
      values (v_user_id, v_phone, v_resolved_name, p_pin)
      returning id into v_manager_id;
    end if;
  end if;

  return jsonb_build_object('worker_id', w.id, 'manager_id', v_manager_id);
end $$;

grant execute on function yeseong_manager_signup_full(
  text, text, text, text, text, text, text, text, integer, text,
  boolean, text, text, text,
  boolean, boolean, boolean, boolean, text
) to authenticated;
