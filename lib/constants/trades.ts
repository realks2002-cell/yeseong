// 공종(직종)은 직종 마스터(yeseong_trades)가 단일 기준.
// 앱 가입 드롭다운은 yeseong_list_trades() RPC로 활성 직종을 불러온다 (하드코딩 상수 제거됨).

// 구분(등급)
export const GRADES = ['팀장', '기공', '조공'] as const;

// 급여형태 — 노임대장·급여 계산 분기용
// - 일급: 공수합 × default_wage
// - 월급: default_wage (그 달 풀 월급)
// - 월급/일급: sum(masonry_volumes.quantity × unit_price) — 성과만
export const WAGE_TYPES = ['월급', '일급', '월급/일급'] as const;
