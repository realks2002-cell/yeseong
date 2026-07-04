-- 현장별 배정 인원 RPC에 현장 좌표/반경 추가
--   출역 지도 모달을 "오늘 활동 없는 현장"에서도 띄우려면 카드(배정 목록)에서 좌표가 필요.

create or replace function yeseong_admin_assigned_by_site()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  with resolved as (
    select w.id as worker_id, ctx.worksite_id
      from yeseong_workers w
      cross join lateral (
        select tc.worksite_id from yeseong_worker_team_context(w.id) tc limit 1
      ) ctx
     where w.is_active = true
  ),
  by_site as (
    select worksite_id, count(*)::int as cnt
      from resolved
     where worksite_id is not null
     group by worksite_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'worksite_id', b.worksite_id,
    'worksite_name', ws.name,
    'count', b.cnt,
    'latitude', ws.latitude,
    'longitude', ws.longitude,
    'geofence_radius', ws.geofence_radius
  ) order by ws.name), '[]'::jsonb)
  into result
  from by_site b
  join yeseong_worksites ws on ws.id = b.worksite_id;

  return result;
end $$;

grant execute on function yeseong_admin_assigned_by_site() to authenticated;
