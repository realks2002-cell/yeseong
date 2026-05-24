import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await sb
    .from('yeseong_workers')
    .select(`
      id, employee_code, name, name_english,
      rrn_prefix, rrn_gender_digit, rrn_plain, pin, is_foreign,
      address, bank_name, account_number, account_holder, phone,
      default_wage, default_trade, skill_grade, wage_type,
      first_work_date, nationality, visa_status, is_active, created_at,
      auth_user_id, team_leader_id,
      team_leader:yeseong_site_managers!yeseong_workers_team_leader_id_fkey(id, name)
    `)
    .eq('is_active', true)
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // team_leader join → team_leader_name 평면 필드로
  const flat = (data ?? []).map((w) => {
    const leader = Array.isArray(w.team_leader) ? w.team_leader[0] : w.team_leader;
    return { ...w, team_leader_name: leader?.name ?? null };
  });
  return NextResponse.json(flat);
}

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const rrn = typeof body?.rrn === 'string' ? body.rrn.trim() : '';
  if (!name) return NextResponse.json({ error: '성명을 입력하세요' }, { status: 400 });
  if (!/^\d{6}-?\d{7}$/.test(rrn)) {
    return NextResponse.json({ error: '주민번호 형식 오류 (000000-0000000)' }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0);

  const { data, error } = await sb.rpc('yeseong_admin_insert_worker', {
    p_name: name,
    p_rrn_plain: rrn,
    p_employee_code: str(body.employee_code),
    p_address: str(body.address),
    p_bank_name: str(body.bank_name),
    p_account_number: str(body.account_number),
    p_account_holder: str(body.account_holder),
    p_phone: str(body.phone),
    p_default_wage: num(body.default_wage),
    p_default_trade: str(body.default_trade),
    p_skill_grade: str(body.skill_grade),
    p_wage_type: str(body.wage_type),
    p_team_leader_id: str(body.team_leader_id),
  });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 등록된 사번 또는 동일인입니다' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data }, { status: 201 });
}
