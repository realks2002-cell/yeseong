// 출역 추적 스케줄러 — 근무 시간대(08:00~17:00)에만 위치 추적/상시 알림을 가동한다.
//   (출역 등록은 퇴근 시 제출하므로 가동 조건으로 쓰지 않는다 — 시간대만으로 판단)
//   가동 조건: 네이티브 + (추적 시간대 08:00~17:00 내)
//   - 포그라운드 폴링: 위치 획득은 항상(출역 제출 폴백 캐시 확보), 단 서버 로깅은 시간대 내에만
//   - 백그라운드 워처: 시간대 내에만 시작 → 상시 알림도 그때만 표시
//   - 1분 주기 + 앱 포그라운드 복귀 시 재평가 → 시간대 종료 시 자동 중지

import { Capacitor } from '@capacitor/core';
import { startForegroundPolling, stopForegroundPolling } from './foreground-gps';
import { startBackgroundTracking, stopBackgroundTracking, type GpsCallback } from './background-gps';
import { isWithinTrackWindow } from './track-window';

let interval: ReturnType<typeof setInterval> | null = null;
let visHandler: (() => void) | null = null;
let running = false;
let report: GpsCallback = () => {};

function active(): boolean {
  return isWithinTrackWindow();
}

async function sync() {
  try {
    if (active()) await startBackgroundTracking(report);
    else await stopBackgroundTracking();
  } catch {
    /* 추적 start/stop 실패는 다음 주기에 재시도 */
  }
}

/** 권한이 막 "항상 허용"으로 바뀐 직후 등 즉시 재평가가 필요할 때 */
export function requestSync() {
  if (running) void sync();
}

/** 추적 스케줄러 시작 — 홈 마운트 시 1회 */
export function startTrackingScheduler(onLocation: GpsCallback) {
  if (running) return;
  if (!Capacitor.isNativePlatform()) return;
  running = true;
  report = onLocation;

  // 포그라운드: 위치는 항상 획득(폴백 캐시), 서버 로깅은 가동 조건일 때만
  startForegroundPolling((lat, lng) => {
    if (active()) onLocation(lat, lng);
  });

  void sync();
  interval = setInterval(() => void sync(), 60 * 1000);
  visHandler = () => {
    if (document.visibilityState === 'visible') void sync();
  };
  document.addEventListener('visibilitychange', visHandler);
}

/** 추적 스케줄러 정지 — 홈 언마운트 시. 모든 추적·알림 종료 */
export function stopTrackingScheduler() {
  running = false;
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  if (visHandler) {
    document.removeEventListener('visibilitychange', visHandler);
    visHandler = null;
  }
  stopForegroundPolling();
  void stopBackgroundTracking();
}
