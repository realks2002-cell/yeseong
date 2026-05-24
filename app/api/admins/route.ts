import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { idToEmail, emailToId } from '@/lib/auth/id-email';
import { isAdminEmail } from '@/lib/auth/admin-guard';

export const runtime = 'nodejs';

// 관리자 = @yeseong.local 도메인을 가진 auth.users
// 소프트 삭제: deleteUser 대신 banned_until=먼 미래로 설정 → 로그인 차단 + 감사 흔적 보존
export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const includeArchived = url.searchParams.get('includeArchived') === 'true';

  const admin = getServiceSupabase();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const admins = (data.users ?? [])
    .filter((u) => u.email?.endsWith('@yeseong.local'))
    .map((u) => {
      const banned = (u as { banned_until?: string | null }).banned_until ?? null;
      const isActive = !banned || new Date(banned).getTime() <= now;
      return {
        id: u.id,
        login_id: emailToId(u.email!),
        email: u.email,
        is_active: isActive,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        is_self: u.id === user.id,
      };
    })
    .filter((a) => includeArchived || a.is_active)
    .sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      return a.login_id.localeCompare(b.login_id);
    });

  return NextResponse.json(admins);
}

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const loginId = String(body?.login_id ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  if (!loginId) return NextResponse.json({ error: 'ID를 입력하세요' }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: '비밀번호는 6자 이상' }, { status: 400 });

  const admin = getServiceSupabase();
  const targetEmail = idToEmail(loginId);
  const { data, error } = await admin.auth.admin.createUser({
    email: targetEmail,
    password,
    email_confirm: true,
  });
  if (error) {
    if (error.message.toLowerCase().includes('already')) {
      // 비활성(ban) 상태인 동일 ID 가 존재하는지 확인 → 친절한 메시지
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const match = (list?.users ?? []).find((u) => u.email === targetEmail);
      const banned = match ? (match as { banned_until?: string | null }).banned_until : null;
      const isBanned = banned && new Date(banned).getTime() > Date.now();
      if (isBanned) {
        return NextResponse.json(
          { error: '비활성 처리된 관리자와 동일한 ID입니다. 보관함 보기에서 복원하세요.' },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: '이미 사용 중인 ID입니다' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id: data.user?.id }, { status: 201 });
}
