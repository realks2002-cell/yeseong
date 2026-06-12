import { expect, type Browser, type Page } from '@playwright/test';
import { E2E, readState } from './e2e-env';

export const GEO = { latitude: 36.35, longitude: 128.7 };

export async function mobileContext(browser: Browser) {
  return browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: GEO,
    permissions: ['geolocation'],
  });
}

export async function pinLogin(page: Page, path: string, phone: string) {
  await page.goto(path);
  await page.getByPlaceholder('010-1234-5678').fill(phone);
  await page.getByRole('button', { name: '다음' }).click();
  const pin = page.locator('input[type="password"]');
  await pin.waitFor({ timeout: 10_000 });
  await pin.fill(E2E.PIN);
}

export async function workerLogin(page: Page) {
  await pinLogin(page, '/m/signup', E2E.WORKER_PHONE);
  await page.waitForURL(/\/m\/home$/, { timeout: 15_000 });
}

export async function managerLogin(page: Page) {
  await pinLogin(page, '/m/manager/signup', E2E.MANAGER_PHONE);
  await page.waitForURL(/\/m\/manager(\/home)?$/, { timeout: 15_000 });
}

export async function adminLogin(page: Page) {
  const state = readState();
  await page.goto('/admin');
  await page.locator('#id').fill(E2E.ADMIN_ID);
  await page.locator('#password').fill(state.adminPassword);
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}
