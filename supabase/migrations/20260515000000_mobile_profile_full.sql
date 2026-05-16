-- 작업자 앱 "내 정보" 화면 지원:
-- 1) yeseong_mobile_get_me 응답에 은행/계좌/주소 추가
-- 2) yeseong_mobile_update_profile: 본인 정보 수정 RPC (auth.uid()로 본인 row만 안전 update)

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
      'default_subcontractor_id', w.default_subcontractor_id,
      'bank_name', w.bank_name,
      'account_number', w.account_number,
      'account_holder', w.account_holder,
      'address', w.address
    ),
    'worksite', case when ws.id is not null then jsonb_build_object('id', ws.id, 'name', ws.name) end,
    'subcontractor', case when sc.id is not null then jsonb_build_object('id', sc.id, 'name', sc.name) end,
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
        and a.work_date >= current_date - interval '7 days'
    )
  ) into result
  from yeseong_workers w
  left join yeseong_worksites ws on ws.id = w.default_worksite_id
  left join yeseong_subcontractors sc on sc.id = w.default_subcontractor_id
  where w.auth_user_id = v_user_id;

  return result;
end $$;

-- 본인 정보 수정 — auth.uid()로 본인 row만 update.
-- 빈 문자열('')은 NULL로 저장(필드 비우기 가능), NULL 파라미터는 변경 안 함.
create or replace function yeseong_mobile_update_profile(
  p_name text default null,
  p_default_trade text default null,
  p_bank_name text default null,
  p_account_number text default null,
  p_account_holder text default null,
  p_address text default null
)
returns void
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
  set
    name = case
      when p_name is null then name
      when btrim(p_name) = '' then name  -- 이름은 비우기 금지
      else btrim(p_name)
    end,
    default_trade = case
      when p_default_trade is null then default_trade
      when btrim(p_default_trade) = '' then null
      else btrim(p_default_trade)
    end,
    bank_name = case
      when p_bank_name is null then bank_name
      when btrim(p_bank_name) = '' then null
      else btrim(p_bank_name)
    end,
    account_number = case
      when p_account_number is null then account_number
      when btrim(p_account_number) = '' then null
      else btrim(p_account_number)
    end,
    account_holder = case
      when p_account_holder is null then account_holder
      when btrim(p_account_holder) = '' then null
      else btrim(p_account_holder)
    end,
    address = case
      when p_address is null then address
      when btrim(p_address) = '' then null
      else btrim(p_address)
    end
  where auth_user_id = v_user_id;

  if not found then
    raise exception 'profile not found';
  end if;
end $$;

grant execute on function yeseong_mobile_update_profile(text, text, text, text, text, text) to authenticated;
