-- 계약서 양식을 급여형태(일급/월급/월급·일급)별로 운영 → 작업자 wage_type에 맞는 양식 자동 선택.
--   - contract_templates.wage_type: NULL=공통(모든 급여형태) 또는 '일급'/'월급'/'월급/일급'
--   - 현장↔양식: 단일 컬럼 → 다대다(yeseong_worksite_contract_templates). 한 현장은 급여형태별 1장.
--   (base: 20260619000000_worker_contracts, 20260623000000_contract_issue)

alter table yeseong_contract_templates
  add column wage_type text check (wage_type is null or wage_type in ('일급', '월급', '월급/일급'));

comment on column yeseong_contract_templates.wage_type is
  'NULL=공통(모든 급여형태), 또는 작업자 yeseong_workers.wage_type과 매칭';

-- seed 일당직 양식은 일급
update yeseong_contract_templates
  set wage_type = '일급'
  where wage_type is null and title = '일당직 표준 근로계약서';

-- 현장↔양식 다대다
create table yeseong_worksite_contract_templates (
  worksite_id uuid not null references yeseong_worksites(id) on delete cascade,
  template_id uuid not null references yeseong_contract_templates(id) on delete cascade,
  primary key (worksite_id, template_id)
);
create index yeseong_wct_template_idx on yeseong_worksite_contract_templates (template_id);

-- 기존 단일 배정(worksites.contract_template_id) → 조인 테이블로 이관
insert into yeseong_worksite_contract_templates (worksite_id, template_id)
  select id, contract_template_id
  from yeseong_worksites
  where contract_template_id is not null
on conflict do nothing;

alter table yeseong_worksites drop column contract_template_id;

alter table yeseong_worksite_contract_templates enable row level security;  -- service_role 전용(정책 없음)
