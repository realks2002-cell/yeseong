-- 이루건설 노임대장 자동화: 초기 스키마
-- 모든 테이블에 yeseong_ 프리픽스
-- 주민번호는 pgcrypto로 암호화 저장

create extension if not exists pgcrypto;

-- 회사 (단일 회사: ㈜이루건설)
create table yeseong_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- 사용자 ↔ 회사 매핑 (RLS용). Supabase auth.users에 1:1로 연결
create table yeseong_company_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references yeseong_companies(id) on delete cascade,
  role text not null default 'admin',  -- admin | member
  created_at timestamptz default now()
);
create index on yeseong_company_members (company_id);

-- 현장
create table yeseong_worksites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references yeseong_companies(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  unique (company_id, name)
);
create index on yeseong_worksites (company_id);

-- 작업자 마스터
create table yeseong_workers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references yeseong_companies(id) on delete cascade,
  name text not null,
  rrn_encrypted bytea not null,        -- pgp_sym_encrypt(주민번호, key)
  rrn_prefix text not null,            -- 'YYMMDD' (생년월일 6자리, 검색/표시용)
  rrn_gender_digit text not null,      -- 7번째 자리 (성별/내국인/세기)
  address text,
  bank_name text,
  account_number text,
  account_holder text,
  phone text,
  default_wage integer not null,
  default_trade text,                  -- 공종 (관리/조적 등)
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (company_id, name, rrn_prefix, rrn_gender_digit)
);
create index on yeseong_workers (company_id);
create index on yeseong_workers (company_id, name);

-- 월별 노임대장 (현장 × 년월)
create table yeseong_payroll_periods (
  id uuid primary key default gen_random_uuid(),
  worksite_id uuid not null references yeseong_worksites(id) on delete cascade,
  year_month text not null,            -- 'YYYY-MM'
  period_start date not null,
  period_end date not null,
  status text not null default 'draft',  -- draft | finalized
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (worksite_id, year_month)
);
create index on yeseong_payroll_periods (worksite_id);

-- 노임대장 슬롯 (해당 월에 그 현장에서 일한 작업자)
-- 엑셀의 26명 슬롯에 대응 (slot_number = 1..26)
create table yeseong_payroll_workers (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references yeseong_payroll_periods(id) on delete cascade,
  worker_id uuid not null references yeseong_workers(id),
  slot_number smallint not null check (slot_number between 1 and 26),
  trade text,                          -- 그 달 공종 (worker.default_trade override 가능)
  daily_wage integer not null,         -- 그 달 일당 (worker.default_wage override 가능)
  created_at timestamptz default now(),
  unique (period_id, worker_id),
  unique (period_id, slot_number)
);
create index on yeseong_payroll_workers (period_id);

-- 출역 기록 (하루 = 1행, hours로 공수 표현)
create table yeseong_attendance (
  id uuid primary key default gen_random_uuid(),
  payroll_worker_id uuid not null references yeseong_payroll_workers(id) on delete cascade,
  work_date date not null,
  hours numeric(3,1) not null default 1.0 check (hours > 0 and hours <= 3.0),
  source text not null default 'manual',  -- manual | vision | import
  image_upload_id uuid,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (payroll_worker_id, work_date)
);
create index on yeseong_attendance (payroll_worker_id);
create index on yeseong_attendance (work_date);

