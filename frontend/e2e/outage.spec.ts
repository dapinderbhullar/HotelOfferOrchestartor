import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const outage = process.env.TEST_SUPPLIER_OUTAGE;

test.skip(!outage, 'Start the real stack with one supplier unavailable');

test('live supplier outage displays partial offers and HTTP 503 degraded health', async ({ page }) => {
  expect(['A', 'B']).toContain(outage);
  const unavailable = 'Supplier ' + outage;
  const surviving = outage === 'A' ? 'Supplier B' : 'Supplier A';
  await page.goto('/');
  await expect(page.getByText('Backend degraded')).toBeVisible();
  const refresh = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/api/hotels/refresh'));
  await page.getByRole('button', { name: 'Refresh Offers' }).click();
  const response = await refresh;
  expect(response.status()).toBe(200);
  expect(response.headers()['x-hotel-failed-suppliers']).toBe(unavailable);
  expect((await response.json()).every((offer: { supplier: string }) => offer.supplier === surviving)).toBe(true);
  await expect(page.getByText('Showing 1–6 of 7 offers')).toBeVisible();
  await expect(page.getByText('Partial results.')).toBeVisible();
  await page.getByRole('link', { name: 'System Health' }).click();
  const probe = page.waitForResponse((result) => result.url().endsWith('/gateway/health'));
  await page.getByRole('button', { name: 'Check health' }).click();
  expect((await probe).status()).toBe(503);
  await expect(page.getByText(unavailable, { exact: true }).locator('..').locator('..')).toContainText('Unhealthy');
  await expect(page.getByText(surviving, { exact: true }).locator('..').locator('..')).toContainText('Healthy');
  if (process.env.CAPTURE_SCREENSHOTS && outage === 'A') {
    await mkdir('../docs/screenshots', { recursive: true });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: '../docs/screenshots/degraded-health.png', fullPage: true });
  }
});
