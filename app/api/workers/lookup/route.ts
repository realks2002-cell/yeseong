import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { normalizePhone } from '@/lib/auth/phone-email';

// 전화번호로 작업자 마스터 조회 (팀장 추가 시 이름·직종 자동 채움용). 최소 필드만 반환.
export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const phone = normalizePhone(new URL(req.url).searchParams.get('phone') ?? '');
  if (phone.length < 10) return NextResponse.json({ exists: false });

  const { data } = await sb
    .from('yeseong_workers')
    .select('name, default_trade')
    .eq('phone', phone)
    .maybeSingle();

  if (!data) return NextResponse.json({ exists: false });
  return NextResponse.json({ exists: true, name: data.name, default_trade: data.default_trade });
}
