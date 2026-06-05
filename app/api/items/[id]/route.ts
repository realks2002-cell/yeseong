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

  const allowed = ['item_code', 'name', 'spec', 'unit', 'vendor_id', 'trades'];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) {
      const v = body[k];
      if (k === 'vendor_id') {
        patch[k] = typeof v === 'string' && v ? v : null;
      } else if (k === 'trades') {
        patch[k] = Array.isArray(v) && v.length > 0
          ? v.filter((t: unknown) => typeof t === 'string' && t)
          : null;
      } else if (typeof v === 'string') {
        patch[k] = v.trim() || null;
      } else if (v === null) {
        patch[k] = null;
      }
    }
  }
  if ('name' in patch && !patch.name) return NextResponse.json({ error: '품목명은 비울 수 없습니다' }, { status: 400 });
  if ('unit' in patch && !patch.unit) return NextResponse.json({ error: '단위는 비울 수 없습니다' }, { status: 400 });
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '변경할 필드가 없습니다' }, { status: 400 });

  const { data, error } = await sb.from('yeseong_items').update(patch).eq('id', id).select('id').single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: '이미 같은 품번이 등록되어 있습니다' }, { status: 409 });
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

  const { error } = await sb.from('yeseong_items').update({ is_active: false }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
