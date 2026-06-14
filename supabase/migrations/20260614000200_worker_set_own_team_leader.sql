-- 작업자 본인 팀장 선택 허용
--   배경: 작업자 셀프 프로필 수정은 차단(20260526000300)됐으나,
--         소속 팀장만은 작업자가 앱 '내 정보'에서 직접 바꿀 수 있게 한다.
--         team_leader_id 한 컬럼이 진실이므로 관리자 마스터(/workers)와 자동 양방향 연동.
--   추종: team_leader_id 변경 시 현장·전문건설사는 team_context 가 동적 추종(별도 갱신 불필요).
create or replace function yeseong_mobile_set_my_team_leader(p_team_leader_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;

  v_worker_id := yeseong_resolve_worker_id(auth.uid());
  if v_worker_id is null then raise exception 'worker not linked'; end if;

  -- 유효성: 활성 팀장만 (null = 해제 허용)
  if p_team_leader_id is not null then
    perform 1 from yeseong_site_managers
      where id = p_team_leader_id and coalesce(is_active, true);
    if not found then raise exception '유효하지 않은 팀장입니다'; end if;
  end if;

  -- team_leader_id 외 다른 컬럼은 건드리지 않는다 (셀프 수정 차단 정책 유지)
  update yeseong_workers
     set team_leader_id = p_team_leader_id,
         updated_at = now()
   where id = v_worker_id;
end $$;

grant execute on function yeseong_mobile_set_my_team_leader(uuid) to authenticated;
