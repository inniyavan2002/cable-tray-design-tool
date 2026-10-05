import { expect, test, type Page } from '@playwright/test';

const singleFileUrl = new URL('../../dist-single/CableTrayDesign.html', import.meta.url).href;

/** Blocks everything that would go over the network, so the tests prove offline use. */
async function openOffline(page: Page) {
  const network: string[] = [];
  await page.context().route('**/*', (route) => {
    const url = route.request().url();
    if (/^(file|data|blob):/.test(url)) return route.continue();
    network.push(url);
    return route.abort();
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(singleFileUrl);
  return { network, errors };
}

async function addFromCatalog(page: Page, search: string, od: string, quantity: number) {
  await page.getByRole('button', { name: '+ Add cable' }).click();
  const dialog = page.getByRole('dialog', { name: /Add cable to/ });
  await dialog.getByLabel('Search').fill(search);
  await dialog.getByRole('radio', { name: new RegExp(`OD ${od.replace('.', '\\.')} mm`) }).check();
  await dialog.getByLabel('Quantity', { exact: true }).fill(String(quantity));
  await dialog.getByRole('button', { name: `Add ${quantity} cable${quantity === 1 ? '' : 's'}` }).click();
  await expect(dialog).toBeHidden();
}

const banner = (page: Page, tray = 'TR-01') => page.getByRole('status', { name: new RegExp(`^${tray}:`) });

test('reference tray T1 sizes to 900 × 75 and survives a reload', async ({ page }) => {
  const { network, errors } = await openOffline(page);

  await addFromCatalog(page, 'doha 4c 240 cu xlpe swa', '60.3', 2);
  await addFromCatalog(page, 'doha 4c 95 cu xlpe swa', '41.2', 3);
  await addFromCatalog(page, 'doha 4c 35 cu xlpe swa', '28.9', 4);

  await expect(banner(page)).toContainText('900 × 75 mm');
  await expect(banner(page)).toContainText('Required 889.1 × 60.3 mm');
  await expect(page.getByRole('img', { name: /Section of a 900 by 75 mm tray with 9 cables in 1 layer/ })).toBeVisible();
  await expect(page.getByText('Saved in this browser')).toBeVisible();

  await page.reload();
  await expect(banner(page)).toContainText('900 × 75 mm');
  await expect(page.getByText('1 row · 2 cables')).toHaveCount(0);
  await expect(page.getByText('3 rows · 9 cables')).toBeVisible();

  expect(network).toEqual([]);
  expect(errors).toEqual([]);
});

test('reference tray T2 is upsized for fill', async ({ page }) => {
  await openOffline(page);
  await page.getByRole('group', { name: 'Layers' }).getByRole('radio', { name: '2' }).check();
  await page.getByRole('group', { name: 'Spacing between cables' }).getByRole('radio', { name: 'Touching' }).check();
  await page.getByRole('switch', { name: 'Gap between layers' }).click();

  await addFromCatalog(page, 'oman 4c 16 cu xlpe swa', '23.5', 12);
  await addFromCatalog(page, 'oman 4c 6 cu xlpe swa', '20.0', 8);

  await expect(banner(page)).toContainText('300 × 75 mm');
  await expect(banner(page)).toContainText('PASS · UPSIZED FOR FILL');
  await expect(page.getByText('300 × 50 gave 51.5%, so the next standard size up by area was used.')).toBeVisible();
});

test('manual cables and several trays', async ({ page }) => {
  await openOffline(page);
  await page.getByRole('button', { name: '+ Add cable' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Manual cable' }).click();
  await dialog.getByLabel('Description').fill('Fire alarm FP200');
  await dialog.getByLabel('Outside diameter (mm)').fill('50');
  await dialog.getByRole('button', { name: 'Add 1 cable' }).click();
  await expect(banner(page)).toContainText('150 × 50 mm');

  await page.getByRole('button', { name: '+ Add tray' }).click();
  await expect(banner(page, 'TR-02')).toContainText('NO CABLES');
  const trays = page.getByRole('navigation', { name: 'Trays' });
  await expect(trays.getByRole('button', { name: /^TR-01.*150 × 50 mm/ })).toBeVisible();
  await trays.getByRole('button', { name: /^TR-01/ }).click();
  await expect(banner(page)).toContainText('150 × 50 mm');
});
