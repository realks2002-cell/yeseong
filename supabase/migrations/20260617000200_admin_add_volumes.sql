-- 관리자: 매사 성과 신규 추가 입력 (리뷰 화면)
--   아직 그 달 성과가 없는 작업자에게 관리자가 직접 성과를 입력 → 즉시 승인(approved).
--   슬롯(payroll_worker)이 없으면 생성. 기존 성과가 있으면 실수 덮어쓰기 방지 위해 거부(수정 기능 사용).
--   (base: 20260614000100_volumes_two_stage_approval / 20260617000100_admin_edit_volumes)

create or replace function yeseong_admin_add_volumes(
  p_worker_id uuid,
  p_year_month text,
  p_worksite_id uuid,
  p_items jsonb
) returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_worker record;
  v_target_last date;
  v_sub uuid;
  v_period_id uuid;
  v_slot_id uuid;
  v_next_slot smallint;
  v_count int;
  v_item jsonb;
  v_price_id uuid;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  if p_year_month !~ '^\d{4}-\d{2}$' then raise exception 'invalid year_month'; end if;
  if p_worksite_id is null then raise exception '현장이 지정되지 않았습니다'; end if;
  if p_worker_id is null then raise exception '작업자가 지정되지 않았습니다'; end if;

  select id, default_wage, default_trade, is_active
    into v_worker
    from yeseong_workers where id = p_worker_id;
  if v_worker.id is null then raise exception '작업자를 찾을 수 없습니다'; end if;
  if v_worker.is_active = false then raise exception 'worker archived'; end if;

  -- 단가는 이 현장 + 활성만 허용
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_price_id := (v_item->>'masonry_price_id')::uuid;
    if v_price_id is null then continue; end if;
    perform 1 from yeseong_masonry_prices
     where id = v_price_id and worksite_id = p_worksite_id and is_active = true;
    if not found then
      raise exception '유효하지 않은 단가입니다 (현장 불일치)';
    end if;
  end loop;

  -- 전문건설사 = 현장 1:1
  select subcontractor_id into v_sub from yeseong_worksites where id = p_worksite_id;

  v_target_last := (to_date(p_year_month || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;

  insert into yeseong_payroll_periods (worksite_id, year_month, period_start, period_end)
  values (
    p_worksite_id, p_year_month,
    (to_date(p_year_month || '-01', 'YYYY-MM-DD'))::date,
    v_target_last
  )
  on conflict (worksite_id, year_month) do update set updated_at = now()
  returning id into v_period_id;

  select id into v_slot_id from yeseong_payroll_workers
   where period_id = v_period_id and worker_id = p_worker_id;

  if v_slot_id is null then
    select coalesce(max(slot_number), 0) + 1 into v_next_slot
      from yeseong_payroll_workers where period_id = v_period_id;
    if v_next_slot > 32 then raise exception '슬롯이 가득 찼습니다 (32 max)'; end if;
    insert into yeseong_payroll_workers
      (period_id, worker_id, slot_number, daily_wage, trade, subcontractor_id)
    values
      (v_period_id, p_worker_id, v_next_slot, v_worker.default_wage, v_worker.default_trade, v_sub)
    returning id into v_slot_id;
  end if;

  -- 실수 덮어쓰기 방지: 이미 그 달 성과가 있으면 거부 (수정 기능으로 처리)
  perform 1 from yeseong_masonry_volumes where payroll_worker_id = v_slot_id limit 1;
  if found then
    raise exception '이미 등록된 성과가 있습니다. 목록에서 수정하세요';
  end if;

  select yeseong_replace_masonry_volumes(v_slot_id, p_items) into v_count;

  -- 관리자 직접 추가분 = 즉시 승인 (노임대장 즉시 반영)
  update yeseong_masonry_volumes
     set approval_status = 'approved',
         approved_at = now(),
         approved_by = v_uid,
         rejection_reason = null
   where payroll_worker_id = v_slot_id;

  return v_count;
end $$;

grant execute on function yeseong_admin_add_volumes(uuid, text, uuid, jsonb) to authenticated;
