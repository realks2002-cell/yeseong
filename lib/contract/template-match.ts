// 작업자 급여형태(wage_type)에 맞는 계약서 양식 선택.
//   우선순위: ① 급여형태 정확 일치 ② 공통(wage_type null) ③ 없음
export type TemplateLite = {
  id: string;
  title: string;
  body: string;
  wage_type: string | null;
  is_active: boolean;
};

export const WAGE_TYPES = ['일급', '월급', '월급/일급'] as const;

// 입력값을 유효한 wage_type 또는 null(공통)로 정규화
export function parseWageType(v: unknown): string | null {
  return typeof v === 'string' && (WAGE_TYPES as readonly string[]).includes(v) ? v : null;
}

export function pickTemplate(
  wageType: string | null,
  templates: TemplateLite[],
): TemplateLite | null {
  const active = templates.filter((t) => t.is_active);
  return (
    active.find((t) => t.wage_type === wageType) ??
    active.find((t) => t.wage_type == null) ??
    null
  );
}
