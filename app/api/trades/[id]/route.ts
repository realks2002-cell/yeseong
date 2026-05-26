import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return NextResponse.json({ error: '직종명은 비울 수 없습니다' }, { status: 400 });
    patch.name = name;
  }
  if ('sort_order' in body && typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)) {
    patch.sort_order = Math.floor(body.sort_order);
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '변경할 필드가 없습니다' }, { status: 400 });

  const { data, error } = await sb.from('yeseong_trades').update(patch).eq('id', id).select('id').single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: '이미 등록된 직종입니다' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await sb.from('yeseong_trades').update({ is_active: false }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
