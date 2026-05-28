import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { normalizePhone, phoneToManagerEmail, pinToPassword } from '@/lib/auth/phone-email';
import { isAdminEmail } from '@/lib/auth/admin-guard';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const includeArchived = url.searchParams.get('includeArchived') === 'true';

  let query = sb
    .from('yeseong_site_managers')
    .select(`
      id, phone, name, pin, default_trade, is_active, created_at,
      yeseong_site_manager_assignments(
        worksite_id,
        yeseong_worksites(id, name)
      )
    `)
    .order('name', { ascending: true });

  if (!includeArchived) query = query.eq('is_active', true);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // 한글 가나다 순으로 정확히 정렬 (Postgres ORDER BY는 locale에 따라 흔들릴 수 있어 보강)
  // 비활성은 뒤로 빼서 가독성 확보
  const sorted = (data ?? []).slice().sort((a: { name: string; is_active: boolean }, b: { name: string; is_active: boolean }) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return (a.name ?? '').localeCompare(b.name ?? '', 'ko');
  });

  // 팀장 전문건설사 = 담당 현장의 전문건설사 (현장 1:1 — worksites.subcontractor_id)
  const admin = getServiceSupabase();
  const { data: wsRows } = await admin
    .from('yeseong_worksites')
    .select('id, subcontractor_id');
  const wsSubMap = new Map<string, string | null>((wsRows ?? []).map((w) => [w.id, w.subcontractor_id]));

  // 팀원수 = team_leader_id가 해당 팀장인 활성 작업자 (팀장 본인=동일 전화번호 제외 — 팀원 보기 모달과 동일 기준)
  const managerIds = sorted.map((m: { id: string }) => m.id);
  const phoneByMgr = new Map<string, string>(sorted.map((m: { id: string; phone: string }) => [m.id, m.phone]));
  const memberCount = new Map<string, number>();
  if (managerIds.length) {
    const { data: memberRows } = await admin
      .from('yeseong_workers')
      .select('team_leader_id, phone')
      .in('team_leader_id', managerIds)
      .eq('is_active', true);
    for (const r of (memberRows ?? []) as Array<{ team_leader_id: string; phone: string | null }>) {
      if (r.phone && phoneByMgr.get(r.team_leader_id) === r.phone) continue; // 본인 제외
      memberCount.set(r.team_leader_id, (memberCount.get(r.team_leader_id) ?? 0) + 1);
    }
  }

  type AssignShape =
    | Array<{ worksite_id: string }>
    | { worksite_id: string }
    | null;
  const firstWorksiteId = (a: AssignShape): string | null => {
    if (!a) return null;
    const arr = Array.isArray(a) ? a : [a];
    return arr[0]?.worksite_id ?? null;
  };

  const enriched = sorted.map((m: { id: string; yeseong_site_manager_assignments?: AssignShape }) => {
    const wsId = firstWorksiteId(m.yeseong_site_manager_assignments ?? null);
    return { ...m, subcontractor_id: wsId ? wsSubMap.get(wsId) ?? null : null, member_count: memberCount.get(m.id) ?? 0 };
  });
  return NextResponse.json(enriched);
}

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const phoneRaw = typeof body?.phone === 'string' ? body.phone : '';
  const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';
  const worksiteIds: string[] = Array.isArray(body?.worksite_ids)
    ? body.worksite_ids.filter((v: unknown) => typeof v === 'string')
    : [];

  if (!name) return NextResponse.json({ error: '성명을 입력하세요' }, { status: 400 });
  const phone = normalizePhone(phoneRaw);
  if (phone.length < 10) return NextResponse.json({ error: '전화번호 형식 오류' }, { status: 400 });
  if (pin && !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN은 4자리 숫자' }, { status: 400 });
  }

  const admin = getServiceSupabase();

  // 동일 phone 중복 체크 — 비활성 팀장과 충돌 시 친절한 안내
  const { data: existing } = await admin
    .from('yeseong_site_managers')
    .select('id, is_active')
    .eq('phone', phone)
    .maybeSingle();
  if (existing) {
    if (!existing.is_active) {
      return NextResponse.json(
        { error: '비활성 처리된 팀장과 동일한 전화번호입니다. 보관함 보기에서 복원하세요.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: '이미 등록된 전화번호' }, { status: 409 });
  }

  // PIN이 있으면 auth.users도 함께 생성 (모바일 앱 로그인 가능 상태)
  let authUserId: string | null = null;
  if (pin) {
    const { data: u, error: ue } = await admin.auth.admin.createUser({
      email: phoneToManagerEmail(phone),
      password: pinToPassword(pin),
      email_confirm: true,
      user_metadata: { phone, role: 'manager' },
    });
    if (ue) {
      if (ue.message.toLowerCase().includes('already')) {
        return NextResponse.json({ error: 'auth user 이미 존재' }, { status: 409 });
      }
      return NextResponse.json({ error: ue.message }, { status: 500 });
    }
    authUserId = u.user?.id ?? null;
  }

  const { data: inserted, error: insErr } = await admin
    .from('yeseong_site_managers')
    .insert({ auth_user_id: authUserId, phone, name, pin: pin || null })
    .select('id')
    .single();
  if (insErr) {
    // auth 생성했으면 롤백
    if (authUserId) await admin.auth.admin.deleteUser(authUserId);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // 팀장도 작업자다 — 같은 phone의 worker 행 보장 (없으면 생성, 있으면 기존 링크 유지)
  const { data: existingWorker } = await admin
    .from('yeseong_workers')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();
  if (!existingWorker) {
    const { error: wErr } = await admin
      .from('yeseong_workers')
      .insert({ name, phone, default_wage: 0 });
    if (wErr) {
      // 팀장/auth 롤백 후 실패 반환
      await admin.from('yeseong_site_managers').delete().eq('id', inserted.id);
      if (authUserId) await admin.auth.admin.deleteUser(authUserId);
      return NextResponse.json({ error: '작업자 등록 실패: ' + wErr.message }, { status: 500 });
    }
  }

  if (worksiteIds.length > 0) {
    const rows = worksiteIds.map((wid) => ({ site_manager_id: inserted.id, worksite_id: wid }));
    const { error: asErr } = await admin.from('yeseong_site_manager_assignments').insert(rows);
    if (asErr) return NextResponse.json({ error: asErr.message }, { status: 500 });

    // 팀장도 작업자 — 담당 현장 + 그 현장의 전문건설사(1:1)를 worker 행에 동기화
    const { data: ws } = await admin
      .from('yeseong_worksites')
      .select('subcontractor_id')
      .eq('id', worksiteIds[0])
      .single();
    await admin
      .from('yeseong_workers')
      .update({ default_worksite_id: worksiteIds[0], default_subcontractor_id: ws?.subcontractor_id ?? null })
      .eq('phone', phone);
  }

  return NextResponse.json({ id: inserted.id }, { status: 201 });
}
