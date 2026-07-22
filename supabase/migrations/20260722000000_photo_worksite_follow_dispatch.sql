-- 증빙 사진/영수증의 현장 결정에 "당일 파견"을 반영
--   문제: 사진 업로드는 yeseong_worker_team_context(=팀장 추종 default 현장)만 봤고,
--         파견(is_dispatch)은 그날 attendance 행에만 저장돼 서로 무관 →
--         파견 나간 날 찍은 증빙이 원래 소속 현장으로 잘못 귀속됨.
--   규칙(고객 확정): 출역 전 = 기본(추종) 현장, 그날 파견 설정 후 = 파견 현장으로 업로드.
--   해결: 사진 현장 결정을 전용 함수로 단일화 — 오늘 파견 출역이 있으면 그 현장, 없으면 team_context.
--   (base: 20260605001000_fix_team_context_ambiguous / 20260617000400_attendance_dispatch)

create or replace function yeseong_worker_photo_worksite(p_worker_id uuid)
returns table (
  worksite_id uuid,
  worksite_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ws uuid;
begin
  -- 1) 오늘(KST) 파견 출역이 있으면 그 현장 우선
  select a.worksite_id
    into v_ws
    from yeseong_attendance a
    join yeseong_payroll_workers pw on pw.id = a.payroll_worker_id
   where pw.worker_id = p_worker_id
     and a.work_date = (now() at time zone 'Asia/Seoul')::date
     and a.is_dispatch = true
   order by a.updated_at desc nulls last, a.created_at desc
   limit 1;

  if v_ws is not null then
    return query
      select v_ws, (select ws.name from yeseong_worksites ws where ws.id = v_ws);
    return;
  end if;

  -- 2) 평소: 팀장 추종 컨텍스트 (기존 단일 출처 재사용)
  return query
    select t.worksite_id, t.worksite_name
      from yeseong_worker_team_context(p_worker_id) t;
end $$;

grant execute on function yeseong_worker_photo_worksite(uuid) to authenticated;
