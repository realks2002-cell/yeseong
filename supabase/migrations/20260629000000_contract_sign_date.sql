-- 계약일(서명일)을 계약기간 시작일과 분리: sign_date 컬럼 신설.
--   서명란 날짜 = sign_date (서명 시 서명한 날 KST로 저장, 관리자 수정 가능).
--   계약기간(contract_date 시작 ~ contract_end_date 종료)은 별개로 유지.
alter table yeseong_worker_contracts
  add column if not exists sign_date date;

-- 기존 서명완료 계약서: 실제 서명일(signed_at, KST)로 백필
update yeseong_worker_contracts
  set sign_date = (timezone('Asia/Seoul', signed_at))::date
  where status = 'signed' and sign_date is null and signed_at is not null;
