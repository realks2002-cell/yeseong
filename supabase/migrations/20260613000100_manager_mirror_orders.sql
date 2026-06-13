-- 팀장앱 미러링(보기 전용) — 발주 데이터 admin RPC
--   기존 self RPC(yeseong_manager_list_order_items / list_orders, auth.uid 기준)를
--   p_manager_id 파라미터 버전으로 복제. service_role 로만 호출(관리자 미러 API).
--   참고: [[yeseong_manager_mirror]]

-- ============================================================
-- 1) 발주 품목 리스트 — 선택한 팀장의 공종 + 공통 품목
-- ============================================================
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
      or (v_trade is not null and v_trade = any(i.trades))
    );

  return result;
end $$;

-- ============================================================
-- 2) 발주 요청 이력 — 선택한 팀장이 요청한 발주
-- ============================================================
create or replace function yeseong_admin_manager_list_orders(p_manager_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if p_manager_id is null then
    raise exception 'manager id required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'order_no', o.order_no,
    'status', o.status,
    'delivery_date', o.delivery_date,
    'note', o.note,
    'created_at', o.created_at,
    'worksite_name', ws.name,
    'items', (
      select jsonb_agg(jsonb_build_object(
        'item_name', oi.item_name,
        'spec', oi.spec,
        'unit', oi.unit,
        'quantity', oi.quantity,
        'note', oi.note
      ) order by oi.created_at)
      from yeseong_order_items oi
      where oi.order_id = o.id
    )
  ) order by o.created_at desc), '[]'::jsonb)
  into result
  from (
    select * from yeseong_orders
    where requested_by = p_manager_id
    order by created_at desc
    limit 50
  ) o
  join yeseong_worksites ws on ws.id = o.worksite_id;

  return result;
end $$;

grant execute on function yeseong_admin_manager_list_order_items(uuid) to service_role;
grant execute on function yeseong_admin_manager_list_orders(uuid) to service_role;
