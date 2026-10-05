import { expect, test } from '@playwright/test';

test('the static site build loads with relative asset paths', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('http://localhost:4173/');

  await expect(page.getByRole('heading', { level: 1, name: 'Cable Tray Design' })).toBeVisible();
  await expect(page.getByText('Web build')).toBeVisible();
  const scriptSources = await page.locator('script[src]').evaluateAll((scripts) =>
    scripts.map((script) => script.getAttribute('src') ?? ''),
  );
  expect(scriptSources.length).toBeGreaterThan(0);
  for (const src of scriptSources) expect(src.startsWith('./')).toBe(true);
  expect(errors).toEqual([]);
});

test('narrow screens show one pane at a time', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:4173/');

  await expect(page.getByRole('region', { name: 'Inputs' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Result' })).toBeHidden();

  await page.getByRole('button', { name: 'Result' }).click();
  await expect(page.getByRole('region', { name: 'Result' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Inputs' })).toBeHidden();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
