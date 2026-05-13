import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type SlotRow = {
  daily_wage: number;
  trade: string | null;
  worker: { default_trade: string | null } | null;
  attendance: { hours: number }[];
};

export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const yearMonth = url.searchParams.get('yearMonth') ?? defaultYearMonth();
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: 'invalid yearMonth' }, { status: 400 });
  }

  const [workersRes, worksitesRes, periodRes] = await Promise.all([
    sb.from('yeseong_workers').select('id', { count: 'exact', head: true }),
    sb.from('yeseong_worksites').select('id, name, address, is_active').order('name'),
    sb
      .from('yeseong_payroll_periods')
      .select('id, worksite_id, yeseong_payroll_workers(daily_wage, trade, yeseong_workers(default_trade), yeseong_attendance(hours))')
      .eq('year_month', yearMonth),
  ]);

  if (workersRes.error) return NextResponse.json({ error: workersRes.error.message }, { status: 500 });
  if (worksitesRes.error) return NextResponse.json({ error: worksitesRes.error.message }, { status: 500 });
  if (periodRes.error) return NextResponse.json({ error: periodRes.error.message }, { status: 500 });

  let totalHours = 0;
  let workerDays = 0;
  let estimatedWageTotal = 0;
  const tradeMap = new Map<string, number>();

  type Joined = {
    id: string;
    worksite_id: string;
    yeseong_payroll_workers: Array<{
      daily_wage: number;
      trade: string | null;
      yeseong_workers: { default_trade: string | null } | null;
      yeseong_attendance: Array<{ hours: number }>;
    }> | null;
  };

  const periods = (periodRes.data ?? []) as unknown as Joined[];
  for (const p of periods) {
    for (const slot of p.yeseong_payroll_workers ?? []) {
      const att = slot.yeseong_attendance ?? [];
      const slotHours = att.reduce((s, a) => s + Number(a.hours ?? 0), 0);
      const slotDays = att.filter((a) => Number(a.hours ?? 0) > 0).length;
      totalHours += slotHours;
      workerDays += slotDays;
      estimatedWageTotal += slot.daily_wage * slotHours;
      const tradeKey = (slot.trade ?? slot.yeseong_workers?.default_trade ?? '미정') || '미정';
      tradeMap.set(tradeKey, (tradeMap.get(tradeKey) ?? 0) + slotHours);
    }
  }

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
    },
    worksites: worksitesRes.data ?? [],
    tradeBreakdown,
  });
}

function defaultYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
