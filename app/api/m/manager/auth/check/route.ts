import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/auth/phone-email';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { phone } = await req.json().catch(() => ({}));
  const p = normalizePhone(String(phone ?? ''));
  if (p.length < 10) return NextResponse.json({ error: 'invalid phone' }, { status: 400 });

  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from('yeseong_site_managers')
    .select('id')
    .eq('phone', p)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ exists: !!data });
}
