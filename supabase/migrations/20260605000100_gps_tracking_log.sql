-- 백그라운드 GPS 위치 로그
-- 작업자 앱에서 주기적으로 전송하는 위치를 기록한다.
-- 관리자가 실시간 출역 현황 / 이탈 기록 확인에 사용.

create table yeseong_gps_logs (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references yeseong_workers(id) on delete cascade,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  distance_from_site_m integer,  -- 현장까지 거리(m), null = 현장 좌표 미등록
  is_within_geofence boolean,    -- geofence 내부 여부
  created_at timestamptz default now()
);

create index yeseong_gps_logs_worker_date_idx
  on yeseong_gps_logs (worker_id, created_at desc);

-- 오래된 로그 자동 정리 (30일 이상)
-- cron 등으로 주기적으로 실행
create or replace function yeseong_cleanup_gps_logs()
returns void
language sql
as $$
  delete from yeseong_gps_logs where created_at < now() - interval '30 days';
$$;
