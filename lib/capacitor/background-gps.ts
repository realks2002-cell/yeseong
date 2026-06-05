// 백그라운드 GPS 추적 — 앱이 백그라운드에 있어도 위치를 주기적으로 서버에 전송
// @capacitor-community/background-geolocation 사용

import { Capacitor } from '@capacitor/core';
import { BackgroundGeolocation } from '@capacitor-community/background-geolocation';

let started = false;

export type GpsCallback = (lat: number, lng: number) => void;

/**
 * 백그라운드 GPS 추적 시작
 * - 앱이 백그라운드에서도 위치를 수집
 * - 위치가 변경될 때마다 callback 호출
 * - Android 포그라운드 서비스로 알림 표시됨
 */
export async function startBackgroundTracking(onLocation: GpsCallback) {
  if (started) return;
  if (!Capacitor.isNativePlatform()) return;

  started = true;

  const watcher = await BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: '예성건축 출역 추적 중',
      backgroundMessage: '현장 위치를 확인하고 있습니다',
      requestPermissions: true,
      stale: false,
      distanceFilter: 50, // 50m 이동 시마다 업데이트
    },
    (location, error) => {
      if (error) return;
      if (location) {
        onLocation(location.latitude, location.longitude);
      }
    },
  );

  return watcher;
}

/**
 * 백그라운드 GPS 추적 중지
 */
export async function stopBackgroundTracking(watcherId?: string) {
  if (!Capacitor.isNativePlatform()) return;

  if (watcherId) {
    await BackgroundGeolocation.removeWatcher({ id: watcherId });
  }
  started = false;
}
