// 사용자가 입력하는 짧은 ID(예: "admin")를 Supabase Auth가 요구하는 이메일로 매핑
// UI에서는 항상 ID만 보이고, 내부 저장만 이메일 형식.
const ADMIN_DOMAIN = '@yeseong.local';

export function idToEmail(id: string): string {
  const trimmed = id.trim().toLowerCase();
  if (trimmed.includes('@')) return trimmed;
  return `${trimmed}${ADMIN_DOMAIN}`;
}

export function emailToId(email: string): string {
  if (email.endsWith(ADMIN_DOMAIN)) {
    return email.slice(0, -ADMIN_DOMAIN.length);
  }
  return email;
}
