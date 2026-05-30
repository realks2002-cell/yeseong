-- 작업자 서류 사진 (신분증·통장사본·자격증)
--   - 작업자/팀장이 본인 앱에서 업로드, 관리자가 /workers 에서 조회
--   - 팀장도 yeseong_workers에 phone으로 1:1 행이 있어 단일 FK로 처리
--   - Storage 버킷: worker-documents (private), 경로 '{worker_id}/{doc_type}/{uuid}.jpg'
--   - 5장 한도(자격증)는 API에서 enforce — RLS check로는 표현 어려움

create table yeseong_worker_documents (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references yeseong_workers(id) on delete cascade,
  doc_type text not null check (doc_type in ('id_card', 'bankbook', 'certificate')),
  storage_path text not null,
  mime_type text not null,
  file_size int not null check (file_size > 0),
  uploaded_by text not null check (uploaded_by in ('self', 'admin')),
  created_at timestamptz not null default now()
);

-- 신분증·통장사본은 worker당 1행만 (자격증은 N행)
create unique index yeseong_worker_documents_single_uniq
  on yeseong_worker_documents (worker_id, doc_type)
  where doc_type in ('id_card', 'bankbook');

create index yeseong_worker_documents_lookup
  on yeseong_worker_documents (worker_id, doc_type, created_at desc);

alter table yeseong_worker_documents enable row level security;

-- 본인(작업자 auth_user_id 매칭) 또는 팀장(phone 매칭으로 그 worker가 본인) R/W
create policy "worker self read" on yeseong_worker_documents
  for select using (
    worker_id in (select id from yeseong_workers where auth_user_id = auth.uid())
    or worker_id in (
      select w.id from yeseong_workers w
      join yeseong_site_managers m on m.phone = w.phone
      where m.auth_user_id = auth.uid()
    )
  );
create policy "worker self insert" on yeseong_worker_documents
  for insert with check (
    worker_id in (select id from yeseong_workers where auth_user_id = auth.uid())
    or worker_id in (
      select w.id from yeseong_workers w
      join yeseong_site_managers m on m.phone = w.phone
      where m.auth_user_id = auth.uid()
    )
  );
create policy "worker self delete" on yeseong_worker_documents
  for delete using (
    worker_id in (select id from yeseong_workers where auth_user_id = auth.uid())
    or worker_id in (
      select w.id from yeseong_workers w
      join yeseong_site_managers m on m.phone = w.phone
      where m.auth_user_id = auth.uid()
    )
  );

-- Storage 버킷
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'worker-documents',
  'worker-documents',
  false,                  -- private
  5242880,                -- 5MB 한도
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Storage 객체 정책 — 경로 첫 세그먼트(worker_id)로 본인 검증
-- (storage.foldername(name))[1] = '{worker_id}'
create policy "worker self r/w own objects" on storage.objects
  for all using (
    bucket_id = 'worker-documents'
    and (
      (storage.foldername(name))[1]::uuid in (
        select id from yeseong_workers where auth_user_id = auth.uid()
      )
      or (storage.foldername(name))[1]::uuid in (
        select w.id from yeseong_workers w
        join yeseong_site_managers m on m.phone = w.phone
        where m.auth_user_id = auth.uid()
      )
    )
  ) with check (
    bucket_id = 'worker-documents'
    and (
      (storage.foldername(name))[1]::uuid in (
        select id from yeseong_workers where auth_user_id = auth.uid()
      )
      or (storage.foldername(name))[1]::uuid in (
        select w.id from yeseong_workers w
        join yeseong_site_managers m on m.phone = w.phone
        where m.auth_user_id = auth.uid()
      )
    )
  );

-- 관리자(@yeseong.local) 조회·삭제는 service_role로 RLS 우회 (서버 API에서)
