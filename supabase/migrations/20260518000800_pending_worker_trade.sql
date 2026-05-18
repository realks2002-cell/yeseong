-- 팀장앱 pending 목록에 작업자 공종(default_trade) 추가
create or replace function yeseong_manager_list_pending_attendance()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manager_id uuid;
  v_manager_phone text;
  v_leader_worker_id uuid;
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select id, phone into v_manager_id, v_manager_phone
    from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_manager_id is null then
    raise exception 'manager not linked';
  end if;

  select id into v_leader_worker_id
    from yeseong_workers
   where phone = v_manager_phone and is_active = true
   limit 1;

  if v_leader_worker_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'attendance_id', a.id,
    'work_date', a.work_date,
    'hours', a.hours,
    'source', a.source,
    'worker_name', w.name,
    'worker_phone', w.phone,
    'worker_trade', w.default_trade,
    'worksite_id', ws.id,
    'worksite_name', ws.name,
    'subcontractor_name', sc.name,
    'created_at', a.created_at
  ) order by a.work_date desc, a.created_at desc), '[]'::jsonb)
  into result
  from yeseong_attendance a
  join yeseong_payroll_workers pw on pw.id = a.payroll_worker_id
  join yeseong_workers w on w.id = pw.worker_id
  join yeseong_worksites ws on ws.id = a.worksite_id
  left join yeseong_subcontractors sc on sc.id = a.subcontractor_id
  where a.approval_status = 'pending'
    and w.team_leader_id = v_leader_worker_id;

  return result;
end $$;
