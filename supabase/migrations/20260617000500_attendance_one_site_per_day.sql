-- 하루 한 작업자 = 한 현장만 출역 (이중 일수 계상 방지, 근본 가드)
--   파견이든 일반이든, 같은 work_date에 그 작업자의 출역이 다른 슬롯(=다른 현장)에 이미 있으면 거부.
--   같은 슬롯·같은 날 재등록(upsert)은 정상(덮어쓰기) — 트리거는 '다른 슬롯' 충돌만 차단.
--   모든 경로(모바일 일반/파견, 관리자 그리드) 커버.
--   (base: 20260617000400_attendance_dispatch)

create or replace function yeseong_attendance_one_site_per_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
  v_other_site text;
begin
  select worker_id into v_worker_id
    from yeseong_payroll_workers where id = NEW.payroll_worker_id;

  select ws.name into v_other_site
    from yeseong_attendance a
    join yeseong_payroll_workers pw on pw.id = a.payroll_worker_id
    join yeseong_payroll_periods p on p.id = pw.period_id
    join yeseong_worksites ws on ws.id = p.worksite_id
   where pw.worker_id = v_worker_id
     and a.work_date = NEW.work_date
     and a.payroll_worker_id <> NEW.payroll_worker_id
   limit 1;

  if v_other_site is not null then
    raise exception '%은 이미 다른 현장(%)에 출역이 등록되어 있습니다. 하루 한 현장만 출역할 수 있습니다.',
      to_char(NEW.work_date, 'FMMM월 FMDD일'), v_other_site;
  end if;

  return NEW;
end $$;

drop trigger if exists yeseong_attendance_one_site_per_day_trg on yeseong_attendance;
create trigger yeseong_attendance_one_site_per_day_trg
  before insert or update of payroll_worker_id, work_date on yeseong_attendance
  for each row execute function yeseong_attendance_one_site_per_day();
