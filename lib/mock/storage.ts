'use client';
// 클라이언트 localStorage에 노임대장 상태 영속화
import type { PayrollState } from './store';
import { emptyPayrollState } from './store';

const KEY = (siteId: string, yyyymm: string) => `yeseong:payroll:${siteId}:${yyyymm}`;

export function loadPayroll(siteId: string, yyyymm: string): PayrollState {
  if (typeof window === 'undefined') return emptyPayrollState(siteId, yyyymm);
  try {
    const raw = localStorage.getItem(KEY(siteId, yyyymm));
    if (!raw) return emptyPayrollState(siteId, yyyymm);
    return JSON.parse(raw) as PayrollState;
  } catch {
    return emptyPayrollState(siteId, yyyymm);
  }
}

export function savePayroll(state: PayrollState): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY(state.worksiteId, state.yearMonth), JSON.stringify(state));
}

export function listPayrollMonths(siteId: string): string[] {
  if (typeof window === 'undefined') return [];
  const months: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    const prefix = `yeseong:payroll:${siteId}:`;
    if (k.startsWith(prefix)) months.push(k.slice(prefix.length));
  }
  return months.sort().reverse();
}
