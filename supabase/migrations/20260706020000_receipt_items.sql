-- 영수증 OCR 품목 저장 — 라인 클릭 시 아코디언으로 품명·단가·수량·금액 표시
alter table yeseong_site_photos add column if not exists receipt_items jsonb;
comment on column yeseong_site_photos.receipt_items is 'OCR 추출 품목 배열 [{name,unit_price,qty,amount}]. null/[]이면 품목 없음.';
