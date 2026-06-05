// 포그라운드 GPS 폴링 — 백그라운드 추적("항상 허용")이 거부돼도
// 앱이 열려 있는 동안 주기적으로 위치를 기록한다.
// "앱 사용 중에만 허용" 권한만으로 작동하는 2번째 레이어.

import { Capacitor } from '@capacitor/core';
import { getCurrentPosition } from './geolocation';
import type { GpsCallback } from './background-gps';

let timer: ReturnType<typeof setInterval> | null = null;

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5분

/**
 * 포그라운드 위치 폴링 시작
 * - 시작 즉시 1회 + 이후 5분 간격
 * - 화면이 보이지 않을 때는 건너뜀 (백그라운드는 워처 담당)
 */
export function startForegroundPolling(onLocation: GpsCallback) {
  if (timer) return;
  if (!Capacitor.isNativePlatform()) return;

  const poll = async () => {
    if (document.visibilityState !== 'visible') return;
    const pos = await getCurrentPosition();
    if (pos) onLocation(pos.latitude, pos.longitude);
  };

  poll(); // 즉시 1회 — 출역 제출 폴백용 최근 위치를 빨리 확보
  timer = setInterval(poll, POLL_INTERVAL_MS);
}

/** 포그라운드 위치 폴링 중지 */
export function stopForegroundPolling() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
