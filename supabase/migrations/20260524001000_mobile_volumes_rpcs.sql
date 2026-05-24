-- 모바일 앱(작업자·팀장)에서 본인 매사 성과를 직접 입력하는 RPC 2개
--   - get: 현재 시점에 적절한 target_month + 폼 분기 정보 + 기존 입력 + 단가 옵션
--   - replace: 본인 성과 전체 교체 (월 1회 입력 정책, DELETE+INSERT 트랜잭션)
--
-- 적격성 form_type 분기:
--   not_eligible    — wage_type <> '월급/일급'
--   trade_unknown   — default_trade ∉ {조적·조적공·미장공·바닥미장}
--   no_worker_link  — auth.uid()로 workers row 매칭 실패
--   조적            — default_trade ∈ {조적, 조적공}
--   미장            — default_trade ∈ {미장공, 바닥미장}
--
-- 입력 기간 (KST 기준):
--   p_year_month='YYYY-MM' 데이터는 [그 달 말일 ~ 다음달 10일]에만 저장 가능
--   get: 오늘이 어떤 월의 입력 윈도우에 들어가는지 자동 계산

-- ============================================================
-- helper: 오늘(KST) 기준 입력 가능한 target_year_month 계산
--   오늘이 5/15 → 4월 윈도우(4/30~5/10) 지남, 5월 윈도우(5/31~) 안 옴 → NULL
--   오늘이 5/31~6/10 → '2026-05'
--   오늘이 6/11~6/29 → NULL (5월 윈도우 지남, 6월 윈도우 안 옴)
--   오늘이 6/30~7/10 → '2026-06'
-- ============================================================
create or replace function yeseong_current_input_target() returns text
language plpgsql immutable
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_this_last date := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
  v_prev_last date := (date_trunc('month', v_today) - interval '1 day')::date;
begin
  -- 오늘이 이번 달 말일 이상이면 → 이번 달
  if v_today >= v_this_last then
    return to_char(v_today, 'YYYY-MM');
  end if;
  -- 오늘이 1일~10일이면 → 지난달
  if extract(day from v_today) <= 10 then
    return to_char(v_prev_last, 'YYYY-MM');
  end if;
  -- 그 외: 입력 윈도우 외
  return null;
end $$;

-- ============================================================
-- yeseong_mobile_get_volumes_me
-- ============================================================
create or replace function yeseong_mobile_get_volumes_me(p_year_month text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
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

  -- 1) worker resolve (auth.uid → workers)
  select id, name, wage_type, default_trade, default_worksite_id, is_active
    into v_worker
    from yeseong_workers
   where auth_user_id = v_user_id;

  if v_worker.id is null then
    return jsonb_build_object('form_type', 'no_worker_link');
  end if;
  if v_worker.is_active = false then
    return jsonb_build_object('form_type', 'no_worker_link', 'archived', true);
  end if;

  -- 2) form_type 결정
  if v_worker.wage_type is distinct from '월급/일급' then
    v_form_type := 'not_eligible';
  elsif v_worker.default_trade in ('조적', '조적공') then
    v_form_type := '조적';
    v_filter_category := '조적';
  elsif v_worker.default_trade in ('미장공', '바닥미장') then
    v_form_type := '미장';
    v_filter_category := '미장';
  else
    v_form_type := 'trade_unknown';
  end if;

  -- 3) target_year_month: 인자 우선, 없으면 자동 계산
  v_target := coalesce(p_year_month, yeseong_current_input_target());

  if v_target is not null and v_target ~ '^\d{4}-\d{2}$' then
    v_target_last := (to_date(v_target || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
    v_input_start := v_target_last;
    v_input_end := v_target_last + interval '10 days';
    v_is_open := v_today >= v_input_start and v_today <= v_input_end;
  end if;

  -- 4) 기존 입력 조회 (target_month, worker의 slot)
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
        'note', v.note
      )), '[]'::jsonb) into v_existing
        from yeseong_masonry_volumes v
       where v.payroll_worker_id = v_slot_id;
    end if;
  end if;

  -- 5) 단가 옵션 (form 적격일 때만)
  if v_filter_category is not null and v_worker.default_worksite_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', mp.id,
      'category', mp.category,
      'type_name', mp.type_name,
      'size_spec', mp.size_spec,
      'unit', mp.unit,
      'unit_price', mp.unit_price
    ) order by mp.type_name, mp.size_spec), '[]'::jsonb) into v_prices
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
-- yeseong_mobile_replace_volumes_me
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
  v_worker record;
  v_form_type text;
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

  -- worker resolve
  select id, name, wage_type, default_trade, default_worksite_id, default_wage,
         default_subcontractor_id, is_active
    into v_worker
    from yeseong_workers
   where auth_user_id = v_user_id;
  if v_worker.id is null then
    raise exception 'worker not linked';
  end if;
  if v_worker.is_active = false then
    raise exception 'worker archived';
  end if;

  -- form_type 검증
  if v_worker.wage_type is distinct from '월급/일급' then
    raise exception '월급/일급 작업자만 입력 가능합니다';
  end if;
  if v_worker.default_trade in ('조적', '조적공') then
    v_category := '조적';
  elsif v_worker.default_trade in ('미장공', '바닥미장') then
    v_category := '미장';
  else
    raise exception '직종이 조적·미장이 아닙니다. 관리자에게 문의하세요';
  end if;

  if v_worker.default_worksite_id is null then
    raise exception '기본 현장이 설정되지 않았습니다';
  end if;

  -- 입력 기간 검증 (KST)
  v_target_last := (to_date(p_year_month || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
  v_input_start := v_target_last;
  v_input_end := v_target_last + interval '10 days';
  if v_today < v_input_start or v_today > v_input_end then
    raise exception '입력 가능 기간이 아닙니다 (% ~ %)', v_input_start, v_input_end;
  end if;

  -- 모든 item의 단가가 worker의 default_worksite + category와 일치하는지 검증
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

  -- period upsert
  insert into yeseong_payroll_periods (worksite_id, year_month, period_start, period_end)
  values (
    v_worker.default_worksite_id,
    p_year_month,
    (to_date(p_year_month || '-01', 'YYYY-MM-DD'))::date,
    v_target_last
  )
  on conflict (worksite_id, year_month) do update set updated_at = now()
  returning id into v_period_id;

  -- slot upsert
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

  -- 기존 replace RPC 재사용 — 단일 트랜잭션
  select yeseong_replace_masonry_volumes(v_slot_id, p_items) into v_count;

  return v_count;
end $$;

grant execute on function yeseong_mobile_replace_volumes_me(text, jsonb) to authenticated;
