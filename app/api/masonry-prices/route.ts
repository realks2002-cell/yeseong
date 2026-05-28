import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { MASONRY_CATEGORIES, MASONRY_UNITS, brickSizes, categoryTypes } from '@/lib/constants/masonry';

function parseCategory(v: unknown): string {
  return typeof v === 'string' && (MASONRY_CATEGORIES as readonly string[]).includes(v) ? v : '조적';
}

export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const categoryParam = url.searchParams.get('category');
  const category = categoryParam ? parseCategory(categoryParam) : null; // 미지정 시 전체 분류
  const worksiteId = url.searchParams.get('worksiteId');

  let q = sb
    .from('yeseong_masonry_prices')
    .select('id, category, type_name, size_spec, unit, unit_price, is_active, worksite_id, created_at, yeseong_worksites(id, name)')
    .eq('is_active', true);

  if (category) q = q.eq('category', category);
  if (worksiteId) q = q.eq('worksite_id', worksiteId);

  const { data, error } = await q.order('category').order('type_name').order('size_spec').order('unit');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const category = parseCategory(body?.category);
  const worksite_id = typeof body?.worksite_id === 'string' && body.worksite_id ? body.worksite_id : null;
  const unit_price = typeof body?.unit_price === 'number' && Number.isFinite(body.unit_price) ? Math.floor(body.unit_price) : -1;

  if (!worksite_id) return NextResponse.json({ error: '현장을 선택하세요' }, { status: 400 });
  if (unit_price < 0) return NextResponse.json({ error: '단가를 입력하세요' }, { status: 400 });

  let type_name: string;
  let size_spec: string | null;
  let unit: string;

  if (category === '조적') {
    type_name = typeof body?.type_name === 'string' ? body.type_name.trim() : '';
    if (!type_name) {
      return NextResponse.json({ error: '품명을 입력하세요' }, { status: 400 });
    }
    const sizes = brickSizes(type_name);
    if (sizes) {
      const size = typeof body?.size_spec === 'string' ? body.size_spec.trim() : '';
      if (!(sizes as readonly string[]).includes(size)) {
        return NextResponse.json({ error: '규격을 선택하세요 (4·6·8인치)' }, { status: 400 });
      }
      size_spec = size;
    } else {
      size_spec = null;
    }
    unit = '장';
  } else {
    // 미장형: 단위 선택형. 미장은 종류(type_name)도 선택 (종류+단위 조합별 단가).
    const types = categoryTypes(category);
    if (types) {
      const t = typeof body?.type_name === 'string' ? body.type_name.trim() : '';
      if (!t) {
        return NextResponse.json({ error: '품명을 입력하세요' }, { status: 400 });
      }
      type_name = t;
    } else {
      type_name = category;
    }
    size_spec = null;
    const u = typeof body?.unit === 'string' ? body.unit.trim() : '';
    if (!(MASONRY_UNITS as readonly string[]).includes(u)) {
      return NextResponse.json({ error: '단위를 선택하세요' }, { status: 400 });
    }
    unit = u;
  }

  const { data, error } = await sb
    .from('yeseong_masonry_prices')
    .insert({ category, type_name, size_spec, unit, unit_price, worksite_id })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      const msg = category === '조적'
        ? '해당 현장에 동일 품명·규격이 이미 등록되어 있습니다'
        : `해당 현장에 ${category} ${unit} 단가가 이미 등록되어 있습니다`;
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
