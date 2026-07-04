-- 로그인 경로(기존 가입자·마스터 등록자) 재동의 기록용 RPC
--   앱은 설치할 때마다(재설치 포함) 동의 화면을 다시 띄운다(프론트 localStorage 게이트).
--   로그인 사용자가 동의 화면을 통과하면 로그인 성공 직후 이 RPC로 동의 시각/버전을 기록한다.
--   작업자·팀장 모두 yeseong_workers 행에 PII·동의가 저장되므로 resolve_worker_id로 해석.

create or replace function yeseong_ack_consent(p_version text default '1.1')
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_wid uuid;
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'unauthenticated';
  end if;

  v_wid := yeseong_resolve_worker_id(v_uid);
  if v_wid is null then
    return; -- 아직 worker 행이 없으면 조용히 종료 (가입 RPC가 별도로 기록)
  end if;

  update yeseong_workers
     set consent_personal_at = coalesce(consent_personal_at, v_now),
         consent_rrn_at      = coalesce(consent_rrn_at, v_now),
         consent_location_at = coalesce(consent_location_at, v_now),
         consent_version     = coalesce(p_version, consent_version)
   where id = v_wid;
end $$;

grant execute on function yeseong_ack_consent(text) to authenticated;
