-- 원청사(원도급사) 마스터 — 예성건축이 도급받는 상위 건설사
-- 구조는 전문건설사(yeseong_subcontractors)와 동일:
--   name(unique) / business_number / contact_phone / is_active / created_at / updated_at
-- RLS·updated_at 트리거·audit 트리거까지 동일하게 적용.

create table yeseong_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_number text,                -- 사업자등록번호 (선택)
  contact_phone text,                  -- 연락처 (선택)
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint yeseong_clients_name_key unique (name)
);

-- updated_at 자동 갱신 (전문건설사와 동일 함수 재사용)
create trigger trg_clients_updated_at
  before update on yeseong_clients
  for each row execute function yeseong_set_updated_at();

-- RLS: 인증된 사용자 전체 접근 (전문건설사와 동일)
alter table yeseong_clients enable row level security;
create policy "auth_all" on yeseong_clients for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- 변경 이력(audit) 트리거 — 마스터 데이터이므로 전문건설사와 동일하게 추적
drop trigger if exists yeseong_clients_audit on yeseong_clients;
create trigger yeseong_clients_audit
  after insert or update or delete on yeseong_clients
  for each row execute function yeseong_audit_trigger();
