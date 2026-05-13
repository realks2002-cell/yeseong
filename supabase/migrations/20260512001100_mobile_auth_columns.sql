-- 모바일 작업자 인증·출역 등록 기반 컬럼
--
-- 결정 사항 (2026-05-12):
--   1) 모바일 가입자는 RRN 입력 안 함 → rrn_* nullable로 변경
--      관리자가 노임대장 출력 전에 RRN 보완
--   2) workers.auth_user_id 추가 (auth.users 1:1 매핑)
--   3) workers.default_worksite_id 추가 (long-lived 매핑, 출역 시 스냅샷)
--   4) workers.phone unique partial index (NULL 허용, 값 있을 때만 unique)
--   5) attendance에 worksite_id/subcontractor_id 스냅샷 컬럼 추가
--      (default 변경 시 과거 출역 영향 없도록)

-- ============================================================
-- 1) workers RRN 컬럼 nullable
-- ============================================================
alter table yeseong_workers alter column rrn_encrypted drop not null;
alter table yeseong_workers alter column rrn_prefix drop not null;
alter table yeseong_workers alter column rrn_gender_digit drop not null;

-- 기존 자연키 unique 제거 (NULL 포함 시 의미 없음)
alter table yeseong_workers drop constraint if exists yeseong_workers_natural_key;

-- ============================================================
-- 2) workers.auth_user_id (모바일 인증 연결)
-- ============================================================
alter table yeseong_workers
  add column auth_user_id uuid references auth.users(id) on delete set null;
create unique index yeseong_workers_auth_user_id_key
  on yeseong_workers (auth_user_id) where auth_user_id is not null;

-- ============================================================
-- 3) workers.default_worksite_id (모바일 출역 default)
-- ============================================================
alter table yeseong_workers
  add column default_worksite_id uuid references yeseong_worksites(id) on delete set null;

-- ============================================================
-- 4) workers.phone unique (값 있을 때만)
--    모바일 가입자는 phone 필수 → 매칭 키로 사용
-- ============================================================
create unique index yeseong_workers_phone_key
  on yeseong_workers (phone) where phone is not null;

-- ============================================================
-- 5) attendance 스냅샷 컬럼
--    출역 시점의 현장·협력사를 보존 (default 변경되어도 과거 영향 X)
-- ============================================================
alter table yeseong_attendance
  add column worksite_id uuid references yeseong_worksites(id) on delete set null;
alter table yeseong_attendance
  add column subcontractor_id uuid references yeseong_subcontractors(id) on delete set null;
