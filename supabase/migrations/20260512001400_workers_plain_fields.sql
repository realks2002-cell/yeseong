-- 모바일 가입자 평문 RRN/PIN 저장 + 외국인 플래그
-- 결정 (2026-05-12): 사용자 명시 — 암호화 불필요, 관리자 확인 가능해야 함
--
-- 보안 메모: RRN 평문 저장은 한국 개인정보보호법 위반 소지.
--   현재 RLS는 auth.uid() is not null이라 인증된 모든 사용자가 read 가능.
--   정식 운영 전 관리자 전용 RLS 또는 audit log 필요.

alter table yeseong_workers add column rrn_plain text;
alter table yeseong_workers add column pin text;
alter table yeseong_workers add column is_foreign boolean not null default false;

-- 기존 시드 워커(82명) 평문 백필
-- yeseong_decrypt_rrn은 service_role만 실행 가능하지만
-- 마이그레이션은 supabase 권한자 컨텍스트에서 실행되므로 통과
update yeseong_workers
   set rrn_plain = yeseong_decrypt_rrn(rrn_encrypted)
 where rrn_encrypted is not null and rrn_plain is null;
