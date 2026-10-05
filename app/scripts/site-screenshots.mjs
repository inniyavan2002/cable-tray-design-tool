// Takes the website's screenshots of the app in its dark theme (the website is
// dark), from the built offline file with the example project (trays T1–T3).
// Run it when the app's screens change; build the app first with
// `npm run build:single`.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const appDir = new URL('../', import.meta.url);
const singleFile = new URL('dist-single/CableTrayDesign.html', appDir);
const imagesDir = new URL('site/images/', appDir);
const publicDir = new URL('site/public/', appDir);
const project = JSON.parse(readFileSync(new URL('tests/fixtures/example-project.json', appDir), 'utf8'));

if (!existsSync(singleFile)) {
  console.error('dist-single/CableTrayDesign.html not found. Run "npm run build:single" first.');
  process.exit(1);
}
mkdirSync(imagesDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });

const SHOTS = [
  { name: 'app', activeTrayId: 't3' },
  { name: 'compare', activeTrayId: 't3', then: (page) => page.getByRole('button', { name: /Compare trays/ }).click() },
  { name: 'catalog', activeTrayId: 't2', then: (page) => page.getByRole('button', { name: 'View cable 2 in the catalog' }).click() },
  { name: 'export', activeTrayId: 't3', then: (page) => page.getByRole('button', { name: 'Export' }).click() },
];

const browser = await chromium.launch();
async function shot({ activeTrayId, theme, width, height, then }, path, options) {
  // Reduced motion, so every view is captured settled rather than halfway through fading in.
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript(
    ([json, theme]) => {
      localStorage.setItem('ctd.project.v1', json);
      localStorage.setItem('ctd.theme', theme);
    },
    [JSON.stringify({ ...project, activeTrayId }), theme],
  );
  await page.goto(singleFile.href);
  // The preview notice is removed at the release; the website shows the app as released.
  await page.addStyleTag({ content: '[role="note"]{display:none!important}' });
  await page.getByRole('heading', { name: 'Cable Tray Design' }).waitFor();
  if (then) await then(page);
  // Runs in the page, so it is passed as text.
  await page.evaluate('document.fonts.ready.then(() => true)');
  await page.screenshot({ path: fileURLToPath(path), ...options });
  await page.close();
}

for (const s of SHOTS) {
  await shot({ ...s, theme: 'dark', width: 1360, height: 820 }, new URL(`${s.name}-dark.jpg`, imagesDir), { type: 'jpeg', quality: 80 });
}
// Shown when a link to the website is shared in email or chat.
await shot({ activeTrayId: 't3', theme: 'dark', width: 1200, height: 630 }, new URL('og-image.png', publicDir), { type: 'png' });
await browser.close();
console.log('Screenshots written to site/images/ and site/public/og-image.png');
