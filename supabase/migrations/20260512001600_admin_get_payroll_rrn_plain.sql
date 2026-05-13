-- yeseong_admin_get_payroll: rrn_plain 우선, 없으면 복호화 fallback
-- (백필 마이그레이션 후에는 사실상 rrn_plain만 사용)

create or replace function yeseong_admin_get_payroll(p_period_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, vault, extensions
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'period', to_jsonb(p),
    'worksite', to_jsonb(ws),
    'slots', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'slot_number', s.slot_number,
        'daily_wage', s.daily_wage,
        'trade', s.trade,
        'subcontractor_name', sc.name,
        'worker', jsonb_build_object(
          'id', w.id,
          'name', w.name,
          'rrn_plain', coalesce(w.rrn_plain, yeseong_decrypt_rrn(w.rrn_encrypted)),
          'address', w.address,
          'bank_name', w.bank_name,
          'account_number', w.account_number,
          'account_holder', w.account_holder,
          'phone', w.phone,
          'default_trade', w.default_trade,
          'default_wage', w.default_wage
        ),
        'attendance', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'work_date', a.work_date,
            'hours', a.hours
          )), '[]'::jsonb)
          from yeseong_attendance a where a.payroll_worker_id = s.id
        )
      ) order by s.slot_number), '[]'::jsonb)
      from yeseong_payroll_workers s
      join yeseong_workers w on w.id = s.worker_id
      left join yeseong_subcontractors sc on sc.id = s.subcontractor_id
      where s.period_id = p.id
    )
  ) into result
  from yeseong_payroll_periods p
  join yeseong_worksites ws on ws.id = p.worksite_id
  where p.id = p_period_id;
  return result;
end $$;
