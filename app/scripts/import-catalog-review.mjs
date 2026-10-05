// Reads decisions from a filled-in catalog review workbook and merges them
// into src/data/catalog/review.json. Usage:
//   npm run catalog:import-review -- path/to/catalog-review.xlsx
// Afterwards run `npm test`: the catalog tests check every decision, and a
// correction that still leaves an impossible value fails them.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run catalog:import-review -- path/to/catalog-review.xlsx');
  process.exit(1);
}

const REVIEW_FILE = new URL('../src/data/catalog/review.json', import.meta.url);
const CORRECTIONS = [
  ['Correct OD (mm)', 'odMm'],
  ['Correct weight (kg/km)', 'weightKgPerKm'],
  ['Correct size (mm²)', 'sizeMm2'],
  ['Correct cores', 'cores'],
];

function cellText(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && 'richText' in v) return v.richText.map((t) => t.text).join('').trim();
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '').trim();
  return String(v).trim();
}

/** Dates may arrive as Date objects, Excel serial numbers or typed text. */
function dateText(cell) {
  const v = cell.value;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Excel counts days from 1899-12-30; 25569 is 1970-01-01.
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  return cellText(cell);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(resolve(file));
const ws = wb.getWorksheet('Rows to review');
if (!ws) {
  console.error(`"${file}" has no sheet named "Rows to review".`);
  process.exit(1);
}

const columns = new Map();
ws.getRow(1).eachCell((cell, col) => columns.set(cellText(cell), col));
const col = (header) => {
  const index = columns.get(header);
  if (!index) throw new Error(`Column "${header}" is missing from the sheet.`);
  return index;
};

const today = new Date().toISOString().slice(0, 10);
const decisions = [];
const problems = [];
ws.eachRow((row, rowNumber) => {
  if (rowNumber === 1) return;
  const action = cellText(row.getCell(col('Decision'))).toLowerCase();
  if (!action) return;
  const id = cellText(row.getCell(col('Row ID')));
  const where = `Row ${rowNumber} (${id})`;
  if (!['correct', 'accept', 'exclude'].includes(action)) {
    problems.push(`${where}: decision must be correct, accept or exclude.`);
    return;
  }
  const decision = {
    id,
    action,
    note: cellText(row.getCell(col('Note'))),
    by: cellText(row.getCell(col('Reviewed by'))),
    date: dateText(row.getCell(col('Date'))) || today,
  };
  if (!decision.note) problems.push(`${where}: add a note saying what was checked.`);
  if (!decision.by) problems.push(`${where}: add the reviewer's name.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(decision.date)) problems.push(`${where}: date must be YYYY-MM-DD.`);
  const set = {};
  for (const [header, field] of CORRECTIONS) {
    const text = cellText(row.getCell(col(header)));
    if (!text) continue;
    const value = Number(text.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) problems.push(`${where}: "${header}" must be a positive number.`);
    else set[field] = value;
  }
  const conductorText = cellText(row.getCell(col('Correct conductor (Cu/Al)'))).toLowerCase();
  if (conductorText) {
    const conductor = { cu: 'Cu', copper: 'Cu', al: 'Al', aluminium: 'Al', aluminum: 'Al' }[conductorText];
    if (conductor) set.conductor = conductor;
    else problems.push(`${where}: "Correct conductor (Cu/Al)" must be Cu or Al.`);
  }
  if (action === 'correct') {
    if (!Object.keys(set).length) problems.push(`${where}: a correction needs at least one "Correct …" value.`);
    decision.set = set;
  } else if (Object.keys(set).length) {
    problems.push(`${where}: "Correct …" values are only used with the decision "correct".`);
  }
  decisions.push(decision);
});

if (problems.length) {
  console.error(`Nothing imported. Fix these rows and try again:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}

const existing = JSON.parse(readFileSync(REVIEW_FILE, 'utf8'));
const byId = new Map(existing.map((d) => [d.id, d]));
let replaced = 0;
for (const d of decisions) {
  if (byId.has(d.id)) replaced += 1;
  byId.set(d.id, d);
}
const merged = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
writeFileSync(REVIEW_FILE, `${JSON.stringify(merged, null, 2)}\n`);
console.log(`Imported ${decisions.length} decisions (${decisions.length - replaced} new, ${replaced} replacing earlier ones).`);
console.log('Now run "npm test" to check them.');
