'use client';

// 관리자 웹이 팀장앱을 ?mirror=<managerId> 로 띄울 때 사용하는 보기 전용 데이터 소스.
//   mirror 값이 있으면 self RPC 대신 서버 미러 API(admin RPC)로 선택된 팀장 데이터를 읽는다.
export function getMirrorId(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('mirror');
}

type Kind = 'me' | 'pending' | 'team' | 'volumes' | 'order_items' | 'orders';

export async function mirrorFetch<T = unknown>(kind: Kind, managerId: string, ym?: string): Promise<T> {
  const qs = new URLSearchParams({ kind, managerId });
  if (ym) qs.set('ym', ym);
  const res = await fetch(`/api/m/manager/mirror?${qs.toString()}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? 'mirror fetch failed');
  return json as T;
}

// 미러 모드에서 탭/링크 이동 시 ?mirror=<id> 유지
export function withMirror(href: string, mirrorId: string | null): string {
  if (!mirrorId) return href;
  return href + (href.includes('?') ? '&' : '?') + `mirror=${mirrorId}`;
}
