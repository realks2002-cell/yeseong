import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await sb
    .from('yeseong_masonry_prices')
    .select('id, category, type_name, size_spec, unit, unit_price, is_active, created_at')
    .eq('is_active', true)
    .order('category')
    .order('type_name')
    .order('size_spec');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const category = typeof body?.category === 'string' ? body.category.trim() : '';
  const type_name = typeof body?.type_name === 'string' ? body.type_name.trim() : '';
  const size_spec = typeof body?.size_spec === 'string' && body.size_spec.trim() ? body.size_spec.trim() : null;
  const unit = category === '조적' ? '장' : '㎡';
  const unit_price = typeof body?.unit_price === 'number' && Number.isFinite(body.unit_price) ? Math.floor(body.unit_price) : -1;

  if (!category || !['조적', '미장'].includes(category)) {
    return NextResponse.json({ error: '카테고리를 선택하세요 (조적/미장)' }, { status: 400 });
  }
  if (!type_name) return NextResponse.json({ error: '종류명을 입력하세요' }, { status: 400 });
  if (unit_price < 0) return NextResponse.json({ error: '단가를 입력하세요' }, { status: 400 });

  const { data, error } = await sb
    .from('yeseong_masonry_prices')
    .insert({ category, type_name, size_spec, unit, unit_price })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 동일한 종류/규격이 등록되어 있습니다' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
