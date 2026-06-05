-- 관리자 웹 — 실시간 출역 현황 (/attendance)
--   오늘(KST) 출역 + 작업자별 최신 GPS 위치를 한 번에 반환
--   last_*: 백그라운드 GPS 로그의 오늘 마지막 기록 (없으면 null)

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

  with latest_gps as (
    select distinct on (worker_id)
           worker_id, latitude, longitude, distance_from_site_m, is_within_geofence, created_at
      from yeseong_gps_logs
     where created_at >= v_day_start
     order by worker_id, created_at desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'hours', a.hours,
    'approval_status', a.approval_status,
    'created_at', a.created_at,
    'gps_distance_m', a.gps_distance_m,
    'worker_id', w.id,
    'worker_name', w.name,
    'worker_phone', w.phone,
    'worker_trade', w.default_trade,
    'worksite_id', ws.id,
    'worksite_name', ws.name,
    'site_has_gps', (ws.latitude is not null),
    'geofence_radius', ws.geofence_radius,
    'last_latitude', g.latitude,
    'last_longitude', g.longitude,
    'last_distance_m', g.distance_from_site_m,
    'last_within', g.is_within_geofence,
    'last_seen_at', g.created_at
  ) order by ws.name, w.name), '[]'::jsonb)
  into result
  from yeseong_attendance a
  join yeseong_payroll_workers pw on pw.id = a.payroll_worker_id
  join yeseong_workers w on w.id = pw.worker_id
  join yeseong_worksites ws on ws.id = a.worksite_id
  left join latest_gps g on g.worker_id = w.id
  where a.work_date = v_today;

  return result;
end $$;

grant execute on function yeseong_admin_attendance_live() to authenticated;