-- 출역부 이미지 업로드 + Gemini Vision 결과
create table yeseong_image_uploads (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references yeseong_payroll_periods(id) on delete cascade,
  uploader_id uuid references auth.users(id),
  blob_url text not null,
  blob_pathname text not null,
  raw_response jsonb,                  -- Gemini 원본 응답
  parsed_result jsonb,                 -- {workers: [{name, dates: [...]}]}
  status text not null default 'pending',  -- pending | reviewed | committed | failed
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on yeseong_image_uploads (period_id);

alter table yeseong_attendance
  add constraint fk_attendance_image
  foreign key (image_upload_id) references yeseong_image_uploads(id) on delete set null;

-- updated_at 자동 갱신 트리거
create or replace function yeseong_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_workers_updated_at
  before update on yeseong_workers
  for each row execute function yeseong_set_updated_at();

create trigger trg_periods_updated_at
  before update on yeseong_payroll_periods
  for each row execute function yeseong_set_updated_at();

create trigger trg_attendance_updated_at
  before update on yeseong_attendance
  for each row execute function yeseong_set_updated_at();

create trigger trg_uploads_updated_at
  before update on yeseong_image_uploads
  for each row execute function yeseong_set_updated_at();

-- ============================================================
-- RLS: 자기 회사 데이터에만 접근
-- ============================================================
alter table yeseong_companies enable row level security;
alter table yeseong_company_members enable row level security;
alter table yeseong_worksites enable row level security;
alter table yeseong_workers enable row level security;
alter table yeseong_payroll_periods enable row level security;
alter table yeseong_payroll_workers enable row level security;
alter table yeseong_attendance enable row level security;
alter table yeseong_image_uploads enable row level security;

-- 본인 멤버십만 조회
create policy "members_self_select" on yeseong_company_members
  for select using (user_id = auth.uid());

-- 본인 회사 조회
create policy "companies_member_select" on yeseong_companies
  for select using (id in (
    select company_id from yeseong_company_members where user_id = auth.uid()
  ));

-- 회사 멤버는 자기 회사 데이터 전체 CRUD
create policy "worksites_member_all" on yeseong_worksites
  for all using (company_id in (
    select company_id from yeseong_company_members where user_id = auth.uid()
  )) with check (company_id in (
    select company_id from yeseong_company_members where user_id = auth.uid()
  ));

create policy "workers_member_all" on yeseong_workers
  for all using (company_id in (
    select company_id from yeseong_company_members where user_id = auth.uid()
  )) with check (company_id in (
    select company_id from yeseong_company_members where user_id = auth.uid()
  ));

create policy "periods_member_all" on yeseong_payroll_periods
  for all using (worksite_id in (
    select id from yeseong_worksites
    where company_id in (
      select company_id from yeseong_company_members where user_id = auth.uid()
    )
  )) with check (worksite_id in (
    select id from yeseong_worksites
    where company_id in (
      select company_id from yeseong_company_members where user_id = auth.uid()
    )
  ));

create policy "payroll_workers_member_all" on yeseong_payroll_workers
  for all using (period_id in (
    select pp.id from yeseong_payroll_periods pp
    join yeseong_worksites ws on ws.id = pp.worksite_id
    where ws.company_id in (
      select company_id from yeseong_company_members where user_id = auth.uid()
    )
  )) with check (period_id in (
    select pp.id from yeseong_payroll_periods pp
    join yeseong_worksites ws on ws.id = pp.worksite_id
    where ws.company_id in (
      select company_id from yeseong_company_members where user_id = auth.uid()
    )
  ));

create policy "attendance_member_all" on yeseong_attendance
  for all using (payroll_worker_id in (
    select pw.id from yeseong_payroll_workers pw
    join yeseong_payroll_periods pp on pp.id = pw.period_id
    join yeseong_worksites ws on ws.id = pp.worksite_id
    where ws.company_id in (
      select company_id from yeseong_company_members where user_id = auth.uid()
    )
  )) with check (payroll_worker_id in (
    select pw.id from yeseong_payroll_workers pw
    join yeseong_payroll_periods pp on pp.id = pw.period_id
    join yeseong_worksites ws on ws.id = pp.worksite_id
    where ws.company_id in (
      select company_id from yeseong_company_members where user_id = auth.uid()
    )
  ));

create policy "uploads_member_all" on yeseong_image_uploads
  for all using (period_id in (
    select pp.id from yeseong_payroll_periods pp
    join yeseong_worksites ws on ws.id = pp.worksite_id
    where ws.company_id in (
      select company_id from yeseong_company_members where user_id = auth.uid()
    )
  )) with check (period_id in (
    select pp.id from yeseong_payroll_periods pp
    join yeseong_worksites ws on ws.id = pp.worksite_id
    where ws.company_id in (
      select company_id from yeseong_company_members where user_id = auth.uid()
    )
  ));

-- ============================================================
-- 주민번호 암호화 헬퍼 (SECURITY DEFINER로 키 노출 방지)
-- 사용: select yeseong_encrypt_rrn('660621-1468716');
--       select yeseong_decrypt_rrn(rrn_encrypted) from yeseong_workers where id = ?;
-- 키는 Supabase Vault에 'rrn_key'로 저장
-- ============================================================
create or replace function yeseong_encrypt_rrn(plain text)
returns bytea
language plpgsql security definer
set search_path = public, vault
as $$
declare
  k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'rrn_key' limit 1;
  if k is null then
    raise exception 'rrn_key not found in vault';
  end if;
  return pgp_sym_encrypt(plain, k);
end $$;

create or replace function yeseong_decrypt_rrn(cipher bytea)
returns text
language plpgsql security definer
set search_path = public, vault
as $$
declare
  k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'rrn_key' limit 1;
  return pgp_sym_decrypt(cipher, k);
end $$;

-- 일반 사용자에게는 decrypt 권한 막아두고, 서버 역할(service_role)만 호출
revoke execute on function yeseong_decrypt_rrn(bytea) from public, anon, authenticated;
grant execute on function yeseong_decrypt_rrn(bytea) to service_role;
