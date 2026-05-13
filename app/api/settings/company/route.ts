import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET() {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await sb
    .from('yeseong_settings')
    .select('company_name, business_number, representative, address, updated_at')
    .eq('id', 'singleton')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const patch: Record<string, string | null> = {};
  if (typeof body?.company_name === 'string' && body.company_name.trim()) {
    patch.company_name = body.company_name.trim();
  }
  for (const key of ['business_number', 'representative', 'address'] as const) {
    if (typeof body?.[key] === 'string') patch[key] = body[key].trim() || null;
    else if (body?.[key] === null) patch[key] = null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 필드가 없습니다' }, { status: 400 });
  }

  const { data, error } = await sb
    .from('yeseong_settings')
    .update(patch)
    .eq('id', 'singleton')
    .select('company_name, business_number, representative, address, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
