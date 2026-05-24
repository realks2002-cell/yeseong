export function daysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// 'YYYY-MM-01' 같은 ISO date 문자열을 직접 빌드 — 타임존 무관.
//   Date 객체 + toISOString().slice(0,10) 패턴은 로컬 KST에서 1일 오차 발생.
export function periodRangeIso(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split('-').map(Number);
  const yyyy = String(y);
  const mm = String(m).padStart(2, '0');
  const dd = String(daysInMonth(yearMonth)).padStart(2, '0');
  return {
    start: `${yyyy}-${mm}-01`,
    end: `${yyyy}-${mm}-${dd}`,
  };
}

// Date 객체가 필요한 호출자용 (엑셀 양식 등). 로컬 자정 기준.
// 직접 비교·.slice() 하지 말고 periodRangeIso() 사용 권장.
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

// 현재 연-월 (YYYY-MM). 4곳에서 중복 정의되던 함수를 통합.
export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
