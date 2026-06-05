import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const allowed = ['name', 'business_number', 'contact_phone', 'contact_name', 'address', 'note'];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) {
      const v = body[k];
      if (typeof v === 'string') patch[k] = v.trim() || null;
      else if (v === null) patch[k] = null;
    }
  }
  if (typeof patch.name === 'string' && !patch.name) {
    return NextResponse.json({ error: '거래처명은 비울 수 없습니다' }, { status: 400 });
  }
  if ('name' in patch && patch.name) patch.name = (patch.name as string);
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '변경할 필드가 없습니다' }, { status: 400 });

  const { data, error } = await sb.from('yeseong_vendors').update(patch).eq('id', id).select('id').single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: '이미 같은 이름의 거래처가 있습니다' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await sb.from('yeseong_vendors').update({ is_active: false }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
