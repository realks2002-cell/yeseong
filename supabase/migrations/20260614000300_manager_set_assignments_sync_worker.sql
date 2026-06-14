-- 팀장 앱 현장 이동 ↔ 팀원 추종 정합화
--   문제: 팀장이 앱(/m/manager/assignments)에서 담당 현장을 바꿔도
--         site_manager_assignments 만 갱신되고 팀장 worker 행 default_worksite_id 는 그대로라
--         team_context(=팀장 worker default_worksite_id 추종)가 옛 현장을 반환.
--         → 팀원·팀장 본인의 현재 현장이 안 따라옴.
--   해결: 관리자 /managers PATCH 와 동일하게 팀장 worker 행도 동기화 (대칭).
--   참고: 현장↔전문건설사 1:1, team_context 는 팀장 worker default_worksite_id 를 진실로 봄.
create or replace function yeseong_manager_set_assignments(
  p_worksite_ids uuid[]
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manager_id uuid;
  v_phone text;
  v_ws uuid;
  v_first_ws uuid;
  v_sub uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select id, phone into v_manager_id, v_phone
    from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_manager_id is null then
    raise exception 'manager not linked';
  end if;

  delete from yeseong_site_manager_assignments
   where site_manager_id = v_manager_id;

  if p_worksite_ids is not null then
    foreach v_ws in array p_worksite_ids loop
      insert into yeseong_site_manager_assignments (site_manager_id, worksite_id)
      values (v_manager_id, v_ws);
    end loop;
  end if;

  -- 팀장도 작업자 — 담당 현장 + 그 현장 전문건설사(1:1)를 worker 행에 동기화
  v_first_ws := case
    when p_worksite_ids is not null and array_length(p_worksite_ids, 1) >= 1
      then p_worksite_ids[1]
    else null
  end;

  if v_first_ws is not null then
    select ws.subcontractor_id into v_sub
      from yeseong_worksites ws where ws.id = v_first_ws;
  else
    v_sub := null;
  end if;

  if v_phone is not null then
    update yeseong_workers
       set default_worksite_id = v_first_ws,
           default_subcontractor_id = v_sub,
           updated_at = now()
     where phone = v_phone;
  end if;
end $$;

grant execute on function yeseong_manager_set_assignments(uuid[]) to authenticated;
