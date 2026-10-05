import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

const FEEDBACK = /script\.google\.com\/macros\//;
const SITE = fileURLToPath(new URL('../../dist-site/', import.meta.url));
/** Every entrance and one-off animation has finished by then. */
const SETTLED_MS = 5000;

/**
 * Opens a page of the website, blocking and recording every request to
 * another site. Tests that send a message answer the feedback script
 * themselves (routes added later take precedence).
 */
async function open(page: Page, path = '/') {
  const outside: string[] = [];
  const errors: string[] = [];
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost') return route.continue();
    outside.push(url.href);
    return route.abort();
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  return { outside, errors };
}

/** GitHub Pages matches file names exactly, so the letter case must match too. */
function existsExactly(relative: string): boolean {
  let dir = SITE;
  for (const part of relative.split('/').filter(Boolean)) {
    if (!existsSync(dir) || !readdirSync(dir).includes(part)) return false;
    dir = `${dir}/${part}`;
  }
  return true;
}

/** The digits each odometer is showing, read from where each column has rolled to. */
function odometers(page: Page) {
  return page.locator('[data-odometer]').evaluateAll((meters) =>
    meters.map((meter) =>
      [...meter.children]
        .map((child) => {
          if (!child.hasAttribute('data-digit-window')) return child.textContent;
          const column = child.firstElementChild!;
          const window = child.getBoundingClientRect();
          const index = Math.round((window.top - column.getBoundingClientRect().top) / window.height);
          return column.children[index]?.textContent;
        })
        .join(''),
    ),
  );
}

const hero = (page: Page) => page.locator('#top');
/**
 * Animations playing by themselves anywhere in the hero: CSS and script-driven.
 * Scroll-linked ones (the model sinking back as the page scrolls) follow the
 * scroll, not the clock, so they are left out.
 */
const playingIn = (page: Page) =>
  hero(page).evaluate((h) => h.getAnimations({ subtree: true }).filter((a) => a.playState === 'running' && a.timeline instanceof DocumentTimeline).length);
const heroDrawing = (page: Page) => hero(page).getByRole('img', { name: /^Illustration of a four-level building/ });

async function fillContact(page: Page, text = 'The weight of Oman Cables 4C 6 mm² shows as unknown in TR-02.') {
  const form = page.locator('#contact form');
  await form.getByLabel('Name').fill('A. Engineer');
  await form.getByLabel('Message').fill(text);
  await form.getByRole('button', { name: 'Send message' }).click();
  return form;
}

const answer = (body: string) => (route: Route) =>
  route.fulfill({ status: 200, contentType: body.startsWith('{') ? 'application/json' : 'text/html', headers: { 'access-control-allow-origin': '*' }, body });

test('loads everything from the site itself, with every figure from the app', async ({ page }) => {
  const { outside, errors } = await open(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cable tray sizing you can check');
  await expect(page.getByRole('list', { name: 'In figures' })).toContainText('2,455 rows');
  await expect(page.locator('#method')).toContainText('12 × Ø23.5 + 8 × Ø20.0 mm cables in 2 touching layers');
  await expect(page.getByRole('row', { name: '300 × 50: fill 51.5%, over 40%' })).toBeVisible();

  // Scroll through, so every lazy screenshot the page shows gets loaded.
  for (const id of ['#features', '#showcase', '#screens', '#catalogues', '#questions']) await page.locator(id).scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page.locator('img').evaluateAll((imgs) => (imgs as HTMLImageElement[]).filter((i) => i.offsetParent !== null).every((i) => i.complete && i.naturalWidth > 0)),
    )
    .toBe(true);
  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
});

