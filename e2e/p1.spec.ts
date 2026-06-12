import fs from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';
import { E2E, getServiceClient, readState } from './helpers/e2e-env';
import { mobileContext, workerLogin, managerLogin, adminLogin } from './helpers/actions';

// P1 스모크: 매사 성과 입력 / 발주 / 현장증빙 업로드 / 엑셀 다운로드
test.describe.configure({ mode: 'serial' });

// 1×1 PNG 픽스처
const FIXTURE_PNG = path.join(__dirname, '.fixture.png');
test.beforeAll(() => {
  fs.writeFileSync(
    FIXTURE_PNG,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  );
});

test('작업자 — 매사 성과 입력 저장', async ({ browser }) => {
  const ctx = await mobileContext(browser);
  const page = await ctx.newPage();
  await workerLogin(page);

  await page.goto('/m/volumes');
  // 팀장 추종 — 성과 입력 폼 표시 (현장 미설정/대상 아님이 아니어야 함)
  await page.getByRole('button', { name: '항목 추가' }).click({ timeout: 15_000 });

  // 추가된 행: 단가 select에 E2E 단가가 기본 선택돼 있음
  await expect(page.locator('select option', { hasText: E2E.PRICE_NAME }).first()).toBeAttached();
  await page.locator('input[inputmode="decimal"]').first().fill('10');
  await page.getByRole('button', { name: '저장' }).click();

  // 저장 토스트 표시 (재조회 시 폼 유지 — 토스트 소실 버그 회귀 방지)
  await expect(page.getByText('저장되었습니다', { exact: false })).toBeVisible({ timeout: 15_000 });

  // DB 반영 검증
  const sb = getServiceClient();
  const state = readState();
  await expect
    .poll(async () => {
      const { data } = await sb
        .from('yeseong_masonry_volumes')
        .select('quantity, yeseong_payroll_workers!inner(worker_id)')
        .eq('yeseong_payroll_workers.worker_id', state.workerId);
      return data?.length ?? 0;
    }, { timeout: 15_000 })
    .toBeGreaterThan(0);
  await ctx.close();
});

test('팀장 — 발주 요청 전송', async ({ browser }) => {
  const ctx = await mobileContext(browser);
  const page = await ctx.newPage();
  await managerLogin(page);

  await page.goto('/m/manager/orders');
  // 품목 행(grid)을 정확히 짚어 해당 행의 수량 입력에만 기입
  const row = page.locator('div.grid', { hasText: E2E.ITEM_NAME });
  await row.waitFor({ timeout: 15_000 });
  await row.locator('input[type="number"]').fill('5');
  await page.getByRole('button', { name: /발주 요청 \(1개 품목\)/ }).click();
  await expect(page.getByText('발주 요청이 전송되었습니다')).toBeVisible({ timeout: 15_000 });
  await ctx.close();
});

test('팀장 — 현장증빙 사진 업로드', async ({ browser }) => {
  const ctx = await mobileContext(browser);
  const page = await ctx.newPage();
  await managerLogin(page);

  await page.goto('/m/manager/site-photos');
  await page.getByRole('button', { name: '사진 추가' }).first().click();
  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 15_000 });
  await page.getByText('사진 보관함에서 선택').click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles(FIXTURE_PNG);

  // 메모 시트 — 건너뛰기로 즉시 제출
  await page.getByRole('button', { name: '건너뛰기' }).click({ timeout: 15_000 });
  await expect(page.getByText('제출되었습니다')).toBeVisible({ timeout: 20_000 });
  await ctx.close();
});

test('관리자 — 발주 목록 확인 + 작업자 엑셀 다운로드', async ({ page }) => {
  await adminLogin(page);

  await page.goto('/orders');
  await expect(page.getByText(E2E.ITEM_NAME).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(new RegExp(`요청: ${E2E.MANAGER_NAME}`)).first()).toBeVisible();

  await page.goto('/workers');
  const downloadPromise = page.waitForEvent('download', { timeout: 20_000 });
  await page.getByRole('button', { name: /다운로드|엑셀/ }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
});
