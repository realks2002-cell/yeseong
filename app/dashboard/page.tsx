'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/admin-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MOCK_COMPANY, MOCK_WORKSITES, type PayrollState } from '@/lib/mock/store';
import { useWorkers } from '@/lib/mock/use-workers';
import {
  computeKpi,
  dailyAttendance,
  loadAllPayrolls,
  monthlyTrend,
  tradeBreakdown,
  workerHoursTop,
  formatKRW,
} from '@/lib/dashboard/aggregate';
import {
  DailyAttendanceChart,
  MonthlyTrendChart,
  TradeBreakdownChart,
  WorkerHoursTopChart,
} from '@/components/dashboard/charts';
import { ChevronRight, Calendar, ChevronLeft, Users, Hourglass, CalendarDays, Wallet, TrendingUp, MapPin } from 'lucide-react';
import { formatYearMonth, shiftMonth } from '@/lib/utils/date';

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function DashboardPage() {
  const { workers } = useWorkers();
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [siteId] = useState(MOCK_WORKSITES[0]?.id ?? '');
  const [payrolls, setPayrolls] = useState<PayrollState[]>([]);

  useEffect(() => {
    setPayrolls(loadAllPayrolls(siteId));
    const onStorage = () => setPayrolls(loadAllPayrolls(siteId));
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [siteId]);

  const currentState = useMemo(
    () => payrolls.find(p => p.yearMonth === yearMonth) ?? null,
    [payrolls, yearMonth]
  );

  const kpi = useMemo(() => computeKpi(currentState, workers), [currentState, workers]);
  const daily = useMemo(() => dailyAttendance(currentState), [currentState]);
  const trade = useMemo(() => tradeBreakdown(currentState, workers), [currentState, workers]);
  const top = useMemo(() => workerHoursTop(currentState, workers, 8), [currentState, workers]);

  const trend = useMemo(() => {
    // 최근 6개월: 현재월 기준으로 -5..0
    const months: string[] = [];
    for (let i = -5; i <= 0; i++) months.push(shiftMonth(yearMonth, i));
    const trendStates = months.map(m => payrolls.find(p => p.yearMonth === m) ?? {
      companyId: MOCK_COMPANY.id,
      worksiteId: siteId,
      yearMonth: m,
      enrolledWorkerIds: [],
      attendance: [],
    });
    return monthlyTrend(trendStates, workers);
  }, [yearMonth, payrolls, workers, siteId]);

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl p-5 space-y-5">
        {/* 헤더 */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-zinc-500">{MOCK_COMPANY.name}</p>
            <h1 className="text-xl font-bold tracking-tight">대시보드</h1>
          </div>
          <MonthSwitcher value={yearMonth} onChange={setYearMonth} />
        </div>

        {/* KPI 4카드 */}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <KpiCard
            icon={<Users className="h-3.5 w-3.5" />}
            label="작업자"
            value={`${kpi.workerCount}명`}
            sub={`전체 ${workers.length}명 중`}
          />
          <KpiCard
            icon={<Hourglass className="h-3.5 w-3.5" />}
            label="총 공수"
            value={kpi.totalHours.toLocaleString()}
            sub="hours"
          />
          <KpiCard
            icon={<CalendarDays className="h-3.5 w-3.5" />}
            label="출역 인일수"
            value={`${kpi.workerDays}건`}
            sub="작업자 × 일자"
          />
          <KpiCard
            icon={<Wallet className="h-3.5 w-3.5" />}
            label="추정 임금총액"
            value={`${formatKRW(kpi.estimatedWageTotal)}원`}
            sub="공제 전"
            accent
          />
        </div>

        {/* 차트 그리드 */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2 p-4">
              <CardTitle className="text-sm">일자별 출역 ({formatYearMonth(yearMonth)})</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <DailyAttendanceChart data={daily} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 p-4">
              <CardTitle className="text-sm">공종별 공수</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <TradeBreakdownChart data={trade} />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm inline-flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-zinc-500" />
                  최근 6개월 추정 임금총액
                </CardTitle>
                <span className="text-[10px] text-zinc-500">엑셀 수식 결과와 다를 수 있음</span>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <MonthlyTrendChart data={trend} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 p-4">
              <CardTitle className="text-sm">작업자별 공수 Top 8</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <WorkerHoursTopChart data={top} />
            </CardContent>
          </Card>
        </div>

        {/* 현장 카드 (기존) */}
        <div>
          <h2 className="text-xs font-semibold text-zinc-700 mb-2">현장</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {MOCK_WORKSITES.map(ws => (
              <Card key={ws.id}>
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
                    <MapPin className="h-3.5 w-3.5" />
                    현장
                  </div>
                  <CardTitle className="text-base">{ws.name}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-2.5">
                  <Link href={`/payroll/${ws.id}/${yearMonth}`}>
                    <Button size="sm" className="w-full justify-between">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {yearMonth} 노임대장 열기
                      </span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function MonthSwitcher({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-zinc-200 bg-white p-0.5">
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
