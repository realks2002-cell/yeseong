// 백그라운드 GPS 추적 — 앱이 백그라운드에 있어도 위치를 주기적으로 서버에 전송
// @capacitor-community/background-geolocation 사용

import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

let started = false;

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
 * 단계적 위치 권한 요청
 * 1단계: "앱 사용 중에만 허용" 요청
 * 2단계: "항상 허용" 필요 시 백그라운드 워처 등록으로 시스템이 자동 요청
 * @returns true = 권한 획득, false = 거부됨
 */
async function requestLocationPermissions(): Promise<boolean> {
  try {
    // 1단계: 기본 위치 권한 (앱 사용 중)
    const perm = await Geolocation.requestPermissions({ permissions: ['location'] });
    if (perm.location !== 'granted') return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * 백그라운드 GPS 추적 시작
 * - Android 11+: 먼저 "앱 사용 중" 권한 획득 후, 워처 등록 시 "항상 허용" 자동 요청
 * - 위치가 변경될 때마다 callback 호출
 * - Android 포그라운드 서비스로 알림 표시됨
 */
export async function startBackgroundTracking(onLocation: GpsCallback) {
  if (started) return;
  if (!Capacitor.isNativePlatform()) return;

  // 1단계: 기본 위치 권한 요청
  const granted = await requestLocationPermissions();
  if (!granted) return;

  started = true;

  // 2단계: 백그라운드 워처 등록 — requestPermissions: true로
  // Android 시스템이 "항상 허용" 다이얼로그를 자동 표시
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
