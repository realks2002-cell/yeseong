-- 배치 팀 명단의 출역 판정을 "GPS 기준"으로 변경
--   기존: attended = 출역서 제출(attended_submit) OR GPS 현장 진입(present_gps)
--         → 출역서만 내도 출역으로 잡혀 지도(현장 인원)와 명단(출역 수)이 어긋남
--   변경: attended = present_gps 만. "GPS로 현장(지오펜스) 안에 한 번이라도 들어오면 출역".
--   또한 present_gps 를 저장된 is_within_geofence(기록 시점 동결값) 대신
--   원본 좌표 + 현재 현장 좌표로 재계산 (좌표/현장 변경 후에도 지도와 일치).
--   그리고 근무시간(KST 07:00~17:00) 안에 진입한 핑만 인정.

create or replace function yeseong_admin_worksite_roster(p_worksite_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_day_start timestamptz := v_today::timestamp at time zone 'Asia/Seoul';
  v_lat numeric;
  v_lng numeric;
  v_radius integer;
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select latitude, longitude, geofence_radius
    into v_lat, v_lng, v_radius
    from yeseong_worksites where id = p_worksite_id;

  with resolved as (
    select w.id, w.name, w.default_trade as trade, w.team_leader_id,
           coalesce(w.team_leader_id, w.id) as group_leader_id
      from yeseong_workers w
      cross join lateral (
        select tc.worksite_id from yeseong_worker_team_context(w.id) tc limit 1
      ) ctx
     where w.is_active = true and ctx.worksite_id = p_worksite_id
  ),
  -- 오늘 GPS 로그를 이 현장 좌표 기준으로 재계산 → 근무시간 중 지오펜스 진입 여부
  today_gps as (
    select g.worker_id,
           bool_or(
             v_lat is not null
             and yeseong_haversine(g.latitude, g.longitude, v_lat, v_lng) <= v_radius
           ) as ever_within
      from yeseong_gps_logs g
     where g.created_at >= v_day_start
       and extract(hour from (g.created_at at time zone 'Asia/Seoul')) >= 7
       and extract(hour from (g.created_at at time zone 'Asia/Seoul')) < 17
     group by g.worker_id
  ),
  enriched as (
    select r.*,
           coalesce(tg.ever_within, false) as present_gps
      from resolved r
      left join today_gps tg on tg.worker_id = r.id
  ),
  teams as (
    select e.group_leader_id,
           (select name from yeseong_workers lw where lw.id = e.group_leader_id) as leader_name,
           count(*)::int as member_count,
           count(*) filter (where e.present_gps)::int as attended_count,
           jsonb_agg(jsonb_build_object(
             'id', e.id,
             'name', e.name,
             'trade', e.trade,
             'is_leader', (e.id = e.group_leader_id),
             'attended', e.present_gps,
             'present_gps', e.present_gps
           ) order by (e.id = e.group_leader_id) desc, e.name) as members
      from enriched e
     group by e.group_leader_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'leader_id', group_leader_id,
    'leader_name', coalesce(leader_name, '팀 미지정'),
    'member_count', member_count,
    'attended_count', attended_count,
    'members', members
  ) order by leader_name nulls last), '[]'::jsonb)
  into result
  from teams;

  return result;
end $$;

grant execute on function yeseong_admin_worksite_roster(uuid) to authenticated;
