import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await sb
    .from('yeseong_items')
    .select('id, item_code, name, spec, unit, vendor_id, trades, is_active, created_at')
    .eq('is_active', true)
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const unit = typeof body?.unit === 'string' ? body.unit.trim() : '';
  if (!name) return NextResponse.json({ error: '품목명을 입력하세요' }, { status: 400 });
  if (!unit) return NextResponse.json({ error: '단위를 입력하세요' }, { status: 400 });

  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const { data, error } = await sb
    .from('yeseong_items')
    .insert({
      item_code: str(body.item_code),
      name,
      spec: str(body.spec),
      unit,
      vendor_id: typeof body?.vendor_id === 'string' && body.vendor_id ? body.vendor_id : null,
      trades: Array.isArray(body?.trades) && body.trades.length > 0
        ? body.trades.filter((t: unknown) => typeof t === 'string' && t)
        : null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: '이미 같은 품번이 등록되어 있습니다' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
