import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { idToEmail, emailToId } from '@/lib/auth/id-email';

export const runtime = 'nodejs';

// 관리자 = @yeseong.local 도메인을 가진 auth.users
export async function GET() {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = getServiceSupabase();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const admins = (data.users ?? [])
    .filter((u) => u.email?.endsWith('@yeseong.local'))
    .map((u) => ({
      id: u.id,
      login_id: emailToId(u.email!),
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      is_self: u.id === user.id,
    }))
    .sort((a, b) => a.login_id.localeCompare(b.login_id));

  return NextResponse.json(admins);
}

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const loginId = String(body?.login_id ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  if (!loginId) return NextResponse.json({ error: 'ID를 입력하세요' }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: '비밀번호는 6자 이상' }, { status: 400 });

  const admin = getServiceSupabase();
  const { data, error } = await admin.auth.admin.createUser({
    email: idToEmail(loginId),
    password,
    email_confirm: true,
  });
  if (error) {
    if (error.message.toLowerCase().includes('already')) {
      return NextResponse.json({ error: '이미 사용 중인 ID입니다' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id: data.user?.id }, { status: 201 });
}
