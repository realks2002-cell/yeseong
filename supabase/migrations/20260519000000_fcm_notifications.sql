-- FCM 토큰 저장 및 알림 발송 이력

-- 1) FCM 디바이스 토큰
create table yeseong_fcm_tokens (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete cascade,
  worker_id uuid references yeseong_workers(id) on delete set null,
  token text not null,
  device_type text not null default 'android',   -- android | ios | web
  app_type text not null default 'worker',        -- worker | manager
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_fcm_token on yeseong_fcm_tokens(token) where is_active = true;
create index idx_fcm_worker on yeseong_fcm_tokens(worker_id) where is_active = true;
create index idx_fcm_auth_user on yeseong_fcm_tokens(auth_user_id) where is_active = true;

-- RLS
alter table yeseong_fcm_tokens enable row level security;
create policy "service_role full" on yeseong_fcm_tokens
  for all using (true) with check (true);

-- 2) 알림 발송 이력
create table yeseong_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  target_type text not null,  -- all | leaders | team | phone
  target_value text,          -- team_leader_id or phone number
  sent_count integer not null default 0,
  fail_count integer not null default 0,
  sent_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table yeseong_notifications enable row level security;
create policy "service_role full" on yeseong_notifications
  for all using (true) with check (true);

-- 3) 모바일앱에서 FCM 토큰 등록 RPC
create or replace function yeseong_register_fcm_token(
  p_token text,
  p_device_type text default 'android',
  p_app_type text default 'worker'
)
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

  -- 작업자 ID 찾기 (있으면)
  select w.id into v_worker_id
    from yeseong_workers w
   where w.auth_user_id = v_user_id and w.is_active = true
   limit 1;

  -- 기존 토큰 비활성화 (같은 토큰)
  update yeseong_fcm_tokens
     set is_active = false, updated_at = now()
   where token = p_token and is_active = true;

  -- 새 토큰 삽입
  insert into yeseong_fcm_tokens (auth_user_id, worker_id, token, device_type, app_type)
  values (v_user_id, v_worker_id, p_token, p_device_type, p_app_type);
end $$;
