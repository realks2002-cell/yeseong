-- 월급/일급 작업자의 월별 성과(조적·미장 작업 물량) 기록
--   payroll_worker_id 슬롯에 종속 (현장×월×작업자)
--   POST 시점의 단가를 스냅샷으로 저장 → 이후 단가 변경에도 과거 급여 안정
--   amount = quantity * unit_price 자동 계산

create table yeseong_masonry_volumes (
  id uuid primary key default gen_random_uuid(),
  payroll_worker_id uuid not null
    references yeseong_payroll_workers(id) on delete cascade,
  category text not null check (category in ('조적', '미장')),
  type_name text,           -- 조적: 치장벽돌|시멘트벽돌, 미장: null
  size_spec text,           -- 조적: 보통|특수, 미장: null
  quantity numeric(10,2) not null check (quantity >= 0),  -- 조적: 장수, 미장: ㎡
  unit_price integer not null check (unit_price >= 0),    -- 입력 시점 스냅샷
  amount integer generated always as ((quantity * unit_price)::int) stored,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on yeseong_masonry_volumes (payroll_worker_id);

alter table yeseong_masonry_volumes enable row level security;

create policy "masonry_volumes_authenticated"
  on yeseong_masonry_volumes
  for all
  to authenticated
  using (true)
  with check (true);
