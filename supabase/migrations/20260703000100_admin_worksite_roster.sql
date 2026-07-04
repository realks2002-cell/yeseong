-- 관리자 출역 지도 — 현장 배치 팀 명단 + 오늘 출역 여부
--   특정 현장에 배치된(팀장 추종) 활성 작업자 전체를 팀장(팀)별로 묶어 반환.
--   각 작업자: 오늘 출역(attendance 제출 또는 GPS 현장 진입) 여부(attended).

create or replace function yeseong_admin_worksite_roster(p_worksite_id uuid)
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

  with resolved as (
    select w.id, w.name, w.default_trade as trade, w.team_leader_id,
           coalesce(w.team_leader_id, w.id) as group_leader_id
      from yeseong_workers w
      cross join lateral (
        select tc.worksite_id from yeseong_worker_team_context(w.id) tc limit 1
      ) ctx
     where w.is_active = true and ctx.worksite_id = p_worksite_id
  ),
  today_att as (
    select distinct pw.worker_id
      from yeseong_attendance a
      join yeseong_payroll_workers pw on pw.id = a.payroll_worker_id
     where a.work_date = v_today
  ),
  today_gps as (
    select worker_id, bool_or(is_within_geofence) as ever_within
      from yeseong_gps_logs
     where created_at >= v_day_start
     group by worker_id
  ),
  enriched as (
    select r.*,
           (ta.worker_id is not null) as attended_submit,
           coalesce(tg.ever_within, false) as present_gps
      from resolved r
      left join today_att ta on ta.worker_id = r.id
      left join today_gps tg on tg.worker_id = r.id
  ),
  teams as (
    select e.group_leader_id,
           (select name from yeseong_workers lw where lw.id = e.group_leader_id) as leader_name,
           count(*)::int as member_count,
           count(*) filter (where e.attended_submit or e.present_gps)::int as attended_count,
           jsonb_agg(jsonb_build_object(
             'id', e.id,
             'name', e.name,
             'trade', e.trade,
             'is_leader', (e.id = e.group_leader_id),
             'attended', (e.attended_submit or e.present_gps),
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
