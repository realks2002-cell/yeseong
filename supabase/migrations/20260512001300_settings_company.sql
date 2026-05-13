-- 회사 정보 설정 (단일 행 패턴)
-- 노임대장 출력 등에 사용되는 회사명/사업자번호/대표자/주소 보관

create table yeseong_settings (
  id text primary key default 'singleton' check (id = 'singleton'),
  company_name text not null default '예성건설',
  business_number text,
  representative text,
  address text,
  updated_at timestamptz not null default now()
);

create trigger trg_settings_updated_at
  before update on yeseong_settings
  for each row execute function yeseong_set_updated_at();

alter table yeseong_settings enable row level security;
create policy "auth_all" on yeseong_settings for all
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- 초기 행 1개 (idempotent)
insert into yeseong_settings (id) values ('singleton')
  on conflict (id) do nothing;