test('every link and image on the page opens, with its exact file name', async ({ page }) => {
  await open(page);
  const refs = await page.evaluate(() =>
    [
      ...[...document.querySelectorAll('a[href]')].map((a) => (a as HTMLAnchorElement).href),
      ...[...document.querySelectorAll('img[src]')].map((i) => (i as HTMLImageElement).src),
    ].filter((href) => href.startsWith(location.origin) && !href.includes('#')),
  );
  const local = [...new Set(refs)];
  expect(local).toContain('http://localhost:4174/pdfs/Riyadh%20cables.pdf');
  expect(local.filter((r) => r.includes('/pdfs/'))).toHaveLength(9);
  expect(local.filter((r) => r.includes('/samples/'))).toHaveLength(3);
  for (const href of local) {
    const path = decodeURIComponent(new URL(href).pathname.slice(1));
    expect(existsExactly(path === '' || path.endsWith('/') ? `${path}index.html` : path), href).toBe(true);
    const response = await page.request.get(href);
    expect(response.status(), href).toBe(200);
    if (href.endsWith('.pdf')) expect((await response.body()).subarray(0, 5).toString(), href).toBe('%PDF-');
  }
});

test('every section link in the header has its section', async ({ page }) => {
  await open(page);
  const targets = await page
    .getByRole('banner')
    .getByRole('link')
    .evaluateAll((links) => links.map((a) => a.getAttribute('href')!).filter((h) => h.startsWith('#')));
  expect(targets).toEqual(['#top', '#features', '#showcase', '#workflow', '#method', '#catalogues', '#contact']);
  for (const target of targets) await expect(page.locator(target)).toHaveCount(1);
});

