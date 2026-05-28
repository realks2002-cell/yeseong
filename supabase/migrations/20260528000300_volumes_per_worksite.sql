-- 매사 성과 입력 — 현장 자동분기 + 월중 이동 처리
--   배경: 월중에 작업자가 A→B로 이동하면, 한 달에 두 현장에서 일함.
--         기존 성과 RPC는 worker.default_worksite_id(현재 현장) 하나만 봐서 A 성과를 못 넣음.
--   변경:
--     get_volumes_me  → 그 달 일한 현장(슬롯) ∪ 현재 현장을 "현장별 섹션"으로 반환.
--     replace_volumes_me(+p_worksite_id) → 지정한 현장의 슬롯에 저장.
--   입력 가능 시점(현장별):
--     · 현재 현장      = 월말~익월10일 (평소대로)
--     · 떠난 현장(슬롯) = 상시 가능 (그 작업자에겐 이미 끝난 현장)
--   전문건설사는 현장 1:1에서 파생.

-- ============================================================
-- get_volumes_me — 현장별 섹션 반환
-- ============================================================
create or replace function yeseong_mobile_get_volumes_me(p_year_month text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_worker_id uuid;
  v_worker record;
  v_form_type text;
  v_category text;
  v_target text;
  v_target_last date;
  v_win_start date;
  v_win_end date;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_current_ws uuid;
  v_worksites jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;

  v_worker_id := yeseong_resolve_worker_id(v_uid);
  if v_worker_id is null then
    return jsonb_build_object('form_type', 'no_worker_link');
  end if;

  select id, name, wage_type, default_trade, default_worksite_id, is_active
    into v_worker
    from yeseong_workers where id = v_worker_id;
  if v_worker.is_active = false then
    return jsonb_build_object('form_type', 'no_worker_link', 'archived', true);
  end if;

  if v_worker.wage_type is distinct from '월급/일급' then
    v_form_type := 'not_eligible';
  else
    v_category := yeseong_trade_to_volume_category(v_worker.default_trade);
    if v_category is null then
      v_form_type := 'trade_unknown';
    else
      v_form_type := v_category;
    end if;
  end if;

  -- 대상 월: 인자 > 정상 입력월(월말창) > 현재 진행 월(월중 이동분 입력용)
  v_target := coalesce(p_year_month, yeseong_current_input_target(), to_char(v_today, 'YYYY-MM'));
  v_current_ws := v_worker.default_worksite_id;

  if v_form_type in ('not_eligible', 'trade_unknown') or v_target !~ '^\d{4}-\d{2}$' then
    return jsonb_build_object(
      'form_type', v_form_type,
      'worker', jsonb_build_object('id', v_worker.id, 'name', v_worker.name,
        'wage_type', v_worker.wage_type, 'default_trade', v_worker.default_trade),
      'target_year_month', v_target,
      'today', v_today,
      'worksites', '[]'::jsonb
    );
  end if;

  v_target_last := (to_date(v_target || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
  v_win_start := v_target_last;
  v_win_end := v_target_last + interval '10 days';

  with cand as (
    -- 그 달 슬롯이 있는 현장(과거/현재) ∪ 현재 배정 현장(슬롯 없어도)
    select distinct p.worksite_id as wsid
      from yeseong_payroll_periods p
      join yeseong_payroll_workers pw on pw.period_id = p.id
     where p.year_month = v_target and pw.worker_id = v_worker.id
    union
    select v_current_ws where v_current_ws is not null
  ),
  built as (
    select
      c.wsid,
      ws.name as wsname,
      (c.wsid = v_current_ws) as is_current,
      -- 현재 현장 = 월말 창 / 떠난 현장 = 상시 열림
      case when c.wsid = v_current_ws
           then (v_today >= v_win_start and v_today <= v_win_end)
           else true end as is_open,
      (select pw.id
         from yeseong_payroll_workers pw
         join yeseong_payroll_periods p on p.id = pw.period_id
        where p.worksite_id = c.wsid and p.year_month = v_target
          and pw.worker_id = v_worker.id
        limit 1) as slot_id
      from cand c
      join yeseong_worksites ws on ws.id = c.wsid
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'worksite_id', b.wsid,
    'worksite_name', b.wsname,
    'is_current', b.is_current,
    'is_input_open', b.is_open,
    'input_window', jsonb_build_object('start', v_win_start, 'end', v_win_end),
    'prices', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', mp.id, 'category', mp.category, 'type_name', mp.type_name,
        'size_spec', mp.size_spec, 'unit', mp.unit, 'unit_price', mp.unit_price
      ) order by mp.type_name, mp.size_spec), '[]'::jsonb)
      from yeseong_masonry_prices mp
      where mp.worksite_id = b.wsid and mp.category = v_category and mp.is_active = true
    ),
    'existing', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'category', v.category, 'type_name', v.type_name, 'size_spec', v.size_spec,
        'unit', v.unit, 'quantity', v.quantity, 'unit_price', v.unit_price, 'amount', v.amount,
        'note', v.note, 'approval_status', v.approval_status, 'rejection_reason', v.rejection_reason
      )), '[]'::jsonb)
      from yeseong_masonry_volumes v
      where v.payroll_worker_id = b.slot_id
    )
  ) order by b.is_current desc, b.wsname), '[]'::jsonb)
  into v_worksites
  from built b;

  return jsonb_build_object(
    'form_type', v_form_type,
    'worker', jsonb_build_object('id', v_worker.id, 'name', v_worker.name,
      'wage_type', v_worker.wage_type, 'default_trade', v_worker.default_trade),
    'target_year_month', v_target,
    'today', v_today,
    'worksites', v_worksites
  );
