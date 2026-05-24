import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { idToEmail } from '@/lib/auth/id-email';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { SOFT_DELETE_BAN_DURATION, UNBAN_DURATION } from '@/lib/auth/ban';

export const runtime = 'nodejs';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const patch: { email?: string; password?: string; ban_duration?: string } = {};

  if (typeof body?.login_id === 'string' && body.login_id.trim()) {
    patch.email = idToEmail(body.login_id.trim().toLowerCase());
  }
  if (typeof body?.password === 'string' && body.password.length > 0) {
    if (body.password.length < 6) {
      return NextResponse.json({ error: '비밀번호는 6자 이상' }, { status: 400 });
    }
    patch.password = body.password;
  }
  // is_active 토글 — 활성/비활성을 ban_duration 으로 표현
  if (typeof body?.is_active === 'boolean') {
    if (!body.is_active && id === user.id) {
      return NextResponse.json({ error: '본인은 비활성 처리할 수 없습니다' }, { status: 400 });
    }
    patch.ban_duration = body.is_active ? UNBAN_DURATION : SOFT_DELETE_BAN_DURATION;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 필드가 없습니다' }, { status: 400 });
  }

  const admin = getServiceSupabase();
  const { error } = await admin.auth.admin.updateUserById(id, {
    ...patch,
    email_confirm: true,
  });
  if (error) {
    if (error.message.toLowerCase().includes('already') || error.message.toLowerCase().includes('exists')) {
      return NextResponse.json({ error: '이미 사용 중인 ID입니다' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// 소프트 삭제: deleteUser 대신 banned_until=100년 으로 로그인 차단
// 다른 테이블의 approved_by, uploader_id 등 감사 흔적 유지
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (id === user.id) {
    return NextResponse.json({ error: '본인은 비활성 처리할 수 없습니다' }, { status: 400 });
  }

  const admin = getServiceSupabase();
  const { error } = await admin.auth.admin.updateUserById(id, {
    ban_duration: SOFT_DELETE_BAN_DURATION,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
