// 작업자앱 급여 화면 공용 타입·포맷터

export type PayrollMonth = {
  year_month: string; // 'YYYY-MM'
  wage_type: string | null;
  approved_hours: number;
  pending_hours: number;
  total_amount: number | null; // null = 성과 기준 정산(월급/일급)
  entries: Array<{
    work_date: string;
    hours: number;
    status: 'pending' | 'approved' | 'rejected';
    worksite_name: string | null;
    daily_wage: number;
  }>;
};

export function fmtMonthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y}년 ${Number(m)}월`;
}

export function fmtWon(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`;
}
