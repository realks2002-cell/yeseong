import { test, expect, type Browser, type Page } from '@playwright/test';
import { E2E, readState } from './helpers/e2e-env';

// P0 핵심 플로우: 관리자 가드 → 작업자 출역 등록 → 팀장 승인 → 관리자 출역 현황 반영
test.describe.configure({ mode: 'serial' });

const GEO = { latitude: 36.35, longitude: 128.7 }; // 임의 좌표 (현장 좌표 미등록 상태라 거리 검증 없음)

async function mobileContext(browser: Browser) {
  return browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: GEO,
    permissions: ['geolocation'],
  });
}

async function pinLogin(page: Page, path: string, phone: string) {
  await page.goto(path);
  await page.getByPlaceholder('010-1234-5678').fill(phone);
  await page.getByRole('button', { name: '다음' }).click();
  // 기존 계정 → PIN 입력 화면, 4자리 입력 시 자동 로그인
  const pin = page.locator('input[type="password"]');
  await pin.waitFor({ timeout: 10_000 });
  await pin.fill(E2E.PIN);
}

test('관리자 가드 — 비로그인 접근 시 로그인 페이지로', async ({ page }) => {
  await page.goto('/workers');
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByText('관리자 로그인')).toBeVisible();
});

test('관리자 로그인 — 대시보드 진입 + 작업자 목록에 E2E작업자', async ({ page }) => {
  const state = readState();
  await page.goto('/admin');
  await page.locator('#id').fill(E2E.ADMIN_ID);
  await page.locator('#password').fill(state.adminPassword);
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  await page.goto('/workers');
  await expect(page.getByText(E2E.WORKER_NAME).first()).toBeVisible({ timeout: 15_000 });
});

test('작업자 — PIN 로그인 후 출역 1일 등록', async ({ browser }) => {
  const ctx = await mobileContext(browser);
  const page = await ctx.newPage();

  await pinLogin(page, '/m/signup', E2E.WORKER_PHONE);
  await expect(page).toHaveURL(/\/m\/home/, { timeout: 15_000 });

  // 팀장 추종 — 현장 미설정 화면이 아니어야 함
  await expect(page.getByText('오늘 근무를 등록해주세요')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: /1 일.*정상/ }).click();
  await expect(page.getByText('1일로 등록할까요?')).toBeVisible();
  await page.getByRole('button', { name: '네, 등록할게요' }).click();

  await expect(page.getByText('오늘 등록 완료')).toBeVisible({ timeout: 20_000 });
  await ctx.close();
});

test('팀장 — 작업자 출역 승인', async ({ browser }) => {
  const ctx = await mobileContext(browser);
  const page = await ctx.newPage();

  await pinLogin(page, '/m/manager/signup', E2E.MANAGER_PHONE);
  // 로그인 완료(게이트 또는 홈 도착) 대기 후 홈으로 진입
  await page.waitForURL(/\/m\/manager(\/home)?$/, { timeout: 15_000 });
  await page.goto('/m/manager/home');
  await expect(page.getByText('내 출역')).toBeVisible({ timeout: 15_000 });

  // 검토 대기 목록에 E2E작업자
  await expect(page.getByText(E2E.WORKER_NAME).first()).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('승인').first().click();
  await expect(page.getByText(E2E.WORKER_NAME)).toHaveCount(0, { timeout: 15_000 });
  await ctx.close();
});

test('관리자 — 출역 현황에 승인 반영', async ({ page }) => {
  const state = readState();
  await page.goto('/admin');
  await page.locator('#id').fill(E2E.ADMIN_ID);
  await page.locator('#password').fill(state.adminPassword);
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  await page.goto('/attendance');
  const row = page.locator('tr', { hasText: E2E.WORKER_NAME });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.getByText('승인')).toBeVisible();
});
