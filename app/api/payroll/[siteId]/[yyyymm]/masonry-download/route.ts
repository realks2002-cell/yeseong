import { NextResponse } from 'next/server';
import {
  fillMasonryPayrollWorkbook,
  buildMasonryDownloadFilename,
  type FillMasonryWorker,
} from '@/lib/excel/fill-payroll-masonry';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { getCompanySettings } from '@/lib/settings/company';
import { MAX_SLOTS } from '@/lib/excel/template-meta-masonry';
import { persistPeriodDeductions } from '@/lib/payroll/compute-period';

export const runtime = 'nodejs';

const MASONRY_WAGE_TYPE = '월급/일급';

type PayrollData = {
  period: { id: string; year_month: string };
  worksite: { id: string; name: string };
  slots: Array<{
    id: string;
    slot_number: number;
    daily_wage: number;
    trade: string | null;
    subcontractor_name: string | null;
    etc_deduction: number;
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
  if (!isAdminEmail(user.email)) return new NextResponse('Forbidden', { status: 403 });

  const { data: period } = await sb
    .from('yeseong_payroll_periods')
    .select('id')
    .eq('worksite_id', siteId)
    .eq('year_month', yyyymm)
    .single();
  if (!period) return new NextResponse('period not found', { status: 404 });

  // 매사 노임대장 다운로드 시 그 달 급여(공제) 자동 계산·저장. 실패해도 다운로드는 진행.
  try {
    await persistPeriodDeductions(period.id, sb, getServiceSupabase());
  } catch (e) {
    console.error('급여 자동 계산 실패(다운로드는 계속):', (e as Error).message);
  }

  // 일급제와 동일 RPC 사용 — 매사 작업자는 라우트에서 필터 (별도 RPC 불필요)
  const { data: payload, error } = await sb.rpc('yeseong_admin_get_payroll', { p_period_id: period.id });
  if (error) return new NextResponse(error.message, { status: 500 });
  const data = payload as unknown as PayrollData;

  const masonrySlots = (data.slots ?? []).filter((s) => s.worker.wage_type === MASONRY_WAGE_TYPE);
  if (masonrySlots.length === 0) {
    return new NextResponse('no masonry workers (월급/일급)', { status: 400 });
  }
  if (masonrySlots.length > MAX_SLOTS) {
    return new NextResponse(`too many masonry workers (max ${MAX_SLOTS})`, { status: 400 });
  }

  const sorted = [...masonrySlots].sort((a, b) =>
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
    etcDeduction: s.etc_deduction ?? 0,
    attendance: s.attendance.map((a) => ({
      day: parseInt(a.work_date.split('-')[2], 10),
      hours: a.hours,
    })),
    volumes: s.volumes ?? [],
  }));

  const settings = await getCompanySettings();
  const buf = await fillMasonryPayrollWorkbook({
    yearMonth: yyyymm,
    companyName: settings.company_name,
    worksiteName: data.worksite.name,
    workers,
  });

  const filename = buildMasonryDownloadFilename(data.worksite.name, yyyymm);
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
