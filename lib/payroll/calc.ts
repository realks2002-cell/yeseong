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

// 엑셀·UI 표시용: 출역 일자 셀 표시. 급여형태 무관하게 공수(0.5/1/1.5 등) 그대로.
//   월급·월급/일급도 출역은 신고용이라 실제값을 표시(임금 계산과는 별개).
export function formatAttendanceCell(hours: number): string {
  if (hours <= 0) return '';
  // numeric(3,1) — 소수 1자리. 1.0 → '1', 0.5/1.5는 그대로.
  const fixed = hours.toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}
