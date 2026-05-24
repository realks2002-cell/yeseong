// 관리자 권한 가드 — email 도메인 기반
//   관리자: @yeseong.local
//   작업자: @yeseong.mobile (차단)
//   팀장:   @yeseong.manager (차단)

const ADMIN_DOMAIN = '@yeseong.local';

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(ADMIN_DOMAIN);
}
