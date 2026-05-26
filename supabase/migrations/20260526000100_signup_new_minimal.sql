-- 작업자 앱 신규 등록 간소화
--   신규(signup_new)는 전번·PIN·이름·주민번호만 받는다.
--   계좌·은행·주소·일당·구분·공종은 관리자가 웹(/workers)에서 보완.
--   → signup_new 의 missing 을 ['identity','rrn'] 로 축소.
--   나머지 분기(signup_partial / login)와 prefilled 는 20260524000100 과 동일하게 유지.
--   팀장 가입 흐름(yeseong_check_phone_full)은 건드리지 않는다.

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
      'missing', array['identity','rrn']::text[]
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
