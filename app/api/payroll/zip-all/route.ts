import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { fillPayrollWorkbook, type FillWorker } from '@/lib/excel/fill-payroll';
import { periodRange } from '@/lib/utils/date';
import { getServerSupabase } from '@/lib/supabase/server';
import { getCompanySettings } from '@/lib/settings/company';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
  };
  attendance: Array<{ work_date: string; hours: number }>;
};

type PayrollData = {
  period: { id: string; year_month: string };
  worksite: { id: string; name: string };
  slots: Slot[];
};

function safeFileName(s: string): string {
  return s.replace(/[\/\\:*?"<>|]/g, '_').slice(0, 100);
}

function toFillWorker(s: Slot, slotIdx: number): FillWorker {
  return {
    slot: slotIdx,
    trade: s.trade ?? s.worker.default_trade,
    name: s.worker.name,
    rrn: s.worker.rrn_plain,
    address: s.worker.address,
    bankName: s.worker.bank_name,
    accountNumber: s.worker.account_number,
    accountHolder: s.worker.account_holder,
    phone: s.worker.phone,
    dailyWage: s.daily_wage,
    attendance: s.attendance.map((a) => ({
      day: parseInt(a.work_date.split('-')[2], 10),
      hours: a.hours,
    })),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const yyyymm = url.searchParams.get('yyyymm') ?? '';
  if (!/^\d{4}-\d{2}$/.test(yyyymm)) {
    return new NextResponse('invalid yyyymm', { status: 400 });
  }

  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

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

  const { start, end } = periodRange(yyyymm);
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
    if (!data.slots || data.slots.length === 0) continue;

    const wsFolder = zip.folder(safeFileName(data.worksite.name));
    if (!wsFolder) continue;

    const groups = new Map<string, Slot[]>();
    for (const s of data.slots) {
      const key = s.subcontractor_name ?? '미배정';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }

    for (const [subName, groupSlots] of groups) {
      if (groupSlots.length > 26) {
        warnings.push(`${data.worksite.name} / ${subName}: 슬롯 ${groupSlots.length}명 (26 초과로 스킵)`);
        continue;
      }
      const fillWorkers = groupSlots.map((s, i) => toFillWorker(s, i + 1));
      const buf = await fillPayrollWorkbook({
        yearMonth: yyyymm,
        periodStart: start,
        periodEnd: end,
        companyName: settings.company_name,
        subcontractorName: subName === '미배정' ? undefined : subName,
        worksiteName: data.worksite.name,
        workers: fillWorkers,
      });
      const innerName = safeFileName(`노임대장_${subName}_${yyyymm}.xlsx`);
      wsFolder.file(innerName, buf);
      totalFiles++;
    }
  }

  if (totalFiles === 0) {
    return new NextResponse('생성 가능한 노임대장이 없습니다.\n' + warnings.join('\n'), { status: 400 });
  }

  if (warnings.length > 0) {
    zip.file('_경고.txt', warnings.join('\n'));
  }

  const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });
  const zipFilename = safeFileName(`노임대장_전체_${yyyymm}.zip`);
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
