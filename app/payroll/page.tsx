import { AdminShell } from '@/components/admin-shell';
import { getServerSupabase } from '@/lib/supabase/server';
import { currentYearMonth } from '@/lib/utils/date';
import { PayrollTabs, type WorksiteCard } from './payroll-tabs';

const MASONRY_WAGE_TYPE = '월급/일급';

type SlotRow = {
  period_id: string;
  yeseong_subcontractors: { name: string } | null;
  yeseong_workers: { wage_type: string | null } | null;
};

export default async function PayrollIndexPage() {
  const ym = currentYearMonth();
  const sb = await getServerSupabase();
  const { data: worksites, error } = await sb
    .from('yeseong_worksites')
    .select('id, name, address, is_active')
    .eq('is_active', true)
    .order('name');

  // 일급제(비-매사) 작업자 슬롯이 있는 현장 = 일반 노임대장 대상
  const normalWorksites = new Set<string>();
  // 매사 작업자(월급/일급) 슬롯이 있는 현장 = 매사 노임대장 대상
  const masonryWorksites = new Set<string>();
  // 전문건설사명은 카드 칩 표시용
  const subsByWorksite = new Map<string, string[]>();

  const { data: periods } = await sb
    .from('yeseong_payroll_periods')
    .select('id, worksite_id')
    .eq('year_month', ym);

  const periodToWorksite = new Map((periods ?? []).map((p) => [p.id, p.worksite_id]));
  if (periodToWorksite.size > 0) {
    const { data: slots } = await sb
      .from('yeseong_payroll_workers')
      .select('period_id, yeseong_subcontractors(name), yeseong_workers(wage_type)')
      .in('period_id', Array.from(periodToWorksite.keys()))
      .returns<SlotRow[]>();

    const accum = new Map<string, Set<string>>();
    for (const slot of slots ?? []) {
      const worksiteId = periodToWorksite.get(slot.period_id);
      if (!worksiteId) continue;
      if (slot.yeseong_workers?.wage_type === MASONRY_WAGE_TYPE) {
        masonryWorksites.add(worksiteId);
      } else {
        normalWorksites.add(worksiteId);
      }
      const name = slot.yeseong_subcontractors?.name;
      if (!name) continue;
      if (!accum.has(worksiteId)) accum.set(worksiteId, new Set());
      accum.get(worksiteId)!.add(name);
    }
    for (const [wsId, names] of accum) {
      subsByWorksite.set(wsId, Array.from(names).sort());
    }
  }

  const toCard = (ws: { id: string; name: string; address: string | null }): WorksiteCard => ({
    id: ws.id,
    name: ws.name,
    address: ws.address,
    subs: subsByWorksite.get(ws.id) ?? [],
  });
  const normalCards = (worksites ?? []).filter((ws) => normalWorksites.has(ws.id)).map(toCard);
  const masonryCards = (worksites ?? []).filter((ws) => masonryWorksites.has(ws.id)).map(toCard);
  const allSubs = Array.from(new Set(Array.from(subsByWorksite.values()).flat())).sort();

  return (
    <AdminShell>
      <div className="max-w-7xl p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">노임대장</h1>
          <p className="mt-1 text-sm text-[#6B7280]">유형을 선택하고 현장을 선택하여 월별 노임대장을 관리하세요.</p>
        </div>

        {error && (
          <p className="mt-4 rounded-[5px] bg-red-50 p-3 text-sm text-red-600">
            현장 목록을 불러오지 못했습니다: {error.message}
          </p>
        )}

        <PayrollTabs ym={ym} normal={normalCards} masonry={masonryCards} allSubs={allSubs} />
      </div>
    </AdminShell>
  );
}