test('opens the app, which finds catalogue pages in the site’s pdfs folder', async ({ page }) => {
  await open(page);
  await page.getByRole('banner').getByRole('link', { name: 'Open the app' }).click();
  await expect(page).toHaveURL(/\/app\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Cable Tray Design' })).toBeVisible();
  await page.getByRole('button', { name: 'Catalog' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cable catalog' });
  await dialog.getByLabel('Search').fill('CX1-T105-W20');
  await dialog.getByRole('radio', { name: /OD 60\.3 mm/ }).check();
  await expect(dialog.getByRole('link', { name: /Open in a new tab/ })).toHaveAttribute('href', '../pdfs/Doha%20Cables.pdf#page=89');
  expect((await page.request.get(new URL('../pdfs/Doha%20Cables.pdf', page.url()).href)).status()).toBe(200);
});

test('the old address forwards to the new app, and the previous version still opens', async ({ page }) => {
  await page.goto('/tool.html');
  await expect(page).toHaveURL(/\/app\/$/);
  const previous = await page.request.get('/previous/tool.html');
  expect(previous.status()).toBe(200);
  expect(await previous.text()).toContain("const pdfPath='../pdfs/'+");
});

test.describe('the hero', () => {
  test('labels the example trays with the sizes the app selects, once the feed settles', async ({ page }) => {
    await open(page);
    // The typing and counting on the way are covered by telemetry.test.ts; here, where the labels settle.
    await expect(heroDrawing(page)).toContainText('Small power, 300 × 75');
    await expect(heroDrawing(page)).toContainText('Mixed, 450 × 150');
    await expect(heroDrawing(page)).toContainText('LV feeders, 900 × 75');
    await expect(heroDrawing(page)).toContainText('Main board');
    await expect(heroDrawing(page)).not.toContainText('▍');
  });

  test('energy particles run from the main board along every route, and the pause stops them', async ({ page }) => {
    await open(page);
    const drawing = heroDrawing(page);
    // Power: the supply into the main board, and on each of the four levels the main run and both branches; then two each for lighting and fire alarm.
    await expect(drawing.locator('.b-particle')).toHaveCount(18);
    await expect(hero(page)).toHaveAttribute('data-flow', 'on');
    await expect.poll(() => drawing.evaluate((svg) => (svg as SVGSVGElement).animationsPaused())).toBe(false);
    await hero(page).getByRole('button', { name: 'Pause animation' }).click();
    await expect.poll(() => drawing.evaluate((svg) => (svg as SVGSVGElement).animationsPaused())).toBe(true);
  });

  test('the main board reports its state, and the callouts settle on the app’s figures', async ({ page }) => {
    await open(page);
    const drawing = heroDrawing(page);
    await expect(drawing.locator('[data-sys="label"]', { hasText: 'MDB, level 0' })).toContainText(/SYSTEM ACTIVE|POWER FLOW|DISTRIBUTION ONLINE/);
    await expect(drawing).toContainText('FILL 34.3%');
    await expect(drawing).toContainText('450 × 150 mm');
    await expect(drawing).toContainText('MDB → TR-01');
  });

  test('the model sinks back and dims as the page scrolls on', async ({ page }) => {
    await open(page);
    const model = page.locator('[data-hero-model]');
    expect(await model.evaluate((m) => Number(getComputedStyle(m).opacity))).toBe(1);
    await page.evaluate(() => window.scrollTo(0, 450));
    await expect.poll(() => model.evaluate((m) => Number(getComputedStyle(m).opacity))).toBeLessThan(0.9);
  });

  test('when the device asks for reduced motion, Play starts the animation, and the choice is remembered', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
    await hero(page).getByRole('button', { name: 'Play animation' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
    await expect(hero(page)).toHaveAttribute('data-flow', 'on');
    await expect(heroDrawing(page).locator('.b-particle')).toHaveCount(18);
    await expect(hero(page).getByRole('button', { name: 'Pause animation' })).toBeFocused();
    await expect(hero(page).locator('[data-live-badge]')).toHaveText('[LIVE: TR-02 ASSEMBLY ACTIVE]');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
    await expect(hero(page)).toHaveAttribute('data-flow', 'on');
  });

  test('the monitor follows the scan from tray to tray, with each tray’s figures', async ({ page }) => {
    await open(page);
    const readout = hero(page).locator('[data-scan-readout]');
    await expect(readout).toHaveAttribute('data-scan-readout', 'TR-01', { timeout: 6000 });
    await expect(readout).toContainText('900 × 75');
    await expect(readout).toHaveAttribute('data-scan-readout', 'TR-02', { timeout: 6000 });
    await expect(readout).toContainText('Fill 34.3%');
    await expect(readout).toContainText('20 cables');
  });

  test('the live badge follows the animation', async ({ page }) => {
    await open(page);
    const badge = hero(page).locator('[data-live-badge]');
    await expect(badge).toHaveText('[LIVE: TR-02 ASSEMBLY ACTIVE]');
    await hero(page).getByRole('button', { name: 'Pause animation' }).click();
    await expect(badge).toHaveText('[PAUSED: TR-02 ASSEMBLY]');
  });

  test('current flows until the reader pauses it, and then nothing moves', async ({ page }) => {
    // Tall enough that taking the screenshot does not scroll the page, which would move the pointer over the drawing.
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page);
    await expect(hero(page)).toHaveAttribute('data-flow', 'on');
    await expect.poll(() => playingIn(page)).toBeGreaterThan(0);

    await hero(page).getByRole('button', { name: 'Pause animation' }).click();
    await expect(hero(page).getByRole('button', { name: 'Play animation' })).toBeVisible();
    // The hero is drawn afresh, complete and still, and the button keeps the focus.
    await expect(hero(page).getByRole('button', { name: 'Play animation' })).toBeFocused();
    await expect(hero(page)).toHaveAttribute('data-flow', 'off');
    await expect.poll(() => playingIn(page)).toBe(0);

    // Off the hero (onto the header), so the drawing is not following the mouse; let the build-up and the label feed finish.
    await page.mouse.move(2, 10);
    await expect(heroDrawing(page)).not.toContainText('▍');
    await page.waitForTimeout(1500);
    const before = await hero(page).screenshot({ animations: 'allow' });
    await page.waitForTimeout(500);
    // equals(), not toEqual(): a failed toEqual on two images spends minutes printing the difference.
    expect((await hero(page).screenshot({ animations: 'allow' })).equals(before), 'the hero is still moving').toBe(true);

    await hero(page).getByRole('button', { name: 'Play animation' }).click();
    await expect(hero(page)).toHaveAttribute('data-flow', 'on');
  });

  test('one pause stops every loop on the page', async ({ page }) => {
    await open(page);
    await hero(page).getByRole('button', { name: 'Pause animation' }).click();
    await page.locator('#showcase').scrollIntoViewIfNeeded();
    await expect(page.locator('#showcase').getByRole('button', { name: 'Play animation' })).toBeVisible();
    await expect(page.locator('#showcase svg.bldg')).toHaveAttribute('data-flow', 'off');
  });

  test('stops its loops when scrolled out of view', async ({ page }) => {
    await open(page);
    await expect(hero(page)).toHaveAttribute('data-flow', 'on');
    await page.locator('#catalogues').scrollIntoViewIfNeeded();
    await expect(hero(page)).toHaveAttribute('data-flow', 'off');
  });

  test('the drawing and a spotlight follow the mouse', async ({ page }) => {
    await open(page);
    const box = (await heroDrawing(page).boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.9);
    await expect(hero(page)).toHaveAttribute('data-pointer', 'on');
    const labels = heroDrawing(page).locator(':scope > g').last();
    await expect.poll(() => labels.evaluate((g) => getComputedStyle(g).transform)).not.toBe('none');
    await page.mouse.move(2, 2);
    await expect(hero(page)).not.toHaveAttribute('data-pointer');
  });

  test('shows TR-02 and the main board on load; hovering a label lights its part and lists its figures', async ({ page }) => {
    // Reduced motion keeps the drawing from following the mouse, so the pointer stays on what it hovers.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    const drawing = heroDrawing(page);
    const tr02 = drawing.locator('[data-sys="label"]', { hasText: 'TR-02' });
    await expect(tr02).toHaveCSS('opacity', '1');
    await expect(tr02).toContainText('Small power, 300 × 75');
    await expect(drawing.locator('[data-sys="label"]', { hasText: 'MDB, level 0' })).toHaveCSS('opacity', '1');
    await expect(tr02.locator('.b-spec')).toHaveCSS('opacity', '0');
    await expect(drawing.locator('.b-target[data-on]')).toHaveCount(0);

    await tr02.getByText('TR-02', { exact: true }).hover();
    await expect(tr02).toHaveAttribute('data-on', 'true');
    await expect(drawing.locator('.b-target[data-on]')).toHaveCount(1);
    await expect(tr02.locator('.b-spec')).toHaveCSS('opacity', '1');
    await expect(tr02.locator('.b-spec')).toContainText('300 × 75 mm');
    await expect(tr02.locator('.b-spec')).toContainText('34.3% of 40%');
    await expect(tr02.locator('.b-spec')).toContainText('20 in 2 layers');
    await expect(tr02.locator('.b-spec')).toContainText('Small power');
    await expect(tr02.locator('.b-spec')).toContainText('14.9 kg/m (1 row unknown)');
    await page.mouse.move(2, 2);
    await expect(drawing.locator('.b-target[data-on]')).toHaveCount(0);

    // Hovering a tray itself shows its label's figures too. In page order: TR-03 (level 2), TR-02 (level 3), then the riser TR-01.
    const tr03 = drawing.locator('[data-sys="label"]', { hasText: 'TR-03' });
    const box = (await drawing.locator('.b-hit[data-kind="tray"]').nth(0).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(tr03).toHaveAttribute('data-on', 'true');
    await expect(tr03.locator('.b-spec')).toContainText('12 in 2 layers');
  });

  test('is complete and still at once when motion is reduced', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await expect(heroDrawing(page).locator('.b-particle')).toHaveCount(0);
    // Still, but the reader can still choose to play it.
    await expect(hero(page).getByRole('button', { name: 'Play animation' })).toBeVisible();
    await expect(hero(page).locator('[data-live-badge]')).toHaveText('[PAUSED: TR-02 ASSEMBLY]');
    await expect(hero(page)).toHaveAttribute('data-flow', 'off');
    await page.evaluate(() => document.fonts.ready);
    // The whole model and its labels are there at once, with their final figures.
    await expect(heroDrawing(page)).toContainText('Small power, 300 × 75', { timeout: 500 });
    await expect(heroDrawing(page)).not.toContainText('▍');
    const before = await hero(page).screenshot({ animations: 'allow' });
    await page.waitForTimeout(500);
    // equals(), not toEqual(): a failed toEqual on two images spends minutes printing the difference.
    expect((await hero(page).screenshot({ animations: 'allow' })).equals(before), 'the hero is still moving').toBe(true);

    await page.getByRole('list', { name: 'In figures' }).scrollIntoViewIfNeeded();
    expect(await odometers(page)).toEqual(['2,455', '11', '6', '30', '3']);
    const box = (await heroDrawing(page).boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.1);
    await expect(hero(page)).not.toHaveAttribute('data-pointer');
  });
});

test.describe('the features’ workflow', () => {
  const stage = (page: Page, n: number) => page.locator(`#features [data-stage="${n}"]`);

  test('runs stage by stage on tray TR-02, its fill going over the limit before the next size passes', async ({ page }) => {
    await open(page);
    await page.locator('#features [data-stage="1"]').scrollIntoViewIfNeeded();
    await expect(stage(page, 1)).toHaveAttribute('data-state', 'running');
    await expect(stage(page, 2)).toHaveAttribute('data-state', 'queued');
    await expect(stage(page, 2)).toHaveAttribute('data-state', 'running', { timeout: 6000 });
    await expect(stage(page, 1)).toHaveAttribute('data-state', 'done');
    await expect(page.locator('#features .fw-wire-lit[data-lit]')).toHaveCount(1);
    // The sizing stage tries 300 × 50, finds 51.5% over the 40% limit, and passes at 300 × 75.
    const sizing = stage(page, 4);
    await sizing.scrollIntoViewIfNeeded();
    await expect(sizing).toContainText('OVER THE LIMIT', { timeout: 15000 });
    await expect(sizing).toContainText('300 × 50');
    await expect(sizing).toContainText('PASS, UNDER THE LIMIT', { timeout: 6000 });
    await expect(sizing).toContainText('300 × 75');
    await expect(sizing).toContainText('34.3%');
  });

  test('is complete and still at once when motion is reduced', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.locator('#features').scrollIntoViewIfNeeded();
    await expect(page.locator('#features article[data-state="done"]')).toHaveCount(6);
    await expect(page.locator('#features [data-run]')).toHaveText('Report ready');
    await expect(stage(page, 1)).toContainText('2,455');
    await expect(stage(page, 3)).toContainText('7,718 mm²');
    await expect(stage(page, 3)).toContainText('288.7 × 47.0 mm');
    await expect(stage(page, 4)).toContainText('34.3%');
    // The section as the app draws it: tray TR-02's 20 cables.
    await expect(stage(page, 5).locator('svg circle')).toHaveCount(20);
    await expect(page.locator('#features .fw-wire-lit[data-lit]')).toHaveCount(5);
  });
});

test.describe('the network behind the hero', () => {
  /** Boxes of everything the network writes, and of what it must stay clear of: the hero's text lines and buttons, and the drawing's labels and monitor. */
  const boxes = (page: Page) =>
    hero(page).evaluate((h) => {
      const rect = (r: DOMRect) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
      const lines: DOMRect[] = [];
      const walker = document.createTreeWalker(h.querySelector('[data-hero-text]')!, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        range.selectNodeContents(node);
        lines.push(...range.getClientRects());
      }
      return {
        written: [...h.querySelectorAll('svg.net text')].map((t) => ({ text: t.textContent, ...rect(t.getBoundingClientRect()) })),
        keepClear: [
          ...lines,
          ...h.querySelectorAll('[data-hero-text] a'),
          ...h.querySelectorAll('svg.bldg [data-sys="label"][data-show~="all"] .b-label-box'),
          h.querySelector('[data-hero-monitor]')!,
        ].map((r) => rect(r instanceof DOMRect ? r : r.getBoundingClientRect())),
      };
    });

  for (const [width, height] of [
    [1280, 720],
    [1440, 900],
    [1600, 900],
    [1920, 1080],
  ] as const) {
    test(`at ${width} × ${height}, writes nothing over the text or the drawing`, async ({ page }) => {
      // Still, so the drawing is where its layout puts it.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height });
      await open(page);
      await expect(hero(page).locator('svg.net').first()).toBeAttached();
      const { written, keepClear } = await boxes(page);
      expect(written.length).toBeGreaterThan(0);
      for (const w of written) {
        const over = keepClear.find((k) => w.left < k.right && k.left < w.right && w.top < k.bottom && k.top < w.bottom);
        expect(over, `"${w.text}" overlaps ${JSON.stringify(over)}`).toBeUndefined();
      }
    });
  }

  test('quotes the app’s figures for the example trays', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1600, height: 900 });
    await open(page);
    const network = hero(page).locator('svg.net');
    await expect(network.locator('[data-row="TR-02"]')).toHaveText('TR-02 300 × 75');
    await expect(network.locator('[data-row="FILL"]')).toHaveText('FILL 34.3%');
    await expect(network.locator('[data-row="CABLES"]')).toHaveText('CABLES 20');
    await expect(network.locator('[data-row="WT"]')).toHaveText('WT 14.9 kg/m');
    for (const text of ['40% FILL LIMIT', '300 × 75 mm', '450 × 150 mm', '900 × 75 mm', 'MDB → TR-01', 'SYSTEM ACTIVE', 'POWER FLOW']) await expect(network.getByText(text, { exact: true })).toHaveCount(1);
  });

  test('is left out where the hero stacks', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await open(page);
    await expect(hero(page).locator('svg.net')).toHaveCount(0);
  });
});

