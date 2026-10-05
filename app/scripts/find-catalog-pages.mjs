// Finds the catalogue page of rows that have a product code but no page
// number (all RAMCRO rows), by searching the code in the PDF's text. A page is
// recorded only when the code appears on exactly one page. The result,
// src/data/catalog/foundPages.json, is committed; rerun only if the PDFs or
// source rows change.
//
// pdf.js is fetched with `npm pack` into a temporary folder rather than being
// a project dependency, since this runs rarely. Its warnings about a missing
// canvas package are expected: reading text does not need rendering.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PDFJS = 'pdfjs-dist@6.3.289';
const appDir = new URL('../', import.meta.url);
const sourceDir = new URL('src/data/catalog/source/', appDir);
const pdfDir = new URL('../pdfs/', appDir);
const outFile = new URL('src/data/catalog/foundPages.json', appDir);

// Brand names as written in the source rows, and their catalogue files (see src/data/catalog/brands.ts).
const PDF_BY_BRAND = {
  alfanar: 'Alfanar cables.pdf',
  Bahra: 'Bahra electric cables.pdf',
  'Doha Cables': 'Doha Cables.pdf',
  Ducab: 'Ducab cables.pdf',
  'Jeddah Cable Company': 'Jeddah cables.pdf',
  'Oman Cables': 'Oman Cables.pdf',
  RAMCRO: 'Ramco cables.pdf',
  'Riyadh Cables': 'Riyadh cables.pdf',
  'Saudi Cable Company': 'Saudi cables.pdf',
};

const hasPage = (row) => Number.isInteger(Number(row.sourcePage)) && Number(row.sourcePage) > 0;
const rows = readdirSync(sourceDir)
  .filter((name) => name.endsWith('.json'))
  .flatMap((name) => JSON.parse(readFileSync(new URL(name, sourceDir), 'utf8')))
  .filter((row) => !hasPage(row) && String(row.code ?? '').trim().length >= 6);

const work = mkdtempSync(join(tmpdir(), 'pdfjs-'));
try {
  // A shell is needed to run npm.cmd on Windows; the command is a fixed string.
  const packed = spawnSync(`npm pack ${PDFJS} --silent`, { cwd: work, shell: true, encoding: 'utf8' });
  if (packed.status !== 0) throw new Error(`npm pack ${PDFJS} failed: ${packed.stderr}`);
  const tarball = packed.stdout.trim().split(/\r?\n/).at(-1);
  mkdirSync(join(work, 'pdfjs'));
  const untar = spawnSync('tar', ['-xzf', tarball, '-C', 'pdfjs'], { cwd: work, encoding: 'utf8' });
  if (untar.status !== 0) throw new Error(`Extracting ${tarball} failed: ${untar.stderr}`);
  const { getDocument } = await import(pathToFileURL(join(work, 'pdfjs', 'package', 'legacy', 'build', 'pdf.mjs')).href);

  const pages = {};
  const counts = {};
  for (const [brand, file] of Object.entries(PDF_BY_BRAND)) {
    const brandRows = rows.filter((row) => row.brand === brand);
    if (!brandRows.length) continue;
    const doc = await getDocument({ data: new Uint8Array(readFileSync(new URL(file, pdfDir))), verbosity: 0 }).promise;
    const texts = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      texts.push(content.items.map((item) => item.str).join(' ').replace(/\s+/g, ''));
    }
    let found = 0;
    for (const row of brandRows) {
      const code = String(row.code).replace(/\s+/g, '');
      const hits = texts.flatMap((text, i) => (text.includes(code) ? [i + 1] : []));
      if (hits.length === 1) {
        pages[row.id] = hits[0];
        found += 1;
      }
    }
    counts[brand] = `${found} of ${brandRows.length}`;
  }

  const sorted = Object.fromEntries(Object.entries(pages).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })));
  const about = 'Catalogue pages for rows that have a product code but no page number, found by scripts/find-catalog-pages.mjs: the code appears on exactly this PDF page.';
  writeFileSync(outFile, `${JSON.stringify({ about, pages: sorted }, null, 2)}\n`);
  console.log('Pages found:', counts);
} finally {
  rmSync(work, { recursive: true, force: true });
}
