import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

// GET /api/payroll/[siteId]/[yyyymm]/volumes
//   해당 period의 모든 slot에 속한 물량 목록 — grid 합계 계산용
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
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: period } = await sb
    .from('yeseong_payroll_periods')
    .select('id')
    .eq('worksite_id', siteId)
    .eq('year_month', yyyymm)
    .single();
  if (!period) return NextResponse.json([]);

  const { data: slots } = await sb
    .from('yeseong_payroll_workers')
    .select('id')
    .eq('period_id', period.id);
  const slotIds = (slots ?? []).map((s) => s.id);
  if (slotIds.length === 0) return NextResponse.json([]);

  const { data, error } = await sb
    .from('yeseong_masonry_volumes')
    .select('id, payroll_worker_id, category, type_name, size_spec, quantity, unit, unit_price, amount, note')
    .in('payroll_worker_id', slotIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// PUT /api/payroll/[siteId]/[yyyymm]/volumes
//   body: { payroll_worker_id, items: [{ masonry_price_id, quantity, note? }] }
//   해당 작업자의 그 달 물량을 전체 교체 (월 1회 입력 정책)
//   RPC yeseong_replace_masonry_volumes로 단일 트랜잭션 처리 — 중간 실패 시 자동 롤백.
export async function PUT(
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
  const pwId = typeof body?.payroll_worker_id === 'string' ? body.payroll_worker_id : null;
  const items = Array.isArray(body?.items) ? body.items : null;
  if (!pwId || !items) {
    return NextResponse.json({ error: 'payroll_worker_id, items 필요' }, { status: 400 });
  }

  // payroll_worker가 해당 period에 속하는지 검증 (보안)
  const { data: pw } = await sb
    .from('yeseong_payroll_workers')
    .select('id, period:yeseong_payroll_periods(worksite_id, year_month)')
    .eq('id', pwId)
    .single<{ id: string; period: { worksite_id: string; year_month: string } | null }>();
  if (!pw || pw.period?.worksite_id !== siteId || pw.period?.year_month !== yyyymm) {
    return NextResponse.json({ error: '유효하지 않은 작업자 슬롯' }, { status: 400 });
  }

  // RPC가 단일 트랜잭션으로 DELETE + INSERT 처리
  const { data: count, error } = await sb.rpc('yeseong_replace_masonry_volumes', {
    p_payroll_worker_id: pwId,
    p_items: items,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: count ?? 0 });
}
