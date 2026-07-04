-- 실시간 출역 판정을 sticky로 보강 (실내 작업 대응)
--   기존: 최근 60분 이내 GPS가 현장 안일 때만 present → 조적·습식은 건물 안에서 GPS가 끊겨 0이 됨
--   변경: "오늘 현장 안 핑이 한 번이라도 있었나"(today_ever_within)를 추가로 내려줌
--         → 프론트에서 '입장 후 명확히 이탈 전까지 present 유지'(sticky)로 판정
--   last_* (마지막 GPS)는 이탈 판정용으로 그대로 유지.

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
  ),
  today_gps_agg as (
    -- 오늘 현장 안 핑이 한 번이라도 있었는지 (sticky 입장 판정)
    select worker_id, bool_or(is_within_geofence) as ever_within
      from yeseong_gps_logs
     where created_at >= v_day_start
     group by worker_id
  ),
  today_att as (
    select distinct on (pw.worker_id)
           a.id, a.hours, a.approval_status, a.created_at, a.gps_distance_m,
           a.worksite_id, pw.worker_id
      from yeseong_attendance a
      join yeseong_payroll_workers pw on pw.id = a.payroll_worker_id
     where a.work_date = v_today
     order by pw.worker_id, a.created_at desc
  ),
  active_workers as (
    select worker_id from latest_gps
    union
    select worker_id from today_att
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
    'last_distance_m', g.distance_from_site_m,
    'last_within', g.is_within_geofence,
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
