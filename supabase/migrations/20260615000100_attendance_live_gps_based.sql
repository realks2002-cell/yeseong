-- 관리자 실시간 출역 현황 (/attendance) — A안: 출역 제출과 무관하게 GPS 기준으로 표시
--   기존: 오늘 출역(yeseong_attendance) 행이 있는 사람만 표시 → 출역을 퇴근 때 제출하므로 낮엔 항상 비어 있었음
--   변경: "오늘 활동 작업자 = 오늘 GPS 로그가 있거나 출역을 제출한 사람"
--         - 출역 정보(상태/공수/제출시간)는 있으면 붙이고, 없으면 null(미제출)
--         - 현장: 출역 행의 현장 우선, 없으면 팀 컨텍스트 추종 현장
--         - last_*: 오늘 마지막 GPS 기록 (현장 이탈 판정 = is_within_geofence = false)

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
  left join lateral (
    select tc.worksite_id from yeseong_worker_team_context(w.id) tc limit 1
  ) tctx on true
  left join yeseong_worksites ws on ws.id = coalesce(att.worksite_id, tctx.worksite_id);

  return result;
end $$;

grant execute on function yeseong_admin_attendance_live() to authenticated;
