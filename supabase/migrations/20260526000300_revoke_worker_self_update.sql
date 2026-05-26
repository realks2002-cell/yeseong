-- 작업자 셀프 프로필 수정 차단
--   작업자마스터(yeseong_workers) 수정 권한은 관리자(웹 /workers)만 갖는다.
--   앱의 '내 정보'는 조회 전용으로 전환했고, 방어적으로 RPC 실행 권한도 회수한다.
--   조회용 yeseong_mobile_get_me 는 그대로 유지. 가입용 signup_full 도 영향 없음(별도 함수).
revoke execute on function yeseong_mobile_update_profile(text, text, text, text, text, text, text) from authenticated;
