// 소프트 삭제 시 auth.users 로그인 차단 정책
// Supabase의 ban_duration은 Go duration 문자열 — 'none' 은 해제, 시간 단위 문자열은 ban 기간
// 100년(876000h)을 사용하는 이유: Supabase가 'inf'/'infinite' 표준값을 공식 지원하지 않으므로
// 실용적으로 영구 ban과 동일한 효과를 내는 충분히 큰 값
export const SOFT_DELETE_BAN_DURATION = '876000h';
export const UNBAN_DURATION = 'none';
