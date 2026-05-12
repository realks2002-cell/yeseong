import { NextResponse } from 'next/server';
import { fillPayrollWorkbook, buildDownloadFilename, type FillWorker } from '@/lib/excel/fill-payroll';
import { getMockWorksite, MOCK_COMPANY, type MockWorker, type PayrollState } from '@/lib/mock/store';
import { periodRange } from '@/lib/utils/date';

export const runtime = 'nodejs';

type Body = {
  state: PayrollState;
  workers: MockWorker[];   // 클라이언트의 최신 작업자 마스터(편집 반영)
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string; yyyymm: string }> }
) {
  const { siteId, yyyymm } = await params;
  const ws = getMockWorksite(siteId);
  if (!ws) return new NextResponse('worksite not found', { status: 404 });
  if (!/^\d{4}-\d{2}$/.test(yyyymm)) return new NextResponse('invalid yyyymm', { status: 400 });

  let payload: Body;
  try {
    payload = (await req.json()) as Body;
  } catch {
    return new NextResponse('invalid json', { status: 400 });
  }
  if (!payload?.state || !Array.isArray(payload.workers)) {
    return new NextResponse('invalid body', { status: 400 });
  }

  const enrolled = payload.state.enrolledWorkerIds
    .map(id => payload.workers.find(w => w.id === id))
    .filter((w): w is MockWorker => !!w);

  if (enrolled.length === 0) {
    return new NextResponse('no enrolled workers', { status: 400 });
  }
  if (enrolled.length > 26) {
    return new NextResponse('too many workers (max 26)', { status: 400 });
  }

  const workersForFill: FillWorker[] = enrolled.map((w, i) => {
    const slot = i + 1;
    const attendance = payload.state.attendance
      .filter(a => a.workerId === w.id)
      .map(a => ({ day: a.day, hours: a.hours }));
    return {
      slot,
      trade: w.defaultTrade,
      name: w.name,
      rrn: w.rrn,
      address: w.address,
      bankName: w.bankName,
      accountNumber: w.accountNumber,
      accountHolder: w.accountHolder,
      phone: w.phone,
      dailyWage: w.defaultWage,
      attendance,
    };
  });

  const { start, end } = periodRange(yyyymm);

  const buf = await fillPayrollWorkbook({
    yearMonth: yyyymm,
    periodStart: start,
    periodEnd: end,
    companyName: MOCK_COMPANY.name,
    worksiteName: ws.name,
    workers: workersForFill,
  });

  const filename = buildDownloadFilename(ws.name, yyyymm);
  const encoded = encodeURIComponent(filename);
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  const blob = new Blob([ab], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  return new NextResponse(blob, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'no-store',
    },
  });
}
