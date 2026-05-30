-- 현장사진 (TBM·자재·일반)
--   - 작업자/팀장이 본인 앱에서 업로드. 카테고리만 선택, 현장·날짜는 서버 결정
--   - worksite_id = 팀장 추종 컨텍스트(yeseong_worker_team_context), photo_date = KST today
--   - 저장 후엔 스냅샷이라 팀장 현장 이동해도 과거 사진의 worksite_id는 변하지 않음
--   - Storage 버킷: site-photos (private), 경로 '{worker_id}/{uuid}.jpg' (플랫 — RLS 1단계 매칭)

create table yeseong_site_photos (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references yeseong_workers(id) on delete cascade,
  worksite_id uuid not null references yeseong_worksites(id),
  photo_date date not null default ((now() at time zone 'Asia/Seoul')::date),
  category text not null check (category in ('tbm', 'materials', 'general')),
  storage_path text not null,
  mime_type text not null,
  file_size int not null check (file_size > 0),
  memo text,
  uploaded_at timestamptz not null default now()
);

create index yeseong_site_photos_site_date
  on yeseong_site_photos (worksite_id, photo_date desc, category);

create index yeseong_site_photos_worker_date
  on yeseong_site_photos (worker_id, photo_date desc);

alter table yeseong_site_photos enable row level security;

-- 본인(작업자 auth_user_id 매칭) 또는 팀장(phone 매칭 worker) 만 R/W
create policy "site photo self read" on yeseong_site_photos
  for select using (
    worker_id in (select id from yeseong_workers where auth_user_id = auth.uid())
    or worker_id in (
      select w.id from yeseong_workers w
      join yeseong_site_managers m on m.phone = w.phone
      where m.auth_user_id = auth.uid()
    )
  );
create policy "site photo self insert" on yeseong_site_photos
  for insert with check (
    worker_id in (select id from yeseong_workers where auth_user_id = auth.uid())
    or worker_id in (
      select w.id from yeseong_workers w
      join yeseong_site_managers m on m.phone = w.phone
      where m.auth_user_id = auth.uid()
    )
  );
create policy "site photo self delete" on yeseong_site_photos
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
  'site-photos',
  'site-photos',
  false,                  -- private
  5242880,                -- 5MB 한도 (압축 후 1MB 미만 목표지만 여유)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Storage 객체 정책 — 경로 첫 세그먼트(worker_id)가 본인인지 검증
create policy "site photo self r/w own objects" on storage.objects
  for all using (
    bucket_id = 'site-photos'
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
    bucket_id = 'site-photos'
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

-- 관리자 조회·삭제는 service_role 우회 (서버 API에서)
