-- delete + insert를 단일 트랜잭션으로 묶는 RPC 2개
--   기존: DELETE 성공 후 INSERT 실패하면 데이터 영구 손실
--   변경: 함수 내부에서 트랜잭션으로 묶임 (예외 시 자동 롤백)

-- 1) 작업자 슬롯의 월별 성과(masonry_volumes) 전체 교체
--    p_items: [{ masonry_price_id uuid, quantity numeric, note text }]
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
  -- 1. 기존 삭제
  delete from yeseong_masonry_volumes where payroll_worker_id = p_payroll_worker_id;

  -- 2. 신규 INSERT
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_quantity := (v_item->>'quantity')::numeric;
    if v_quantity is null or v_quantity <= 0 then
      continue;  -- 0 또는 NULL은 저장 안 함
    end if;

    select id, category, type_name, size_spec, unit_price, is_active
      into v_price
      from yeseong_masonry_prices
     where id = (v_item->>'masonry_price_id')::uuid;

    if v_price.id is null or not v_price.is_active then
      raise exception '유효하지 않은 단가: %', v_item->>'masonry_price_id';
    end if;

    v_note := nullif(trim(coalesce(v_item->>'note', '')), '');

    insert into yeseong_masonry_volumes
      (payroll_worker_id, category, type_name, size_spec, quantity, unit_price, note)
    values
      (p_payroll_worker_id, v_price.category, v_price.type_name, v_price.size_spec,
       v_quantity, v_price.unit_price, v_note);
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

grant execute on function yeseong_replace_masonry_volumes(uuid, jsonb) to authenticated;

-- 2) 현장-협력사 매핑 전체 교체
create or replace function yeseong_replace_worksite_subcontractors(
  p_worksite_id uuid,
  p_subcontractor_ids uuid[]
) returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_sid uuid;
begin
  delete from yeseong_worksite_subcontractors where worksite_id = p_worksite_id;

  if p_subcontractor_ids is not null then
    foreach v_sid in array p_subcontractor_ids loop
      insert into yeseong_worksite_subcontractors (worksite_id, subcontractor_id)
      values (p_worksite_id, v_sid);
      v_count := v_count + 1;
    end loop;
  end if;

  return v_count;
end $$;

grant execute on function yeseong_replace_worksite_subcontractors(uuid, uuid[]) to authenticated;
