// "항상 허용" 위치 권한 상태 확인 — 작업자앱 커스텀 네이티브 플러그인
// (android/app/src/main/java/com/yeseong/app/BackgroundPermissionPlugin.java)

import { Capacitor, registerPlugin } from '@capacitor/core';

type BackgroundPermissionPlugin = {
  check(): Promise<{ granted: boolean }>;
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
