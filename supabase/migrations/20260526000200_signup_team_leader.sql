-- 작업자 앱 신규 등록: 주민번호 다음에 팀장 선택 단계 추가
--   1) 가입 중(미인증) 작업자가 고를 수 있는 팀장 목록 RPC (anon 실행)
--   2) signup_new 의 missing 에 'leader' 추가 → 신규 흐름에 팀장 선택 단계 노출
--   signup_full v6 는 이미 p_team_leader_id 를 받으므로(20260523000400) RPC 추가 변경 없음.

-- 1) 팀장 목록 — 활성 팀장의 id, name 만 노출 (전화번호 등 민감정보 제외)
create or replace function yeseong_list_team_leaders()
returns table(id uuid, name text)
language sql
security definer
set search_path = public
as $$
  select id, name
    from yeseong_site_managers
   where coalesce(is_active, true)
   order by name;
$$;

grant execute on function yeseong_list_team_leaders() to anon, authenticated;

-- 2) signup_new missing 에 leader 추가 (나머지 분기는 20260526000100 과 동일 유지)
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
      'missing', array['identity','rrn','leader']::text[]
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
