import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token, deviceType, appType } = await req.json();
  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  const { error } = await sb.rpc('yeseong_register_fcm_token', {
    p_token: token,
    p_device_type: deviceType ?? 'android',
    p_app_type: appType ?? 'worker',
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
