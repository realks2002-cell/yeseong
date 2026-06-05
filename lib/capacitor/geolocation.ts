// GPS 위치 가져오기 — Capacitor 네이티브 + 웹 폴백

import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export type Position = { latitude: number; longitude: number };

// 마지막 성공 위치 캐시 — 모든 레이어(백그라운드 워처/포그라운드 폴링/제출)가 공유.
// 출역 제출 순간 GPS가 안 잡혀도 최근 좌표로 폴백할 수 있다.
let lastKnown: { latitude: number; longitude: number; at: number } | null = null;

const FALLBACK_MAX_AGE_MS = 10 * 60 * 1000; // 폴백 허용 최대 나이: 10분

/** 위치 획득 성공 시 캐시에 기록 (모든 레이어에서 호출) */
export function rememberPosition(latitude: number, longitude: number) {
  lastKnown = { latitude, longitude, at: Date.now() };
}

/**
 * 현재 위치를 가져온다.
 * - 네이티브: @capacitor/geolocation (고정밀)
 * - 웹: navigator.geolocation (폴백)
 * @returns 좌표 또는 null (권한 거부/실패)
 */
export async function getCurrentPosition(): Promise<Position | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const perm = await Geolocation.requestPermissions();
      if (perm.location !== 'granted') return null;

      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });
      rememberPosition(pos.coords.latitude, pos.coords.longitude);
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
    } catch {
      return null;
    }
  }

  // 웹 폴백
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        rememberPosition(pos.coords.latitude, pos.coords.longitude);
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

/**
 * 출역 제출용 위치 획득 — 실패에 강한 3단계:
 * 1. 현재 위치 시도
 * 2. 실패 시 1회 재시도
 * 3. 그래도 실패하면 10분 내 마지막 성공 위치로 폴백
 *    (백그라운드 워처/포그라운드 폴링이 남긴 좌표)
 */
export async function getPositionWithRetry(): Promise<Position | null> {
  let pos = await getCurrentPosition();
  if (!pos) pos = await getCurrentPosition(); // 재시도 1회
  if (pos) return pos;

  if (lastKnown && Date.now() - lastKnown.at <= FALLBACK_MAX_AGE_MS) {
    return { latitude: lastKnown.latitude, longitude: lastKnown.longitude };
  }
  return null;
}
