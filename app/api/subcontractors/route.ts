import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const includeArchived = new URL(req.url).searchParams.get('includeArchived') === 'true';

  let query = sb
    .from('yeseong_subcontractors')
    .select('id, name, business_number, contact_phone, representative, address, is_active, created_at')
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
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: '전문건설사명을 입력하세요' }, { status: 400 });

  const business_number = typeof body?.business_number === 'string' && body.business_number.trim()
    ? body.business_number.trim() : null;
  const contact_phone = typeof body?.contact_phone === 'string' && body.contact_phone.trim()
    ? body.contact_phone.trim() : null;
  const representative = typeof body?.representative === 'string' && body.representative.trim()
    ? body.representative.trim() : null;
  const address = typeof body?.address === 'string' && body.address.trim()
    ? body.address.trim() : null;

  const { data, error } = await sb
    .from('yeseong_subcontractors')
    .insert({ name, business_number, contact_phone, representative, address })
    .select('id, name, business_number, contact_phone, representative, address, is_active, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 같은 이름의 전문건설사가 있습니다' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
