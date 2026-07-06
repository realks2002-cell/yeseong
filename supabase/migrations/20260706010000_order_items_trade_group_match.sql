-- 발주 품목 필터: 직종을 '상위 그룹'으로 묶어 매칭 (저장값은 그대로)
--   요청 배경: 품목 태그(미장공/조적공)와 팀장 직종 표기(조적공/조적/조적(시멘트벽돌)…, 미장공/미장(벽미장)…)가
--   제각각이라 발주 화면에 품목이 안 뜨는 경우 발생. 데이터(작업자/팀장/품목)는 건드리지 않고,
--   매칭 시점에만 조적* → '조적', 미장* → '미장'으로 정규화해 비교한다.
--   규칙(사용자 확정): 조적/조적공/조적(**) → 조적,  미장/미장공/미장(**)/바닥미장 → 미장.
--   그 외 직종(방수공·도장공·타일공·석공·견출 등)은 원값 그대로 비교.

create or replace function yeseong_trade_group(t text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when t is null then null
    when t like '조적%' then '조적'
    when t like '미장%' then '미장'
    when t = '바닥미장' then '미장'
    else t
  end
$$;

-- 1) 작업자 앱 self RPC (auth.uid → site_manager, 없으면 worker 행 폴백)
create or replace function yeseong_manager_list_order_items()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_phone text;
  v_trade text;
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select default_trade, phone into v_trade, v_phone
    from yeseong_site_managers
   where auth_user_id = v_user_id;
  if not found then
    raise exception 'manager not found';
  end if;

  -- manager 행에 공종이 없으면 본인 worker 행(phone 매칭)의 공종 사용
  if v_trade is null and v_phone is not null then
    select w.default_trade into v_trade
      from yeseong_workers w
     where w.phone = v_phone
     limit 1;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'item_code', i.item_code,
    'name', i.name,
    'spec', i.spec,
    'unit', i.unit,
    'vendor_name', v.name
  ) order by i.name), '[]'::jsonb)
  into result
  from yeseong_items i
  left join yeseong_vendors v on v.id = i.vendor_id
  where i.is_active = true
    and (
      i.trades is null
      or cardinality(i.trades) = 0
      or (v_trade is not null and exists (
            select 1 from unnest(i.trades) it
            where yeseong_trade_group(it) = yeseong_trade_group(v_trade)
          ))
    );

  return result;
end $$;

-- 2) 관리자 미러 RPC (p_manager_id 지정, service_role)
create or replace function yeseong_admin_manager_list_order_items(p_manager_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_trade text;
  result jsonb;
begin
  if p_manager_id is null then
    raise exception 'manager id required';
  end if;

  select default_trade into v_trade
    from yeseong_site_managers
   where id = p_manager_id;
  if not found then
    raise exception 'manager not found';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'item_code', i.item_code,
    'name', i.name,
    'spec', i.spec,
    'unit', i.unit,
    'vendor_name', v.name
  ) order by i.name), '[]'::jsonb)
  into result
  from yeseong_items i
  left join yeseong_vendors v on v.id = i.vendor_id
  where i.is_active = true
    and (
      i.trades is null
      or cardinality(i.trades) = 0
      or (v_trade is not null and exists (
            select 1 from unnest(i.trades) it
            where yeseong_trade_group(it) = yeseong_trade_group(v_trade)
          ))
    );

  return result;
end $$;

-- 3) 앱 가입 직종 드롭다운용 — 활성 직종 마스터 목록 (미인증 anon 실행)
--    가입 화면이 하드코딩 상수 대신 /trades(yeseong_trades) 값을 그대로 보여주도록.
create or replace function yeseong_list_trades()
returns table(name text)
language sql
security definer
set search_path = public
as $$
  select name
    from yeseong_trades
   where is_active
   order by sort_order, name;
$$;

grant execute on function yeseong_trade_group(text) to authenticated, service_role;
grant execute on function yeseong_manager_list_order_items() to authenticated;
grant execute on function yeseong_admin_manager_list_order_items(uuid) to service_role;
grant execute on function yeseong_list_trades() to anon, authenticated;
