-- 현장↔전문건설사 1:1 정합화
--   규칙: 전문건설사의 단일 진실 = yeseong_worksites.subcontractor_id
--         팀장 현장배정 → 전문건설사 자동(현장에서 파생). 팀원은 팀장 따름.
--   기존엔 전문건설사가 팀장 worker 행 default_subcontractor_id에 수동 저장돼 이원화.
--   → worker_team_context 가 현장에서 파생하도록 변경하고, 死 m:n junction 제거.

-- ============================================================
-- 1) 백필: 기존 데이터의 전문건설사를 현장으로 끌어올림 (현장당 최빈 전문건설사)
--    worksites.subcontractor_id 가 비어있는 현장만 채움.
-- ============================================================
with ranked as (
  select default_worksite_id as wsid,
         default_subcontractor_id as scid,
         count(*) as c
  from yeseong_workers
  where default_worksite_id is not null
    and default_subcontractor_id is not null
  group by default_worksite_id, default_subcontractor_id
),
pick as (
  select distinct on (wsid) wsid, scid
  from ranked
  order by wsid, c desc
)
update yeseong_worksites w
set subcontractor_id = pick.scid
from pick
where pick.wsid = w.id
  and w.subcontractor_id is null;

-- ============================================================
-- 2) worker_team_context: 전문건설사를 현장(1:1)에서 파생
--    (현장 = 팀장 있으면 팀장 worker행 default_worksite_id, 없으면 본인 default)
--    전문건설사 = 그 현장의 worksites.subcontractor_id  ← 단일 진실
-- ============================================================
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

  -- 전문건설사는 현장 1:1에서 파생 (단일 진실)
  select subcontractor_id into v_eff_sc
    from yeseong_worksites where id = v_eff_ws;

  return query
    select
      v_eff_ws,
      (select name from yeseong_worksites where id = v_eff_ws),
      v_eff_sc,
      (select name from yeseong_subcontractors where id = v_eff_sc),
      v_tl_id,
      v_tl_name;
end $$;

grant execute on function yeseong_worker_team_context(uuid) to authenticated;

-- ============================================================
-- 3) 死 junction 제거: 현장↔전문건설사 m:n (1:1 규칙과 충돌, 소비처 0)
-- ============================================================
drop function if exists yeseong_replace_worksite_subcontractors(uuid, uuid[]);
drop table if exists yeseong_worksite_subcontractors cascade;
