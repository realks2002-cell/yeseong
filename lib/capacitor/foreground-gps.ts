// 포그라운드 GPS 폴링 — 백그라운드 추적("항상 허용")이 거부돼도
// 앱이 열려 있는 동안 주기적으로 위치를 기록한다.
// "앱 사용 중에만 허용" 권한만으로 작동하는 2번째 레이어.

import { Capacitor } from '@capacitor/core';
import { getCurrentPosition } from './geolocation';
import type { GpsCallback } from './background-gps';

let timer: ReturnType<typeof setInterval> | null = null;
let visibilityHandler: (() => void) | null = null;
let lastPollAt = 0;

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5분
const RESUME_THROTTLE_MS = 30 * 1000; // 재오픈 즉시 폴링 최소 간격

/**
 * 포그라운드 위치 폴링 시작
 * - 시작 즉시 1회 + 이후 5분 간격
 * - 앱이 백그라운드에서 다시 화면에 올라오는 순간에도 즉시 1회 (30초 스로틀)
 * - 화면이 보이지 않을 때는 건너뜀
 */
export function startForegroundPolling(onLocation: GpsCallback) {
  if (timer) return;
  if (!Capacitor.isNativePlatform()) return;

  const poll = async () => {
    if (document.visibilityState !== 'visible') return;
    lastPollAt = Date.now();
    const pos = await getCurrentPosition();
    if (pos) onLocation(pos.latitude, pos.longitude);
  };

  poll(); // 즉시 1회 — 출역 제출 폴백용 최근 위치를 빨리 확보
  timer = setInterval(poll, POLL_INTERVAL_MS);

  // 앱 재오픈(백그라운드 → 포그라운드) 순간 즉시 폴링
  visibilityHandler = () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastPollAt < RESUME_THROTTLE_MS) return;
    poll();
  };
  document.addEventListener('visibilitychange', visibilityHandler);
}

/** 포그라운드 위치 폴링 중지 */
export function stopForegroundPolling() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
}
