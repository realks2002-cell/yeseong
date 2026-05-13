import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};
  if (typeof body?.name === 'string') {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: '협력사명은 비울 수 없습니다' }, { status: 400 });
    patch.name = name;
  }
  if ('business_number' in (body ?? {})) {
    patch.business_number =
      typeof body.business_number === 'string' && body.business_number.trim()
        ? body.business_number.trim() : null;
  }
  if ('contact_phone' in (body ?? {})) {
    patch.contact_phone =
      typeof body.contact_phone === 'string' && body.contact_phone.trim()
        ? body.contact_phone.trim() : null;
  }
  if (typeof body?.is_active === 'boolean') {
    patch.is_active = body.is_active;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 필드가 없습니다' }, { status: 400 });
  }

  const { data, error } = await sb
    .from('yeseong_subcontractors')
    .update(patch)
    .eq('id', id)
    .select('id, name, business_number, contact_phone, is_active, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 같은 이름의 협력사가 있습니다' }, { status: 409 });
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

  // 협력사가 작업자/슬롯에 참조되어 있어도 ON DELETE SET NULL로 안전하게 끊김
  const { error } = await sb.from('yeseong_subcontractors').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
