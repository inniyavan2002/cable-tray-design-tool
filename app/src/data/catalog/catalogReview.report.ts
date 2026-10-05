/**
 * Writes the catalog review workbook (reports/catalog-review.xlsx) listing
 * every row the automatic checks flagged, for engineers to check against the
 * manufacturer PDFs, plus a Markdown summary (reports/catalog-checks.md).
 * Run with `npm run catalog:review`; read decisions back with
 * `npm run catalog:import-review -- <file>`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { it } from 'vitest';
import { plain } from '../../domain/format';
import { describeCable } from './checks';
import { loadCatalog, sourceRows } from './index';
import { normalizeRow } from './normalize';
import reviewDecisions from './review.json';
import type { ReviewDecision } from './review';
import type { CatalogCable, FlagCode } from './types';

const INK = 'FF1B2A38';
const INPUT = 'FFFFF4CC';
const EXCLUDED = 'FFF6E0DB';
const REVIEW = 'FFF6ECD2';
const LIGHT = 'FFF6F4EE';

const FLAG_LABELS: Record<FlagCode, string> = {
  'od-impossible': 'Impossible OD',
  'od-unusual': 'Unusual OD',
  'od-order': 'OD out of size order',
  'size-nonstandard': 'Non-standard size',
  'cores-unknown': 'Core count missing',
  'conductor-missing': 'Conductor missing',
  'weight-implausible': 'Weight not plausible',
  'conductor-suspect': 'Conductor may be aluminium',
  lookalike: 'Look-alike rows',
  'lookalike-unresolved': 'Look-alike rows, no code',
  'excluded-by-review': 'Excluded by review',
};

function materials(c: CatalogCable): string {
  return [c.conductor ?? '?', c.insulation ?? '?', c.armour ?? '?'].join('/');
}

function styleHeader(row: ExcelJS.Row): void {
  row.height = 30;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
}

it('writes the catalog review workbook', async () => {
  const catalog = loadCatalog();
  // Values as the catalogue gave them, before any were hidden or corrected.
  const original = new Map(sourceRows().map((row) => {
    const c = normalizeRow(row);
    return [c.id, c];
  }));
  const flagged = catalog.cables
    .filter((c) => c.status !== 'checked')
    .sort(
      (a, b) =>
        a.brand.localeCompare(b.brand) ||
        (a.status === b.status ? 0 : a.status === 'excluded' ? -1 : 1) ||
        (a.cores ?? 99) - (b.cores ?? 99) ||
        a.sizeMm2 - b.sizeMm2 ||
        a.odMm - b.odMm,
    );
  const today = new Date().toISOString().slice(0, 10);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Cable Tray Design';
  wb.created = new Date();

  // --- Read me -------------------------------------------------------------
  const readme = wb.addWorksheet('Read me');
  readme.columns = [{ width: 110 }];
  const line = (text: string, font: Partial<ExcelJS.Font> = {}) => {
    const row = readme.addRow([text]);
    row.getCell(1).font = font;
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
  };
  line('Cable catalog review', { bold: true, size: 16 });
  line(`Generated ${today} from the cable catalog in the Cable Tray Design app (${catalog.summary.total} rows from 9 manufacturers).`);
  line('');
  line('Why this review is needed', { bold: true, size: 12 });
  line(
    'The catalog was read automatically from the manufacturer PDFs. Automatic checks found rows whose values are impossible or unusual. ' +
      `${catalog.summary.byStatus.excluded} rows are excluded: they are hidden from cable selection until corrected. ` +
      `${catalog.summary.byStatus['needs-review']} rows need review: they can be selected but show a warning.`,
  );
  line('');
  line('How to review a row', { bold: true, size: 12 });
  [
    '1. Open the sheet "Rows to review". Each line is one catalog cable and lists the problems found.',
    '2. Open the PDF named under "Catalogue file" (in the pdfs folder) at the given page and find the cable. "Original text" shows what was read from the PDF.',
    '3. In "Decision" (yellow), choose one:',
    '      correct: a value is wrong. Enter the right value in the "Correct …" columns; leave the others blank.',
    '               Rows marked "Conductor may be aluminium" usually need Correct conductor = Al (check the resistance or product code in the PDF).',
    '      accept: the row is right as it is (for example two genuine product variants).',
    '      exclude: the cable should not be offered.',
    '4. Fill in "Note" (what you checked, e.g. "PDF p.20 shows 7.1 mm") and "Reviewed by". "Date" is filled with the import date if left blank.',
    '5. Leave "Decision" blank for rows you did not check. Save the file and send it back.',
    '',
    'A correction is checked again automatically. A row cannot be accepted while it has an impossible value: correct it or exclude it.',
    'Weights that are not plausible are hidden rather than used; a weight does not change the tray size, only the reported tray load.',
  ].forEach((text) => line(text));
  line('');
  line('For the development team', { bold: true, size: 12 });
  line('Import the returned file with: npm run catalog:import-review -- path/to/catalog-review.xlsx (in the app folder), then run npm test.');

  // --- Rows to review ------------------------------------------------------
  const ws = wb.addWorksheet('Rows to review', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  ws.columns = [
    { header: 'Row ID', key: 'id', width: 14 },
    { header: 'Status', key: 'status', width: 13 },
    { header: 'Problems found', key: 'problems', width: 60 },
    { header: 'Brand', key: 'brand', width: 20 },
    { header: 'Cable', key: 'cable', width: 22 },
    { header: 'Materials', key: 'materials', width: 16 },
    { header: 'Voltage', key: 'voltage', width: 10 },
    { header: 'Standard', key: 'standard', width: 14 },
    { header: 'Code / variant', key: 'variant', width: 22 },
    { header: 'OD (mm)', key: 'od', width: 9 },
    { header: 'Weight (kg/km)', key: 'weight', width: 10 },
    { header: 'Catalogue file', key: 'file', width: 24 },
    { header: 'Page', key: 'page', width: 7 },
    { header: 'Original text', key: 'raw', width: 50 },
    { header: 'Decision', key: 'decision', width: 11 },
    { header: 'Correct OD (mm)', key: 'fixOd', width: 10 },
    { header: 'Correct weight (kg/km)', key: 'fixWeight', width: 11 },
    { header: 'Correct size (mm²)', key: 'fixSize', width: 10 },
    { header: 'Correct cores', key: 'fixCores', width: 9 },
    { header: 'Correct conductor (Cu/Al)', key: 'fixConductor', width: 11 },
    { header: 'Note', key: 'note', width: 40 },
    { header: 'Reviewed by', key: 'by', width: 14 },
    { header: 'Date', key: 'date', width: 12 },
  ];
  styleHeader(ws.getRow(1));
  ws.getColumn('date').numFmt = 'yyyy-mm-dd';
  const inputColumns = ['decision', 'fixOd', 'fixWeight', 'fixSize', 'fixCores', 'fixConductor', 'note', 'by', 'date'];

  for (const c of flagged) {
    const before = original.get(c.id)!;
    const row = ws.addRow({
      id: c.id,
      status: c.status === 'excluded' ? 'Excluded' : 'Needs review',
      problems: c.flags
        .filter((f) => f.severity !== 'info')
        .map((f) => `${FLAG_LABELS[f.code]}: ${f.message}`)
        .join('\n'),
      brand: c.brand,
      cable: describeCable(c) + (c.reducedNeutral ? ` (${plain(c.neutralSizeMm2 ?? 0)} mm² neutral)` : ''),
      materials: materials(c),
      voltage: c.voltage ?? '',
      standard: c.standard ?? '',
      variant: c.variant,
      od: c.odMm,
      weight: before.weightKgPerKm ?? '',
      file: c.source.file,
      page: c.source.page ?? '',
      raw: c.source.raw,
    });
    row.alignment = { vertical: 'top', wrapText: true };
    row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.status === 'excluded' ? EXCLUDED : REVIEW } };
    for (const key of inputColumns) {
      row.getCell(key).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT } };
    }
    row.getCell('decision').dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"correct,accept,exclude"'],
      showErrorMessage: true,
      errorTitle: 'Decision',
      error: 'Choose correct, accept or exclude.',
    };
    row.getCell('fixConductor').dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Cu,Al"'],
      showErrorMessage: true,
      errorTitle: 'Conductor',
      error: 'Choose Cu or Al.',
    };
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: flagged.length + 1, column: ws.columns.length } };

  // --- Already reviewed ----------------------------------------------------
  const done = wb.addWorksheet('Already reviewed', { views: [{ state: 'frozen', ySplit: 1 }] });
  done.columns = [
    { header: 'Row ID', key: 'id', width: 14 },
    { header: 'Decision', key: 'action', width: 11 },
    { header: 'Corrected values', key: 'set', width: 30 },
    { header: 'Note', key: 'note', width: 70 },
    { header: 'Reviewed by', key: 'by', width: 26 },
    { header: 'Date', key: 'date', width: 12 },
  ];
  styleHeader(done.getRow(1));
  for (const d of reviewDecisions as ReviewDecision[]) {
    done.addRow({
      id: d.id,
      action: d.action,
      set: d.set ? Object.entries(d.set).map(([k, v]) => `${k} = ${v}`).join(', ') : '',
      note: d.note,
      by: d.by,
      date: d.date,
    }).alignment = { vertical: 'top', wrapText: true };
  }

  // --- Summary -------------------------------------------------------------
  const summary = wb.addWorksheet('Summary');
  summary.columns = [{ width: 24 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 10 }];
  styleHeader(summary.addRow(['Brand', 'Checked', 'Needs review', 'Excluded', 'Total']));
  const brandRows = Object.entries(catalog.summary.byBrand).sort(([a], [b]) => a.localeCompare(b));
  brandRows.forEach(([brand, s], i) => {
    const row = summary.addRow([brand, s.checked, s['needs-review'], s.excluded, s.checked + s['needs-review'] + s.excluded]);
    if (i % 2 === 0) row.eachCell((cell) => (cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }));
  });
  const totals = catalog.summary.byStatus;
  summary.addRow(['All', totals.checked, totals['needs-review'], totals.excluded, catalog.summary.total]).font = { bold: true };
  summary.addRow([]);
  styleHeader(summary.addRow(['Problem', 'Rows']));
  for (const [code, n] of Object.entries(catalog.summary.byFlag).sort((a, b) => b[1] - a[1])) {
    summary.addRow([FLAG_LABELS[code as FlagCode], n]);
  }

  mkdirSync(new URL('../../../reports/', import.meta.url), { recursive: true });
  const workbookPath = fileURLToPath(new URL('../../../reports/catalog-review.xlsx', import.meta.url));
  try {
    await wb.xlsx.writeFile(workbookPath);
  } catch (error) {
    // Excel locks a workbook while it is open; write a dated copy instead of failing.
    if ((error as NodeJS.ErrnoException).code !== 'EBUSY' && (error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
    const copy = workbookPath.replace(/\.xlsx$/, ` ${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.xlsx`);
    await wb.xlsx.writeFile(copy);
    console.warn(`reports/catalog-review.xlsx is open in another program, so the workbook was written to ${copy}`);
  }

  // --- Markdown summary ----------------------------------------------------
  const table = (headers: string[], rows: Array<Array<string | number>>) =>
    [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
  const flagRows = Object.entries(catalog.summary.byFlag)
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => [FLAG_LABELS[code as FlagCode], n]);
  const markdown = `# Catalog checks

Generated by \`npm run catalog:review\` on ${today}. The review workbook for engineers is \`reports/catalog-review.xlsx\`.

${catalog.summary.total} rows from the original tool, after automatic checks and ${(reviewDecisions as ReviewDecision[]).length} recorded review decisions:

${table(
  ['Brand', 'Checked', 'Needs review', 'Excluded'],
  [...brandRows.map(([brand, s]) => [brand, s.checked, s['needs-review'], s.excluded]), ['**All**', totals.checked, totals['needs-review'], totals.excluded]],
)}

- **Checked**: passed every automatic check. This is not the same as checked by a person against the PDF.
- **Needs review**: selectable, shown with a warning until someone reviews it.
- **Excluded**: has an impossible value; hidden from cable selection until corrected.

## Problems found

${table(['Problem', 'Rows'], flagRows)}

A row can have more than one problem, so the counts add up to more than the flagged rows.
`;
  writeFileSync(new URL('../../../reports/catalog-checks.md', import.meta.url), markdown);
  console.log(markdown);
});
