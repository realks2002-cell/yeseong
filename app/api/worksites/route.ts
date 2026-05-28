import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const includeArchived = new URL(req.url).searchParams.get('includeArchived') === 'true';

  let query = sb
    .from('yeseong_worksites')
    .select('id, name, address, client_id, subcontractor_id, is_active, created_at')
    .order('name');
  if (!includeArchived) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const address = typeof body?.address === 'string' ? body.address.trim() || null : null;
  const client_id = typeof body?.client_id === 'string' && body.client_id ? body.client_id : null;
  const subcontractor_id = typeof body?.subcontractor_id === 'string' && body.subcontractor_id ? body.subcontractor_id : null;
  if (!name) return NextResponse.json({ error: '현장명을 입력하세요' }, { status: 400 });

  const { data, error } = await sb
    .from('yeseong_worksites')
    .insert({ name, address, client_id, subcontractor_id })
    .select('id, name, address, client_id, subcontractor_id, is_active, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 같은 이름의 현장이 있습니다' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