/**
 * True when the element is drawn fully opaque and nothing covers its centre:
 * what a reader would call there, not blank. Covers that let the pointer
 * through count; ones that have faded out do not.
 */
const readable = (el: Element) => {
  const opacity = (e: Element | null) => {
    let o = 1;
    for (; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    return o;
  };
  if (opacity(el) < 0.99) return false;
  const box = el.getBoundingClientRect();
  const hitAll = document.head.appendChild(document.createElement('style'));
  hitAll.textContent = '* { pointer-events: auto !important; }';
  const stack = document.elementsFromPoint(box.x + box.width / 2, box.y + box.height / 2);
  hitAll.remove();
  const top = stack.find((e) => opacity(e) > 0.05);
  return top !== undefined && el.contains(top);
};

for (const [device, button] of [
  ['reduce', 'Play animation'],
  ['no-preference', 'Pause animation'],
] as const) {
  test(`after "${button}" in the hero, the sections that reveal themselves still come in as they scroll into view`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: device });
    await open(page);
    await hero(page).getByRole('button', { name: button }).click();
    // Feature cards, the method's formulas and the catalogue rows: each sets its reveal up when it is drawn.
    for (const part of await page.locator('#features h3, #method pre code > span, #catalogues tbody tr').all()) {
      await part.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await expect.poll(() => part.evaluate(readable), { timeout: SETTLED_MS }).toBe(true);
    }
  });
}

