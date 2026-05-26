-- 매사 성과 2·3단계
--   [2단계] 직종(방수공·타일공·석공)→카테고리 매핑 확장, 작업자 성과 입력 연동
--   [3단계] 성과 승인 플로우(작업자 제출=pending → 관리자 승인/반려, 승인분만 급여 반영)

-- ============================================================
-- [2단계] 직종 마스터에 타일공·석공 추가
-- ============================================================
insert into yeseong_trades (name, sort_order)
  select '타일공', 11 where not exists (select 1 from yeseong_trades where name = '타일공');
insert into yeseong_trades (name, sort_order)
  select '석공', 12 where not exists (select 1 from yeseong_trades where name = '석공');

-- 직종 → 매사 카테고리 매핑 헬퍼 (get/replace 공통, 중복 제거)
create or replace function yeseong_trade_to_volume_category(p_trade text)
returns text language sql immutable
as $$
  select case
    when p_trade in ('조적','조적공') then '조적'
    when p_trade in ('미장공','바닥미장') then '미장'
    when p_trade in ('방수공','방수') then '방수'
    when p_trade in ('타일공','타일') then '타일'
    when p_trade in ('석공','석공사') then '석공사'
    else null
  end
$$;

-- ============================================================
-- [3단계] 성과 승인 컬럼
-- ============================================================
alter table yeseong_masonry_volumes
  add column if not exists unit text,
  add column if not exists approval_status text not null default 'pending',
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists rejection_reason text;

-- 미장형은 단위가 구분자(방수·㎡ vs 방수·롤). 기존 행은 단가의 unit으로 백필.
update yeseong_masonry_volumes v
   set unit = mp.unit
  from yeseong_masonry_prices mp
 where v.unit is null
   and mp.category = v.category
   and coalesce(mp.type_name,'') = coalesce(v.type_name,'')
   and coalesce(mp.size_spec,'') = coalesce(v.size_spec,'')
   and mp.unit_price = v.unit_price;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'yeseong_masonry_volumes_approval_status_check') then
    alter table yeseong_masonry_volumes
      add constraint yeseong_masonry_volumes_approval_status_check
      check (approval_status in ('pending','approved','rejected'));
  end if;
end $$;

-- 기존 입력분은 승인된 것으로 간주(현행 급여 유지). 이후 신규 입력만 pending.
update yeseong_masonry_volumes set approval_status = 'approved' where approval_status = 'pending';

-- replace_masonry_volumes 재정의 — 단위(unit)도 스냅샷 저장 (미장형 단위 구분)
create or replace function yeseong_replace_masonry_volumes(
  p_payroll_worker_id uuid,
  p_items jsonb
) returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_item jsonb;
  v_price record;
  v_quantity numeric;
  v_note text;
begin
  delete from yeseong_masonry_volumes where payroll_worker_id = p_payroll_worker_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_quantity := (v_item->>'quantity')::numeric;
    if v_quantity is null or v_quantity <= 0 then
      continue;
    end if;

    select id, category, type_name, size_spec, unit, unit_price, is_active
      into v_price
      from yeseong_masonry_prices
     where id = (v_item->>'masonry_price_id')::uuid;

    if v_price.id is null or not v_price.is_active then
      raise exception '유효하지 않은 단가: %', v_item->>'masonry_price_id';
    end if;

    v_note := nullif(trim(coalesce(v_item->>'note', '')), '');

    insert into yeseong_masonry_volumes
      (payroll_worker_id, category, type_name, size_spec, unit, quantity, unit_price, note)
    values
      (p_payroll_worker_id, v_price.category, v_price.type_name, v_price.size_spec, v_price.unit,
       v_quantity, v_price.unit_price, v_note);
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

grant execute on function yeseong_replace_masonry_volumes(uuid, jsonb) to authenticated;

-- ============================================================
-- [2·3단계] get_volumes_me — 매핑 헬퍼 + existing에 승인상태 포함
-- ============================================================
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

  -- form_type 결정: 월급/일급 + 매핑 가능한 직종이면 카테고리명, 아니면 trade_unknown
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

-- ============================================================
-- [2단계] replace_volumes_me — 매핑 헬퍼 적용
-- ============================================================
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

  -- 기존 replace RPC 재사용 — 재제출 시 행이 새로 생성되어 approval_status는 default 'pending'
  select yeseong_replace_masonry_volumes(v_slot_id, p_items) into v_count;

  return v_count;
