import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { normalizePhone, phoneToManagerEmail, pinToPassword } from '@/lib/auth/phone-email';
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const admin = getServiceSupabase();

  const { data: current, error: curErr } = await admin
    .from('yeseong_site_managers')
    .select('id, phone, auth_user_id, pin, is_active')
    .eq('id', id)
    .single();
  if (curErr || !current) return NextResponse.json({ error: '팀장을 찾을 수 없음' }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (typeof body?.name === 'string' && body.name.trim()) patch.name = body.name.trim();

  // is_active 토글 — 복원/비활성 둘 다 PATCH 한 경로로 처리 (subcontractors 패턴)
  let activeChange: boolean | null = null;
  if (typeof body?.is_active === 'boolean') {
    activeChange = body.is_active;
    patch.is_active = body.is_active;
  }

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

  // is_active 변경 시 auth.users 로그인 차단 동기화
  if (activeChange !== null && current.auth_user_id) {
    const { error: banErr } = await admin.auth.admin.updateUserById(current.auth_user_id, {
      ban_duration: activeChange ? UNBAN_DURATION : SOFT_DELETE_BAN_DURATION,
    });
    if (banErr) return NextResponse.json({ error: `로그인 ${activeChange ? '복원' : '차단'} 실패: ${banErr.message}` }, { status: 500 });
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

    // 팀장도 작업자 — 담당 현장을 성과 입력 기본 현장으로 동기화 (worker는 phone으로 연결)
    await admin
      .from('yeseong_workers')
      .update({ default_worksite_id: worksiteIds.length > 0 ? worksiteIds[0] : null })
      .eq('phone', current.phone);
  }

  // 팀장 협력사 갱신 — 팀원이 팀장 협력사를 따라감 (worker.default_subcontractor_id)
  if (body != null && 'subcontractor_id' in body) {
    const subcontractorId: string | null =
      typeof body.subcontractor_id === 'string' && body.subcontractor_id ? body.subcontractor_id : null;
    await admin
      .from('yeseong_workers')
      .update({ default_subcontractor_id: subcontractorId })
      .eq('phone', current.phone);
  }

  return NextResponse.json({ ok: true });
}

// 소프트 삭제: row + auth.users 보존, is_active=false 로 비활성 + 로그인 차단
// 과거 attendance.approved_by, workers.team_leader_id 등 참조 데이터의 감사 흔적 유지
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = getServiceSupabase();

  const { data: current } = await admin
    .from('yeseong_site_managers')
    .select('auth_user_id')
    .eq('id', id)
    .single();
  if (!current) return NextResponse.json({ error: '팀장을 찾을 수 없음' }, { status: 404 });

  const { error } = await admin
    .from('yeseong_site_managers')
    .update({ is_active: false })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (current.auth_user_id) {
    const { error: banErr } = await admin.auth.admin.updateUserById(current.auth_user_id, {
      ban_duration: SOFT_DELETE_BAN_DURATION,
    });
    if (banErr) return NextResponse.json({ error: `로그인 차단 실패: ${banErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
