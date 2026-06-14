import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { persistPeriodDeductions } from '@/lib/payroll/compute-period';

export const runtime = 'nodejs';

// 서버에서 공제 자동 계산 → payroll_workers 저장 (엑셀 수식 재현)
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ siteId: string; yyyymm: string }> },
) {
  const { siteId, yyyymm } = await params;
  if (!/^\d{4}-\d{2}$/.test(yyyymm)) return NextResponse.json({ error: 'invalid yyyymm' }, { status: 400 });

  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: period } = await sb
    .from('yeseong_payroll_periods')
    .select('id')
    .eq('worksite_id', siteId)
    .eq('year_month', yyyymm)
    .single();
  if (!period) return NextResponse.json({ error: '해당 월의 노임대장이 없습니다.' }, { status: 404 });

  const svc = getServiceSupabase();
  let computed: number;
  try {
    computed = await persistPeriodDeductions(period.id, sb, svc);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  if (computed === 0) return NextResponse.json({ error: '계산할 작업자가 없습니다.' }, { status: 400 });

  return NextResponse.json({ computed });
}
