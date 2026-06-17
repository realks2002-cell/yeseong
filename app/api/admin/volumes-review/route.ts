import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { pushVolumeRejectedToManager } from '@/lib/push/volumes';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const ym = url.searchParams.get('year_month');
  const statusParam = url.searchParams.get('status');
  const status = statusParam && ['pending', 'approved', 'rejected'].includes(statusParam) ? statusParam : null;

  const { data, error } = await sb.rpc('yeseong_admin_list_volumes_review', {
    p_year_month: ym && /^\d{4}-\d{2}$/.test(ym) ? ym : null,
    p_status: status,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.ids) || body.ids.length === 0 || typeof body.approve !== 'boolean') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const { data, error } = await sb.rpc('yeseong_admin_bulk_approve_volumes', {
    p_ids: body.ids,
    p_approve: body.approve,
    p_reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 반려 시 담당 팀장에게 푸시 (보조 채널 — 실패해도 무시)
  if (body.approve === false) {
    await pushVolumeRejectedToManager(body.ids);
  }
  return NextResponse.json({ updated: data ?? 0 });
}

// PUT — 제출된 성과 직접 수정(슬롯 단위 전체 교체). 편집 전 결재 상태는 RPC가 보존.
export async function PUT(req: Request) {
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

  const { data, error } = await sb.rpc('yeseong_admin_replace_volumes', {
    p_payroll_worker_id: pwId,
    p_items: items,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: data ?? 0 });
}

// POST — 신규 성과 추가 입력(작업자×현장×월). 슬롯 자동 생성, 즉시 승인.
export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const workerId = typeof body?.worker_id === 'string' ? body.worker_id : null;
  const worksiteId = typeof body?.worksite_id === 'string' ? body.worksite_id : null;
  const yearMonth = typeof body?.year_month === 'string' ? body.year_month : null;
  const items = Array.isArray(body?.items) ? body.items : null;
  if (!workerId || !worksiteId || !yearMonth || !items) {
    return NextResponse.json({ error: 'worker_id, worksite_id, year_month, items 필요' }, { status: 400 });
  }

  const { data, error } = await sb.rpc('yeseong_admin_add_volumes', {
    p_worker_id: workerId,
    p_year_month: yearMonth,
    p_worksite_id: worksiteId,
    p_items: items,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: data ?? 0 });
}
