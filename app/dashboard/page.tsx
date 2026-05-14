'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/admin-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ChevronRight,
  Calendar,
  ChevronLeft,
  Users,
  Hourglass,
  CalendarDays,
  Wallet,
  MapPin,
  Building2,
} from 'lucide-react';
import { formatYearMonth, shiftMonth } from '@/lib/utils/date';

type Worksite = { id: string; name: string; address: string | null; is_active: boolean };
type Trade = { trade: string; hours: number };
type Dashboard = {
  yearMonth: string;
  kpi: {
    workerCount: number;
    worksiteCount: number;
    totalHours: number;
    workerDays: number;
    estimatedWageTotal: number;
  };
  worksites: Worksite[];
  tradeBreakdown: Trade[];
};

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatKRW(n: number): string {
  return n.toLocaleString();
}

export default function DashboardPage() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const r = await fetch(`/api/dashboard?yearMonth=${yearMonth}`, { cache: 'no-store' });
    if (!r.ok) {
      setError(`로드 실패: ${r.status}`);
      return;
    }
    setData(await r.json());
  }, [yearMonth]);

  useEffect(() => { load(); }, [load]);

  const kpi = data?.kpi;
  const trades = data?.tradeBreakdown ?? [];
  const maxTrade = Math.max(1, ...trades.map((t) => t.hours));

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl p-5 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-zinc-500">(주)예성건축</p>
            <h1 className="text-xl font-bold tracking-tight">대시보드</h1>
          </div>
          <MonthSwitcher value={yearMonth} onChange={setYearMonth} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <KpiCard
            icon={<Users className="h-3.5 w-3.5" />}
            label="등록 작업자"
            value={`${kpi?.workerCount ?? 0}명`}
            sub="DB 전체"
          />
          <KpiCard
            icon={<Building2 className="h-3.5 w-3.5" />}
            label="활성 현장"
            value={`${kpi?.worksiteCount ?? 0}곳`}
            sub="활성"
          />
          <KpiCard
            icon={<Hourglass className="h-3.5 w-3.5" />}
            label="총 공수"
            value={(kpi?.totalHours ?? 0).toLocaleString()}
            sub={`인일수 ${kpi?.workerDays ?? 0}건`}
          />
          <KpiCard
            icon={<Wallet className="h-3.5 w-3.5" />}
            label="추정 임금총액"
            value={`${formatKRW(kpi?.estimatedWageTotal ?? 0)}원`}
            sub="공제 전"
            accent
          />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2 p-4">
              <CardTitle className="text-sm">공종별 공수 ({formatYearMonth(yearMonth)})</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {trades.length === 0 ? (
                <p className="py-8 text-center text-xs text-zinc-400">출역 데이터가 없습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {trades.map((t) => (
                    <li key={t.trade} className="flex items-center gap-3 text-xs">
                      <span className="w-20 shrink-0 truncate text-zinc-700">{t.trade}</span>
                      <div className="relative flex-1 h-5 rounded bg-zinc-100">
                        <div
                          className="absolute inset-y-0 left-0 rounded bg-zinc-900"
                          style={{ width: `${(t.hours / maxTrade) * 100}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right tabular-nums text-zinc-600">
                        {t.hours.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 p-4">
              <CardTitle className="text-sm">바로가기</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              <Link href="/workers"><Button variant="outline" size="sm" className="w-full justify-between">작업자 관리<ChevronRight className="h-3.5 w-3.5" /></Button></Link>
              <Link href="/worksites"><Button variant="outline" size="sm" className="w-full justify-between">현장 관리<ChevronRight className="h-3.5 w-3.5" /></Button></Link>
              <Link href="/subcontractors"><Button variant="outline" size="sm" className="w-full justify-between">협력사 관리<ChevronRight className="h-3.5 w-3.5" /></Button></Link>
              <Link href="/payroll"><Button variant="outline" size="sm" className="w-full justify-between">노임대장<ChevronRight className="h-3.5 w-3.5" /></Button></Link>
            </CardContent>
          </Card>
        </div>

      </div>
    </AdminShell>
  );
}

function MonthSwitcher({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-[5px] border border-zinc-200 bg-white p-0.5">
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onChange(shiftMonth(value, -1))} aria-label="이전 달">
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <span className="px-1.5 text-xs font-medium tabular-nums">{formatYearMonth(value)}</span>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onChange(shiftMonth(value, 1))} aria-label="다음 달">
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? 'bg-zinc-900 text-white border-zinc-900' : ''}>
      <CardContent className="p-4">
        <div className={`flex items-center gap-1 text-[11px] ${accent ? 'text-zinc-300' : 'text-zinc-500'}`}>
          {icon}
          {label}
        </div>
        <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
        {sub && <p className={`text-[10px] mt-0.5 ${accent ? 'text-zinc-400' : 'text-zinc-500'}`}>{sub}</p>}
      </CardContent>
    </Card>
  );
}

