-- yeseong_check_phone_full — manager_registered(팀장 마스터 등록 여부) 필드 추가
--   팀장앱은 /managers 마스터에 등록된 전화번호만 로그인/가입 가능 (자가 등록 차단)
--   기존 필드는 그대로 유지 (작업자앱 호환)

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
    'manager_registered', m.id is not null,
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
