-- 매사 자유화 원복 — 20260527000100/000200 을 자유화 직전(20260526 상태)으로 되돌림
--   1) trade_to_volume_category 함수 복원 (20260526000800)
--   2) masonry_prices/volumes category·unit CHECK 복원 (20260526000500)
--   3) get_volumes_me / replace_volumes_me 복원 (20260526000600)
--   4) admin_manager_get_volumes 복원 (20260526000900)
--   주의: 자유화 후 5종 외 공종 / 7종 외 단위 데이터가 입력됐다면 CHECK 복원이 실패합니다.

-- 1) 직종→공종 매핑 함수 복원
create or replace function yeseong_trade_to_volume_category(p_trade text)
returns text language sql immutable
as $$
  select case
    when p_trade in ('조적','조적공') then '조적'
    when p_trade in ('미장공','미장','바닥미장','견출공','기계미장공','방통') then '미장'
    when p_trade in ('방수공','방수') then '방수'
    when p_trade in ('타일공','타일') then '타일'
    when p_trade in ('석공','석공사') then '석공사'
    else null
  end
$$;

-- 2) CHECK 제약 복원
alter table yeseong_masonry_prices drop constraint if exists yeseong_masonry_prices_category_check;
alter table yeseong_masonry_prices
  add constraint yeseong_masonry_prices_category_check
  check (category in ('조적','미장','방수','타일','석공사'));
alter table yeseong_masonry_prices drop constraint if exists yeseong_masonry_prices_unit_check;
alter table yeseong_masonry_prices
  add constraint yeseong_masonry_prices_unit_check
  check (unit in ('장','㎡','㎥','m','매','식','롤'));
alter table yeseong_masonry_volumes drop constraint if exists yeseong_masonry_volumes_category_check;
alter table yeseong_masonry_volumes
  add constraint yeseong_masonry_volumes_category_check
  check (category in ('조적','미장','방수','타일','석공사'));

-- 3) get_volumes_me 복원 (직종 매핑 기반)
create or replace function yeseong_mobile_get_volumes_me(p_year_month text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_worker_id uuid;
  v_worker record;
  v_form_type text;
  v_target text;
  v_target_last date;
  v_input_start date;
  v_input_end date;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_is_open boolean := false;
  v_period_id uuid;
  v_slot_id uuid;
  v_existing jsonb := '[]'::jsonb;
  v_prices jsonb := '[]'::jsonb;
  v_filter_category text;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  v_worker_id := yeseong_resolve_worker_id(v_user_id);
  if v_worker_id is null then
    return jsonb_build_object('form_type', 'no_worker_link');
  end if;

  select id, name, wage_type, default_trade, default_worksite_id, is_active
    into v_worker
    from yeseong_workers
   where id = v_worker_id;

  if v_worker.is_active = false then
    return jsonb_build_object('form_type', 'no_worker_link', 'archived', true);
  end if;

  if v_worker.wage_type is distinct from '월급/일급' then
    v_form_type := 'not_eligible';
  else
    v_filter_category := yeseong_trade_to_volume_category(v_worker.default_trade);
    if v_filter_category is null then
      v_form_type := 'trade_unknown';
    else
      v_form_type := v_filter_category;
    end if;
  end if;

  v_target := coalesce(p_year_month, yeseong_current_input_target());

  if v_target is not null and v_target ~ '^\d{4}-\d{2}$' then
    v_target_last := (to_date(v_target || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
    v_input_start := v_target_last;
    v_input_end := v_target_last + interval '10 days';
    v_is_open := v_today >= v_input_start and v_today <= v_input_end;
  end if;

  if v_target is not null and v_worker.default_worksite_id is not null then
    select p.id into v_period_id
      from yeseong_payroll_periods p
     where p.worksite_id = v_worker.default_worksite_id
       and p.year_month = v_target;

    if v_period_id is not null then
      select pw.id into v_slot_id
        from yeseong_payroll_workers pw
       where pw.period_id = v_period_id and pw.worker_id = v_worker.id;
    end if;

    if v_slot_id is not null then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id,
        'category', v.category,
        'type_name', v.type_name,
        'size_spec', v.size_spec,
        'quantity', v.quantity,
        'unit_price', v.unit_price,
        'amount', v.amount,
        'note', v.note,
        'unit', v.unit,
        'approval_status', v.approval_status,
        'rejection_reason', v.rejection_reason
      )), '[]'::jsonb) into v_existing
        from yeseong_masonry_volumes v
       where v.payroll_worker_id = v_slot_id;
    end if;
  end if;

  if v_filter_category is not null and v_worker.default_worksite_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', mp.id,
      'category', mp.category,
      'type_name', mp.type_name,
      'size_spec', mp.size_spec,
      'unit', mp.unit,
      'unit_price', mp.unit_price
    ) order by mp.type_name, mp.size_spec, mp.unit), '[]'::jsonb) into v_prices
      from yeseong_masonry_prices mp
     where mp.worksite_id = v_worker.default_worksite_id
       and mp.category = v_filter_category
       and mp.is_active = true;
  end if;

  return jsonb_build_object(
    'form_type', v_form_type,
    'worker', jsonb_build_object(
      'id', v_worker.id,
      'name', v_worker.name,
      'wage_type', v_worker.wage_type,
      'default_trade', v_worker.default_trade
    ),
    'worksite_id', v_worker.default_worksite_id,
    'target_year_month', v_target,
    'is_input_open', v_is_open,
    'input_window', case when v_target_last is not null then
      jsonb_build_object('start', v_input_start, 'end', v_input_end) else null end,
    'today', v_today,
    'existing', v_existing,
    'prices', v_prices
  );
