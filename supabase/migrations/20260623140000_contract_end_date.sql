-- 근로계약서에 계약 종료일 추가 (엑셀의 '계약기간 시작 ~ 종료' 범위 표현).
--   계약일(contract_date=시작)과 함께 live 값으로, 관리자가 발급/수정 시 지정. 비우면 본문에 '공종 종료일'로 표기.
alter table yeseong_worker_contracts
  add column if not exists contract_end_date date;