end $$;

grant execute on function yeseong_mobile_get_volumes_me(text) to authenticated;

-- ============================================================
-- replace_volumes_me — 현장 지정 저장 (p_worksite_id 추가)
-- ============================================================
drop function if exists yeseong_mobile_replace_volumes_me(text, jsonb);

create or replace function yeseong_mobile_replace_volumes_me(
  p_year_month text,
  p_worksite_id uuid,
  p_items jsonb
) returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_worker_id uuid;
  v_worker record;
  v_category text;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_target_last date;
  v_win_start date;
  v_win_end date;
  v_is_current boolean;
  v_has_slot boolean;
  v_period_id uuid;
  v_slot_id uuid;
  v_next_slot smallint;
  v_sub uuid;
  v_count int;
  v_item jsonb;
  v_price_id uuid;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  if p_year_month !~ '^\d{4}-\d{2}$' then raise exception 'invalid year_month'; end if;
  if p_worksite_id is null then raise exception '현장이 지정되지 않았습니다'; end if;

  v_worker_id := yeseong_resolve_worker_id(v_uid);
  if v_worker_id is null then raise exception 'worker not linked'; end if;

  select id, name, wage_type, default_trade, default_worksite_id, default_wage, is_active
    into v_worker
    from yeseong_workers where id = v_worker_id;
  if v_worker.is_active = false then raise exception 'worker archived'; end if;

  if v_worker.wage_type is distinct from '월급/일급' then
    raise exception '월급/일급 작업자만 입력 가능합니다';
  end if;
  v_category := yeseong_trade_to_volume_category(v_worker.default_trade);
  if v_category is null then
    raise exception '직종이 매사 성과 입력 대상이 아닙니다. 관리자에게 문의하세요';
  end if;

  v_is_current := (p_worksite_id = v_worker.default_worksite_id);

  select exists (
    select 1 from yeseong_payroll_workers pw
      join yeseong_payroll_periods p on p.id = pw.period_id
     where p.worksite_id = p_worksite_id and p.year_month = p_year_month
       and pw.worker_id = v_worker.id
  ) into v_has_slot;

  -- 현재 현장이거나, 그 달 그 현장에서 일한 기록(슬롯)이 있어야 입력 가능
  if not v_is_current and not v_has_slot then
    raise exception '이 현장은 입력 대상이 아닙니다';
  end if;

  v_target_last := (to_date(p_year_month || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
  v_win_start := v_target_last;
  v_win_end := v_target_last + interval '10 days';
  -- 현재 현장은 월말 창에만 / 떠난 현장(슬롯 보유)은 상시 가능
  if v_is_current and (v_today < v_win_start or v_today > v_win_end) then
    raise exception '현재 현장 성과는 입력 기간(% ~ %)에만 가능합니다', v_win_start, v_win_end;
  end if;

  -- 단가는 이 현장 + 직종 카테고리만 허용
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_price_id := (v_item->>'masonry_price_id')::uuid;
    if v_price_id is null then continue; end if;
    perform 1 from yeseong_masonry_prices
     where id = v_price_id and worksite_id = p_worksite_id
       and category = v_category and is_active = true;
    if not found then
      raise exception '유효하지 않은 단가입니다 (현장·분류 불일치)';
    end if;
  end loop;

  -- 전문건설사 = 현장 1:1
  select subcontractor_id into v_sub from yeseong_worksites where id = p_worksite_id;

  insert into yeseong_payroll_periods (worksite_id, year_month, period_start, period_end)
  values (
    p_worksite_id, p_year_month,
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
    if v_next_slot > 32 then raise exception '슬롯이 가득 찼습니다 (32 max)'; end if;
    insert into yeseong_payroll_workers
      (period_id, worker_id, slot_number, daily_wage, trade, subcontractor_id)
    values
      (v_period_id, v_worker.id, v_next_slot, v_worker.default_wage, v_worker.default_trade, v_sub)
    returning id into v_slot_id;
  end if;

  select yeseong_replace_masonry_volumes(v_slot_id, p_items) into v_count;
  return v_count;
end $$;

grant execute on function yeseong_mobile_replace_volumes_me(text, uuid, jsonb) to authenticated;

-- ============================================================
-- 미러(관리자 보기 전용) — get_volumes_me 와 동일 shape(현장별 섹션) 반환
-- ============================================================
create or replace function yeseong_admin_manager_get_volumes(p_manager_id uuid, p_year_month text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
  v_worker record;
  v_form_type text;
  v_category text;
  v_target text;
  v_target_last date;
  v_win_start date;
  v_win_end date;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_current_ws uuid;
  v_worksites jsonb := '[]'::jsonb;
begin
  if p_manager_id is null then raise exception 'manager id required'; end if;

  -- 팀장(=작업자) phone 매칭으로 worker 해석
  select w.id into v_worker_id
    from yeseong_workers w
    join yeseong_site_managers m on m.phone = w.phone
   where m.id = p_manager_id and m.phone is not null
   limit 1;
  if v_worker_id is null then
    return jsonb_build_object('form_type', 'no_worker_link');
  end if;

  select id, name, wage_type, default_trade, default_worksite_id, is_active
    into v_worker
    from yeseong_workers where id = v_worker_id;
  if v_worker.is_active = false then
    return jsonb_build_object('form_type', 'no_worker_link', 'archived', true);
  end if;

  if v_worker.wage_type is distinct from '월급/일급' then
    v_form_type := 'not_eligible';
  else
    v_category := yeseong_trade_to_volume_category(v_worker.default_trade);
    if v_category is null then v_form_type := 'trade_unknown';
    else v_form_type := v_category;
    end if;
  end if;

  v_target := coalesce(p_year_month, yeseong_current_input_target(), to_char(v_today, 'YYYY-MM'));
  v_current_ws := v_worker.default_worksite_id;

  if v_form_type in ('not_eligible', 'trade_unknown') or v_target !~ '^\d{4}-\d{2}$' then
    return jsonb_build_object(
      'form_type', v_form_type,
      'worker', jsonb_build_object('id', v_worker.id, 'name', v_worker.name,
        'wage_type', v_worker.wage_type, 'default_trade', v_worker.default_trade),
      'target_year_month', v_target,
      'today', v_today,
      'worksites', '[]'::jsonb
    );
  end if;

  v_target_last := (to_date(v_target || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
  v_win_start := v_target_last;
  v_win_end := v_target_last + interval '10 days';

  with cand as (
    select distinct p.worksite_id as wsid
      from yeseong_payroll_periods p
      join yeseong_payroll_workers pw on pw.period_id = p.id
     where p.year_month = v_target and pw.worker_id = v_worker.id
    union
    select v_current_ws where v_current_ws is not null
  ),
  built as (
    select
      c.wsid,
      ws.name as wsname,
      (c.wsid = v_current_ws) as is_current,
      case when c.wsid = v_current_ws
           then (v_today >= v_win_start and v_today <= v_win_end)
           else true end as is_open,
      (select pw.id
         from yeseong_payroll_workers pw
         join yeseong_payroll_periods p on p.id = pw.period_id
        where p.worksite_id = c.wsid and p.year_month = v_target
          and pw.worker_id = v_worker.id
        limit 1) as slot_id
      from cand c
      join yeseong_worksites ws on ws.id = c.wsid
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'worksite_id', b.wsid,
    'worksite_name', b.wsname,
    'is_current', b.is_current,
    'is_input_open', b.is_open,
    'input_window', jsonb_build_object('start', v_win_start, 'end', v_win_end),
    'prices', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', mp.id, 'category', mp.category, 'type_name', mp.type_name,
        'size_spec', mp.size_spec, 'unit', mp.unit, 'unit_price', mp.unit_price
      ) order by mp.type_name, mp.size_spec), '[]'::jsonb)
      from yeseong_masonry_prices mp
      where mp.worksite_id = b.wsid and mp.category = v_category and mp.is_active = true
    ),
    'existing', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'category', v.category, 'type_name', v.type_name, 'size_spec', v.size_spec,
        'unit', v.unit, 'quantity', v.quantity, 'unit_price', v.unit_price, 'amount', v.amount,
        'note', v.note, 'approval_status', v.approval_status, 'rejection_reason', v.rejection_reason
      )), '[]'::jsonb)
      from yeseong_masonry_volumes v
      where v.payroll_worker_id = b.slot_id
    )
  ) order by b.is_current desc, b.wsname), '[]'::jsonb)
  into v_worksites
  from built b;

  return jsonb_build_object(
    'form_type', v_form_type,
    'worker', jsonb_build_object('id', v_worker.id, 'name', v_worker.name,
      'wage_type', v_worker.wage_type, 'default_trade', v_worker.default_trade),
    'target_year_month', v_target,
    'today', v_today,
    'worksites', v_worksites
  );
end $$;

grant execute on function yeseong_admin_manager_get_volumes(uuid, text) to authenticated;
