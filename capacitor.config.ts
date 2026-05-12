import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yeseong.app',
  appName: '예성건설',
  webDir: 'public',
  server: {
    url: 'https://yeseong-nine.vercel.app/m',
    androidScheme: 'https',
  },
};

export default config;
