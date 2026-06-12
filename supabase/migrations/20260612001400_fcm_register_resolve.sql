-- FCM 토큰 — 팀장 세션 worker 연결 수정
--   기존: 등록 RPC가 auth_user_id 직접 조회만 해서 팀장앱 토큰은 worker_id가 null
--         → 팀장/팀/전화번호 타겟팅(worker_id 기준)에서 전부 누락, 발송 0건
--   변경: yeseong_resolve_worker_id 로 통일 (팀장 phone 매칭 + 전화번호 폴백 포함)
--         + 기존 토큰 worker_id 백필

create or replace function yeseong_register_fcm_token(
  p_token text,
  p_device_type text default 'android',
  p_app_type text default 'worker'
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_worker_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  -- 작업자/팀장 공용 — 팀장 세션도 phone 매칭으로 worker 행 연결
  v_worker_id := yeseong_resolve_worker_id(v_user_id);

  -- 기존 토큰 비활성화 (같은 토큰)
  update yeseong_fcm_tokens
     set is_active = false, updated_at = now()
   where token = p_token and is_active = true;

  -- 새 토큰 삽입
  insert into yeseong_fcm_tokens (auth_user_id, worker_id, token, device_type, app_type)
  values (v_user_id, v_worker_id, p_token, p_device_type, p_app_type);
end $$;

grant execute on function yeseong_register_fcm_token(text, text, text) to authenticated;

-- 백필: worker_id 비어 있는 기존 토큰 연결
update yeseong_fcm_tokens t
   set worker_id = yeseong_resolve_worker_id(t.auth_user_id)
 where t.worker_id is null;
