// 공종(직종) — '구분(등급)'은 GRADES로 분리됨
// '직접 입력'은 클라이언트에서 자유 입력 모드 트리거
export const TRADES = [
  '조적',
  '미장공',
  '바닥미장',
  '방수공',
  '도장공',
  '줄눈공',
  '보통인부',
  '용접공',
  '철근공',
  '목수',
] as const;

// 구분(등급)
export const GRADES = ['팀장', '기공', '조공'] as const;

// 급여형태 — 노임대장·급여 계산 분기용
// - 일급: 공수합 × default_wage
// - 월급: default_wage (그 달 풀 월급)
// - 월급/일급: sum(masonry_volumes.quantity × unit_price) — 성과만
export const WAGE_TYPES = ['월급', '일급', '월급/일급'] as const;
