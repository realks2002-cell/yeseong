-- 급여 공제 연동: 엑셀 노임대장 정산 결과(소득세·주민세·고용·연금·건강·장기요양)를
-- payroll_workers(슬롯=작업자×월)에 저장하고, 모바일 급여 RPC가 반환하도록 한다.
-- 숫자는 엑셀이 계산한 값을 업로드 파싱해 채운다(서버 재계산 없음).

-- 1) 슬롯별 공제 컬럼
alter table yeseong_payroll_workers
  add column if not exists income_tax integer,
  add column if not exists resident_tax integer,
  add column if not exists employment_ins integer,
  add column if not exists pension integer,
  add column if not exists health_ins integer,
  add column if not exists longterm_care integer,
  add column if not exists deductions_updated_at timestamptz;

-- 1-1) 일반 노임대장 4대보험 제외 구분 (엑셀 C열 수동선택 대체). 기본=적용.
alter table yeseong_workers
  add column if not exists exempt_employment_ins boolean not null default false,
  add column if not exists exempt_pension boolean not null default false;

-- 2) 모바일 급여 RPC — deductions 추가 (year_month별 슬롯 합산, 정산 전이면 null)
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
  v_worker_id := yeseong_resolve_worker_id(auth.uid());
  if v_worker_id is null then
    raise exception 'worker not found';
  end if;

  select w.wage_type, w.default_wage
    into v_wage_type, v_default_wage
    from yeseong_workers w
   where w.id = v_worker_id;

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
          when v_wage_type = '월급/일급'
            then (
              select floor(sum(v.amount))
                from yeseong_masonry_volumes v
                join yeseong_payroll_workers pw2 on pw2.id = v.payroll_worker_id
                join yeseong_payroll_periods p2 on p2.id = pw2.period_id
               where pw2.worker_id = v_worker_id
                 and p2.year_month = p.year_month
                 and v.approval_status <> 'rejected'
            )
          else null
        end,
        'volumes_pending', case
          when v_wage_type = '월급/일급' then exists (
            select 1
              from yeseong_masonry_volumes v
              join yeseong_payroll_workers pw2 on pw2.id = v.payroll_worker_id
              join yeseong_payroll_periods p2 on p2.id = pw2.period_id
             where pw2.worker_id = v_worker_id
               and p2.year_month = p.year_month
               and v.approval_status = 'pending'
          )
          else false
        end,
        'deductions', (
          select case when bool_or(pwd.deductions_updated_at is not null) then
            jsonb_build_object(
              'income_tax',     coalesce(sum(pwd.income_tax), 0),
              'resident_tax',   coalesce(sum(pwd.resident_tax), 0),
              'employment_ins', coalesce(sum(pwd.employment_ins), 0),
              'pension',        coalesce(sum(pwd.pension), 0),
              'health_ins',     coalesce(sum(pwd.health_ins), 0),
              'longterm_care',  coalesce(sum(pwd.longterm_care), 0)
            )
          else null end
            from yeseong_payroll_workers pwd
            join yeseong_payroll_periods p3 on p3.id = pwd.period_id
           where pwd.worker_id = v_worker_id
             and p3.year_month = p.year_month
        ),
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
