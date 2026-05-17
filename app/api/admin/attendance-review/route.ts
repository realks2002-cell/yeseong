import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days') ?? '30')));
  const statusParam = url.searchParams.get('status');
  const status = statusParam && ['pending', 'approved', 'rejected'].includes(statusParam) ? statusParam : null;

  const { data, error } = await sb.rpc('yeseong_admin_list_attendance_review', {
    p_days: days,
    p_status: status,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.ids) || body.ids.length === 0 || typeof body.approve !== 'boolean') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const { data, error } = await sb.rpc('yeseong_admin_bulk_approve_attendance', {
    p_ids: body.ids,
    p_approve: body.approve,
    p_reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: data ?? 0 });
}
