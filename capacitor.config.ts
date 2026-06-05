import type { CapacitorConfig } from '@capacitor/cli';

const isManager = process.env.CAP_TARGET === 'manager';

const config: CapacitorConfig = {
  appId: isManager ? 'com.yeseong.manager' : 'com.yeseong.app',
  appName: isManager ? '예성건축 팀장' : '예성건축',
  // 앱은 server.url(원격)을 로드하므로 번들 웹 자산은 스텁만 포함
  // (public을 통째로 넣으면 public/apps의 APK까지 재귀 포함돼 용량 폭증)
  webDir: 'capacitor-assets',
  android: {
    path: isManager ? 'android-manager' : 'android',
  },
  server: {
    url: isManager
      ? 'https://yeseong-nine.vercel.app/m/manager'
      : 'https://yeseong-nine.vercel.app/m',
    androidScheme: 'https',
  },
};

export default config;
