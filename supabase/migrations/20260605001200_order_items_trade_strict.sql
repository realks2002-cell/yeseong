-- 발주 품목: 팀장 공종별 엄격 필터
--   - 공종 출처: site_managers.default_trade → 없으면 worker 행(phone 매칭).default_trade
--     (앱 '내 정보'의 공종 수정은 worker 행에 저장되므로 worker 행까지 봐야 함)
--   - 공종 일치 품목 + 공통(trades 미지정) 품목만 표시
--   - 공종 미지정 팀장 → 공통 품목만 (이전 '전체 표시' 폴백 제거)

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
      or (v_trade is not null and v_trade = any(i.trades))
    );

  return result;
end $$;

grant execute on function yeseong_manager_list_order_items() to authenticated;
