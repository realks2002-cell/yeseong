// 작업자앱 급여 화면 공용 타입·포맷터

// 공제 내역 — 엑셀 급여 정산 결과를 소스로 사용 (정산 전이면 null)
export type PayrollDeductions = {
  income_tax: number;      // 소득세
  resident_tax: number;    // 주민세
  employment_ins: number;  // 고용보험
  pension: number;         // 연금보험(국민연금)
  health_ins: number;      // 건강보험
  longterm_care: number;   // 장기요양
};

export type PayrollMonth = {
  year_month: string; // 'YYYY-MM'
  wage_type: string | null;
  approved_hours: number;
  pending_hours: number;
  total_amount: number | null; // 월급/일급(매사)은 성과 총액, 미입력이면 null
  volumes_pending?: boolean; // 매사: 검토 중 성과 포함 여부
  deductions?: PayrollDeductions | null; // 엑셀 정산 연동 전이면 없음
  entries: Array<{
    work_date: string;
    hours: number;
    status: 'pending' | 'approved' | 'rejected';
    worksite_name: string | null;
    daily_wage: number;
  }>;
};

// 현재 월(Asia/Seoul 기준 디바이스 시각) 'YYYY-MM' — 진행 중인 달 숨김 판정용
export function currentYM(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

export function fmtMonthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y}년 ${Number(m)}월`;
}

export function fmtWon(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`;
}
