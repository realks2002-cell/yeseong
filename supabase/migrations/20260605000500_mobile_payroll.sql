-- 작업자앱 급여(정산) 조회 RPC
-- 최근 6개월의 월별 출역·공수·예상 금액을 반환한다.
--   금액 기준:
--   - 일급 / null: 승인 공수 × 그 달 일당(payroll_workers.daily_wage)
--   - 월급: default_wage (월 고정)
--   - 월급/일급: null (성과 기준 정산 — 관리자 확인 필요)

create or replace function yeseong_mobile_get_payroll()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
  v_wage_type text;
  v_default_wage integer;
  v_result jsonb;
begin
  select w.id, w.wage_type, w.default_wage
    into v_worker_id, v_wage_type, v_default_wage
    from yeseong_workers w
   where w.auth_user_id = auth.uid();

  if v_worker_id is null then
    raise exception 'worker not found';
  end if;

  select coalesce(jsonb_agg(m order by m->>'year_month' desc), '[]'::jsonb)
    into v_result
    from (
      select jsonb_build_object(
        'year_month', p.year_month,
        'wage_type', v_wage_type,
        'approved_hours', coalesce(sum(a.hours) filter (where a.approval_status = 'approved'), 0),
        'pending_hours', coalesce(sum(a.hours) filter (where a.approval_status = 'pending'), 0),
        'total_amount', case
          when v_wage_type is null or v_wage_type = '일급'
            then floor(coalesce(sum(a.hours * pw.daily_wage) filter (where a.approval_status = 'approved'), 0))
          when v_wage_type = '월급'
            then v_default_wage
          else null
        end,
        'entries', coalesce(
          jsonb_agg(
            jsonb_build_object(
              'work_date', a.work_date,
              'hours', a.hours,
              'status', a.approval_status,
              'worksite_name', ws.name,
              'daily_wage', pw.daily_wage
            ) order by a.work_date desc
          ) filter (where a.id is not null),
          '[]'::jsonb
        )
      ) as m
      from yeseong_payroll_workers pw
      join yeseong_payroll_periods p on p.id = pw.period_id
      left join yeseong_attendance a on a.payroll_worker_id = pw.id
      left join yeseong_worksites ws on ws.id = coalesce(a.worksite_id, p.worksite_id)
      where pw.worker_id = v_worker_id
        and p.year_month >= to_char((now() at time zone 'Asia/Seoul') - interval '5 months', 'YYYY-MM')
      group by p.year_month
    ) sub;

  return v_result;
end;
$$;

grant execute on function yeseong_mobile_get_payroll() to authenticated;
