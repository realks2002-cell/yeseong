-- 근로계약서 전자서명
--   - contract_templates: 관리자가 등록하는 계약조건 양식(본문 + {{변수}}). 현장마다 다른 문구.
--   - worksites.contract_template_id: 현장에 지정된 양식 (관리자 체크박스, 한 현장=한 양식 자동 보장).
--   - worker_contracts: 작업자가 서명한 최종본. 서식(레이아웃)은 코드 고정, 본문/근로자/근무정보는 스냅샷.
--   - Storage 버킷: signatures (private), 경로 '{worker_id}/{uuid}.png'.
--   - 서명 이미지는 base64로 받아 서버(service_role)가 Storage에 업로드 — work-documents와 동일 패턴.

-- ============================================
-- 1) 계약서 양식 (관리자 관리)
-- ============================================
create table yeseong_contract_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',          -- 계약조건 본문 ({{변수}} 포함)
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger yeseong_contract_templates_updated_at
  before update on yeseong_contract_templates
  for each row execute function yeseong_set_updated_at();

-- ============================================
-- 2) 현장 ↔ 양식 (한 현장 = 한 양식)
--    한 양식이 여러 현장 공통 가능 (양식 1 : 현장 N). 컬럼이 현장에 있으니 한 현장당 하나는 자동 보장.
-- ============================================
alter table yeseong_worksites
  add column contract_template_id uuid references yeseong_contract_templates(id) on delete set null;

-- ============================================
-- 3) 서명된 계약서
-- ============================================
create table yeseong_worker_contracts (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references yeseong_workers(id) on delete cascade,
  worksite_id uuid references yeseong_worksites(id) on delete set null,
  template_id uuid references yeseong_contract_templates(id) on delete set null,
  attendance_id uuid references yeseong_attendance(id) on delete set null,  -- 확장용(매 출역 단위로 갈 때만 사용)
  status text not null default 'issued' check (status in ('issued', 'signed')),  -- 배포됨(미서명) / 서명완료
  rendered_body text not null default '',   -- 계약조건 본문(배포 시 변수 치환·동결, 날짜만 live 토큰)
  snapshot jsonb not null default '{}'::jsonb,  -- 근로자/근무정보/회사정보 고정값(배포 시 동결)
  signature_path text,                      -- 서명 전 null → 서명 시 Storage 경로 채움
  signed_at timestamptz,                    -- 서명 전 null → 서명 시각(불변, 법적 기록)
  contract_date date not null default (timezone('Asia/Seoul', now()))::date,  -- 계약일 (배포 시 관리자 지정, 이후 수정 가능)
  issued_at timestamptz not null default now(),   -- 배포 시각
  issued_by uuid references auth.users(id),       -- 배포한 관리자
  created_at timestamptz not null default now()
);

-- 미서명(issued)은 현장당 1장만 — 같은 현장에 미서명 계약서를 둘 이상 띄우지 않게(중복 배포 방지).
--   서명완료(signed)는 무제한 누적: 같은 현장 재계약·갱신 가능하고 과거 서명본은 전부 보관된다.
create unique index yeseong_worker_contracts_pending_uniq
  on yeseong_worker_contracts (worker_id, worksite_id)
  where status = 'issued' and attendance_id is null;

create index yeseong_worker_contracts_worker_idx
  on yeseong_worker_contracts (worker_id, created_at desc);
create index yeseong_worker_contracts_worksite_idx
  on yeseong_worker_contracts (worksite_id);

-- RLS: 본인 계약서만 조회 (작업자 auth_user_id 또는 팀장 phone 매칭). 쓰기는 서버(service_role).
alter table yeseong_worker_contracts enable row level security;

create policy "worker self read contracts" on yeseong_worker_contracts
  for select using (
    worker_id in (select id from yeseong_workers where auth_user_id = auth.uid())
    or worker_id in (
      select w.id from yeseong_workers w
      join yeseong_site_managers m on m.phone = w.phone
      where m.auth_user_id = auth.uid()
    )
  );

-- 양식 테이블은 관리자만 service_role로 접근 — RLS 켜고 정책 없음(작업자 직접 접근 차단)
alter table yeseong_contract_templates enable row level security;

-- ============================================
-- 4) Storage 버킷: signatures
-- ============================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'signatures',
  'signatures',
  false,                  -- private
  2097152,                -- 2MB (서명 PNG는 수십 KB)
  array['image/png', 'image/jpeg']
)
on conflict (id) do nothing;

-- Storage 객체 정책 — 경로 첫 세그먼트(worker_id)로 본인 검증 (worker-documents와 동일)
create policy "signatures self r/w own objects" on storage.objects
  for all using (
    bucket_id = 'signatures'
    and (
      (storage.foldername(name))[1]::uuid in (
        select id from yeseong_workers where auth_user_id = auth.uid()
      )
      or (storage.foldername(name))[1]::uuid in (
        select w.id from yeseong_workers w
        join yeseong_site_managers m on m.phone = w.phone
        where m.auth_user_id = auth.uid()
      )
    )
  ) with check (
    bucket_id = 'signatures'
    and (
      (storage.foldername(name))[1]::uuid in (
        select id from yeseong_workers where auth_user_id = auth.uid()
      )
      or (storage.foldername(name))[1]::uuid in (
        select w.id from yeseong_workers w
        join yeseong_site_managers m on m.phone = w.phone
        where m.auth_user_id = auth.uid()
      )
    )
  );

-- 관리자(@yeseong.local) 조회는 service_role로 RLS 우회 (서버 API에서)