test('the figures roll to their values when scrolled into view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await open(page);
  await page.getByRole('list', { name: 'In figures' }).scrollIntoViewIfNeeded();
  await expect.poll(() => odometers(page), { timeout: 3000 }).toEqual(['2,455', '11', '6', '30', '3']);
});

test.describe('the showcase', () => {
  test('shows tray TR-03 as the app draws it in the cable tray view', async ({ page }) => {
    await open(page);
    const showcase = page.locator('#showcase');
    await showcase.scrollIntoViewIfNeeded();
    await expect(showcase.getByRole('tab', { name: 'Cable trays' })).toHaveAttribute('aria-selected', 'true');
    const panel = showcase.getByRole('tabpanel');
    await expect(panel.getByRole('listitem').first()).toHaveText(/TR-01\s*LV feeders\s*900 × 75/);
    const section = panel.getByRole('img', { name: 'Tray TR-03 as the app draws it: 450 × 150 mm with 12 cables in 2 layers, fill 20.8% of 40%' });
    await expect(section.locator('circle')).toHaveCount(12);
    await expect(section.locator('text', { hasText: 'spare 64.5' })).toHaveCSS('opacity', '1', { timeout: SETTLED_MS });
  });

  test('switches views with the tabs and the arrow keys', async ({ page }) => {
    await open(page);
    const showcase = page.locator('#showcase');
    const drawing = showcase.locator('svg.bldg');
    await showcase.getByRole('tab', { name: 'Power' }).click();
    await expect(drawing).toHaveAttribute('data-view', 'power');
    await expect(showcase.getByRole('tabpanel')).toContainText('Power distribution');
    await expect(drawing).toHaveAccessibleName(/power distribution highlighted/);

    await page.keyboard.press('ArrowRight');
    await expect(showcase.getByRole('tab', { name: 'Lighting' })).toBeFocused();
    await expect(showcase.getByRole('tab', { name: 'Lighting' })).toHaveAttribute('aria-selected', 'true');
    await expect(drawing).toHaveAttribute('data-view', 'lighting');
    await page.keyboard.press('Home');
    await expect(showcase.getByRole('tab', { name: 'Cable trays' })).toBeFocused();
    await expect(drawing).toHaveAttribute('data-view', 'trays');
  });
});

