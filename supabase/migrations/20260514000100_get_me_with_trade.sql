-- yeseong_mobile_get_me RPC에 default_trade(공종) 추가
-- 작업자 앱 home 화면에서 "이름 (공종)" 표시 위해

create or replace function yeseong_mobile_get_me()
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

  select jsonb_build_object(
    'worker', jsonb_build_object(
      'id', w.id,
      'name', w.name,
      'phone', w.phone,
      'default_trade', w.default_trade,
      'default_worksite_id', w.default_worksite_id,
      'default_subcontractor_id', w.default_subcontractor_id
    ),
    'worksite', case when ws.id is not null then jsonb_build_object('id', ws.id, 'name', ws.name) end,
    'subcontractor', case when sc.id is not null then jsonb_build_object('id', sc.id, 'name', sc.name) end,
    'recent', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'work_date', a.work_date,
        'hours', a.hours
      ) order by a.work_date desc), '[]'::jsonb)
      from yeseong_attendance a
      join yeseong_payroll_workers pw on pw.id = a.payroll_worker_id
      where pw.worker_id = w.id
        and a.work_date >= current_date - interval '7 days'
    )
  ) into result
  from yeseong_workers w
  left join yeseong_worksites ws on ws.id = w.default_worksite_id
  left join yeseong_subcontractors sc on sc.id = w.default_subcontractor_id
  where w.auth_user_id = v_user_id;

  return result;
end $$;
