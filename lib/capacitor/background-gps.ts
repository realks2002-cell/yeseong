// 백그라운드 GPS 추적 — 앱이 백그라운드에 있어도 위치를 주기적으로 서버에 전송
// @capacitor-community/background-geolocation 사용

import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { rememberPosition } from './geolocation';
import { getLocationAuthStatus } from './background-permission';
import { isWithinTrackWindow } from './track-window';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

let started = false;
let watcherId: string | null = null;

export type GpsCallback = (lat: number, lng: number) => void;

/**
 * "항상 허용" 권한 상태를 확인한다.
 * @returns 'granted' | 'prompt' | 'denied'
 */
export async function checkBackgroundPermission(): Promise<'granted' | 'prompt' | 'denied'> {
  if (!Capacitor.isNativePlatform()) return 'denied';
  try {
    const perm = await Geolocation.checkPermissions();
    // coarseLocation이 granted이고 location(fine)이 granted인 경우
    // background는 Android 시스템 설정에서만 확인 가능
    // requestPermissions로 시도 후 결과로 판단
    if (perm.location === 'granted') return 'granted';
    if (perm.location === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'denied';
  }
}

/**
 * 백그라운드 GPS 추적 시작 — "항상 허용"이 이미 부여된 경우에만 시작.
 * 권한 요청은 여기서 하지 않는다 (사전 고지 화면의 사용자 탭에서만 — ANR 루프 금지).
 * 권한이 없으면 조용히 종료하고, 재유도는 AlwaysLocationPrompt 배너가 담당.
 */
export async function startBackgroundTracking(onLocation: GpsCallback) {
  if (started) return;
  if (!Capacitor.isNativePlatform()) return;

  const status = await getLocationAuthStatus();
  if (status !== 'always') return;

  started = true;

  watcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: '예성건축 출역 추적 중',
      backgroundMessage: '현장 위치를 확인하고 있습니다',
      requestPermissions: false, // 자동 권한 요청 금지 — 위에서 상태 확인 완료
      stale: false,
      distanceFilter: 50, // 50m 이동 시마다 업데이트
    },
    (location, error) => {
      if (error) return;
      // 추적 시간대를 벗어나면 (앱이 백그라운드여도) 워처를 스스로 종료 → 상시 알림 사라짐
      if (!isWithinTrackWindow()) {
        void stopBackgroundTracking();
        return;
      }
      if (location) {
        rememberPosition(location.latitude, location.longitude); // 제출 폴백 캐시 갱신
        onLocation(location.latitude, location.longitude);
      }
    },
  );

  return watcherId;
}

/**
 * 시스템 앱 설정 화면 열기 — 사용자가 위치 권한을 "항상 허용"으로 바꿀 수 있게
 */
export async function openLocationSettings() {
  if (!Capacitor.isNativePlatform()) return;
  await BackgroundGeolocation.openSettings();
}

/**
 * 백그라운드 GPS 추적 중지
 */
export async function stopBackgroundTracking(id?: string) {
  if (!Capacitor.isNativePlatform()) return;

  const target = id ?? watcherId;
  if (target) {
    await BackgroundGeolocation.removeWatcher({ id: target });
    if (target === watcherId) watcherId = null;
  }
  started = false;
}
