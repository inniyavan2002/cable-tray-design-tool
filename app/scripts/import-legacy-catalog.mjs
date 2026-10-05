// One-time import: copies the cable catalog out of ../tool.html (the
// MASTER_CATALOG array) into one JSON file per brand under
// src/data/catalog/source/. Rows are copied unchanged; normalisation and
// checks happen in src/data/catalog. Kept for provenance; rerunning it
// overwrites the source files.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BRAND_FILES = {
  alfanar: 'alfanar',
  Bahra: 'bahra',
  'Doha Cables': 'doha',
  Ducab: 'ducab',
  'Jeddah Cable Company': 'jeddah',
  'Oman Cables': 'oman',
  RAMCRO: 'ramcro',
  'Riyadh Cables': 'riyadh',
  'Saudi Cable Company': 'saudi',
};

const html = readFileSync(new URL('../../tool.html', import.meta.url), 'utf8');
const line = html.split(/\r?\n/).find((l) => l.startsWith('const MASTER_CATALOG = '));
if (!line) throw new Error('MASTER_CATALOG not found in tool.html');
const rows = JSON.parse(line.slice('const MASTER_CATALOG = '.length).replace(/;\s*$/, ''));

const byBrand = new Map();
for (const row of rows) {
  const file = BRAND_FILES[row.brand];
  if (!file) throw new Error(`Unknown brand "${row.brand}" (row ${row.id})`);
  if (!byBrand.has(file)) byBrand.set(file, []);
  byBrand.get(file).push(row);
}

const outDir = new URL('../src/data/catalog/source/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const [file, brandRows] of byBrand) {
  // One row per line keeps diffs readable when a row is corrected.
  const json = `[\n${brandRows.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`;
  writeFileSync(new URL(`${file}.json`, outDir), json);
  console.log(`${file}.json: ${brandRows.length} rows`);
}
console.log(`Total: ${rows.length} rows`);
