import { defineConfig, devices } from '@playwright/test';

// 프로덕션 검증용 일회성 설정 — 같은 DB를 쓰므로 시드/정리는 동일
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'https://yeseong-nine.vercel.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  },
  projects: [
    { name: 'e2e-prod', use: { ...devices['Desktop Chrome'] } },
  ],
});
