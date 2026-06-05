-- 발주 시스템
--   흐름: 팀장앱 자재 요청(품목+수량) → 관리자 검토 → 발주서 텍스트 복사 → 카톡 전송 → 상태 관리
--   품목은 공종(trades) 필터: 팀장의 공종에 맞는 품목만 노출 (null/빈배열 = 전체 공통)

-- ============================================================
-- 품목 ← 공종 연결 (다중 공종 지정 가능)
-- ============================================================
alter table yeseong_items
  add column trades text[];  -- null 또는 '{}' = 모든 공종에 노출 (공통 자재)

comment on column yeseong_items.trades is '노출 공종 목록. null/빈배열 = 전체 공통';

-- ============================================================
-- 발주서
-- ============================================================
create table yeseong_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,                 -- PO-YYYYMMDD-NN (KST)
  worksite_id uuid not null references yeseong_worksites(id) on delete restrict,
  requested_by uuid references yeseong_site_managers(id) on delete set null,  -- null = 관리자 직접 작성
  delivery_date date,                            -- 납기 희망일
  note text,                                     -- 요청사항
  status text not null default 'requested',      -- requested | sent | delivered | cancelled
  sent_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on yeseong_orders (status, created_at desc);
create index on yeseong_orders (requested_by);

create trigger trg_orders_updated_at
  before update on yeseong_orders
  for each row execute function yeseong_set_updated_at();

alter table yeseong_orders enable row level security;
create policy "orders_authenticated" on yeseong_orders
  for all to authenticated using (true) with check (true);

-- ============================================================
-- 발주 품목 라인 (품목 마스터 스냅샷 보존)
-- ============================================================
create table yeseong_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references yeseong_orders(id) on delete cascade,
  item_id uuid references yeseong_items(id) on delete set null,
  vendor_id uuid references yeseong_vendors(id) on delete set null,  -- 발주 시점 품목 거래처
  item_name text not null,
  spec text,
  unit text not null,
  quantity numeric(10,2) not null check (quantity > 0),
  note text,
  created_at timestamptz default now()
);
create index on yeseong_order_items (order_id);

alter table yeseong_order_items enable row level security;
create policy "order_items_authenticated" on yeseong_order_items
  for all to authenticated using (true) with check (true);

-- ============================================================
-- 발주번호 채번: PO-YYYYMMDD-NN (KST 기준, 당일 순번)
-- ============================================================
create or replace function yeseong_next_order_no()
returns text
language plpgsql
as $$
declare
  v_date text := to_char(now() at time zone 'Asia/Seoul', 'YYYYMMDD');
  v_seq integer;
begin
  select count(*) + 1 into v_seq
    from yeseong_orders
   where order_no like 'PO-' || v_date || '-%';
  return 'PO-' || v_date || '-' || lpad(v_seq::text, 2, '0');
end $$;

-- ============================================================
-- RPC: 팀장 발주 품목 리스트 — 본인 공종 + 공통 품목만
-- ============================================================
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
      i.trades is null
      or cardinality(i.trades) = 0
      or (v_trade is not null and v_trade = any(i.trades))
    );

  return result;
end $$;

grant execute on function yeseong_manager_list_order_items() to authenticated;

-- ============================================================
-- RPC: 팀장 발주 요청 생성
--   p_items: [{"item_id": uuid, "quantity": numeric, "note": text}]
--   현장은 본인 담당 현장(단일) 자동 적용
-- ============================================================
create or replace function yeseong_manager_create_order(
  p_items jsonb,
  p_delivery_date date default null,
  p_note text default null
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manager_id uuid;
  v_worksite_id uuid;
  v_order_id uuid;
  v_line jsonb;
  v_item record;
  v_qty numeric;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'items required';
  end if;

  select id into v_manager_id
    from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_manager_id is null then
    raise exception 'manager not found';
  end if;

  select worksite_id into v_worksite_id
    from yeseong_site_manager_assignments
   where site_manager_id = v_manager_id
   limit 1;
  if v_worksite_id is null then
    raise exception 'no assigned worksite';
  end if;

  insert into yeseong_orders (order_no, worksite_id, requested_by, delivery_date, note)
  values (yeseong_next_order_no(), v_worksite_id, v_manager_id, p_delivery_date, nullif(trim(p_note), ''))
  returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_line->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid quantity';
    end if;

    select i.name, i.spec, i.unit, i.vendor_id into v_item
      from yeseong_items i
     where i.id = (v_line->>'item_id')::uuid and i.is_active = true;
    if not found then
      raise exception 'item not found';
    end if;

    insert into yeseong_order_items
      (order_id, item_id, vendor_id, item_name, spec, unit, quantity, note)
    values
      (v_order_id, (v_line->>'item_id')::uuid, v_item.vendor_id,
       v_item.name, v_item.spec, v_item.unit, v_qty, nullif(trim(v_line->>'note'), ''));
  end loop;

  return v_order_id;
end $$;

grant execute on function yeseong_manager_create_order(jsonb, date, text) to authenticated;

-- ============================================================
-- RPC: 팀장 본인 발주 요청 이력
-- ============================================================
create or replace function yeseong_manager_list_orders()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manager_id uuid;
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select id into v_manager_id
    from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_manager_id is null then
    raise exception 'manager not found';
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
    where requested_by = v_manager_id
    order by created_at desc
    limit 50
  ) o
  join yeseong_worksites ws on ws.id = o.worksite_id;

  return result;
end $$;

grant execute on function yeseong_manager_list_orders() to authenticated;