end $$;

grant execute on function yeseong_mobile_replace_volumes_me(text, jsonb) to authenticated;

-- ============================================================
-- [3단계] admin_get_payroll — volumes는 승인(approved)된 것만 급여 반영
-- ============================================================
create or replace function yeseong_admin_get_payroll(p_period_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'period', to_jsonb(p),
    'worksite', to_jsonb(ws),
    'slots', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'slot_number', s.slot_number,
        'daily_wage', s.daily_wage,
        'trade', s.trade,
        'subcontractor_name', sc.name,
        'worker', jsonb_build_object(
          'id', w.id,
          'name', w.name,
          'rrn_plain', w.rrn_plain,
          'address', w.address,
          'bank_name', w.bank_name,
          'account_number', w.account_number,
          'account_holder', w.account_holder,
          'phone', w.phone,
          'default_trade', w.default_trade,
          'default_wage', w.default_wage,
          'wage_type', w.wage_type
        ),
        'attendance', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'work_date', a.work_date,
            'hours', a.hours
          )), '[]'::jsonb)
          from yeseong_attendance a
          where a.payroll_worker_id = s.id
            and a.approval_status = 'approved'
        ),
        'volumes', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'category', v.category,
            'type_name', v.type_name,
            'size_spec', v.size_spec,
            'quantity', v.quantity,
            'unit_price', v.unit_price,
            'amount', v.amount
          )), '[]'::jsonb)
          from yeseong_masonry_volumes v
          where v.payroll_worker_id = s.id
            and v.approval_status = 'approved'
        )
      ) order by s.slot_number), '[]'::jsonb)
      from yeseong_payroll_workers s
      join yeseong_workers w on w.id = s.worker_id
      left join yeseong_subcontractors sc on sc.id = s.subcontractor_id
      where s.period_id = p.id
    )
  ) into result
  from yeseong_payroll_periods p
  join yeseong_worksites ws on ws.id = p.worksite_id
  where p.id = p_period_id;
  return result;
end $$;

-- ============================================================
-- [3단계] 관리자 성과 검토 RPC (출역 검토와 동일 패턴)
-- ============================================================
create or replace function yeseong_admin_list_volumes_review(
  p_year_month text default null,
  p_status text default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'category', v.category,
    'type_name', v.type_name,
    'size_spec', v.size_spec,
    'quantity', v.quantity,
    'unit', v.unit,
    'unit_price', v.unit_price,
    'amount', v.amount,
    'approval_status', v.approval_status,
    'rejection_reason', v.rejection_reason,
    'approved_at', v.approved_at,
    'created_at', v.created_at,
    'year_month', pp.year_month,
    'worker_id', w.id,
    'worker_name', w.name,
    'worker_phone', w.phone,
    'worksite_id', ws.id,
    'worksite_name', ws.name,
    'subcontractor_name', sc.name
  ) order by pp.year_month desc, w.name, v.created_at desc), '[]'::jsonb)
  into result
  from yeseong_masonry_volumes v
  join yeseong_payroll_workers pw on pw.id = v.payroll_worker_id
  join yeseong_payroll_periods pp on pp.id = pw.period_id
  join yeseong_workers w on w.id = pw.worker_id
  join yeseong_worksites ws on ws.id = pp.worksite_id
  left join yeseong_subcontractors sc on sc.id = pw.subcontractor_id
  where (p_year_month is null or pp.year_month = p_year_month)
    and (p_status is null or v.approval_status = p_status);

  return result;
end $$;

grant execute on function yeseong_admin_list_volumes_review(text, text) to authenticated;

create or replace function yeseong_admin_bulk_approve_volumes(
  p_ids uuid[],
  p_approve boolean,
  p_reason text default null
)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  if p_approve then
    update yeseong_masonry_volumes
       set approval_status = 'approved',
           approved_at = now(),
           approved_by = v_user_id,
           rejection_reason = null
     where id = any(p_ids);
  else
    update yeseong_masonry_volumes
       set approval_status = 'rejected',
           approved_at = now(),
           approved_by = v_user_id,
           rejection_reason = p_reason
     where id = any(p_ids);
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

grant execute on function yeseong_admin_bulk_approve_volumes(uuid[], boolean, text) to authenticated;
