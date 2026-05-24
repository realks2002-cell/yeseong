-- yeseong_admin_get_payroll RPC 확장:
--   1) worker.wage_type 추가 (엑셀 행 색상·일자셀 표시 분기용)
--   2) volumes 배열 추가 (월급/일급 작업자 성과 합계 계산용)

create or replace function yeseong_admin_get_payroll(p_period_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
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
          'rrn_plain', w.rrn_plain,
          'address', w.address,
          'bank_name', w.bank_name,
          'account_number', w.account_number,
          'account_holder', w.account_holder,
          'phone', w.phone,
          'default_trade', w.default_trade,
          'default_wage', w.default_wage,
          'wage_type', w.wage_type
        ),
        'attendance', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'work_date', a.work_date,
            'hours', a.hours
          )), '[]'::jsonb)
          from yeseong_attendance a
          where a.payroll_worker_id = s.id
            and a.approval_status = 'approved'
        ),
        'volumes', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'category', v.category,
            'type_name', v.type_name,
            'size_spec', v.size_spec,
            'quantity', v.quantity,
            'unit_price', v.unit_price,
            'amount', v.amount
          )), '[]'::jsonb)
          from yeseong_masonry_volumes v
          where v.payroll_worker_id = s.id
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
