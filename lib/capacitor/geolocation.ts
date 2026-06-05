// GPS 위치 가져오기 — Capacitor 네이티브 + 웹 폴백

import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export type Position = { latitude: number; longitude: number };

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
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}
