-- 20260526000300 보강: update_profile 권한이 실제로 회수되지 않던 문제 수정
--   원인: PostgreSQL 함수는 생성 시 PUBLIC 에 EXECUTE 가 기본 부여된다.
--         authenticated 만 revoke 해도 PUBLIC 경유로 실행이 가능했다.
--   조치: PUBLIC / authenticated / anon 모두에서 EXECUTE 회수 → 작업자 셀프 수정 완전 차단.
--   조회용 get_me 및 가입용 signup_full 은 영향 없음(별도 함수).
revoke execute on function yeseong_mobile_update_profile(text, text, text, text, text, text, text) from public;
revoke execute on function yeseong_mobile_update_profile(text, text, text, text, text, text, text) from authenticated;
revoke execute on function yeseong_mobile_update_profile(text, text, text, text, text, text, text) from anon;
