import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { currentYearMonth, shiftMonth } from '@/lib/utils/date';

export const runtime = 'nodejs';

// 최근 6개월(앵커 월 포함) 총 공수 / 추정 임금총액 추세.
// 임금은 급여형태별 분기: 일급=공수×일당, 월급=월급액, 매사(월급/일급)=승인 물량합.
export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const anchor = url.searchParams.get('yearMonth') ?? currentYearMonth();
  if (!/^\d{4}-\d{2}$/.test(anchor)) {
    return NextResponse.json({ error: 'invalid yearMonth' }, { status: 400 });
  }

  const months: string[] = [];
  for (let i = 5; i >= 0; i--) months.push(shiftMonth(anchor, -i));

  const { data, error } = await sb
    .from('yeseong_payroll_periods')
    .select('year_month, yeseong_payroll_workers(daily_wage, yeseong_workers(wage_type), yeseong_attendance(hours, approval_status), yeseong_masonry_volumes(amount, approval_status))')
    .in('year_month', months);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Joined = {
    year_month: string;
    yeseong_payroll_workers: Array<{
      daily_wage: number;
      yeseong_workers: { wage_type: string | null } | null;
      yeseong_attendance: Array<{ hours: number; approval_status: string }>;
      yeseong_masonry_volumes: Array<{ amount: number; approval_status: string }> | null;
    }> | null;
  };

  const acc = new Map<string, { totalHours: number; wageTotal: number }>();
  for (const m of months) acc.set(m, { totalHours: 0, wageTotal: 0 });

  const periods = (data ?? []) as unknown as Joined[];
  for (const p of periods) {
    const bucket = acc.get(p.year_month);
    if (!bucket) continue;
    for (const slot of p.yeseong_payroll_workers ?? []) {
      const slotHours = (slot.yeseong_attendance ?? [])
        .filter((a) => a.approval_status === 'approved')
        .reduce((s, a) => s + Number(a.hours ?? 0), 0);
      bucket.totalHours += slotHours;

      const wageType = slot.yeseong_workers?.wage_type ?? null;
      if (wageType === '월급/일급') {
        bucket.wageTotal += (slot.yeseong_masonry_volumes ?? [])
          .filter((v) => v.approval_status === 'approved')
          .reduce((s, v) => s + Number(v.amount ?? 0), 0);
      } else if (wageType === '월급') {
        bucket.wageTotal += slot.daily_wage;
      } else {
        bucket.wageTotal += Math.floor(slotHours * slot.daily_wage);
      }
    }
  }

  const trend = months.map((m) => ({
    yearMonth: m,
    totalHours: acc.get(m)!.totalHours,
    wageTotal: acc.get(m)!.wageTotal,
  }));

  return NextResponse.json({ trend });
}
