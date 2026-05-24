import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { periodRangeIso } from '@/lib/utils/date';

// GET: 현장+년월 노임대장 조회. period 없으면 자동 생성.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string; yyyymm: string }> },
) {
  const { siteId, yyyymm } = await params;
  if (!/^\d{4}-\d{2}$/.test(yyyymm)) {
    return NextResponse.json({ error: 'invalid yyyymm' }, { status: 400 });
  }

  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 현장 검증
  const { data: ws, error: wsErr } = await sb
    .from('yeseong_worksites')
    .select('id, name, address, is_active')
    .eq('id', siteId)
    .single();
  if (wsErr || !ws) return NextResponse.json({ error: 'worksite not found' }, { status: 404 });

  // period upsert (타임존 무관 문자열 빌드)
  const { start: startStr, end: endStr } = periodRangeIso(yyyymm);

  const { data: period, error: pErr } = await sb
    .from('yeseong_payroll_periods')
    .upsert(
      { worksite_id: siteId, year_month: yyyymm, period_start: startStr, period_end: endStr },
      { onConflict: 'worksite_id,year_month' },
    )
    .select('id, worksite_id, year_month, period_start, period_end, status')
    .single();
  if (pErr || !period) return NextResponse.json({ error: pErr?.message ?? 'period upsert failed' }, { status: 500 });

  // 슬롯 + 워커 + 협력사 조회
  const { data: slots, error: slotErr } = await sb
    .from('yeseong_payroll_workers')
    .select(`
      id, slot_number, daily_wage, trade,
      worker:yeseong_workers (
        id, employee_code, name, name_english,
        default_trade, skill_grade, default_wage, wage_type,
        rrn_prefix, rrn_gender_digit,
        bank_name, account_number, account_holder, phone, address
      ),
      subcontractor:yeseong_subcontractors ( id, name )
    `)
    .eq('period_id', period.id)
    .order('slot_number');
  if (slotErr) return NextResponse.json({ error: slotErr.message }, { status: 500 });

  // 출역 조회 (해당 period의 모든 슬롯)
  const slotIds = (slots ?? []).map((s) => s.id);
  let attendance: Array<{ payroll_worker_id: string; work_date: string; hours: number }> = [];
  if (slotIds.length > 0) {
    const { data: att, error: aErr } = await sb
      .from('yeseong_attendance')
      .select('payroll_worker_id, work_date, hours')
      .in('payroll_worker_id', slotIds)
      .eq('approval_status', 'approved');
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
    attendance = att ?? [];
  }

  return NextResponse.json({ worksite: ws, period, slots: slots ?? [], attendance });
}
