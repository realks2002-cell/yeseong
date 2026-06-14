// "항상 허용" 위치 권한 — 커스텀 네이티브 플러그인 래퍼
// (android{,-manager}/app/src/main/java/com/yeseong/*/BackgroundPermissionPlugin.java)
//
// Android OS 규칙 때문에 2단계 분리 요청이 필수:
//   포그라운드 허용 → (API 29: 다이얼로그 / API 30+: 설정 화면 이동) → 항상 허용
// 권한 요청은 반드시 사용자의 명시적 버튼 탭에서만 호출할 것 (자동 트리거 금지 — ANR 루프)

import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export type LocationAuthStatus = 'denied' | 'whenInUse' | 'always';

type BackgroundPermissionPlugin = {
  check(): Promise<{ granted: boolean }>;
  getLocationAuthorizationStatus(): Promise<{ status: LocationAuthStatus }>;
  requestBackgroundLocation(): Promise<{ granted: boolean; requested?: boolean; settingsOpened?: boolean }>;
};

const BackgroundPermission = registerPlugin<BackgroundPermissionPlugin>('BackgroundPermission');

/**
 * 위치 권한이 "항상 허용"인지 확인한다.
 * - 웹 / 플러그인 미탑재(구버전 APK): true 반환 → 메뉴 숨김
 */
export async function isAlwaysAllowGranted(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const { granted } = await BackgroundPermission.check();
    return granted;
  } catch {
    return true; // 플러그인 없는 구버전 APK — 메뉴 미노출
  }
}

/**
 * 현재 위치 권한 상태. 웹/구버전 APK는 null (유도 UI 미노출).
 */
export async function getLocationAuthStatus(): Promise<LocationAuthStatus | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { status } = await BackgroundPermission.getLocationAuthorizationStatus();
    return status;
  } catch {
    return null;
  }
}

/**
 * "항상 허용" 유도 — 반드시 사용자 버튼 탭에서만 호출.
 * 1단계: 포그라운드 권한 (없으면 다이얼로그)
 * 2단계: 백그라운드 권한 (API 29 다이얼로그 / API 30+ 설정 화면 이동)
 * @returns 호출 직후 상태 (settingsOpened면 사용자가 설정에서 돌아온 뒤 재확인 필요)
 */
export async function requestAlwaysLocation(): Promise<LocationAuthStatus | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const perm = await Geolocation.checkPermissions();
    if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
      const r = await Geolocation.requestPermissions({ permissions: ['location'] });
      if (r.location !== 'granted' && r.coarseLocation !== 'granted') return 'denied';
    }
    await BackgroundPermission.requestBackgroundLocation();
    return await getLocationAuthStatus();
  } catch {
    return null;
  }
}
