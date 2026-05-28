-- 현장 마스터에 원청사·전문건설사 연결
--   client_id        → 이 현장의 원청사(원도급사)
--   subcontractor_id → 이 현장의 전문건설사
-- 둘 다 선택값(NULL 허용), 마스터 삭제 시 set null

alter table yeseong_worksites
  add column client_id uuid references yeseong_clients(id) on delete set null,
  add column subcontractor_id uuid references yeseong_subcontractors(id) on delete set null;

create index on yeseong_worksites (client_id);
create index on yeseong_worksites (subcontractor_id);
