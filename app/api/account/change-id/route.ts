import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { idToEmail } from '@/lib/auth/id-email';

export async function POST(req: Request) {
  const userSb = await getServerSupabase();
  const { data: { user } } = await userSb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const newId = body?.newId;
  if (typeof newId !== 'string' || !newId.trim()) {
    return NextResponse.json({ error: '새 ID가 필요합니다' }, { status: 400 });
  }

  const newEmail = idToEmail(newId);
  if (newEmail === user.email) {
    return NextResponse.json({ error: '현재 ID와 같습니다' }, { status: 400 });
  }

  const admin = getServiceSupabase();
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    email: newEmail,
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
