import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { currentYearMonth } from '@/lib/utils/date';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const yearMonth = url.searchParams.get('yearMonth') ?? currentYearMonth();
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: 'invalid yearMonth' }, { status: 400 });
  }

  const [workersRes, worksitesRes, periodRes] = await Promise.all([
    sb.from('yeseong_workers').select('id', { count: 'exact', head: true }),
    sb.from('yeseong_worksites').select('id, name, address, is_active').order('name'),
    sb
      .from('yeseong_payroll_periods')
      .select('id, worksite_id, yeseong_payroll_workers(daily_wage, trade, yeseong_workers(default_trade, wage_type), yeseong_attendance(hours, approval_status), yeseong_masonry_volumes(amount, approval_status))')
      .eq('year_month', yearMonth),
  ]);

  if (workersRes.error) return NextResponse.json({ error: workersRes.error.message }, { status: 500 });
  if (worksitesRes.error) return NextResponse.json({ error: worksitesRes.error.message }, { status: 500 });
  if (periodRes.error) return NextResponse.json({ error: periodRes.error.message }, { status: 500 });

  let totalHours = 0;
  let workerDays = 0;
  // 급여형태별 임금 — 일급: 공수×일당, 월급: 월급액(출역 무관), 매사(월급/일급): 승인 물량합
  const wageBreakdown = { daily: 0, monthly: 0, masonry: 0 };
  const tradeMap = new Map<string, number>();

  type Joined = {
    id: string;
    worksite_id: string;
    yeseong_payroll_workers: Array<{
      daily_wage: number;
      trade: string | null;
      yeseong_workers: { default_trade: string | null; wage_type: string | null } | null;
      yeseong_attendance: Array<{ hours: number; approval_status: string }>;
      yeseong_masonry_volumes: Array<{ amount: number; approval_status: string }> | null;
    }> | null;
  };

  const periods = (periodRes.data ?? []) as unknown as Joined[];
  for (const p of periods) {
    for (const slot of p.yeseong_payroll_workers ?? []) {
      const att = (slot.yeseong_attendance ?? []).filter((a) => a.approval_status === 'approved');
      const slotHours = att.reduce((s, a) => s + Number(a.hours ?? 0), 0);
      const slotDays = att.filter((a) => Number(a.hours ?? 0) > 0).length;
      totalHours += slotHours;
      workerDays += slotDays;

      const wageType = slot.yeseong_workers?.wage_type ?? null;
      if (wageType === '월급/일급') {
        const volumesSum = (slot.yeseong_masonry_volumes ?? [])
          .filter((v) => v.approval_status === 'approved')
          .reduce((s, v) => s + Number(v.amount ?? 0), 0);
        wageBreakdown.masonry += volumesSum;
      } else if (wageType === '월급') {
        wageBreakdown.monthly += slot.daily_wage;
      } else {
        wageBreakdown.daily += Math.floor(slotHours * slot.daily_wage);
      }

      const tradeKey = (slot.trade ?? slot.yeseong_workers?.default_trade ?? '미정') || '미정';
      tradeMap.set(tradeKey, (tradeMap.get(tradeKey) ?? 0) + slotHours);
    }
  }

  const estimatedWageTotal = wageBreakdown.daily + wageBreakdown.monthly + wageBreakdown.masonry;

  const tradeBreakdown = Array.from(tradeMap.entries())
    .map(([trade, hours]) => ({ trade, hours }))
    .sort((a, b) => b.hours - a.hours);

  return NextResponse.json({
    yearMonth,
    kpi: {
      workerCount: workersRes.count ?? 0,
      worksiteCount: (worksitesRes.data ?? []).filter((w) => w.is_active).length,
      totalHours,
      workerDays,
      estimatedWageTotal,
      wageBreakdown,
    },
    worksites: worksitesRes.data ?? [],
    tradeBreakdown,
  });
}

