export function daysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function periodRange(yearMonth: string): { start: Date; end: Date } {
  const [y, m] = yearMonth.split('-').map(Number);
  return {
    start: new Date(y, m - 1, 1),
    end: new Date(y, m - 1, daysInMonth(yearMonth)),
  };
}

export function shiftMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-');
  return `${y}년 ${m}월`;
}
