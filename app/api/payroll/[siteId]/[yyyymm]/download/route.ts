import { NextResponse } from 'next/server';
import { fillPayrollWorkbook, buildDownloadFilename, type FillWorker } from '@/lib/excel/fill-payroll';
import { periodRange } from '@/lib/utils/date';
import { getServerSupabase } from '@/lib/supabase/server';
import { getCompanySettings } from '@/lib/settings/company';

export const runtime = 'nodejs';

type PayrollData = {
  period: { id: string; year_month: string };
  worksite: { id: string; name: string };
  slots: Array<{
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
    };
    attendance: Array<{ work_date: string; hours: number }>;
  }>;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string; yyyymm: string }> },
) {
  const { siteId, yyyymm } = await params;
  if (!/^\d{4}-\d{2}$/.test(yyyymm)) return new NextResponse('invalid yyyymm', { status: 400 });

  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { data: period } = await sb
    .from('yeseong_payroll_periods')
    .select('id')
    .eq('worksite_id', siteId)
    .eq('year_month', yyyymm)
    .single();
  if (!period) return new NextResponse('period not found', { status: 404 });

  const { data: payload, error } = await sb.rpc('yeseong_admin_get_payroll', { p_period_id: period.id });
  if (error) return new NextResponse(error.message, { status: 500 });
  const data = payload as unknown as PayrollData;
  if (!data.slots || data.slots.length === 0) {
    return new NextResponse('no enrolled workers', { status: 400 });
  }
  if (data.slots.length > 32) {
    return new NextResponse('too many workers (max 32)', { status: 400 });
  }

  const sortedSlots = [...data.slots].sort((a, b) =>
    a.worker.name.localeCompare(b.worker.name, 'ko'),
  );
  const fillWorkers: FillWorker[] = sortedSlots.map((s, i) => ({
    slot: i + 1,
    trade: s.worker.default_trade,
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
  }));

  const { start, end } = periodRange(yyyymm);
  const settings = await getCompanySettings();
  // 단일 파일 다운로드: 모든 슬롯의 협력사가 동일하면 그 협력사명을 "상 호"에 사용
  const uniqueSubs = new Set(
    data.slots
      .map((s) => s.subcontractor_name)
      .filter((v): v is string => !!v),
  );
  const subcontractorName = uniqueSubs.size === 1 ? Array.from(uniqueSubs)[0] : undefined;
  const buf = await fillPayrollWorkbook({
    yearMonth: yyyymm,
    periodStart: start,
    periodEnd: end,
    companyName: settings.company_name,
    subcontractorName,
    worksiteName: data.worksite.name,
    workers: fillWorkers,
  });

  const filename = buildDownloadFilename(data.worksite.name, yyyymm);
  const encoded = encodeURIComponent(filename);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'no-store',
    },
  });
}
