-- 발주 품목 리스트: 공종(default_trade) 미지정 팀장은 전체 품목 표시
--   기존: 공종 일치 + 공통 품목만 → 공종 미지정 팀장은 공통 품목 외 아무것도 안 보임

create or replace function yeseong_manager_list_order_items()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_trade text;
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select default_trade into v_trade
    from yeseong_site_managers
   where auth_user_id = v_user_id;
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
      v_trade is null                -- 공종 미지정 팀장 → 전체 품목
      or i.trades is null
      or cardinality(i.trades) = 0
      or v_trade = any(i.trades)
    );

  return result;
end $$;

grant execute on function yeseong_manager_list_order_items() to authenticated;
