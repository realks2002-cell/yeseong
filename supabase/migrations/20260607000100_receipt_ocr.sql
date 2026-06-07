-- 영수증 OCR — expense 카테고리 사진에 AI 비전 분석 결과 저장
--   - receipt_store/amount/date: Claude 비전으로 추출 (관리자 수동 수정 가능)
--   - ocr_status: pending(분석 대기) / done(완료) / failed(실패) / null(구버전 미분석)
--   - ocr_raw: 모델 원본 응답(jsonb) — 디버깅·재검토용

alter table yeseong_site_photos
  add column receipt_store text,
  add column receipt_amount numeric(12, 0) check (receipt_amount is null or receipt_amount >= 0),
  add column receipt_date date,
  add column ocr_status text check (ocr_status in ('pending', 'done', 'failed')),
  add column ocr_raw jsonb;

-- 비용처리 화면에서 미분석 영수증 조회용
create index yeseong_site_photos_expense_ocr
  on yeseong_site_photos (category, ocr_status)
  where category = 'expense';
