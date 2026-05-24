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
  return NextResponse.json(sorted);
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

  if (worksiteIds.length > 0) {
    const rows = worksiteIds.map((wid) => ({ site_manager_id: inserted.id, worksite_id: wid }));
    const { error: asErr } = await admin.from('yeseong_site_manager_assignments').insert(rows);
    if (asErr) return NextResponse.json({ error: asErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: inserted.id }, { status: 201 });
}
