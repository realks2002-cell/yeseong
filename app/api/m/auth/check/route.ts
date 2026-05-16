import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/auth/phone-email';

export const runtime = 'nodejs';

type SignupStatus =
  | { mode: 'login' }
  | { mode: 'signup_new'; missing: string[] }
  | {
      mode: 'signup_partial';
      worker_id: string;
      missing: string[];
      prefilled: { name: string | null; is_foreign: boolean };
    };

export async function POST(req: Request) {
  const { phone } = await req.json().catch(() => ({}));
  const p = normalizePhone(String(phone ?? ''));
  if (p.length < 10) return NextResponse.json({ error: 'invalid phone' }, { status: 400 });

  const sb = getServiceSupabase();
  const { data, error } = await sb.rpc('yeseong_mobile_signup_status', { p_phone: p });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const status = data as SignupStatus;
  return NextResponse.json({ exists: status.mode === 'login', ...status });
}
