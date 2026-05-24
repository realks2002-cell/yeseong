-- 모바일 작업자 가입에 팀장 선택 추가
--   yeseong_mobile_signup_full v6: p_team_leader_id 파라미터 추가
--   yeseong_mobile_set_defaults v2: p_team_leader_id 파라미터 추가
--   workers.team_leader_id 는 site_managers(id) FK (20260523000300 마이그레이션)

-- ============================================================
-- 1) yeseong_mobile_signup_full v6 — p_team_leader_id 추가
-- ============================================================
drop function if exists yeseong_mobile_signup_full(
  text, text, text, text, text, text, text, text, integer, text,
  boolean, text, text, text, text,
  boolean, boolean, boolean, boolean, text
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
  p_skill_grade text default null,
  p_consent_personal boolean default false,
  p_consent_rrn boolean default false,
  p_consent_foreign_id boolean default false,
  p_consent_third_party boolean default false,
  p_consent_version text default '1.0',
  p_team_leader_id uuid default null
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
  v_now timestamptz := now();
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
           default_wage     = case when coalesce(p_default_wage, 0) > 0 then p_default_wage else default_wage end,
           default_trade    = coalesce(nullif(btrim(p_default_trade), ''), default_trade),
           skill_grade      = coalesce(nullif(btrim(p_skill_grade), ''), skill_grade),
           is_foreign       = coalesce(p_is_foreign, is_foreign),
           name_english     = coalesce(nullif(btrim(p_name_english), ''), name_english),
           nationality      = coalesce(nullif(btrim(p_nationality), ''), nationality),
           visa_status      = coalesce(nullif(btrim(p_visa_status), ''), visa_status),
           team_leader_id   = coalesce(p_team_leader_id, team_leader_id),
           auth_user_id     = v_user_id,
           consent_personal_at    = coalesce(consent_personal_at, v_now),
           consent_rrn_at         = coalesce(consent_rrn_at, v_now),
           consent_foreign_id_at  = case when coalesce(p_consent_foreign_id, false)
                                          then coalesce(consent_foreign_id_at, v_now)
                                          else consent_foreign_id_at end,
           consent_third_party_at = case when coalesce(p_consent_third_party, false)
                                          then coalesce(consent_third_party_at, v_now)
                                          else consent_third_party_at end,
           consent_version        = coalesce(p_consent_version, consent_version)
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
    team_leader_id,
    auth_user_id,
    consent_personal_at, consent_rrn_at,
    consent_foreign_id_at, consent_third_party_at, consent_version
  ) values (
    btrim(p_name), v_phone, p_pin,
    v_rrn_clean, v_prefix, v_gender,
    nullif(btrim(p_address), ''), nullif(btrim(p_bank_name), ''),
    nullif(btrim(p_account_number), ''), nullif(btrim(p_account_holder), ''),
    coalesce(p_default_wage, 0), nullif(btrim(p_default_trade), ''), nullif(btrim(p_skill_grade), ''),
    coalesce(p_is_foreign, false),
    nullif(btrim(p_name_english), ''), nullif(btrim(p_nationality), ''), nullif(btrim(p_visa_status), ''),
    p_team_leader_id,
    v_user_id,
    v_now, v_now,
    case when coalesce(p_consent_foreign_id, false) then v_now else null end,
    case when coalesce(p_consent_third_party, false) then v_now else null end,
    p_consent_version
  )
  returning id into w.id;
  return w.id;
end $$;

grant execute on function yeseong_mobile_signup_full(
  text, text, text, text, text, text, text, text, integer, text,
  boolean, text, text, text, text,
  boolean, boolean, boolean, boolean, text, uuid
) to authenticated;


-- ============================================================
-- 2) yeseong_mobile_set_defaults v2 — p_team_leader_id 추가
-- ============================================================
drop function if exists yeseong_mobile_set_defaults(uuid, uuid);

create or replace function yeseong_mobile_set_defaults(
  p_worksite_id uuid,
  p_subcontractor_id uuid,
  p_team_leader_id uuid default null
) returns void
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
     set default_worksite_id = p_worksite_id,
         default_subcontractor_id = p_subcontractor_id,
         team_leader_id = coalesce(p_team_leader_id, team_leader_id)
   where auth_user_id = v_user_id;

  if not found then
    raise exception 'worker not linked to auth user';
  end if;
end $$;

grant execute on function yeseong_mobile_set_defaults(uuid, uuid, uuid) to authenticated;
