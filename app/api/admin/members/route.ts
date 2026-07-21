import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { idToEmail } from '@/lib/auth/id-email';
import { isMobileEmail, isManagerEmail, pinToPassword } from '@/lib/auth/phone-email';

export const runtime = 'nodejs';

async function requireAdmin() {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdminEmail(user.email)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user };
}

// GET — 전체 로그인 계정 목록 (관리자/팀장/작업자) + 이름 매핑 + 마지막 접속
export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const admin = getServiceSupabase();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const users = data.users ?? [];
  const ids = users.map((u) => u.id);

  const [{ data: workers }, { data: managers }] = await Promise.all([
    admin.from('yeseong_workers').select('auth_user_id, name, pin').in('auth_user_id', ids),
    admin.from('yeseong_site_managers').select('auth_user_id, name, pin').in('auth_user_id', ids),
  ]);
  const workerMap = new Map((workers ?? []).map((w) => [w.auth_user_id, w]));
  const managerMap = new Map((managers ?? []).map((m) => [m.auth_user_id, m]));

  const members = users.map((u) => {
    const email = u.email ?? '';
    const role = isAdminEmail(email) ? 'admin' : isManagerEmail(email) ? 'manager' : isMobileEmail(email) ? 'worker' : 'unknown';
    const linked = role === 'manager' ? managerMap.get(u.id) : role === 'worker' ? workerMap.get(u.id) : null;
    return {
      id: u.id,
      email,
      login_id: email.split('@')[0],
      role,
      name: linked?.name ?? null,
      pin: linked?.pin ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
    };
  });

  return NextResponse.json({ members, me: auth.user.id });
}

// POST — 관리자 계정 추가 { id, password }
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!id) return NextResponse.json({ error: 'ID를 입력하세요' }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다' }, { status: 400 });

  const admin = getServiceSupabase();
  const { data, error } = await admin.auth.admin.createUser({
    email: idToEmail(id),
    password,
    email_confirm: true,
  });
  if (error) {
    if (/already|exists/i.test(error.message)) {
      return NextResponse.json({ error: '이미 사용 중인 ID입니다' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.user?.id }, { status: 201 });
}

// PATCH — 작업자/팀장 PIN 재설정 { user_id, pin }
export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const userId = typeof body?.user_id === 'string' ? body.user_id : '';
  const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';
  if (!userId) return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  if (!/^\d{4}$/.test(pin)) return NextResponse.json({ error: '비밀번호는 숫자 4자리입니다' }, { status: 400 });

  const admin = getServiceSupabase();
  const { data: target, error: gErr } = await admin.auth.admin.getUserById(userId);
  if (gErr || !target?.user) return NextResponse.json({ error: '계정을 찾을 수 없습니다' }, { status: 404 });

  const email = target.user.email ?? '';
  if (!isMobileEmail(email) && !isManagerEmail(email)) {
    return NextResponse.json({ error: '작업자/팀장 계정만 비밀번호 재설정이 가능합니다' }, { status: 400 });
  }

  const { error: uErr } = await admin.auth.admin.updateUserById(userId, {
    password: pinToPassword(pin),
  });
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  // 관리자 가시성용 pin 컬럼 동기화
  if (isMobileEmail(email)) {
    await admin.from('yeseong_workers').update({ pin }).eq('auth_user_id', userId);
  } else {
    await admin.from('yeseong_site_managers').update({ pin }).eq('auth_user_id', userId);
  }

  return NextResponse.json({ ok: true });
}

// DELETE — 계정 삭제(탈퇴 처리) { user_id }. 마스터 데이터(작업자/팀장 행)는 유지
export async function DELETE(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const userId = typeof body?.user_id === 'string' ? body.user_id : '';
  if (!userId) return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  if (userId === auth.user.id) {
    return NextResponse.json({ error: '본인 계정은 삭제할 수 없습니다' }, { status: 400 });
  }

  const admin = getServiceSupabase();

  // 마스터 데이터 연결 해제 (행은 유지 — 노임/출역 이력 보존)
  await admin.from('yeseong_workers').update({ auth_user_id: null }).eq('auth_user_id', userId);
  await admin.from('yeseong_site_managers').update({ auth_user_id: null }).eq('auth_user_id', userId);

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
