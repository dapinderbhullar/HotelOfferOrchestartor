import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function capture(page: Page, name: string) {
  if (!process.env.CAPTURE_SCREENSHOTS) return;
  await mkdir('../docs/screenshots', { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '../docs/screenshots/' + name + '.png', fullPage: true, animations: 'disabled' });
}

test.skip(Boolean(process.env.TEST_SUPPLIER_OUTAGE), 'Normal-mode tests require both suppliers');

test('desktop pages render live results without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await expect(page.getByText('Backend connected')).toBeVisible();
  await expect(page.getByText('Showing 1–6 of 10 offers')).toBeVisible();
  await expect(page.getByText('Best price')).toBeVisible();
  await capture(page, 'overview');
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await navigation.getByRole('link', { name: 'Hotel Search' }).click();
  await expect(page.getByRole('heading', { name: 'Hotel search', exact: true })).toBeVisible();
  await expect(page.getByText('Showing 1–6 of 10 offers')).toBeVisible();
  await capture(page, 'hotel-search');
  await navigation.getByRole('link', { name: 'Price Analytics' }).click();
  await expect(page.getByRole('heading', { name: 'Supplier distribution' })).toBeVisible();
  await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible();
  await capture(page, 'price-analytics');
  await navigation.getByRole('link', { name: 'Workflow Monitor' }).click();
  await expect(page.getByText('hotel-aggregation:delhi')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Temporal UI' })).toHaveAttribute('href', /^https?:\/\//);
  await capture(page, 'workflow-monitor');
  await navigation.getByRole('link', { name: 'System Health' }).click();
  await expect(page.getByRole('heading', { name: 'Service checks' })).toBeVisible();
  const probe = page.waitForResponse((response) => response.url().endsWith('/gateway/health'));
  await page.getByRole('button', { name: 'Check health' }).click();
  expect((await probe).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Check health' })).toBeEnabled();
  await capture(page, 'system-health');
  expect(errors).toEqual([]);
});

test('search, filters, validation, sorting, pagination and refresh use the real API', async ({ page }) => {
  await page.goto('/hotels?city=delhi');
  const city = page.getByRole('textbox', { name: 'City' });
  const min = page.getByRole('textbox', { name: 'Minimum price', exact: false });
  const max = page.getByRole('textbox', { name: 'Maximum price', exact: false });
  const apply = page.getByRole('button', { name: 'Apply filters' });
  const clear = page.getByRole('button', { name: 'Clear filters' });
  await expect(page.getByText('Showing 1–6 of 10 offers')).toBeVisible();

  async function filter(lower: string, upper: string, expected: number) {
    await min.fill(lower);
    await max.fill(upper);
    const result = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/api/hotels') && url.searchParams.get('city') === 'delhi' &&
        (url.searchParams.get('minPrice') ?? '') === lower && (url.searchParams.get('maxPrice') ?? '') === upper;
    });
    await apply.click();
    expect((await (await result).json()).length).toBe(expected);
    await expect(page.getByText('Showing 1–' + expected + ' of ' + expected + ' offers')).toBeVisible();
  }

  await filter('7000', '', 3);
  await clear.click();
  await expect(page.getByText('Showing 1–6 of 10 offers')).toBeVisible();
  await filter('', '5000', 4);
  await filter('5340', '5900', 2);
  await expect(page.getByText('Holtin', { exact: true })).toBeVisible();
  await min.fill('6000');
  await apply.click();
  await expect(page.getByRole('alert')).toHaveText('Minimum price cannot exceed maximum price.');
  await clear.click();
  await expect(page.getByText('Showing 1–6 of 10 offers')).toBeVisible();

  const table = page.getByRole('table', { name: 'Hotel offers' });
  await table.getByRole('button', { name: 'Price', exact: true }).click();
  await expect(table.getByRole('row').nth(1)).toContainText('Lodhi Garden Suites');
  await table.getByRole('button', { name: 'Hotel', exact: true }).click();
  await expect(table.getByRole('row').nth(1)).toContainText('Aerocity Grand');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('Showing 7–10 of 10 offers')).toBeVisible();
  await page.getByRole('button', { name: 'Previous page' }).click();
  await page.getByRole('button', { name: 'View Aerocity Grand' }).click();
  await expect(page.getByRole('dialog', { name: 'Aerocity Grand' })).toBeVisible();
  await page.keyboard.press('Escape');

  await city.fill('mumbai');
  await city.press('Enter');
  await expect(page.getByText('No hotels found')).toBeVisible();
  await city.fill('unknown');
  await city.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Try Delhi or Mumbai');
  await city.fill('Delhi');
  await city.press('Enter');
  await expect(page.getByText('Showing 1–6 of 10 offers')).toBeVisible();
  const refresh = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/api/hotels/refresh?city=delhi'));
  await page.getByRole('button', { name: 'Refresh Offers' }).click();
  expect((await refresh).status()).toBe(200);
  await expect(page.getByText('Delhi offers refreshed. 10 returned.')).toBeVisible();
});

test('network failure is recoverable in the search panel', async ({ page }) => {
  const route = '**/gateway/api/hotels?*';
  await page.route(route, (request) => request.abort());
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Could not reach the backend');
  await page.unroute(route);
  await page.getByRole('button', { name: 'Retry search' }).click();
  await expect(page.getByText('Showing 1–6 of 10 offers')).toBeVisible();
});

test('offers show a loading state while the real API request is pending', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/gateway/api/hotels?*', async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/');
    await expect(page.getByText('Searching hotel offers…')).toBeVisible();
  } finally {
    release();
  }
  await expect(page.getByText('Showing 1–6 of 10 offers')).toBeVisible();
});

test('a rejected refresh keeps visible offers and reports the failure', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Showing 1–6 of 10 offers')).toBeVisible();
  await page.route('**/gateway/api/hotels/refresh?*', (route) => route.fulfill({
    status: 503,
    json: { error: { code: 'AGGREGATION_UNAVAILABLE', message: 'Hotel aggregation is temporarily unavailable.' } },
  }));
  await page.getByRole('button', { name: 'Refresh Offers' }).click();
  await expect(page.getByRole('alert')).toContainText('Refresh failed.');
  await expect(page.getByRole('alert')).toContainText('Check Temporal and the suppliers');
  await expect(page.getByText('Showing 1–6 of 10 offers')).toBeVisible();
});

for (const width of [1440, 1280, 768, 375]) {
  test('responsive layout fits at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByText('Showing 1–6 of 10 offers')).toBeVisible();
    if (width === 375) await capture(page, 'mobile-overview');
    for (const path of ['/', '/hotels', '/analytics', '/workflows', '/health']) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      if (path === '/analytics') await expect(page.getByRole('heading', { name: 'Price distribution' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path + ' should fit the viewport').toBe(true);
    }
    if (width <= 768) {
      const menu = page.getByRole('button', { name: 'Open navigation menu' });
      await menu.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Overview', exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(menu).toBeFocused();
      await page.keyboard.press('Enter');
      await page.getByRole('link', { name: 'Hotel Search' }).click();
      await expect(page).toHaveURL(/\/hotels$/);
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
    }
  });
}
