-- 팀장(매니저)이 매사 성과 입력 시 'no_worker_link' 나는 버그 수정
-- 근본 원인:
--   yeseong_mobile_get_volumes_me / _replace_ 는 worker 를 auth_user_id = auth.uid() 로만 찾는다.
--   그러나 팀장 세션의 uid 는 yeseong_site_managers.auth_user_id 에 있고(phoneToManagerEmail),
--   worker 행은 전화번호로만 연결된다(불변규칙: 팀장도 작업자). worker.auth_user_id 는
--   작업자앱 가입 identity(phoneToEmail) 전용이라 팀장의 manager uid 는 절대 들어가지 않는다.
--   → 팀장 세션은 자기 worker 행을 못 찾아 no_worker_link.
--
-- 수정: worker.auth_user_id 를 덮어쓰지 않고(작업자앱 가입 매칭이 깨지므로), resolve 단계에
--       manager→phone→worker 폴백을 추가한다. 헬퍼 yeseong_resolve_worker_id() 로 공통화.

-- ============================================================
-- helper: 현재 auth.uid() 에 해당하는 worker id 해석
--   1) 작업자앱 identity: yeseong_workers.auth_user_id = uid
--   2) 팀장앱 identity:   yeseong_site_managers.auth_user_id = uid → 같은 phone 의 worker
-- ============================================================
create or replace function yeseong_resolve_worker_id(p_uid uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_uid is null then
    return null;
  end if;

  select id into v_id from yeseong_workers where auth_user_id = p_uid limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- 팀장 세션: manager 의 phone 으로 worker 매칭 (팀장도 작업자)
  select w.id into v_id
    from yeseong_workers w
    join yeseong_site_managers m on m.phone = w.phone
   where m.auth_user_id = p_uid
     and m.phone is not null
   limit 1;

  return v_id;
end $$;

grant execute on function yeseong_resolve_worker_id(uuid) to authenticated;

-- ============================================================
-- yeseong_mobile_get_volumes_me — resolve 폴백 적용
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

  -- 1) worker resolve (작업자앱 또는 팀장앱 모두 지원)
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
-- yeseong_mobile_replace_volumes_me — resolve 폴백 적용
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

  -- worker resolve (작업자앱 또는 팀장앱 모두 지원)
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
