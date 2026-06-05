// FCM 푸시 알림 등록 — Capacitor 네이티브 전용
// 웹에서는 아무 동작하지 않음 (FCM은 네이티브 앱 전용)

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

let registered = false;

/**
 * FCM 토큰을 서버에 등록한다.
 * 앱 실행 중 한 번만 실행되며, 중복 호출은 무시된다.
 * @param appType 'worker' | 'manager' — 어떤 앱에서 호출했는지
 */
export async function registerPush(appType: 'worker' | 'manager') {
  if (registered) return;
  if (!Capacitor.isNativePlatform()) return;

  registered = true;

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') { registered = false; return; }

  await PushNotifications.register();

  PushNotifications.addListener('registration', async ({ value: token }) => {
    try {
      await fetch('/api/fcm/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          deviceType: 'android',
          appType,
        }),
      });
    } catch {
      // 토큰 등록 실패는 조용히 무시 — 다음 앱 실행 시 재시도
    }
  });

  PushNotifications.addListener('registrationError', () => {
    // 등록 실패 — 조용히 무시
  });
}
