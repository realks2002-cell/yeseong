-- 인앱 공지 팝업 테이블

create table yeseong_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  target_type text not null default 'all',  -- all | leaders | team | phone
  target_value text,                         -- team_leader_id or comma-separated phones
  font_size integer not null default 16,     -- 본문 글씨 크기 (px)
  is_active boolean not null default true,
  expires_at timestamptz,                    -- null이면 무기한
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table yeseong_announcements enable row level security;
create policy "service_role full" on yeseong_announcements
  for all using (true) with check (true);

-- 읽음 처리 테이블
create table yeseong_announcement_reads (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references yeseong_announcements(id) on delete cascade,
  worker_id uuid references yeseong_workers(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null,
  read_at timestamptz not null default now()
);

create unique index uq_announcement_read_worker
  on yeseong_announcement_reads(announcement_id, worker_id)
  where worker_id is not null;

create unique index uq_announcement_read_user
  on yeseong_announcement_reads(announcement_id, auth_user_id)
  where auth_user_id is not null;

alter table yeseong_announcement_reads enable row level security;
create policy "service_role full" on yeseong_announcement_reads
  for all using (true) with check (true);

-- 모바일앱: 안 읽은 공지 조회 RPC
create or replace function yeseong_get_unread_announcements()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_worker_id uuid;
  v_leader_id uuid;
  v_phone text;
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  -- 작업자 정보 조회
  select w.id, w.team_leader_id, w.phone
    into v_worker_id, v_leader_id, v_phone
    from yeseong_workers w
   where w.auth_user_id = v_user_id and w.is_active = true
   limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'title', a.title,
    'body', a.body,
    'font_size', a.font_size,
    'created_at', a.created_at
  ) order by a.created_at desc), '[]'::jsonb)
  into result
  from yeseong_announcements a
  where a.is_active = true
    and (a.expires_at is null or a.expires_at > now())
    -- 읽지 않은 것만
    and not exists (
      select 1 from yeseong_announcement_reads r
       where r.announcement_id = a.id
         and (r.worker_id = v_worker_id or r.auth_user_id = v_user_id)
    )
    -- 대상 필터
    and (
      a.target_type = 'all'
      or (a.target_type = 'leaders'
          and exists (
            select 1 from yeseong_workers w2
             where w2.id = v_worker_id and w2.skill_grade = '팀장'
          ))
      or (a.target_type = 'team'
          and (v_worker_id::text = a.target_value
               or v_leader_id::text = a.target_value))
      or (a.target_type = 'phone'
          and v_phone is not null
          and a.target_value like '%' || v_phone || '%')
    );

  return result;
end $$;

-- 모바일앱: 공지 읽음 처리 RPC
create or replace function yeseong_mark_announcement_read(p_announcement_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_worker_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select w.id into v_worker_id
    from yeseong_workers w
   where w.auth_user_id = v_user_id and w.is_active = true
   limit 1;

  insert into yeseong_announcement_reads (announcement_id, worker_id, auth_user_id)
  values (p_announcement_id, v_worker_id, v_user_id)
  on conflict do nothing;
end $$;
