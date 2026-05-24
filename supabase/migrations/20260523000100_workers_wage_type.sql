-- 작업자 마스터 — 급여형태 컬럼 추가
--   엑셀의 '급여형태' (예: '2.일급', '4.월급/일급')를 보관

alter table yeseong_workers
  add column if not exists wage_type text;

comment on column yeseong_workers.wage_type is '급여 형태 (예: 2.일급, 4.월급/일급) — 노임대장 작성용';
