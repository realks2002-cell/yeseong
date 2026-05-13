-- 모바일 작업자용 RPC (SECURITY DEFINER, RLS 우회)
-- 본인 worker만 조작 가능하도록 auth.uid() 검증 필수

-- ============================================================
-- yeseong_mobile_signup_or_link
--   가입 시: phone 매칭되는 worker 있으면 auth_user_id 연결
--           없으면 신규 worker INSERT
--   리턴: worker.id (호출자가 default_subcontractor_id/worksite_id 후속 PATCH)
-- ============================================================
create or replace function yeseong_mobile_signup_or_link(
  p_phone text,
  p_name text
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_worker_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;
  if p_phone is null or length(p_phone) < 10 then
    raise exception 'invalid phone';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid name';
  end if;

  -- 이미 연결된 worker 있으면 그대로 리턴
  select id into v_worker_id from yeseong_workers
   where auth_user_id = v_user_id;
  if v_worker_id is not null then
    return v_worker_id;
  end if;

  -- phone 매칭 시도
  select id into v_worker_id from yeseong_workers
   where phone = p_phone and auth_user_id is null;

  if v_worker_id is not null then
    -- 기존 worker에 auth 연결
    update yeseong_workers
       set auth_user_id = v_user_id,
           name = coalesce(nullif(name, ''), p_name)
     where id = v_worker_id;
  else
    -- 신규 worker INSERT (RRN 없이 — 관리자가 사후 보완)
    insert into yeseong_workers (name, phone, default_wage, auth_user_id)
    values (p_name, p_phone, 0, v_user_id)
    returning id into v_worker_id;
  end if;

  return v_worker_id;
end $$;

grant execute on function yeseong_mobile_signup_or_link(text, text) to authenticated;

-- ============================================================
-- yeseong_mobile_set_defaults
--   본인 worker의 default_worksite_id, default_subcontractor_id 갱신
-- ============================================================
create or replace function yeseong_mobile_set_defaults(
  p_worksite_id uuid,
  p_subcontractor_id uuid
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  update yeseong_workers
     set default_worksite_id = p_worksite_id,
         default_subcontractor_id = p_subcontractor_id
   where auth_user_id = v_user_id;

  if not found then
    raise exception 'worker not linked to auth user';
  end if;
end $$;

grant execute on function yeseong_mobile_set_defaults(uuid, uuid) to authenticated;

-- ============================================================
-- yeseong_mobile_get_me
--   본인 worker + default 현장/협력사 + 최근 7일 출역 한 번에
-- ============================================================
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

grant execute on function yeseong_mobile_get_me() to authenticated;

-- ============================================================
-- yeseong_mobile_register_attendance
--   본인 + 날짜 + 공수로 출역 INSERT
--   year_month 추출 → period upsert → slot upsert (subcontractor 스냅샷) → attendance upsert
-- ============================================================
create or replace function yeseong_mobile_register_attendance(
  p_work_date date,
  p_hours numeric,
  p_worksite_id uuid default null,
  p_subcontractor_id uuid default null
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_worker_id uuid;
  v_default_wage integer;
  v_default_trade text;
  v_default_worksite uuid;
  v_default_sub uuid;
  v_worksite uuid;
  v_subcontractor uuid;
  v_year_month text;
  v_period_id uuid;
  v_slot_id uuid;
  v_attendance_id uuid;
  v_next_slot smallint;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;
  if p_hours is null or p_hours <= 0 or p_hours > 3.0 then
    raise exception 'invalid hours';
  end if;

  select id, default_wage, default_trade, default_worksite_id, default_subcontractor_id
    into v_worker_id, v_default_wage, v_default_trade, v_default_worksite, v_default_sub
    from yeseong_workers where auth_user_id = v_user_id;
  if v_worker_id is null then
    raise exception 'worker not linked to auth user';
  end if;

  v_worksite := coalesce(p_worksite_id, v_default_worksite);
  v_subcontractor := coalesce(p_subcontractor_id, v_default_sub);
  if v_worksite is null then
    raise exception 'worksite required (no default set)';
  end if;

  v_year_month := to_char(p_work_date, 'YYYY-MM');

  -- period upsert
  insert into yeseong_payroll_periods (worksite_id, year_month, period_start, period_end)
  values (
    v_worksite,
    v_year_month,
    date_trunc('month', p_work_date)::date,
    (date_trunc('month', p_work_date) + interval '1 month - 1 day')::date
  )
  on conflict (worksite_id, year_month) do update set updated_at = now()
  returning id into v_period_id;

  -- slot 찾기 (worker_id × period_id)
  select id into v_slot_id from yeseong_payroll_workers
   where period_id = v_period_id and worker_id = v_worker_id;

  if v_slot_id is null then
    -- 다음 빈 slot_number
    select coalesce(max(slot_number), 0) + 1 into v_next_slot
      from yeseong_payroll_workers where period_id = v_period_id;
    if v_next_slot > 26 then
      raise exception 'slot full (26 max)';
    end if;
    insert into yeseong_payroll_workers
      (period_id, worker_id, slot_number, daily_wage, trade, subcontractor_id)
    values
      (v_period_id, v_worker_id, v_next_slot, v_default_wage, v_default_trade, v_subcontractor)
    returning id into v_slot_id;
  end if;

  -- attendance upsert (worksite/subcontractor 스냅샷 포함)
  insert into yeseong_attendance
    (payroll_worker_id, work_date, hours, source, worksite_id, subcontractor_id)
  values
    (v_slot_id, p_work_date, p_hours, 'mobile', v_worksite, v_subcontractor)
  on conflict (payroll_worker_id, work_date) do update
    set hours = excluded.hours,
        worksite_id = excluded.worksite_id,
        subcontractor_id = excluded.subcontractor_id,
        source = 'mobile',
        updated_at = now()
  returning id into v_attendance_id;

  return v_attendance_id;
end $$;

grant execute on function yeseong_mobile_register_attendance(date, numeric, uuid, uuid) to authenticated;
