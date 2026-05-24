-- audit 대상을 마스터 데이터로 한정
--   유지: yeseong_workers, yeseong_site_managers, yeseong_subcontractors,
--        yeseong_worksites, yeseong_masonry_prices
--   제거: yeseong_attendance (출역 — 양 많고 운영 데이터),
--        yeseong_masonry_volumes (월별 성과 — 입력 데이터),
--        yeseong_payroll_workers (노임대장 슬롯 — 운영)
--
-- 기존 audit_log row는 유지 (제거 안 함). 향후 트리거가 안 잡을 뿐.
--
-- 이전 마이그레이션의 trigger 명명 버그 호환:
--   create trigger {table}_audit + drop trigger {table}_audit_audit 패턴이
--   섞여있어 둘 다 시도

drop trigger if exists yeseong_attendance_audit on yeseong_attendance;
drop trigger if exists yeseong_attendance_audit_audit on yeseong_attendance;

drop trigger if exists yeseong_masonry_volumes_audit on yeseong_masonry_volumes;
drop trigger if exists yeseong_masonry_volumes_audit_audit on yeseong_masonry_volumes;

drop trigger if exists yeseong_payroll_workers_audit on yeseong_payroll_workers;
drop trigger if exists yeseong_payroll_workers_audit_audit on yeseong_payroll_workers;
