-- 관리자: 제출된 매사 성과 직접 수정
--   리뷰 화면(monitoring/volumes-review)에서 슬롯(작업자×현장×월) 단위로 항목 전체 교체.
--   핵심: 편집 전 결재 상태를 보존 → 승인된 성과를 수정해도 승인 상태 유지(급여 안정),
--         검토 대기는 검토 대기 유지(관리자가 수정 후 그대로 승인 가능).
--   (base: 20260614000100_volumes_two_stage_approval)

-- ============================================================
-- 1) 리뷰 목록에 payroll_worker_id 추가 (편집 시 슬롯 식별용)
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
    'payroll_worker_id', v.payroll_worker_id,
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
  where v.approval_status in ('pending_admin','approved','rejected_admin')
    and (p_year_month is null or pp.year_month = p_year_month)
    and (p_status is null or v.approval_status = p_status);

  return result;
end $$;

grant execute on function yeseong_admin_list_volumes_review(text, text) to authenticated;

-- ============================================================
-- 2) 관리자 성과 전체 교체 — 편집 전 결재 상태 보존
-- ============================================================
create or replace function yeseong_admin_replace_volumes(
  p_payroll_worker_id uuid,
  p_items jsonb
) returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_approved_by uuid;
  v_approved_at timestamptz;
  v_count int;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  if p_payroll_worker_id is null then raise exception 'payroll_worker_id required'; end if;

  -- 편집 전 슬롯의 결재 상태 보존 (가장 진행된 상태 우선 — 일반적으로 슬롯 내 동일)
  select approval_status, approved_by, approved_at
    into v_status, v_approved_by, v_approved_at
    from yeseong_masonry_volumes
   where payroll_worker_id = p_payroll_worker_id
   order by case approval_status
     when 'approved' then 1
     when 'pending_admin' then 2
     when 'rejected_admin' then 3
     when 'pending_leader' then 4
     when 'rejected_leader' then 5
     else 6 end
   limit 1;

  if v_status is null then v_status := 'pending_admin'; end if;

  -- 전체 교체 (단가 검증 포함, 단일 트랜잭션). 새 행은 default 'pending_admin' 로 생성됨.
  select yeseong_replace_masonry_volumes(p_payroll_worker_id, p_items) into v_count;

  -- 교체로 새로 생성된 행에 기존 결재 상태 복원
  update yeseong_masonry_volumes
     set approval_status = v_status,
         approved_at = case when v_status = 'approved' then coalesce(v_approved_at, now()) else null end,
         approved_by = case when v_status = 'approved' then coalesce(v_approved_by, v_uid) else null end
   where payroll_worker_id = p_payroll_worker_id;

  return v_count;
end $$;

grant execute on function yeseong_admin_replace_volumes(uuid, jsonb) to authenticated;
