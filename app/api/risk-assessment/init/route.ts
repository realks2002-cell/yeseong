import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import { normalizeTrade } from '@/lib/risk-assessment/hazards';

export const runtime = 'nodejs';

// Supabase 임베드 관계는 배열/객체 모두로 추론될 수 있어 안전하게 이름 추출
function relName(v: unknown): string {
  if (Array.isArray(v)) return (v[0] as { name?: string } | undefined)?.name ?? '';
  return (v as { name?: string } | null)?.name ?? '';
}

// GET /api/risk-assessment/init            → 활성 현장 목록
// GET /api/risk-assessment/init?siteId=..  → 현장 상세 + 공종·참석자(배정 작업자)
export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  if (!isAdminEmail(user.email)) return new NextResponse('Forbidden', { status: 403 });

  const siteId = new URL(req.url).searchParams.get('siteId');

  if (!siteId) {
    const { data, error } = await sb
      .from('yeseong_worksites')
      .select('id, name, is_active, client:yeseong_clients(name), subcontractor:yeseong_subcontractors(name)')
      .eq('is_active', true)
      .order('name');
    if (error) return new NextResponse(error.message, { status: 500 });
    const sites = (data ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      client: relName(w.client),
      subcontractor: relName(w.subcontractor) || '(주)예성건축',
    }));
    return NextResponse.json({ sites });
  }

  const { data: site, error: sErr } = await sb
    .from('yeseong_worksites')
    .select('id, name, client:yeseong_clients(name), subcontractor:yeseong_subcontractors(name)')
    .eq('id', siteId)
    .single();
  if (sErr || !site) return new NextResponse('site not found', { status: 404 });

  const { data: workers } = await sb
    .from('yeseong_workers')
    .select('name, default_trade, skill_grade')
    .eq('default_worksite_id', siteId)
    .eq('is_active', true)
    .order('skill_grade', { ascending: false });

  // 참석자 = 배정 작업자 전체(직종·성명)
  const participants = (workers ?? []).map((w) => ({
    trade: w.default_trade ?? '',
    name: w.name,
  }));

  // 공종 = 정규화된 대표 공종별로 그룹, 조치자 = 그 공종 팀장(없으면 첫 작업자)
  const tradeMap = new Map<string, string>(); // normalizedTrade -> actor
  for (const w of workers ?? []) {
    const nt = normalizeTrade(w.default_trade);
    if (!nt) continue;
    if (!tradeMap.has(nt) || w.skill_grade === '팀장') tradeMap.set(nt, w.name);
  }
  const trades = [...tradeMap.entries()].map(([trade, actor]) => ({ trade, actor }));

  return NextResponse.json({
    site: {
      id: site.id,
      name: site.name,
      client: relName(site.client),
      subcontractor: relName(site.subcontractor) || '(주)예성건축',
    },
    trades,
    participants,
  });
}
