import { expect, test } from '@playwright/test';

const singleFileUrl = new URL('../../dist-single/CableTrayDesign.html', import.meta.url).href;

// Playwright's drag and drop does not work while it records a trace, so this
// file never records one.
test.use({ trace: 'off' });

test('trays can be reordered by dragging', async ({ page }) => {
  await page.goto(singleFileUrl);
  await page.getByRole('button', { name: '+ Add tray' }).click();
  await page.getByRole('button', { name: '+ Add tray' }).click();
  const trays = page.getByRole('navigation', { name: 'Trays' });
  await trays.getByRole('button', { name: /^TR-03/ }).dragTo(trays.getByRole('button', { name: /^TR-01/ }));
  await expect(trays.getByRole('listitem')).toHaveText([/^TR-03/, /^TR-01/, /^TR-02/]);
});
