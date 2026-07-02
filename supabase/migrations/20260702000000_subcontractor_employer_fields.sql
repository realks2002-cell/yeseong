-- 전문건설사 마스터를 계약서 '갑(사용자)'으로 쓸 수 있도록 회사정보 필드 보강.
-- 기존: name, business_number, contact_phone / 추가: representative(대표자), address(소재지)
alter table yeseong_subcontractors
  add column if not exists representative text,
  add column if not exists address text;
