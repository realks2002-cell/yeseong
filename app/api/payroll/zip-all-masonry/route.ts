import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { fillMasonryPayrollWorkbook, type FillMasonryWorker } from '@/lib/excel/fill-payroll-masonry';
import { MAX_SLOTS } from '@/lib/excel/template-meta-masonry';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { getCompanySettings } from '@/lib/settings/company';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MASONRY_WAGE_TYPE = '월급/일급';

type Slot = {
  id: string;
  slot_number: number;
  daily_wage: number;
  trade: string | null;
  subcontractor_name: string | null;
  worker: {
    id: string;
    name: string;
    rrn_plain: string;
    address: string | null;
    bank_name: string | null;
    account_number: string | null;
    account_holder: string | null;
    phone: string | null;
    default_trade: string | null;
    default_wage: number;
    wage_type: string | null;
  };
  attendance: Array<{ work_date: string; hours: number }>;
  volumes: Array<{ category: string; type_name: string | null; size_spec: string | null; quantity: number; unit_price: number; amount: number }>;
};

type PayrollData = {
  period: { id: string; year_month: string };
  worksite: { id: string; name: string };
  slots: Slot[];
};

function safeFileName(s: string): string {
  return s.replace(/[\/\\:*?"<>|]/g, '_').slice(0, 100);
}

// 매사 노임대장 ZIP — 현장별 1파일 (매사 작업자만). subcontractor 지정 시 해당 전문건설사 현장만.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const yyyymm = url.searchParams.get('yyyymm') ?? '';
  const subFilter = url.searchParams.get('subcontractor') ?? '';
  if (!/^\d{4}-\d{2}$/.test(yyyymm)) {
    return new NextResponse('invalid yyyymm', { status: 400 });
  }

  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  if (!isAdminEmail(user.email)) return new NextResponse('Forbidden', { status: 403 });

  const { data: periodsRaw, error: pErr } = await sb
    .from('yeseong_payroll_periods')
    .select('id, worksite_id, yeseong_worksites!inner(name, is_active)')
    .eq('year_month', yyyymm)
    .eq('yeseong_worksites.is_active', true);
  if (pErr) return new NextResponse(pErr.message, { status: 500 });
  const periods = (periodsRaw ?? []) as unknown as Array<{
    id: string;
    worksite_id: string;
    yeseong_worksites: { name: string; is_active: boolean };
  }>;
  if (periods.length === 0) {
    return new NextResponse('no payroll data for ' + yyyymm, { status: 404 });
  }

  const settings = await getCompanySettings();
  const zip = new JSZip();
  const warnings: string[] = [];
  let totalFiles = 0;

  for (const p of periods) {
    const { data: payload, error } = await sb.rpc('yeseong_admin_get_payroll', { p_period_id: p.id });
    if (error || !payload) {
      warnings.push(`${p.yeseong_worksites.name}: RPC 실패 (${error?.message ?? 'no data'})`);
      continue;
    }
    const data = payload as unknown as PayrollData;
    const masonry = (data.slots ?? []).filter(
      (s) =>
        s.worker.wage_type === MASONRY_WAGE_TYPE &&
        (!subFilter || (s.subcontractor_name ?? '미배정') === subFilter),
    );
    if (masonry.length === 0) continue;
    if (masonry.length > MAX_SLOTS) {
      warnings.push(`${data.worksite.name}: 매사 작업자 ${masonry.length}명 (최대 ${MAX_SLOTS}명 초과로 스킵)`);
      continue;
    }

    const sorted = [...masonry].sort((a, b) =>
      a.worker.name.localeCompare(b.worker.name, 'ko'),
    );
    const workers: FillMasonryWorker[] = sorted.map((s, i) => ({
      slot: i + 1,
      trade: s.worker.default_trade,
      team: s.subcontractor_name,
      name: s.worker.name,
      rrn: s.worker.rrn_plain,
      address: s.worker.address,
      bankName: s.worker.bank_name,
      accountNumber: s.worker.account_number,
      accountHolder: s.worker.account_holder,
      phone: s.worker.phone,
      dailyWage: s.worker.default_wage,
      attendance: s.attendance.map((a) => ({
        day: parseInt(a.work_date.split('-')[2], 10),
        hours: a.hours,
      })),
      volumes: s.volumes ?? [],
    }));

    const buf = await fillMasonryPayrollWorkbook({
      yearMonth: yyyymm,
      companyName: settings.company_name,
      worksiteName: data.worksite.name,
      workers,
    });
    zip.file(safeFileName(`매사노임대장_${data.worksite.name}_${yyyymm}.xlsx`), buf);
    totalFiles++;
  }

  if (totalFiles === 0) {
    return new NextResponse('생성 가능한 매사 노임대장이 없습니다.\n' + warnings.join('\n'), { status: 400 });
  }
  if (warnings.length > 0) {
    zip.file('_경고.txt', warnings.join('\n'));
  }

  const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });
  const zipFilename = safeFileName(subFilter ? `매사노임대장_${subFilter}_${yyyymm}.zip` : `매사노임대장_전체_${yyyymm}.zip`);
  const encoded = encodeURIComponent(zipFilename);
  return new NextResponse(new Uint8Array(zipBuf), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'no-store',
    },
  });
}