test.describe('the engineering steps', () => {
  test('the hero names its three systems', async ({ page }) => {
    await open(page);
    const legend = page.getByRole('list', { name: 'Systems in the drawing' });
    await expect(legend.getByRole('listitem')).toHaveText(['Power', 'Lighting', 'Fire alarm']);
  });

  test('tray T2 is sized step by step: over the limit at 300 × 50, passing at 300 × 75', async ({ page }) => {
    await open(page);
    const steps = page.locator('#method ol').first();
    await steps.scrollIntoViewIfNeeded();
    await expect(steps.locator('li[data-lit]')).toHaveCount(5, { timeout: 8000 });
    await expect(steps).toContainText('Required 288.7 × 47.0 mm');
    await expect(steps).toContainText('300 × 75, PASS');
    await expect(steps).toContainText('34.3%');
  });

  test('the showcase lays TR-03’s cables and its fill stops at the app’s figure', async ({ page }) => {
    await open(page);
    const panel = page.locator('#showcase').getByRole('tabpanel');
    await panel.scrollIntoViewIfNeeded();
    await expect(panel).toContainText('20.8% of 40%', { timeout: 8000 });
  });

  test('the showcase has a fire alarm view of its own', async ({ page }) => {
    await open(page);
    const showcase = page.locator('#showcase');
    await showcase.getByRole('tab', { name: 'Fire alarm' }).click();
    await expect(showcase.locator('svg.bldg')).toHaveAttribute('data-view', 'fire');
    await expect(showcase.getByRole('tabpanel')).toContainText('Detectors, four on each level');
  });

  test('every manufacturer’s rows are validated as the scan passes', async ({ page }) => {
    await open(page);
    const table = page.locator('#catalogues table');
    await table.scrollIntoViewIfNeeded();
    await expect(table.getByText('Validated')).toHaveCount(9, { timeout: 8000 });
  });
});

