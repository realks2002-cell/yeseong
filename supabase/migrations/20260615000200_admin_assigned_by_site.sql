-- 관리자 실시간 출역 (/attendance) — 총 배정인원 (작업자 마스터 기준)
--   활성 작업자 전체를 팀 컨텍스트(yeseong_worker_team_context)로 현장에 연결한다.
--   - 팀원: team_leader_id → 팀장 worker 행(phone 매칭)의 현장을 추종
--   - 팀장(=작업자): 본인 default_worksite_id
--   현장이 결정되는(배정된) 인원만 현장별로 집계해 반환한다.

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
    'count', b.cnt
  ) order by ws.name), '[]'::jsonb)
  into result
  from by_site b
  join yeseong_worksites ws on ws.id = b.worksite_id;

  return result;
end $$;

grant execute on function yeseong_admin_assigned_by_site() to authenticated;
