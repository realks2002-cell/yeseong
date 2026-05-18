-- 팀장 앱 — 모두 승인 RPC
-- 본인 담당 현장의 pending 출역을 한 번의 UPDATE로 일괄 approved 처리
-- 리턴: 처리된 건수

create or replace function yeseong_manager_approve_all_pending()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manager_id uuid;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select id into v_manager_id from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_manager_id is null then
    raise exception 'manager not linked';
  end if;

  update yeseong_attendance
     set approval_status = 'approved',
         approved_at = now(),
         approved_by = v_user_id,
         rejection_reason = null
   where approval_status = 'pending'
     and worksite_id in (
       select worksite_id from yeseong_site_manager_assignments
        where site_manager_id = v_manager_id
     );

  get diagnostics v_count = row_count;
  return v_count;
end $$;

grant execute on function yeseong_manager_approve_all_pending() to authenticated;