test.describe('the workflow', () => {
  test('lights each step as the page scrolls to it', async ({ page }) => {
    await open(page);
    const steps = page.locator('#workflow ol > li');
    await expect(steps).toHaveCount(5);
    await steps.last().evaluate((li) => window.scrollTo(0, li.getBoundingClientRect().bottom + window.scrollY - window.innerHeight * 0.4));
    await expect(page.locator('#workflow ol > li[data-active]')).toHaveCount(5);
  });

  test('has every step lit at once when motion is reduced', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await expect(page.locator('#workflow ol > li[data-active]')).toHaveCount(5);
  });
});

test('shows a screen full size, and Escape returns to where the reader was', async ({ page }) => {
  await open(page);
  const card = page.locator('#screens').getByRole('button', { name: /Compare trays/ });
  await card.scrollIntoViewIfNeeded();
  await card.click();
  const dialog = page.getByRole('dialog', { name: 'Compare trays' });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.locator('img').evaluate((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth)).toBe(1360);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(card).toBeFocused();
});

test.describe('the contact form', () => {
  test('asks for a name, enough detail and a usable email before sending', async ({ page }) => {
    await open(page);
    const form = page.locator('#contact form');
    await form.getByLabel('Email').fill('a.engineer@example');
    await form.getByRole('button', { name: 'Send message' }).click();
    await expect(form.getByText('Enter your name.')).toBeVisible();
    await expect(form.getByText('Enter an email address like name@example.com')).toBeVisible();
    await expect(form.getByText('Write at least 25 characters')).toBeVisible();
    await expect(form.getByLabel('Name')).toBeFocused();
    await expect(form.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true');
    await expect(form.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  test('says "Sent" only when the script confirms, and sends every field with the app version', async ({ page }) => {
    await open(page);
    let body: Record<string, string> = {};
    await page.route(FEEDBACK, (route) => {
      body = JSON.parse(route.request().postData() ?? '{}');
      return answer('{"ok":true}')(route);
    });
    const form = page.locator('#contact form');
    await form.getByLabel('Email').fill('a.engineer@example.com');
    await form.getByLabel('Company').fill('Example Consultants');
    await fillContact(page);
    await expect(form.getByRole('status')).toHaveText(/^Sent\./);
    await expect(form.getByLabel('Message')).toHaveValue('');
    expect(body).toMatchObject({ name: 'A. Engineer', email: 'a.engineer@example.com', organisation: 'Example Consultants', version: '0.1.0', source: 'website' });
  });

  test('keeps the message when the script reports a problem', async ({ page }) => {
    await open(page);
    await page.route(FEEDBACK, answer('{"ok":false}'));
    const form = await fillContact(page);
    await expect(form.getByRole('status')).toHaveText(/^Not sent/);
    await expect(form.getByLabel('Message')).not.toHaveValue('');
  });

  test('does not claim success when the script gives no result', async ({ page }) => {
    await open(page);
    await page.route(FEEDBACK, answer('<html><body>The script completed but did not return anything.</body></html>'));
    const form = await fillContact(page);
    await expect(form.getByRole('status')).toHaveText(/did not confirm/);
    await expect(form.getByLabel('Message')).not.toHaveValue('');
  });

  test('does not claim success when the connection fails', async ({ page }) => {
    await open(page);
    await page.route(FEEDBACK, (route) => route.abort('failed'));
    const form = await fillContact(page);
    await expect(form.getByRole('status')).toHaveText(/did not confirm/);
  });

  test('sends nothing while offline', async ({ page, context }) => {
    await open(page);
    let sent = false;
    await page.route(FEEDBACK, (route) => {
      sent = true;
      return answer('{"ok":true}')(route);
    });
    await context.setOffline(true);
    const form = await fillContact(page);
    await expect(form.getByRole('status')).toHaveText(/You are offline/);
    expect(sent).toBe(false);
  });
});

test('the header turns to frosted glass once the page scrolls', async ({ page }) => {
  await open(page);
  const header = page.getByRole('banner');
  await expect(header).not.toHaveAttribute('data-scrolled');
  const height = (await header.boundingBox())!.height;
  await page.locator('#features').scrollIntoViewIfNeeded();
  await expect(header).toHaveAttribute('data-scrolled', 'true');
  await expect.poll(() => header.evaluate((h) => getComputedStyle(h).backdropFilter)).toContain('blur(18px)');
  // The bar does not jump: it is as tall as before.
  expect((await header.boundingBox())!.height).toBe(height);
});

test('the header marks the section being read', async ({ page }) => {
  await open(page);
  const nav = page.getByRole('navigation', { name: 'Sections' });
  await page.locator('#method').evaluate((section) => window.scrollTo(0, (section as HTMLElement).offsetTop + 40));
  await expect(nav.getByRole('link', { name: 'Method' })).toHaveAttribute('aria-current', 'true');
  await expect(nav.locator('[aria-current]')).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(nav.locator('[aria-current]')).toHaveCount(0);
});

test('on a phone the section links fold into a menu, without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const menu = page.getByRole('button', { name: 'Menu' });
  const nav = page.getByRole('navigation', { name: 'Sections' });
  await expect(page.getByRole('banner').getByRole('link', { name: 'Open the app' })).toBeHidden();
  await expect(nav.getByRole('link', { name: 'Catalogues' })).toBeHidden();
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await nav.getByRole('link', { name: 'Catalogues' }).click();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  for (const id of ['#features', '#showcase', '#workflow', '#screens', '#catalogues', '#contact', '#questions']) await page.locator(id).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  // Nothing is cut off inside a section either: the showcase's panel fits the screen.
  const panel = (await page.locator('#showcase [role="tabpanel"]').boundingBox())!;
  expect(panel.x + panel.width).toBeLessThanOrEqual(390);
});

test('without scripts, a short fallback still leads to the app', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Cable Tray Design' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the app' })).toHaveAttribute('href', 'app/');
  await context.close();
});

test('keeps its navy theme whatever the device prefers', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await open(page);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(6, 13, 25)');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`passes an accessibility scan with the device set to ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await open(page);
    await page.waitForTimeout(SETTLED_MS);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}
