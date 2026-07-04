-- 실시간 출역 판정의 거리/지오펜스를 "조회 시점"에 재계산하도록 수정
--   문제: gps_logs.distance_from_site_m / is_within_geofence 는 GPS 기록 시점의
--         팀 컨텍스트 현장 기준으로 한 번 계산돼 저장된다. 이후 팀 추종 현장이
--         바뀌면 저장값이 옛 현장 기준으로 남아, 실제로는 현장 밖(수백 m)인데도
--         within=true 로 남아 '현장(present)'으로 잘못 집계된다.
--         (지도는 원본 좌표로 찍으므로 위치와 상태 색이 모순됨)
--   해결: 저장된 distance/within 을 믿지 말고, 원본 좌표(latitude/longitude)와
--         RPC 가 해석한 현장(att.worksite_id -> 팀 컨텍스트) 좌표로 haversine 재계산.
--         지도·지오펜스 원·상태 색이 항상 같은 진실원천을 쓰게 된다.

create or replace function yeseong_admin_attendance_live()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_day_start timestamptz := v_today::timestamp at time zone 'Asia/Seoul';
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  with today_att as (
    select distinct on (pw.worker_id)
           a.id, a.hours, a.approval_status, a.created_at, a.gps_distance_m,
           a.worksite_id, pw.worker_id
      from yeseong_attendance a
      join yeseong_payroll_workers pw on pw.id = a.payroll_worker_id
     where a.work_date = v_today
     order by pw.worker_id, a.created_at desc
  ),
  gps_today as (
    select distinct worker_id from yeseong_gps_logs where created_at >= v_day_start
  ),
  active_workers as (
    select worker_id from gps_today
    union
    select worker_id from today_att
  ),
  -- 작업자별 "현재 해석된 현장" (출역 현장 우선, 없으면 팀장 추종 컨텍스트)
  resolved as (
    select aw.worker_id,
           coalesce(att.worksite_id, tctx.worksite_id) as worksite_id
      from active_workers aw
      left join today_att att on att.worker_id = aw.worker_id
      left join lateral (
        select tc.worksite_id from yeseong_worker_team_context(aw.worker_id) tc limit 1
      ) tctx on true
  ),
  -- 오늘 GPS 로그를 해석된 현장 좌표 기준으로 재계산 (저장값 무시)
  gps_scored as (
    select g.worker_id, g.latitude, g.longitude, g.created_at,
           case when ws.latitude is not null and ws.longitude is not null
                then yeseong_haversine(g.latitude, g.longitude, ws.latitude, ws.longitude)
           end as dist_m,
           ws.geofence_radius
      from yeseong_gps_logs g
      join resolved r on r.worker_id = g.worker_id
      left join yeseong_worksites ws on ws.id = r.worksite_id
     where g.created_at >= v_day_start
  ),
  latest_gps as (
    select distinct on (worker_id)
           worker_id, latitude, longitude, created_at,
           dist_m,
           case when dist_m is not null then dist_m <= geofence_radius end as within
      from gps_scored
     order by worker_id, created_at desc
  ),
  today_gps_agg as (
    select worker_id,
           bool_or(dist_m is not null and dist_m <= geofence_radius) as ever_within
      from gps_scored
     group by worker_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', coalesce(att.id::text, 'gps-' || w.id::text),
    'hours', att.hours,
    'approval_status', att.approval_status,
    'created_at', att.created_at,
    'gps_distance_m', att.gps_distance_m,
    'worker_id', w.id,
    'worker_name', w.name,
    'worker_phone', w.phone,
    'worker_trade', w.default_trade,
    'worksite_id', ws.id,
    'worksite_name', coalesce(ws.name, '미지정'),
    'site_has_gps', (ws.latitude is not null),
    'geofence_radius', ws.geofence_radius,
    'worksite_lat', ws.latitude,
    'worksite_lng', ws.longitude,
    'today_ever_within', coalesce(tga.ever_within, false),
    'last_latitude', g.latitude,
    'last_longitude', g.longitude,
    'last_distance_m', g.dist_m,
    'last_within', g.within,
    'last_seen_at', g.created_at
  ) order by ws.name nulls last, w.name), '[]'::jsonb)
  into result
  from active_workers aw
  join yeseong_workers w on w.id = aw.worker_id
  left join today_att att on att.worker_id = w.id
  left join latest_gps g on g.worker_id = w.id
  left join today_gps_agg tga on tga.worker_id = w.id
  left join lateral (
    select tc.worksite_id from yeseong_worker_team_context(w.id) tc limit 1
  ) tctx on true
  left join yeseong_worksites ws on ws.id = coalesce(att.worksite_id, tctx.worksite_id);

  return result;
end $$;

grant execute on function yeseong_admin_attendance_live() to authenticated;
