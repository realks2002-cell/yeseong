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
  if ('worksite_id' in body) {
    if (typeof body.worksite_id !== 'string' || !body.worksite_id) {
      return NextResponse.json({ error: '현장을 선택하세요' }, { status: 400 });
    }
    patch.worksite_id = body.worksite_id;
  }
  if (typeof body.type_name === 'string') {
    const v = body.type_name.trim();
    if (!v) return NextResponse.json({ error: '종류명은 비울 수 없습니다' }, { status: 400 });
    patch.type_name = v;
  }
  if ('size_spec' in body) {
    patch.size_spec = typeof body.size_spec === 'string' && body.size_spec.trim() ? body.size_spec.trim() : null;
  }
  if (typeof body.unit_price === 'number' && Number.isFinite(body.unit_price)) {
    patch.unit_price = Math.floor(body.unit_price);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 필드가 없습니다' }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await sb
    .from('yeseong_masonry_prices')
    .update(patch)
    .eq('id', id)
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '해당 현장에 동일 종류·규격이 이미 등록되어 있습니다' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await sb
    .from('yeseong_masonry_prices')
    .update({ is_active: false })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
