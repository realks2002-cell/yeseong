import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';

// PATCH: 출역 셀 단일 저장 — { payroll_worker_id, day, hours }
// hours = 0 이면 DELETE, 그 외엔 UPSERT (체크 조건 0 < h <= 3.0)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ siteId: string; yyyymm: string }> },
) {
  const { yyyymm } = await params;
  if (!/^\d{4}-\d{2}$/.test(yyyymm)) {
    return NextResponse.json({ error: 'invalid yyyymm' }, { status: 400 });
  }

  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const pwId = typeof body?.payroll_worker_id === 'string' ? body.payroll_worker_id : null;
  const day = typeof body?.day === 'number' ? body.day : null;
  const hours = typeof body?.hours === 'number' ? body.hours : null;
  if (!pwId || day === null || hours === null) {
    return NextResponse.json({ error: 'payroll_worker_id, day, hours 필요' }, { status: 400 });
  }
  if (day < 1 || day > 31) {
    return NextResponse.json({ error: 'day 범위 1~31' }, { status: 400 });
  }
  if (hours < 0 || hours > 3.0) {
    return NextResponse.json({ error: 'hours 범위 0~3.0' }, { status: 400 });
  }

  // 'YYYY-MM-DD' 직접 빌드 — TZ 무관
  const [y, m] = yyyymm.split('-').map(Number);
  const workDateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  if (hours === 0) {
    const { error } = await sb
      .from('yeseong_attendance')
      .delete()
      .eq('payroll_worker_id', pwId)
      .eq('work_date', workDateStr);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: true });
  }

  const { data, error } = await sb
    .from('yeseong_attendance')
    .upsert(
      {
        payroll_worker_id: pwId,
        work_date: workDateStr,
        hours,
        source: 'manual',
        approval_status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      },
      { onConflict: 'payroll_worker_id,work_date' },
    )
    .select('id, work_date, hours')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
