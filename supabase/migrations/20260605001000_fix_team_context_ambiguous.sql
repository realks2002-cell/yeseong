-- yeseong_worker_team_context: "subcontractor_id" ambiguous 수정
--   returns table의 OUT 변수(subcontractor_id)와 yeseong_worksites.subcontractor_id 컬럼이
--   충돌해 함수 호출이 42702로 실패 → 사진 업로드 "배정된 현장이 없습니다" / 출역 제출 실패.
--   테이블 별칭으로 컬럼을 한정해 해결.

create or replace function yeseong_worker_team_context(p_worker_id uuid)
returns table (
  worksite_id uuid,
  worksite_name text,
  subcontractor_id uuid,
  subcontractor_name text,
  team_leader_id uuid,
  team_leader_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tl uuid;
  v_own_ws uuid;
  v_eff_ws uuid;
  v_eff_sc uuid;
  v_tl_id uuid;
  v_tl_name text;
  v_sm_phone text;
begin
  select w.team_leader_id, w.default_worksite_id
    into v_tl, v_own_ws
    from yeseong_workers w
   where w.id = p_worker_id;

  if v_tl is not null then
    select sm.id, sm.name, sm.phone
      into v_tl_id, v_tl_name, v_sm_phone
      from yeseong_site_managers sm
     where sm.id = v_tl;

    -- 팀장 worker 행(phone 매칭)의 현장을 따라감
    select lw.default_worksite_id
      into v_eff_ws
      from yeseong_workers lw
     where lw.phone = v_sm_phone
     limit 1;
  else
    v_eff_ws := v_own_ws;
  end if;

  -- 전문건설사는 현장 1:1에서 파생 (단일 진실) — ws. 한정으로 OUT 변수와 충돌 방지
  select ws.subcontractor_id into v_eff_sc
    from yeseong_worksites ws
   where ws.id = v_eff_ws;

  return query
    select
      v_eff_ws,
      (select w2.name from yeseong_worksites w2 where w2.id = v_eff_ws),
      v_eff_sc,
      (select sc.name from yeseong_subcontractors sc where sc.id = v_eff_sc),
      v_tl_id,
      v_tl_name;
end $$;

grant execute on function yeseong_worker_team_context(uuid) to authenticated;
