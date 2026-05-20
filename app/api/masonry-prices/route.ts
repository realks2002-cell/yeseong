import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const worksiteId = url.searchParams.get('worksiteId');

  let q = sb
    .from('yeseong_masonry_prices')
    .select('id, category, type_name, size_spec, unit, unit_price, is_active, worksite_id, created_at, yeseong_worksites(id, name)')
    .eq('is_active', true)
    .eq('category', '조적');

  if (worksiteId) q = q.eq('worksite_id', worksiteId);

  const { data, error } = await q.order('type_name').order('size_spec');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const worksite_id = typeof body?.worksite_id === 'string' && body.worksite_id ? body.worksite_id : null;
  const type_name = typeof body?.type_name === 'string' ? body.type_name.trim() : '';
  const size_spec = typeof body?.size_spec === 'string' && body.size_spec.trim() ? body.size_spec.trim() : null;
  const unit_price = typeof body?.unit_price === 'number' && Number.isFinite(body.unit_price) ? Math.floor(body.unit_price) : -1;

  if (!worksite_id) return NextResponse.json({ error: '현장을 선택하세요' }, { status: 400 });
  if (!type_name) return NextResponse.json({ error: '벽돌 종류를 입력하세요' }, { status: 400 });
  if (unit_price < 0) return NextResponse.json({ error: '단가를 입력하세요' }, { status: 400 });

  const { data, error } = await sb
    .from('yeseong_masonry_prices')
    .insert({ category: '조적', type_name, size_spec, unit: '장', unit_price, worksite_id })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '해당 현장에 동일 종류·규격이 이미 등록되어 있습니다' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
