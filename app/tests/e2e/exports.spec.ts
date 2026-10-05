import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';

const singleFileUrl = new URL('../../dist-single/CableTrayDesign.html', import.meta.url).href;
/** Copies of each export, for reviewing the real output. */
const samplesDir = fileURLToPath(new URL('../../reports/samples/', import.meta.url));

/** Reference trays T1–T3, as saved by the app; also used for the website's screenshots. */
const SAMPLE_PROJECT = JSON.parse(readFileSync(new URL('../fixtures/example-project.json', import.meta.url), 'utf8'));

async function openSample(page: Page) {
  await page.context().route('**/*', (route) => (/^(file|data|blob):/.test(route.request().url()) ? route.continue() : route.abort()));
  await page.addInitScript((json) => localStorage.setItem('ctd.project.v1', json), JSON.stringify(SAMPLE_PROJECT));
  await page.goto(singleFileUrl);
  await expect(page.getByRole('status', { name: /^TR-01:/ })).toContainText('900 × 75 mm');
}

async function exportFile(page: Page, scope: RegExp, format: RegExp, button: string) {
  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await dialog.getByRole('radio', { name: scope }).check();
  await dialog.getByRole('radio', { name: format }).check();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: button }).click();
  const file = await download;
  mkdirSync(samplesDir, { recursive: true });
  const path = `${samplesDir}${file.suggestedFilename()}`;
  await file.saveAs(path);
  return { name: file.suggestedFilename(), bytes: readFileSync(path) };
}

test('PDF report of the whole project, after a preview', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await dialog.getByRole('radio', { name: /Whole project/ }).check();
  await dialog.getByRole('button', { name: 'Preview PDF' }).click();
  await expect(dialog.locator('iframe[title="PDF preview"]')).toBeVisible();
  await expect(dialog.getByText(/Example-Project_cable-tray-report\.pdf · \d+ pages/)).toBeVisible();

  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Save PDF' }).click();
  const file = await download;
  mkdirSync(samplesDir, { recursive: true });
  await file.saveAs(`${samplesDir}${file.suggestedFilename()}`);
  const bytes = readFileSync(`${samplesDir}${file.suggestedFilename()}`);
  expect(file.suggestedFilename()).toBe('Example-Project_cable-tray-report.pdf');
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  await expect(dialog).toBeHidden();
});

test('Excel workbook of the whole project', async ({ page }) => {
  await openSample(page);
  const { name, bytes } = await exportFile(page, /Whole project/, /Excel workbook/, 'Save Excel');
  expect(name).toBe('Example-Project_cable-tray-report.xlsx');
  const files = Object.keys(unzipSync(new Uint8Array(bytes)));
  expect(files).toContain('xl/workbook.xml');
  // One picture per tray drawing.
  expect(files.filter((f) => /^xl\/media\/.+\.png$/.test(f))).toHaveLength(3);
});

test('drawings of one tray as PNG and SVG', async ({ page }) => {
  await openSample(page);
  const png = await exportFile(page, /This tray/, /Drawing as PNG/, 'Save PNG');
  expect(png.name).toBe('Example-Project_TR-01_section.png');
  expect(png.bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(png.bytes.readUInt32BE(16)).toBeGreaterThan(1000); // width in pixels, drawn at 2×

  const svg = await exportFile(page, /This tray/, /Drawing as SVG/, 'Save SVG');
  expect(svg.name).toBe('Example-Project_TR-01_section.svg');
  expect(svg.bytes.toString('utf8')).toMatch(/^<\?xml[\s\S]*<svg[\s\S]*TR-01 · LV feeders[\s\S]*<\/svg>$/);
});

test('drawings of several trays come as one zip', async ({ page }) => {
  await openSample(page);
  const zip = await exportFile(page, /Whole project/, /Drawing as PNG/, 'Save PNG');
  expect(zip.name).toBe('Example-Project_sections-png.zip');
  expect(Object.keys(unzipSync(new Uint8Array(zip.bytes))).sort()).toEqual(['TR-01_section.png', 'TR-02_section.png', 'TR-03_section.png']);
});
