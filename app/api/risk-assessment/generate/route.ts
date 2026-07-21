import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { HAZARDS } from '@/lib/risk-assessment/hazards';
import { fillRiskAssessment, buildRaFilename, type RiskAssessmentInput } from '@/lib/excel/fill-risk-assessment';

export const runtime = 'nodejs';

type Body = {
  chasu: number;
  periodStart: string;
  periodEnd: string;
  writeDate: string;
  meetDate: string;
  worksiteName: string;
  clientName: string;
  subcontractorName: string;
  bigTrade: string;
  midTrade: string;
  trades: Array<{ trade: string; actor: string }>;
  participants: Array<{ trade: string; name: string }>;
  schedule: Array<{ trade: string; task: string; start: string; end: string }>;
};

export async function POST(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  if (!isAdminEmail(user.email)) return new NextResponse('Forbidden', { status: 403 });

  const b = (await req.json()) as Body;
  if (!b.worksiteName || !b.trades?.length) return new NextResponse('invalid input', { status: 400 });

  // 공종별 표준 위험요인 주입 (서식 한도상 최대 2블록)
  const trades = b.trades.slice(0, 2).map((t) => ({
    trade: t.trade,
    actor: t.actor,
    hazards: HAZARDS[t.trade] ?? [],
  }));

  const input: RiskAssessmentInput = {
    chasu: b.chasu,
    periodStart: b.periodStart,
    periodEnd: b.periodEnd,
    writeDate: b.writeDate,
    meetDate: b.meetDate,
    worksiteName: b.worksiteName,
    clientName: b.clientName,
    subcontractorName: b.subcontractorName,
    bigTrade: b.bigTrade || '건축',
    midTrade: b.midTrade || '습식공사',
    trades,
    participants: b.participants ?? [],
    schedule: b.schedule ?? [],
  };

  const buf = await fillRiskAssessment(input);
  const filename = buildRaFilename(b.worksiteName, b.chasu);
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
