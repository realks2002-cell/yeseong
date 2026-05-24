-- yeseong_mobile_signup_status v2 — prefilled에 모든 비민감 필드 추가
--   회원가입 흐름에서 DB에 있는 정보는 확인 단계로 보여주기 위해 클라이언트가 알아야 함
--   RRN은 마스킹용으로 prefix/gender_digit만 노출

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
      'name_english', w.name_english,
      'is_foreign', coalesce(w.is_foreign, false),
      'nationality', w.nationality,
      'visa_status', w.visa_status,
      'rrn_prefix', w.rrn_prefix,
      'rrn_gender_digit', w.rrn_gender_digit,
      'address', w.address,
      'bank_name', w.bank_name,
      'account_number', w.account_number,
      'account_holder', w.account_holder,
      'default_wage', w.default_wage,
      'skill_grade', w.skill_grade,
      'default_trade', w.default_trade,
      'default_worksite_id', w.default_worksite_id,
      'default_subcontractor_id', w.default_subcontractor_id,
      'team_leader_id', w.team_leader_id
    )
  );
end $$;

grant execute on function yeseong_mobile_signup_status(text) to anon, authenticated;

-- yeseong_check_phone_full v2 — 팀장 가입 흐름. prefilled 확장.
-- 기존 시그니처/응답 구조 유지하되 prefilled를 풍부하게.
create or replace function yeseong_check_phone_full(p_phone text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_phone text;
  w yeseong_workers;
  m yeseong_site_managers;
begin
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_phone) < 10 then
    raise exception 'invalid phone';
  end if;

  select * into w from yeseong_workers where phone = v_phone and coalesce(is_active, true) limit 1;
  select * into m from yeseong_site_managers where phone = v_phone limit 1;

  return jsonb_build_object(
    'has_worker', w.id is not null,
    'worker_has_auth', w.auth_user_id is not null,
    'worker_name', w.name,
    'has_manager', m.auth_user_id is not null,
    'missing', case
      when w.id is null then array['identity','rrn','address','account','work']::text[]
      else (
        select array(
          select unnest(yeseong_compute_worker_missing(w))
          except select 'belonging'
        )
      )
    end,
    'prefilled', case
      when w.id is null then null
      else jsonb_build_object(
        'name', w.name,
        'name_english', w.name_english,
        'is_foreign', coalesce(w.is_foreign, false),
        'nationality', w.nationality,
        'visa_status', w.visa_status,
        'rrn_prefix', w.rrn_prefix,
        'rrn_gender_digit', w.rrn_gender_digit,
        'address', w.address,
        'bank_name', w.bank_name,
        'account_number', w.account_number,
        'account_holder', w.account_holder,
        'default_wage', w.default_wage,
        'skill_grade', w.skill_grade,
        'default_trade', w.default_trade
      )
    end
  );
end $$;

grant execute on function yeseong_check_phone_full(text) to anon, authenticated;
