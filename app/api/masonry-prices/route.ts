import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

const BRICK_TYPES = ['치장벽돌', '시멘트벽돌'] as const;
const BRICK_SIZES = ['보통', '특수'] as const;

export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const category = url.searchParams.get('category') === '미장' ? '미장' : '조적';
  const worksiteId = url.searchParams.get('worksiteId');

  let q = sb
    .from('yeseong_masonry_prices')
    .select('id, category, type_name, size_spec, unit, unit_price, is_active, worksite_id, created_at, yeseong_worksites(id, name)')
    .eq('is_active', true)
    .eq('category', category);

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
  const category = body?.category === '미장' ? '미장' : '조적';
  const worksite_id = typeof body?.worksite_id === 'string' && body.worksite_id ? body.worksite_id : null;
  const unit_price = typeof body?.unit_price === 'number' && Number.isFinite(body.unit_price) ? Math.floor(body.unit_price) : -1;

  if (!worksite_id) return NextResponse.json({ error: '현장을 선택하세요' }, { status: 400 });
  if (unit_price < 0) return NextResponse.json({ error: '단가를 입력하세요' }, { status: 400 });

  let type_name: string;
  let size_spec: string | null;
  let unit: '장' | '㎡';

  if (category === '조적') {
    type_name = typeof body?.type_name === 'string' ? body.type_name.trim() : '';
    if (!(BRICK_TYPES as readonly string[]).includes(type_name)) {
      return NextResponse.json({ error: '벽돌 종류를 선택하세요 (치장벽돌·시멘트벽돌)' }, { status: 400 });
    }
    const size = typeof body?.size_spec === 'string' ? body.size_spec.trim() : '';
    if (!(BRICK_SIZES as readonly string[]).includes(size)) {
      return NextResponse.json({ error: '부위·규격을 선택하세요 (보통·특수)' }, { status: 400 });
    }
    size_spec = size;
    unit = '장';
  } else {
    type_name = '미장';
    size_spec = null;
    unit = '㎡';
  }

  const { data, error } = await sb
    .from('yeseong_masonry_prices')
    .insert({ category, type_name, size_spec, unit, unit_price, worksite_id })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      const msg = category === '미장'
        ? '해당 현장에 미장 단가가 이미 등록되어 있습니다'
        : '해당 현장에 동일 종류·규격이 이미 등록되어 있습니다';
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
