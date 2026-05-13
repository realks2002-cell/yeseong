-- Phase C: 단일 테넌트화 + vendors→subcontractors rename + worksites.address
-- 사용자 결정 (2026-05-12):
--   1) 예성건설 단일 운영 — yeseong_companies / yeseong_company_members 제거
--   2) "외주공사 업체"는 subcontractors, "자재 발주처"는 vendors로 분리 → vendors 테이블은 협력사 의미였으니 rename
--   3) worksites에 address 컬럼 추가

-- ============================================================
-- 1) vendors → subcontractors rename (init 직후 마이그레이션이 vendors로 만들었음)
-- ============================================================
alter table yeseong_vendors rename to yeseong_subcontractors;
alter table yeseong_workers rename column default_vendor_id to default_subcontractor_id;
alter table yeseong_payroll_workers rename column vendor_id to subcontractor_id;
alter trigger trg_vendors_updated_at on yeseong_subcontractors rename to trg_subcontractors_updated_at;

-- ============================================================
-- 2) 회사 의존 RLS 정책 모두 drop
--    (companies/company_members 테이블 자체는 cascade로 자동 drop)
-- ============================================================
drop policy if exists "vendors_member_all" on yeseong_subcontractors;
drop policy if exists "worksites_member_all" on yeseong_worksites;
drop policy if exists "workers_member_all" on yeseong_workers;
drop policy if exists "periods_member_all" on yeseong_payroll_periods;
drop policy if exists "payroll_workers_member_all" on yeseong_payroll_workers;
drop policy if exists "attendance_member_all" on yeseong_attendance;
drop policy if exists "uploads_member_all" on yeseong_image_uploads;

-- ============================================================
-- 3) 멀티 테넌트 테이블 drop (cascade로 자식 FK·정책 자동 정리)
-- ============================================================
drop table if exists yeseong_company_members cascade;
drop table if exists yeseong_companies cascade;

-- ============================================================
-- 4) company_id 컬럼 제거 (cascade로 unique constraint·index 자동 제거)
-- ============================================================
alter table yeseong_worksites drop column company_id cascade;
alter table yeseong_workers drop column company_id cascade;
alter table yeseong_subcontractors drop column company_id cascade;

-- ============================================================
-- 5) 새 unique constraint (회사 컬럼 빠진 후 자연 키 재정의)
-- ============================================================
alter table yeseong_worksites
  add constraint yeseong_worksites_name_key unique (name);
alter table yeseong_workers
  add constraint yeseong_workers_natural_key unique (name, rrn_prefix, rrn_gender_digit);
alter table yeseong_subcontractors
  add constraint yeseong_subcontractors_name_key unique (name);

-- ============================================================
-- 6) RLS 단순화: 인증된 사용자면 전체 접근
--    작업자 모바일은 service_role 백엔드 호출(추후 Phase B)로 RLS 우회
-- ============================================================
create policy "auth_all" on yeseong_worksites for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "auth_all" on yeseong_workers for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "auth_all" on yeseong_subcontractors for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "auth_all" on yeseong_payroll_periods for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "auth_all" on yeseong_payroll_workers for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "auth_all" on yeseong_attendance for all
  using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "auth_all" on yeseong_image_uploads for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- ============================================================
-- 7) worksites.address 컬럼 추가
-- ============================================================
alter table yeseong_worksites add column address text;
