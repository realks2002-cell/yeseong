import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

// POST: 노임대장에 작업자 추가 (슬롯 생성)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string; yyyymm: string }> },
) {
  const { siteId, yyyymm } = await params;
  if (!/^\d{4}-\d{2}$/.test(yyyymm)) {
    return NextResponse.json({ error: 'invalid yyyymm' }, { status: 400 });
  }

  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const workerId = typeof body?.worker_id === 'string' ? body.worker_id : null;
  if (!workerId) return NextResponse.json({ error: 'worker_id 필요' }, { status: 400 });

  // period 조회
  const { data: period, error: pErr } = await sb
    .from('yeseong_payroll_periods')
    .select('id')
    .eq('worksite_id', siteId)
    .eq('year_month', yyyymm)
    .single();
  if (pErr || !period) return NextResponse.json({ error: 'period 없음 — 먼저 GET 호출' }, { status: 404 });

  // 워커 + default wage 조회
  const { data: w, error: wErr } = await sb
    .from('yeseong_workers')
    .select('id, default_wage, default_trade')
    .eq('id', workerId)
    .single();
  if (wErr || !w) return NextResponse.json({ error: 'worker not found' }, { status: 404 });

  // 전문건설사 = 현장(1:1)에서 파생 (worksites.subcontractor_id)
  const { data: site } = await sb
    .from('yeseong_worksites')
    .select('subcontractor_id')
    .eq('id', siteId)
    .single();

  // 빈 slot_number 찾기 (1~26)
  const { data: existing } = await sb
    .from('yeseong_payroll_workers')
    .select('slot_number')
    .eq('period_id', period.id)
    .order('slot_number');
  const used = new Set((existing ?? []).map((x) => x.slot_number));
  let slot = -1;
  for (let i = 1; i <= 26; i++) {
    if (!used.has(i)) { slot = i; break; }
  }
  if (slot < 0) return NextResponse.json({ error: '슬롯이 가득 찼습니다 (26명)' }, { status: 409 });

  const { data, error } = await sb
    .from('yeseong_payroll_workers')
    .insert({
      period_id: period.id,
      worker_id: workerId,
      slot_number: slot,
      trade: w.default_trade,
      daily_wage: w.default_wage ?? 0,
      subcontractor_id: site?.subcontractor_id ?? null,
    })
    .select('id, slot_number')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 등록된 작업자입니다' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
