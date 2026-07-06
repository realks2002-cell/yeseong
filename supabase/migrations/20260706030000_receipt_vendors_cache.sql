-- 사업자번호→상호 캐시. OCR 상호 오독을 사업자번호 기준으로 자동 교정.
--   같은 매장 재방문 시 상호가 안정적으로 확정됨. 관리자 수정도 여기에 학습된다.
create table if not exists yeseong_receipt_vendors (
  business_no text primary key,
  store text not null,
  updated_at timestamptz not null default now()
);

comment on table yeseong_receipt_vendors is '영수증 사업자번호→확정 상호 캐시. OCR 상호 오독 자동 교정용.';

-- service_role(서버)만 접근. anon/authenticated 정책 없음 → 클라이언트 직접 접근 차단.
alter table yeseong_receipt_vendors enable row level security;
