-- 소장 앱 "내 정보" 화면 지원:
-- yeseong_manager_update_profile: 본인 이름 수정 RPC (auth.uid()로 본인 row만 안전 update)

create or replace function yeseong_manager_update_profile(
  p_name text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  update yeseong_site_managers
  set name = case
    when p_name is null then name
    when btrim(p_name) = '' then name  -- 이름 비우기 금지
    else btrim(p_name)
  end
  where auth_user_id = v_user_id;

  if not found then
    raise exception 'profile not found';
  end if;
end $$;

grant execute on function yeseong_manager_update_profile(text) to authenticated;
