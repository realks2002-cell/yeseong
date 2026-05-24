// 작업자 1명의 그 달 급여 계산.
//   wage_type에 따라 분기:
//   - 일급 / null: 공수합 × default_wage
//   - 월급: default_wage (그 달 풀 월급, 출역 무관)
//   - 월급/일급: 물량합 (성과만, default_wage·공수 무시)
export function calcWorkerTotal(input: {
  wage_type: string | null;
  default_wage: number;
  attendance_sum: number;  // 공수합 (numeric, 일급용)
  volumes_sum: number;     // sum(amount), 월급/일급용
}): number {
  const { wage_type, default_wage, attendance_sum, volumes_sum } = input;
  if (wage_type === '월급/일급') return volumes_sum;
  if (wage_type === '월급') return default_wage;
  return Math.floor(attendance_sum * default_wage);
}

// 엑셀·UI 표시용: wage_type에 따라 일자 셀 표시 방식
//   - 월급 / 월급/일급: 출역 있으면 '1', 없으면 ''
//   - 일급 / null: 공수 숫자 (0.5/1/1.5 등) 그대로
export function formatAttendanceCell(wage_type: string | null, hours: number): string {
  if (hours <= 0) return '';
  if (wage_type === '월급' || wage_type === '월급/일급') return '1';
  // numeric(3,1) — 소수 1자리. 1.0 → '1'로, 0.5/1.5는 그대로.
  const fixed = hours.toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}

// 엑셀 행 배경색 ARGB (ExcelJS fgColor)
//   - 월급: 옅은 노랑
//   - 월급/일급: 옅은 오렌지
//   - 그 외: null (기본/흰색)
export function wageTypeRowColor(wage_type: string | null): string | null {
  if (wage_type === '월급') return 'FFFFF9C4';
  if (wage_type === '월급/일급') return 'FFFFE4C4';
  return null;
}
