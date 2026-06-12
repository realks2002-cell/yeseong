-- yeseong_mobile_get_me — recent 출역 범위를 7일 → 이번 달 전체(+앞 7일)로 확장
--   홈 화면이 월 캘린더로 바뀌어 이번 달 전체 출역이 필요.
--   + worker 연결을 auth_user_id 직접 조회 → yeseong_resolve_worker_id 로 통일
--     (팀장 세션도 phone 매칭으로 본인 worker 행 인식 — 팀장=작업자 규칙)

create or replace function yeseong_mobile_get_me()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_worker_id uuid;
  v_ctx record;
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  v_worker_id := yeseong_resolve_worker_id(v_user_id);
  if v_worker_id is null then
    return null;
  end if;

  select * into v_ctx from yeseong_worker_team_context(v_worker_id);

  select jsonb_build_object(
    'worker', jsonb_build_object(
      'id', w.id,
      'name', w.name,
      'phone', w.phone,
      'default_trade', w.default_trade,
      'skill_grade', w.skill_grade,
      'default_worksite_id', w.default_worksite_id,
      'default_subcontractor_id', w.default_subcontractor_id,
      'bank_name', w.bank_name,
      'account_number', w.account_number,
      'account_holder', w.account_holder,
      'address', w.address
    ),
    'worksite', case when v_ctx.worksite_id is not null
      then jsonb_build_object('id', v_ctx.worksite_id, 'name', v_ctx.worksite_name) end,
    'subcontractor', case when v_ctx.subcontractor_id is not null
      then jsonb_build_object('id', v_ctx.subcontractor_id, 'name', v_ctx.subcontractor_name) end,
    'team_leader', case when v_ctx.team_leader_id is not null
      then jsonb_build_object('id', v_ctx.team_leader_id, 'name', v_ctx.team_leader_name) end,
    'recent', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'work_date', a.work_date,
        'hours', a.hours,
        'approval_status', a.approval_status,
        'rejection_reason', a.rejection_reason
      ) order by a.work_date desc), '[]'::jsonb)
      from yeseong_attendance a
      join yeseong_payroll_workers pw on pw.id = a.payroll_worker_id
      where pw.worker_id = w.id
        and a.work_date >= (date_trunc('month', (now() at time zone 'Asia/Seoul')::date) - interval '7 days')::date
    )
  ) into result
  from yeseong_workers w
  where w.id = v_worker_id;

  return result;
end $$;

grant execute on function yeseong_mobile_get_me() to authenticated;
