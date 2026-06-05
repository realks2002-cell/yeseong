import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

// PATCH: 슬롯의 subcontractor 변경 (trade·daily_wage는 작업자 마스터에서만 관리)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ siteId: string; yyyymm: string; id: string }> },
) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};
  if (typeof body?.subcontractor_id === 'string') patch.subcontractor_id = body.subcontractor_id;
  else if (body?.subcontractor_id === null) patch.subcontractor_id = null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 필드가 없습니다' }, { status: 400 });
  }

  const { data, error } = await sb
    .from('yeseong_payroll_workers')
    .update(patch)
    .eq('id', id)
    .select('id, subcontractor_id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE: 슬롯 제거 (cascade로 출역도 삭제)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ siteId: string; yyyymm: string; id: string }> },
) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await sb.from('yeseong_payroll_workers').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
