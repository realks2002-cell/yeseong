import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await sb
    .from('yeseong_trades')
    .select('id, name, sort_order, is_active, created_at')
    .eq('is_active', true)
    .order('sort_order')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ?managersOnly=1 — 팀장(현장소장)에게 등록된 직종만 (manager 행 + 팀장 worker 행 공종)
  const managersOnly = new URL(req.url).searchParams.get('managersOnly');
  if (managersOnly && data) {
    const [{ data: mgrs }, { data: mgrPhones }] = await Promise.all([
      sb.from('yeseong_site_managers').select('default_trade, phone').eq('is_active', true),
      sb.from('yeseong_site_managers').select('phone').eq('is_active', true).not('phone', 'is', null),
    ]);
    const used = new Set<string>();
    for (const m of mgrs ?? []) if (m.default_trade) used.add(m.default_trade);
    const phones = (mgrPhones ?? []).map((m) => m.phone as string);
    if (phones.length) {
      const { data: workers } = await sb
        .from('yeseong_workers')
        .select('default_trade')
        .in('phone', phones)
        .not('default_trade', 'is', null);
      for (const w of workers ?? []) if (w.default_trade) used.add(w.default_trade);
    }
    return NextResponse.json(data.filter((t) => used.has(t.name)));
  }

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: '직종명을 입력하세요' }, { status: 400 });

  const sortOrder = typeof body?.sort_order === 'number' && Number.isFinite(body.sort_order)
    ? Math.floor(body.sort_order)
    : 0;

  const { data, error } = await sb
    .from('yeseong_trades')
    .insert({ name, sort_order: sortOrder })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: '이미 등록된 직종입니다' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
