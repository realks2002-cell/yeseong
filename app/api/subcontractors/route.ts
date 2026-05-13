import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await sb
    .from('yeseong_subcontractors')
    .select('id, name, business_number, contact_phone, is_active, created_at')
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
  if (!name) return NextResponse.json({ error: '협력사명을 입력하세요' }, { status: 400 });

  const business_number = typeof body?.business_number === 'string' && body.business_number.trim()
    ? body.business_number.trim() : null;
  const contact_phone = typeof body?.contact_phone === 'string' && body.contact_phone.trim()
    ? body.contact_phone.trim() : null;

  const { data, error } = await sb
    .from('yeseong_subcontractors')
    .insert({ name, business_number, contact_phone })
    .select('id, name, business_number, contact_phone, is_active, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 같은 이름의 협력사가 있습니다' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
