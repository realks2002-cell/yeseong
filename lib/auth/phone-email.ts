// 모바일 작업자/소장 전화번호 → Supabase Auth 가짜 이메일 매핑
// 관리자(admin@yeseong.local)와 도메인을 분리해 충돌 방지
// 작업자 앱 / 소장 앱은 도메인을 다시 분리해서 한 번호로 양쪽 가입 가능
const MOBILE_DOMAIN = '@yeseong.mobile';
const MANAGER_DOMAIN = '@yeseong.manager';

export function normalizePhone(v: string): string {
  return v.replace(/\D/g, '');
}

export function phoneToEmail(phone: string): string {
  return `${normalizePhone(phone)}${MOBILE_DOMAIN}`;
}

export function phoneToManagerEmail(phone: string): string {
  return `${normalizePhone(phone)}${MANAGER_DOMAIN}`;
}

export function isMobileEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith(MOBILE_DOMAIN);
}

export function isManagerEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith(MANAGER_DOMAIN);
}

export function formatPhone(v: string): string {
  const d = normalizePhone(v).slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}
