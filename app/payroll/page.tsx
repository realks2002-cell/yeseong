import Link from 'next/link';
import { AdminShell } from '@/components/admin-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, Calendar, ChevronRight, MapPin } from 'lucide-react';
import { getServerSupabase } from '@/lib/supabase/server';
import { ZipAllButton } from './zip-all-button';

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

type SlotRow = {
  period_id: string;
  yeseong_subcontractors: { name: string } | null;
};

export default async function PayrollIndexPage() {
  const ym = currentYearMonth();
  const sb = await getServerSupabase();
  const { data: worksites, error } = await sb
    .from('yeseong_worksites')
    .select('id, name, address, is_active')
    .eq('is_active', true)
    .order('name');

  // 이번 달 노임대장 슬롯의 협력사 → 현장별 distinct 목록
  const subsByWorksite = new Map<string, string[]>();
  const { data: periods } = await sb
    .from('yeseong_payroll_periods')
    .select('id, worksite_id')
    .eq('year_month', ym);

  const periodToWorksite = new Map((periods ?? []).map((p) => [p.id, p.worksite_id]));
  if (periodToWorksite.size > 0) {
    const { data: slots } = await sb
      .from('yeseong_payroll_workers')
      .select('period_id, yeseong_subcontractors(name)')
      .in('period_id', Array.from(periodToWorksite.keys()))
      .returns<SlotRow[]>();

    const accum = new Map<string, Set<string>>();
    for (const slot of slots ?? []) {
      const worksiteId = periodToWorksite.get(slot.period_id);
      const name = slot.yeseong_subcontractors?.name;
      if (!worksiteId || !name) continue;
      if (!accum.has(worksiteId)) accum.set(worksiteId, new Set());
      accum.get(worksiteId)!.add(name);
    }
    for (const [wsId, names] of accum) {
      subsByWorksite.set(wsId, Array.from(names).sort());
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">노임대장</h1>
            <p className="text-sm text-[#6B7280] mt-1">현장을 선택하여 월별 노임대장을 관리하세요.</p>
          </div>
          <ZipAllButton yyyymm={ym} />
        </div>

        {error && (
          <p className="mt-4 rounded-[5px] bg-red-50 p-3 text-sm text-red-600">
            현장 목록을 불러오지 못했습니다: {error.message}
          </p>
        )}

        {(() => {
          const visible = (worksites ?? []).filter((ws) => subsByWorksite.has(ws.id));
          if (visible.length === 0) {
            return (
              <p className="mt-10 text-center text-sm text-[#9CA3AF]">
                {ym} 노임대장 데이터가 있는 현장이 없습니다.
              </p>
            );
          }
          return (
            <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {visible.map((ws) => (
                <Card key={ws.id}>
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center gap-1.5 text-[#6B7280] text-xs">
                      <MapPin className="h-3.5 w-3.5" />
                      현장
                    </div>
                    <CardTitle className="text-base">{ws.name}</CardTitle>
                    {ws.address && (
                      <p className="text-[11px] text-[#6B7280] line-clamp-1">{ws.address}</p>
                    )}
                    {(() => {
                      const subs = subsByWorksite.get(ws.id);
                      if (!subs || subs.length === 0) return null;
                      return (
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          <Building2 className="h-3 w-3 text-[#9CA3AF]" />
                          {subs.map((name) => (
                            <span
                              key={name}
                              className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-blue-100"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <Link href={`/payroll/${ws.id}/${ym}`}>
                      <Button size="sm" className="w-full justify-between">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {ym} 노임대장 열기
                        </span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          );
        })()}
      </div>
    </AdminShell>
  );
}
