-- 급여 내역 — 세션 연결 복구 + 급여형태별 금액 정책
--   1) 끊긴 작업자 auth 링크 백필 (<phone>@yeseong.mobile → worker 행)
--   2) yeseong_resolve_worker_id 에 작업자 auth 전화번호 폴백 추가
--      (재시드 등으로 auth_user_id 링크가 소실돼도 전화번호로 복구)
--   3) yeseong_mobile_get_payroll — resolve 사용 + 매사(월급/일급)는 성과 총액 표시

-- ============================================================
-- 1) 백필: 작업자 가입 auth 와 worker 행 재연결
-- ============================================================
update yeseong_workers w
   set auth_user_id = u.id
  from auth.users u
 where w.auth_user_id is null
   and w.phone is not null
   and u.email = w.phone || '@yeseong.mobile';

-- ============================================================
-- 2) resolve_worker_id — 작업자 auth 전화번호 폴백
-- ============================================================
create or replace function yeseong_resolve_worker_id(p_uid uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text;
  v_phone text;
begin
  if p_uid is null then
    return null;
  end if;

  select id into v_id from yeseong_workers where auth_user_id = p_uid limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- 팀장 세션: manager 의 phone 으로 worker 매칭 (팀장도 작업자)
  select w.id into v_id
    from yeseong_workers w
    join yeseong_site_managers m on m.phone = w.phone
   where m.auth_user_id = p_uid
     and m.phone is not null
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- 작업자 세션 폴백: auth 이메일(<phone>@yeseong.mobile)의 전화번호로 매칭
  select email into v_email from auth.users where id = p_uid;
  if v_email like '%@yeseong.mobile' then
    v_phone := split_part(v_email, '@', 1);
    select id into v_id
      from yeseong_workers
     where phone = v_phone and is_active = true
     limit 1;
  end if;

  return v_id;
end $$;

-- ============================================================
-- 3) 급여 조회 — resolve 통일 + 매사 성과 총액
--    - 일급/미설정: 승인 공수 × 일당 (현행)
--    - 월급: default_wage 월 고정 (현행)
--    - 월급/일급(매사): 그 달 성과 총액(반려 제외). 미입력이면 null
--      + volumes_pending: 검토 중 성과 포함 여부
-- ============================================================
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
