-- 팀장이 본인 '성과 입력 기본 현장'(worker.default_worksite_id)을 앱에서 설정하도록 지원
--   배경: 팀장도 작업자이며 성과 입력은 worker.default_worksite_id 기준으로 동작한다.
--         팀장 worker 행에 기본 현장이 없으면 단가 조회/저장이 막힌다(20260525000200 후속).
--   정책: 기본은 팀장이 앱에서 설정, 관리자도 웹에서 수정(담당 현장 동기화) — 양방향.
--   manager 세션은 phone 으로 worker 를 매칭한다(yeseong_manager_get_me 와 동일 규칙).

-- ============================================================
-- yeseong_manager_get_me — worker 객체에 default_worksite_id 추가
-- ============================================================
create or replace function yeseong_manager_get_me()
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
    'manager', jsonb_build_object(
      'id', m.id,
      'name', m.name,
      'phone', m.phone
    ),
    'worker', (
      select jsonb_build_object(
        'id', w.id,
        'name', w.name,
        'phone', w.phone,
        'default_trade', w.default_trade,
        'default_wage', w.default_wage,
        'default_worksite_id', w.default_worksite_id,
        'bank_name', w.bank_name,
        'account_number', w.account_number,
        'account_holder', w.account_holder,
        'address', w.address
      )
      from yeseong_workers w
      where w.phone = m.phone
      limit 1
    ),
    'worksites', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name) order by w.name)
        from yeseong_site_manager_assignments a
        join yeseong_worksites w on w.id = a.worksite_id
       where a.site_manager_id = m.id
    ), '[]'::jsonb)
  ) into result
  from yeseong_site_managers m
  where m.auth_user_id = v_user_id;

  return result;
end $$;

grant execute on function yeseong_manager_get_me() to authenticated;

-- ============================================================
-- yeseong_manager_set_default_worksite — 팀장이 본인 기본 현장 설정
--   p_worksite_id 는 본인 담당 현장(site_manager_assignments) 중 하나여야 함
--   null 이면 기본 현장 해제
-- ============================================================
create or replace function yeseong_manager_set_default_worksite(p_worksite_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manager_id uuid;
  v_phone text;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select id, phone into v_manager_id, v_phone
    from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_manager_id is null then
    raise exception 'manager not found';
  end if;

  -- 담당 현장 검증 (본인에게 배정된 현장만 기본 현장으로 지정 가능)
  if p_worksite_id is not null then
    perform 1 from yeseong_site_manager_assignments
     where site_manager_id = v_manager_id and worksite_id = p_worksite_id;
    if not found then
      raise exception 'not your assigned worksite';
    end if;
  end if;

  update yeseong_workers
     set default_worksite_id = p_worksite_id
   where phone = v_phone;
  if not found then
    raise exception 'worker not found';
  end if;
end $$;

grant execute on function yeseong_manager_set_default_worksite(uuid) to authenticated;
