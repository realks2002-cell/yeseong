-- 팀장 앱: 내 팀원 목록 조회
--   팀원 = team_leader_id 가 현재 팀장(site_manager)을 가리키는 활성 worker (본인 제외)
create or replace function yeseong_manager_list_team_members()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manager_id uuid;
  v_phone text;
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select id, phone into v_manager_id, v_phone
    from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_manager_id is null then
    raise exception 'manager not found';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id,
    'name', w.name,
    'phone', w.phone,
    'default_trade', w.default_trade
  ) order by w.name), '[]'::jsonb) into result
    from yeseong_workers w
   where w.team_leader_id = v_manager_id
     and coalesce(w.is_active, true) = true
     and (v_phone is null or w.phone is distinct from v_phone);  -- 본인 제외

  return result;
end $$;

grant execute on function yeseong_manager_list_team_members() to authenticated;