end $$;
grant execute on function yeseong_mobile_get_volumes_me(text) to authenticated;

-- 4) replace_volumes_me 복원 (직종 매핑 검증 기반)
create or replace function yeseong_mobile_replace_volumes_me(
  p_year_month text,
  p_items jsonb
) returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_worker_id uuid;
  v_worker record;
  v_category text;
  v_target_last date;
  v_input_start date;
  v_input_end date;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_period_id uuid;
  v_slot_id uuid;
  v_next_slot smallint;
  v_count int;
  v_item jsonb;
  v_price_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  if p_year_month !~ '^\d{4}-\d{2}$' then
    raise exception 'invalid year_month';
  end if;

  v_worker_id := yeseong_resolve_worker_id(v_user_id);
  if v_worker_id is null then
    raise exception 'worker not linked';
  end if;

  select id, name, wage_type, default_trade, default_worksite_id, default_wage,
         default_subcontractor_id, is_active
    into v_worker
    from yeseong_workers
   where id = v_worker_id;
  if v_worker.is_active = false then
    raise exception 'worker archived';
  end if;

  if v_worker.wage_type is distinct from '월급/일급' then
    raise exception '월급/일급 작업자만 입력 가능합니다';
  end if;
  v_category := yeseong_trade_to_volume_category(v_worker.default_trade);
  if v_category is null then
    raise exception '직종이 매사 성과 대상이 아닙니다. 관리자에게 문의하세요';
  end if;

  if v_worker.default_worksite_id is null then
    raise exception '기본 현장이 설정되지 않았습니다';
  end if;

  v_target_last := (to_date(p_year_month || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
  v_input_start := v_target_last;
  v_input_end := v_target_last + interval '10 days';
  if v_today < v_input_start or v_today > v_input_end then
    raise exception '입력 가능 기간이 아닙니다 (% ~ %)', v_input_start, v_input_end;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_price_id := (v_item->>'masonry_price_id')::uuid;
    if v_price_id is null then continue; end if;
    perform 1 from yeseong_masonry_prices
     where id = v_price_id
       and worksite_id = v_worker.default_worksite_id
       and category = v_category
       and is_active = true;
    if not found then
      raise exception '유효하지 않은 단가입니다 (현장·분류 불일치)';
    end if;
  end loop;

  insert into yeseong_payroll_periods (worksite_id, year_month, period_start, period_end)
  values (
    v_worker.default_worksite_id,
    p_year_month,
    (to_date(p_year_month || '-01', 'YYYY-MM-DD'))::date,
    v_target_last
  )
  on conflict (worksite_id, year_month) do update set updated_at = now()
  returning id into v_period_id;

  select id into v_slot_id from yeseong_payroll_workers
   where period_id = v_period_id and worker_id = v_worker.id;

  if v_slot_id is null then
    select coalesce(max(slot_number), 0) + 1 into v_next_slot
      from yeseong_payroll_workers where period_id = v_period_id;
    if v_next_slot > 32 then
      raise exception '슬롯이 가득 찼습니다 (32 max)';
    end if;
    insert into yeseong_payroll_workers
      (period_id, worker_id, slot_number, daily_wage, trade, subcontractor_id)
    values
      (v_period_id, v_worker.id, v_next_slot, v_worker.default_wage,
       v_worker.default_trade, v_worker.default_subcontractor_id)
    returning id into v_slot_id;
  end if;

  select yeseong_replace_masonry_volumes(v_slot_id, p_items) into v_count;

  return v_count;
end $$;
grant execute on function yeseong_mobile_replace_volumes_me(text, jsonb) to authenticated;

-- 5) admin_manager_get_volumes 복원 (미러, 직종 매핑 기반)
create or replace function yeseong_admin_manager_get_volumes(p_manager_id uuid, p_year_month text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
  v_worker record;
  v_form_type text;
  v_target text;
  v_target_last date;
  v_input_start date;
  v_input_end date;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_is_open boolean := false;
  v_period_id uuid;
  v_slot_id uuid;
  v_existing jsonb := '[]'::jsonb;
  v_prices jsonb := '[]'::jsonb;
  v_filter_category text;
begin
  if p_manager_id is null then
    raise exception 'manager id required';
  end if;

  select w.id into v_worker_id
    from yeseong_workers w
    join yeseong_site_managers m on m.phone = w.phone
   where m.id = p_manager_id
     and m.phone is not null
   limit 1;

  if v_worker_id is null then
    return jsonb_build_object('form_type', 'no_worker_link');
  end if;

  select id, name, wage_type, default_trade, default_worksite_id, is_active
    into v_worker
    from yeseong_workers
   where id = v_worker_id;

  if v_worker.is_active = false then
    return jsonb_build_object('form_type', 'no_worker_link', 'archived', true);
  end if;

  if v_worker.wage_type is distinct from '월급/일급' then
    v_form_type := 'not_eligible';
  else
    v_filter_category := yeseong_trade_to_volume_category(v_worker.default_trade);
    if v_filter_category is null then
      v_form_type := 'trade_unknown';
    else
      v_form_type := v_filter_category;
    end if;
  end if;

  v_target := coalesce(p_year_month, yeseong_current_input_target());

  if v_target is not null and v_target ~ '^\d{4}-\d{2}$' then
    v_target_last := (to_date(v_target || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
    v_input_start := v_target_last;
    v_input_end := v_target_last + interval '10 days';
    v_is_open := v_today >= v_input_start and v_today <= v_input_end;
  end if;

  if v_target is not null and v_worker.default_worksite_id is not null then
    select p.id into v_period_id
      from yeseong_payroll_periods p
     where p.worksite_id = v_worker.default_worksite_id
       and p.year_month = v_target;

    if v_period_id is not null then
      select pw.id into v_slot_id
        from yeseong_payroll_workers pw
       where pw.period_id = v_period_id and pw.worker_id = v_worker.id;
    end if;

    if v_slot_id is not null then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id,
        'category', v.category,
        'type_name', v.type_name,
        'size_spec', v.size_spec,
        'quantity', v.quantity,
        'unit_price', v.unit_price,
        'amount', v.amount,
        'note', v.note,
        'unit', v.unit,
        'approval_status', v.approval_status,
        'rejection_reason', v.rejection_reason
      )), '[]'::jsonb) into v_existing
        from yeseong_masonry_volumes v
       where v.payroll_worker_id = v_slot_id;
    end if;
  end if;

  if v_filter_category is not null and v_worker.default_worksite_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', mp.id,
      'category', mp.category,
      'type_name', mp.type_name,
      'size_spec', mp.size_spec,
      'unit', mp.unit,
      'unit_price', mp.unit_price
    ) order by mp.type_name, mp.size_spec, mp.unit), '[]'::jsonb) into v_prices
      from yeseong_masonry_prices mp
     where mp.worksite_id = v_worker.default_worksite_id
       and mp.category = v_filter_category
       and mp.is_active = true;
  end if;

  return jsonb_build_object(
    'form_type', v_form_type,
    'worker', jsonb_build_object(
      'id', v_worker.id,
      'name', v_worker.name,
      'wage_type', v_worker.wage_type,
      'default_trade', v_worker.default_trade
    ),
    'worksite_id', v_worker.default_worksite_id,
    'target_year_month', v_target,
    'is_input_open', v_is_open,
    'input_window', case when v_target_last is not null then
      jsonb_build_object('start', v_input_start, 'end', v_input_end) else null end,
    'today', v_today,
    'existing', v_existing,
    'prices', v_prices
  );
end $$;
revoke all on function yeseong_admin_manager_get_volumes(uuid, text) from public;
grant execute on function yeseong_admin_manager_get_volumes(uuid, text) to service_role;
