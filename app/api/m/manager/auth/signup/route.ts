import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';
import { normalizePhone, phoneToManagerEmail, pinToPassword } from '@/lib/auth/phone-email';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const phone = normalizePhone(String(body.phone ?? ''));
  const pin = String(body.pin ?? '');

  if (phone.length < 10) return NextResponse.json({ error: 'invalid phone' }, { status: 400 });
  if (!/^\d{4}$/.test(pin)) return NextResponse.json({ error: 'invalid pin' }, { status: 400 });

  const sb = getServiceSupabase();
  const { data, error } = await sb.auth.admin.createUser({
    email: phoneToManagerEmail(phone),
    password: pinToPassword(pin),
    email_confirm: true,
    user_metadata: { phone, role: 'manager' },
  });

  if (error) {
    if (error.message.toLowerCase().includes('already')) {
      return NextResponse.json({ error: 'already_registered' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, user_id: data.user?.id });
}
