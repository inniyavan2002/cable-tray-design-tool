import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const singleFileUrl = new URL('../../dist-single/CableTrayDesign.html', import.meta.url).href;
const siteUrl = 'http://localhost:4173/';

/** Opens the offline file with every network request blocked. */
async function openOffline(page: Page) {
  await page.context().route('**/*', (route) => (/^(file|data|blob):/.test(route.request().url()) ? route.continue() : route.abort()));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(singleFileUrl);
  return errors;
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
const trayOrder = (page: Page) =>
  page
    .getByRole('navigation', { name: 'Trays' })
    .getByRole('listitem')
    .evaluateAll((items) => items.map((li) => li.textContent?.slice(0, 5)));

test('a saved project file opens in a fresh browser with the same trays', async ({ page, browser }) => {
  await openOffline(page);
  await page.getByRole('textbox', { name: 'Project name' }).fill('Tower B');
  await addFromCatalog(page, 'doha 4c 240 cu xlpe swa', '60.3', 2);
  await page.getByRole('button', { name: '+ Add tray' }).click();
  await addFromCatalog(page, 'oman 4c 16 cu xlpe swa', '23.5', 6);
  const tr02 = await banner(page, 'TR-02').textContent();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Tower-B.ctd.json');
  const path = await file.path();
  expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ format: 'cable-tray-design-project', project: { name: 'Tower B' } });

  // A new context has empty browser storage, like a colleague's computer.
  const other = await (await browser.newContext()).newPage();
  const errors = await openOffline(other);
  await other.getByLabel('Project file to open').setInputFiles({ name: file.suggestedFilename(), mimeType: 'application/json', buffer: readFileSync(path) });
  await expect(other.getByText('Opened Tower-B.ctd.json.')).toBeVisible();
  await expect(other.getByRole('textbox', { name: 'Project name' })).toHaveValue('Tower B');
  await expect(trayOrder(other)).resolves.toEqual(['TR-01', 'TR-02']);
  await expect(banner(other, 'TR-02')).toHaveText(tr02!);
  expect(errors).toEqual([]);
});

test('trays from the previous tool are imported once', async ({ page }) => {
  const oldState = {
    catalog: [],
    standards: { widths: [50, 75, 100, 150, 200, 300, 450, 600, 750, 900, 1000], heights: [25, 50, 75, 100, 150, 200], clearanceFactors: [0.3, 0.5, 1] },
    trays: [
      {
        id: 'x1',
        name: 'Riser A',
        trayType: 'Perforated',
        arrangement: 'Single Layer',
        layers: 1,
        spacingLabel: '1d',
        clearanceFactor: 0.5,
        topClearance: 0,
        layerSpaceMode: 'yes',
        maxFillPct: 40,
        sparePct: 20,
        service: 'LV Power',
        cables: [
          { id: 'c1', mode: 'catalog', catalogId: 'mdb_1873', od: 60.3, weight: 11780, qty: 2 },
          { id: 'c2', mode: 'catalog', catalogId: 'mdb_1866', od: 28.9, weight: 2210, qty: 4 },
        ],
      },
    ],
    activeTrayId: 'x1',
  };
  await page.addInitScript((json) => {
    // Seed only the first load, as if the previous tool had been used in this browser.
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('cabletray_multi_v19_fixed', json);
  }, JSON.stringify(oldState));
  await openOffline(page);

  await expect(page.getByText(/Imported 1 tray and 2 cable rows from the previous tool/)).toBeVisible();
  // 2 × 60.3 + 4 × 28.9 at 1 × OD spacing: 443.5 + 20% spare + 2 × 30.15 = 592.5 mm wide.
  await expect(banner(page, 'Riser A')).toContainText('600 × 75 mm');
  // Kept while the app is a preview, so tool.html still has its trays (see REMOVE_PREVIOUS_TOOL_DATA).
  expect(await page.evaluate(() => localStorage.getItem('cabletray_multi_v19_fixed'))).not.toBeNull();

  await page.reload();
  await expect(banner(page, 'Riser A')).toContainText('600 × 75 mm');
  await expect(page.getByText(/Imported 1 tray/)).toHaveCount(0);
});

test('undo, redo and the comparison', async ({ page }) => {
  await openOffline(page);
  await addFromCatalog(page, 'doha 4c 240 cu xlpe swa', '60.3', 2);
  await page.getByRole('button', { name: '+ Add tray' }).click();
  await page.getByRole('button', { name: '+ Add tray' }).click();

  await page.keyboard.press('Control+z');
  await expect(trayOrder(page)).resolves.toEqual(['TR-01', 'TR-02']);
  await page.keyboard.press('Control+y');
  await expect(trayOrder(page)).resolves.toEqual(['TR-01', 'TR-02', 'TR-03']);

  await page.getByRole('button', { name: /Compare trays/ }).click();
  const compare = page.getByRole('region', { name: 'Compare trays' });
  await expect(compare.getByRole('article')).toHaveCount(3);
  await expect(compare.getByRole('img', { name: /Section of a 300 by 75 mm tray/ })).toBeVisible();
  await compare.getByRole('button', { name: 'Open TR-01' }).click();
  await expect(banner(page)).toContainText('300 × 75 mm');
});

test('the catalog shows a row’s catalogue page from the pdfs folder of the site', async ({ page }) => {
  await page.goto(siteUrl);
  await page.getByRole('button', { name: 'Catalog' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cable catalog' });
  await dialog.getByLabel('Search').fill('CX1-T105-W20');
  await dialog.getByRole('radio', { name: /OD 60\.3 mm/ }).check();
  // The test browser has no PDF viewer, so the catalog offers the page as a link.
  await expect(dialog.getByRole('link', { name: /Open in a new tab/ })).toHaveAttribute('href', 'pdfs/Doha%20Cables.pdf#page=89');

  const pdf = await page.request.get(new URL('pdfs/Doha%20Cables.pdf', siteUrl).href);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

  await dialog.getByRole('button', { name: 'Add to TR-01' }).click();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(banner(page)).toContainText('150 × 75 mm');
});
