-- 관리자 웹 — 소장출역 검토 페이지
--   1) yeseong_admin_list_attendance_review: 출역 + 작업자 + 현장 + 승인 소장 정보 join
--   2) yeseong_admin_bulk_approve_attendance: 일괄/단일 승인·미승인 (관리자 권한)

-- ============================================================
-- 1) 출역 검토 목록 조회 (최근 N일, 상태 필터 옵션)
-- ============================================================
create or replace function yeseong_admin_list_attendance_review(
  p_days integer default 30,
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
    'id', a.id,
    'work_date', a.work_date,
    'hours', a.hours,
    'source', a.source,
    'approval_status', a.approval_status,
    'rejection_reason', a.rejection_reason,
    'approved_at', a.approved_at,
    'created_at', a.created_at,
    'worker_id', w.id,
    'worker_name', w.name,
    'worker_phone', w.phone,
    'worksite_id', ws.id,
    'worksite_name', ws.name,
    'subcontractor_name', sc.name,
    'approver_name', sm.name
  ) order by a.work_date desc, a.created_at desc), '[]'::jsonb)
  into result
  from yeseong_attendance a
  join yeseong_payroll_workers pw on pw.id = a.payroll_worker_id
  join yeseong_workers w on w.id = pw.worker_id
  join yeseong_worksites ws on ws.id = a.worksite_id
  left join yeseong_subcontractors sc on sc.id = pw.subcontractor_id
  left join yeseong_site_managers sm on sm.auth_user_id = a.approved_by
  where a.work_date >= current_date - (p_days || ' days')::interval
    and (p_status is null or a.approval_status = p_status);

  return result;
end $$;

grant execute on function yeseong_admin_list_attendance_review(integer, text) to authenticated;


-- ============================================================
-- 2) 일괄/단일 승인·미승인 (관리자가 직접 처리)
--    p_approve=true: approved / false: rejected
--    p_reason: rejected일 때만 의미
-- ============================================================
create or replace function yeseong_admin_bulk_approve_attendance(
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
    update yeseong_attendance
       set approval_status = 'approved',
           approved_at = now(),
           approved_by = v_user_id,
           rejection_reason = null
     where id = any(p_ids);
  else
    update yeseong_attendance
       set approval_status = 'rejected',
           approved_at = now(),
           approved_by = v_user_id,
           rejection_reason = p_reason
     where id = any(p_ids);
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

grant execute on function yeseong_admin_bulk_approve_attendance(uuid[], boolean, text) to authenticated;
