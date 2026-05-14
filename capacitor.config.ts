import type { CapacitorConfig } from '@capacitor/cli';

const isManager = process.env.CAP_TARGET === 'manager';

const config: CapacitorConfig = {
  appId: isManager ? 'com.yeseong.manager' : 'com.yeseong.app',
  appName: isManager ? '예성건축 소장' : '예성건축',
  webDir: 'public',
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
