-- 서명 완료 계약서 PDF 영구 보관 (안전·증빙)
--   서명 시점의 최종 계약서를 PDF로 만들어 Storage(contracts 버킷)에 보관하고 경로를 기록.
--   본문/데이터가 이후 바뀌거나 삭제돼도 서명 원본이 남는다.

alter table yeseong_worker_contracts
  add column if not exists pdf_path text;

comment on column yeseong_worker_contracts.pdf_path is
  '서명 완료 계약서 PDF 보관 경로 (contracts 버킷). null이면 미보관.';

-- 비공개 버킷 (service_role로만 접근, public URL 없음)
insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do nothing;
