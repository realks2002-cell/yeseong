import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { parseDeductions } from '@/lib/excel/parse-deductions';
import { computePeriodDeductions } from '@/lib/payroll/compute-period';
import type { DeductionResult } from '@/lib/payroll/deductions';

export const runtime = 'nodejs';

const FIELDS: Array<[keyof DeductionResult, string]> = [
  ['income_tax', '소득세'],
  ['resident_tax', '주민세'],
  ['employment_ins', '고용보험'],
  ['pension', '연금보험'],
  ['health_ins', '건강보험'],
  ['longterm_care', '장기요양'],
];

// 서버 계산 vs 업로드 엑셀 대조 — 차이만 리포트(저장하지 않음)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string; yyyymm: string }> },
) {
  const { siteId, yyyymm } = await params;
  if (!/^\d{4}-\d{2}$/.test(yyyymm)) return NextResponse.json({ error: 'invalid yyyymm' }, { status: 400 });

  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: period } = await sb
    .from('yeseong_payroll_periods')
    .select('id')
    .eq('worksite_id', siteId)
    .eq('year_month', yyyymm)
    .single();
  if (!period) return NextResponse.json({ error: '해당 월의 노임대장이 없습니다.' }, { status: 404 });

  // 엑셀 파싱
  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) return NextResponse.json({ error: '빈 파일입니다.' }, { status: 400 });
  let parsed;
  try {
    parsed = await parseDeductions(buf);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  if (parsed.uncomputed) {
    return NextResponse.json(
      { error: '엑셀에서 한 번 열어 저장한 뒤 대조해 주세요. (공제 수식 계산값이 비어 있습니다)' },
      { status: 400 },
    );
  }

  // 서버 계산
  const svc = getServiceSupabase();
  let server;
  try {
    server = await computePeriodDeductions(period.id, sb, svc);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  const serverByRrn = new Map(server.map((r) => [r.rrn, r]));

  const mismatches: Array<{ name: string; field: string; server: number; excel: number }> = [];
  let matched = 0;
  const onlyInExcel: string[] = [];

  for (const ex of parsed.rows) {
    const sv = serverByRrn.get(ex.rrn);
    if (!sv) {
      onlyInExcel.push(ex.name ?? ex.rrn);
      continue;
    }
    matched += 1;
    for (const [key, label] of FIELDS) {
      const a = sv.deductions[key];
      const b = ex[key];
      if (a !== b) mismatches.push({ name: sv.name, field: label, server: a, excel: b });
    }
  }

  return NextResponse.json({
    type: parsed.type,
    matched,
    ok: mismatches.length === 0 && onlyInExcel.length === 0,
    mismatches,
    onlyInExcel,
  });
}
