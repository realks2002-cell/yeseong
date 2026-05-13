-- 외주업체(협력사) 마스터 + 작업자/슬롯에 vendor 연결
-- 노임대장은 (period × vendor) 단위로 분리 다운로드되므로
-- vendor는 payroll_workers(그 달의 슬롯)에 기록한다.
-- worker 마스터에는 기본 vendor만 둬서 다음 슬롯 생성 시 디폴트로 사용.

-- ============================================================
-- 외주업체 마스터
-- ============================================================
create table yeseong_vendors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references yeseong_companies(id) on delete cascade,
  name text not null,
  business_number text,                -- 사업자등록번호 (선택)
  contact_phone text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (company_id, name)
);
create index on yeseong_vendors (company_id);

create trigger trg_vendors_updated_at
  before update on yeseong_vendors
  for each row execute function yeseong_set_updated_at();

-- ============================================================
-- 작업자 마스터 ← 기본 외주업체
-- ============================================================
alter table yeseong_workers
  add column default_vendor_id uuid references yeseong_vendors(id) on delete set null;

create index on yeseong_workers (default_vendor_id);

-- ============================================================
-- 노임대장 슬롯 ← 그 달 그 현장의 외주업체 소속
-- (같은 worker가 달마다 vendor 바뀔 수 있어 슬롯 단위로 기록)
-- ============================================================
alter table yeseong_payroll_workers
  add column vendor_id uuid references yeseong_vendors(id) on delete set null;

create index on yeseong_payroll_workers (period_id, vendor_id);

-- ============================================================
-- RLS: 자기 회사 vendor만 CRUD
-- ============================================================
alter table yeseong_vendors enable row level security;

create policy "vendors_member_all" on yeseong_vendors
  for all using (company_id in (
    select company_id from yeseong_company_members where user_id = auth.uid()
  )) with check (company_id in (
    select company_id from yeseong_company_members where user_id = auth.uid()
  ));
