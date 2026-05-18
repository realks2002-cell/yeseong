import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { normalizePhone, phoneToManagerEmail, pinToPassword } from '@/lib/auth/phone-email';

export const runtime = 'nodejs';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const admin = getServiceSupabase();

  const { data: current, error: curErr } = await admin
    .from('yeseong_site_managers')
    .select('id, phone, auth_user_id, pin')
    .eq('id', id)
    .single();
  if (curErr || !current) return NextResponse.json({ error: '팀장을 찾을 수 없음' }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (typeof body?.name === 'string' && body.name.trim()) patch.name = body.name.trim();

  let newPhone: string | null = null;
  if (typeof body?.phone === 'string') {
    newPhone = normalizePhone(body.phone);
    if (newPhone.length < 10) return NextResponse.json({ error: '전화번호 형식 오류' }, { status: 400 });
    if (newPhone !== current.phone) {
      const { data: dup } = await admin
        .from('yeseong_site_managers')
        .select('id')
        .eq('phone', newPhone)
        .neq('id', id)
        .maybeSingle();
      if (dup) return NextResponse.json({ error: '이미 등록된 전화번호' }, { status: 409 });
      patch.phone = newPhone;
    }
  }

  let newPin: string | null = null;
  if (typeof body?.pin === 'string') {
    const p = body.pin.trim();
    if (p && !/^\d{4}$/.test(p)) return NextResponse.json({ error: 'PIN은 4자리 숫자' }, { status: 400 });
    newPin = p;
    patch.pin = p || null;
  }

  // auth.users 처리 — phone/pin 변경 시
  if (newPhone || newPin !== null) {
    if (current.auth_user_id) {
      const authUpdate: { email?: string; password?: string } = {};
      if (newPhone && newPhone !== current.phone) authUpdate.email = phoneToManagerEmail(newPhone);
      if (newPin) authUpdate.password = pinToPassword(newPin);
      if (Object.keys(authUpdate).length > 0) {
        const { error: aue } = await admin.auth.admin.updateUserById(current.auth_user_id, authUpdate);
        if (aue) return NextResponse.json({ error: `auth 갱신 실패: ${aue.message}` }, { status: 500 });
      }
    } else if (newPin) {
      // shell 행에 PIN 추가 — auth.users 신규 생성
      const finalPhone = newPhone ?? current.phone;
      const { data: u, error: ue } = await admin.auth.admin.createUser({
        email: phoneToManagerEmail(finalPhone),
        password: pinToPassword(newPin),
        email_confirm: true,
        user_metadata: { phone: finalPhone, role: 'manager' },
      });
      if (ue) return NextResponse.json({ error: `auth 생성 실패: ${ue.message}` }, { status: 500 });
      patch.auth_user_id = u.user?.id;
    }
  }

  if (Object.keys(patch).length > 0) {
    const { error: upErr } = await admin
      .from('yeseong_site_managers')
      .update(patch)
      .eq('id', id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // 담당 현장 갱신 (전체 교체)
  if (Array.isArray(body?.worksite_ids)) {
    const worksiteIds = body.worksite_ids.filter((v: unknown) => typeof v === 'string') as string[];
    await admin.from('yeseong_site_manager_assignments').delete().eq('site_manager_id', id);
    if (worksiteIds.length > 0) {
      const rows = worksiteIds.map((wid) => ({ site_manager_id: id, worksite_id: wid }));
      const { error: asErr } = await admin.from('yeseong_site_manager_assignments').insert(rows);
      if (asErr) return NextResponse.json({ error: asErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = getServiceSupabase();

  const { data: current } = await admin
    .from('yeseong_site_managers')
    .select('auth_user_id')
    .eq('id', id)
    .single();

  const { error } = await admin.from('yeseong_site_managers').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (current?.auth_user_id) {
    await admin.auth.admin.deleteUser(current.auth_user_id);
  }

  return NextResponse.json({ ok: true });
}
