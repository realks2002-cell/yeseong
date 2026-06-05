import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

const VALID_STATUS = ['requested', 'sent', 'delivered', 'cancelled'] as const;

// PATCH /api/orders/[id] — 상태 변경 (관리자 전용)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (!VALID_STATUS.includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { status };
  if (status === 'sent') patch.sent_at = new Date().toISOString();

  const { data, error } = await sb
    .from('yeseong_orders')
    .update(patch)
    .eq('id', id)
    .select('id, status, sent_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
