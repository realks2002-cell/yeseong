'use client';
// 대시보드용 집계: localStorage의 노임대장 상태들을 읽어 KPI/차트 데이터 생성
// 계산은 단순 곱셈/합계만. 공제·세금은 코드에서 계산하지 않음 (엑셀 수식 영역)
import type { MockWorker, PayrollState } from '@/lib/mock/store';
import { daysInMonth } from '@/lib/utils/date';

const PAYROLL_PREFIX = 'yeseong:payroll:';

export function loadAllPayrolls(siteId: string): PayrollState[] {
  if (typeof window === 'undefined') return [];
  const list: PayrollState[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    const prefix = `${PAYROLL_PREFIX}${siteId}:`;
    if (!k.startsWith(prefix)) continue;
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      list.push(JSON.parse(raw) as PayrollState);
    } catch {
      // skip corrupt
    }
  }
  return list.sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}

export type Kpi = {
  workerCount: number;       // 등록 인원
  totalHours: number;        // SUM(hours)
  workerDays: number;        // attendance 행 수 (사람×날 수)
  estimatedWageTotal: number;// Σ(daily_wage × hours)
};

export function computeKpi(state: PayrollState | null, workers: MockWorker[]): Kpi {
  if (!state) return { workerCount: 0, totalHours: 0, workerDays: 0, estimatedWageTotal: 0 };

  const workerById = new Map(workers.map(w => [w.id, w]));
  const enrolledExisting = state.enrolledWorkerIds.filter(id => workerById.has(id));

  let totalHours = 0;
  let estimatedWageTotal = 0;
  let workerDays = 0;
  for (const a of state.attendance) {
    const w = workerById.get(a.workerId);
    if (!w) continue;
    if (a.hours <= 0) continue;
    totalHours += a.hours;
    estimatedWageTotal += a.hours * w.defaultWage;
    workerDays += 1;
  }

  return {
    workerCount: enrolledExisting.length,
    totalHours,
    workerDays,
    estimatedWageTotal,
  };
}

// 일자별 출역 (이번 달 1..N)
export type DailyHoursPoint = { day: number; hours: number };
export function dailyAttendance(state: PayrollState | null): DailyHoursPoint[] {
  const total = state ? daysInMonth(state.yearMonth) : 31;
  const arr: DailyHoursPoint[] = Array.from({ length: total }, (_, i) => ({ day: i + 1, hours: 0 }));
  if (!state) return arr;
  for (const a of state.attendance) {
    if (a.day < 1 || a.day > total) continue;
    if (a.hours > 0) arr[a.day - 1].hours += a.hours;
  }
  return arr;
}

// 공종별 공수 합계
export type TradeBreakdownPoint = { trade: string; hours: number };
export function tradeBreakdown(state: PayrollState | null, workers: MockWorker[]): TradeBreakdownPoint[] {
  if (!state) return [];
  const workerById = new Map(workers.map(w => [w.id, w]));
  const map = new Map<string, number>();
  for (const a of state.attendance) {
    const w = workerById.get(a.workerId);
    if (!w || a.hours <= 0) continue;
    const trade = w.defaultTrade?.trim() || '미지정';
    map.set(trade, (map.get(trade) ?? 0) + a.hours);
  }
  return Array.from(map.entries())
    .map(([trade, hours]) => ({ trade, hours }))
    .sort((a, b) => b.hours - a.hours);
}

// 월별 추이 (모든 localStorage 노임대장 → 추정 임금총액)
export type MonthlyTrendPoint = {
  yearMonth: string;
  totalHours: number;
  estimatedWageTotal: number;
  workerCount: number;
};
export function monthlyTrend(states: PayrollState[], workers: MockWorker[]): MonthlyTrendPoint[] {
  const workerById = new Map(workers.map(w => [w.id, w]));
  return states.map(s => {
    let totalHours = 0;
    let estimatedWageTotal = 0;
    for (const a of s.attendance) {
      const w = workerById.get(a.workerId);
      if (!w || a.hours <= 0) continue;
      totalHours += a.hours;
      estimatedWageTotal += a.hours * w.defaultWage;
    }
    return {
      yearMonth: s.yearMonth,
      totalHours,
      estimatedWageTotal,
      workerCount: s.enrolledWorkerIds.filter(id => workerById.has(id)).length,
    };
  });
}

// 작업자별 공수 Top N
export type WorkerHoursPoint = { workerId: string; name: string; hours: number; estimatedWage: number };
export function workerHoursTop(state: PayrollState | null, workers: MockWorker[], topN = 10): WorkerHoursPoint[] {
  if (!state) return [];
  const workerById = new Map(workers.map(w => [w.id, w]));
  const map = new Map<string, number>();
  for (const a of state.attendance) {
    if (a.hours <= 0) continue;
    map.set(a.workerId, (map.get(a.workerId) ?? 0) + a.hours);
  }
  const list: WorkerHoursPoint[] = [];
  for (const [id, hours] of map) {
    const w = workerById.get(id);
    if (!w) continue;
    list.push({ workerId: id, name: w.name, hours, estimatedWage: hours * w.defaultWage });
  }
  return list.sort((a, b) => b.hours - a.hours).slice(0, topN);
}

export function formatKRW(amount: number): string {
  if (amount >= 100_000_000) return `${(amount / 100_000_000).toFixed(2)}억`;
  if (amount >= 10_000) return `${(amount / 10_000).toFixed(1)}만`;
  return amount.toLocaleString();
}
