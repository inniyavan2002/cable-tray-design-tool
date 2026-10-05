import { expect, test } from '@playwright/test';

const singleFileUrl = new URL('../../dist-single/CableTrayDesign.html', import.meta.url).href;

test('the single HTML file opens from disk with no network access', async ({ page, context }) => {
  // Let local file, data and blob URLs through; block and record anything that
  // would go over the network, since that means the file needs the internet.
  const networkRequests: string[] = [];
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/^(file|data|blob):/.test(url)) return route.continue();
    networkRequests.push(url);
    return route.abort();
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(singleFileUrl);

  await expect(page.getByRole('heading', { level: 1, name: 'Cable Tray Design' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Trays' })).toBeVisible();
  await expect(page.getByText('Single-file offline build')).toBeVisible();

  const fontStatus = await page.evaluate(async () => {
    await document.fonts.ready;
    const plex = [...document.fonts].filter((face) => face.family.replace(/"/g, '').startsWith('IBM Plex'));
    return { loaded: plex.filter((face) => face.status === 'loaded').length, failed: plex.filter((face) => face.status === 'error').length };
  });
  expect(fontStatus.loaded).toBeGreaterThan(0);
  expect(fontStatus.failed).toBe(0);

  expect(networkRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('the theme choice is remembered in the single file', async ({ page }) => {
  await page.goto(singleFileUrl);
  await page.getByRole('radio', { name: 'Dark' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
