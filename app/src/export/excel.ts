/**
 * The Excel report: a project sheet, one sheet per tray (result, settings,
 * cable schedule, calculation and drawing), the cables used, and optionally
 * the whole catalog. Numbers are stored as numbers so they can be used in
 * further calculations.
 */
import ExcelJS from 'exceljs';
import type { CatalogCable } from '../data/catalog';
import { PRINT } from './palette';
import type { ProjectReport, ReportTone, ReportTray } from './reportModel';

export interface ExcelOptions {
  /** PNG of each tray's drawing, base64, keyed by tray id. Trays without one get no picture. */
  drawings?: ReadonlyMap<string, { base64: string; width: number; height: number }>;
  /** Adds a sheet with every selectable catalog cable. */
  catalog?: readonly CatalogCable[];
}

const argb = (hex: string) => `FF${hex.slice(1).toUpperCase()}`;
const solid = (hex: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } });
const TONE: Record<ReportTone, string> = { pass: PRINT.pass, warn: PRINT.warn, fail: PRINT.fail, neutral: PRINT.ink2 };
const INVALID_SHEET_CHARS = /[[\]:*?/\\]/g;

function band(ws: ExcelJS.Worksheet, text: string, columns: number, size = 13): void {
  const row = ws.addRow([text]);
  ws.mergeCells(row.number, 1, row.number, columns);
  row.height = size + 11;
  const cell = row.getCell(1);
  cell.font = { bold: true, size, color: { argb: 'FFFFFFFF' } };
  cell.fill = solid(PRINT.ink);
  cell.alignment = { vertical: 'middle', indent: 1 };
}

function section(ws: ExcelJS.Worksheet, text: string, columns: number): void {
  ws.addRow([]);
  const row = ws.addRow([text]);
  ws.mergeCells(row.number, 1, row.number, columns);
  row.getCell(1).font = { bold: true, size: 11, color: { argb: argb(PRINT.accentInk) } };
  row.getCell(1).border = { bottom: { style: 'thin', color: { argb: argb(PRINT.line2) } } };
}

function labelValue(ws: ExcelJS.Worksheet, rows: ReadonlyArray<readonly [string, string | number]>, valueSpan = 1): void {
  rows.forEach(([label, value], i) => {
    const row = ws.addRow([label, value]);
    if (valueSpan > 1) ws.mergeCells(row.number, 2, row.number, 1 + valueSpan);
    row.getCell(1).font = { color: { argb: argb(PRINT.ink2) } };
    row.getCell(2).font = { bold: true };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    if (i % 2 === 1) for (let c = 1; c <= 1 + valueSpan; c++) row.getCell(c).fill = solid(PRINT.paper);
  });
}

function header(ws: ExcelJS.Worksheet, headers: readonly string[]): ExcelJS.Row {
  const row = ws.addRow([...headers]);
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = solid(PRINT.ink);
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  return row;
}

function uniqueSheetName(name: string, used: Set<string>): string {
  const base = (name.replace(INVALID_SHEET_CHARS, '-').trim() || 'Tray').slice(0, 31);
  let candidate = base;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

function projectSheet(wb: ExcelJS.Workbook, report: ProjectReport): void {
  const ws = wb.addWorksheet('Project', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 24 }, { width: 22 }, { width: 13 }, { width: 8 }, { width: 8 }, { width: 18 }, { width: 9 }, { width: 26 }];
  band(ws, 'CABLE TRAY SIZING REPORT', 8, 14);
  const name = ws.addRow([report.projectName]);
  name.getCell(1).font = { bold: true, size: 16 };
  name.height = 24;
  const d = report.details;
  labelValue(
    ws,
    [
      ['Project number', d.number || '–'],
      ['Client', d.client || '–'],
      ['Prepared by', d.preparedBy || '–'],
      ['Checked by', d.checkedBy || '–'],
      ['Revision', d.revision || '–'],
      ['Date', d.date],
      ['Generated', `${report.generatedAt.toLocaleString('en-GB')} · Cable Tray Design v${__APP_VERSION__}`],
    ],
    3,
  );

  section(ws, 'Trays in this report', 8);
  header(ws, report.summary.headers);
  report.summary.rows.forEach((values, i) => {
    const row = ws.addRow(values);
    row.getCell(1).font = { bold: true };
    row.getCell(6).font = { bold: true };
    row.getCell(8).font = { bold: true, color: { argb: argb(TONE[report.trays[i]!.statusTone]) } };
    if (i % 2 === 1) row.eachCell((cell) => (cell.fill = solid(PRINT.paper)));
  });

  section(ws, 'How the trays were sized', 8);
  for (const line of report.method) wrapped(ws, line, 8);
  section(ws, 'Points to check', 8);
  for (const line of report.warnings.length ? report.warnings : ['None: every cable passed the catalog checks and every tray fits a standard size.']) {
    wrapped(ws, line, 8);
  }
}

function wrapped(ws: ExcelJS.Worksheet, text: string, columns: number): void {
  const row = ws.addRow([text]);
  ws.mergeCells(row.number, 1, row.number, columns);
  row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
  row.height = Math.max(15, Math.ceil(text.length / 120) * 15);
}

function traySheet(wb: ExcelJS.Workbook, tray: ReportTray, sheetName: string, picture?: { base64: string; width: number; height: number }): void {
  const ws = wb.addWorksheet(sheetName, { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 6 }, { width: 30 }, { width: 38 }, { width: 22 }, { width: 9 }, { width: 6 }, { width: 10 }, { width: 28 }, { width: 44 }];
  band(ws, `${tray.name}${tray.service ? ` · ${tray.service}` : ''}   ${tray.sizeText} · ${tray.statusText}`, 9);

  // Two-column blocks start in column B so column A can hold cable numbers below.
  const block = (title: string, rows: ReadonlyArray<readonly [string, string | number]>) => {
    section(ws, title, 4);
    rows.forEach(([label, value], i) => {
      const row = ws.addRow(['', label, value]);
      ws.mergeCells(row.number, 3, row.number, 4);
      row.getCell(2).font = { color: { argb: argb(PRINT.ink2) } };
      row.getCell(3).font = { bold: true };
      if (i % 2 === 1) for (let c = 2; c <= 4; c++) row.getCell(c).fill = solid(PRINT.paper);
    });
  };
  const firstBlockRow = ws.rowCount + 1;
  block('Result', tray.resultRows);
  block('Settings', tray.settingsRows);

  section(ws, 'Cable schedule', 9);
  header(ws, ['#', 'Cable', 'Details', 'Code / variant', 'OD (mm)', 'Qty', 'Weight (kg/km)', 'Catalogue source', 'Note']);
  if (!tray.cables.length) ws.addRow(['', 'No cables in this tray.']);
  tray.cables.forEach((c, i) => {
    const row = ws.addRow([c.tag, c.description, c.details, c.variant, c.odMm ?? '–', c.quantity, c.weightKgPerKm ?? '–', c.source, c.note]);
    row.getCell(5).numFmt = '0.0';
    row.getCell(7).numFmt = '#,##0';
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).font = { bold: true };
    if (c.note && c.note !== 'Manual entry') row.getCell(9).font = { color: { argb: argb(PRINT.warn) } };
    row.alignment = { wrapText: true, vertical: 'top' };
    if (i % 2 === 1) row.eachCell({ includeEmpty: true }, (cell) => (cell.fill = solid(PRINT.paper)));
  });

  for (const [title, rows] of [
    ['Calculation: width', tray.calc.width],
    ['Calculation: height', tray.calc.height],
    ['Calculation: tray selection', tray.calc.selection],
  ] as const) {
    if (!rows.length) continue;
    section(ws, title, 4);
    rows.forEach((r, i) => {
      const row = ws.addRow(['', r.label, r.value]);
      ws.mergeCells(row.number, 3, row.number, 4);
      row.getCell(2).font = { color: { argb: argb(r.emphasis ? PRINT.ink : PRINT.ink2) }, bold: r.emphasis === 'total' };
      row.getCell(3).font = { bold: r.emphasis === 'total' };
      row.getCell(3).alignment = { horizontal: 'right' };
      if (r.emphasis === 'total') for (let c = 2; c <= 4; c++) row.getCell(c).fill = solid(PRINT.surface2);
      else if (i % 2 === 1) for (let c = 2; c <= 4; c++) row.getCell(c).fill = solid(PRINT.paper);
    });
  }

  if (picture) {
    const id = wb.addImage({ base64: picture.base64, extension: 'png' });
    const width = Math.min(640, picture.width);
    ws.addImage(id, { tl: { col: 5, row: firstBlockRow }, ext: { width, height: (width * picture.height) / picture.width } });
  }
}

const CABLE_HEADERS = ['Brand', 'Cores', 'Size (mm²)', 'Conductor', 'Insulation', 'Armour', 'Screen', 'Voltage', 'Standard', 'Code / variant', 'OD (mm)', 'Weight (kg/km)', 'Status', 'Catalogue file', 'Page'];

function cableValues(c: CatalogCable): Array<string | number> {
  return [
    c.brand,
    c.cores ?? 'multi',
    c.sizeMm2,
    c.conductor ?? '–',
    c.insulation ?? '–',
    c.armour ?? '–',
    c.screen ?? '–',
    c.voltage ?? '–',
    c.standard ?? '–',
    c.variant,
    c.odMm,
    c.weightKgPerKm ?? '–',
    c.status === 'checked' ? 'Checked' : c.status === 'needs-review' ? 'Needs review' : 'Excluded',
    c.source.file,
    c.source.page ?? '–',
  ];
}

function cableTable(ws: ExcelJS.Worksheet, rows: ReadonlyArray<Array<string | number>>, extraHeaders: readonly string[]): void {
  const widths = [18, 7, 10, 10, 10, 11, 12, 11, 18, 24, 9, 12, 13, 24, 7, 30, 60];
  ws.columns = [...CABLE_HEADERS, ...extraHeaders].map((_, i) => ({ width: widths[i] ?? 14 }));
  header(ws, [...CABLE_HEADERS, ...extraHeaders]);
  rows.forEach((values) => {
    const row = ws.addRow(values);
    row.getCell(11).numFmt = '0.0';
    row.getCell(12).numFmt = '#,##0';
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: CABLE_HEADERS.length + extraHeaders.length } };
}

export async function buildExcel(report: ProjectReport, options: ExcelOptions = {}): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = `Cable Tray Design v${__APP_VERSION__}`;
  wb.created = report.generatedAt;
  wb.title = `${report.projectName}: cable tray sizing report`;

  projectSheet(wb, report);
  const used = new Set(['project', 'cables used', 'catalog']);
  for (const tray of report.trays) traySheet(wb, tray, uniqueSheetName(tray.name, used), options.drawings?.get(tray.id));

  // Every catalog cable used, once, with the trays it appears in; then manual cables.
  const byCable = new Map<string, { cable: CatalogCable; trays: Set<string> }>();
  const manual: Array<Array<string | number>> = [];
  for (const tray of report.trays) {
    for (const r of tray.outcome.resolved) {
      if (r.catalog) {
        const entry = byCable.get(r.catalog.id) ?? { cable: r.catalog, trays: new Set<string>() };
        entry.trays.add(tray.name);
        byCable.set(r.catalog.id, entry);
      } else if (r.cable.kind === 'manual') {
        manual.push(['Manual entry', '–', '–', '–', '–', '–', '–', '–', '–', r.title, r.odMm ?? '–', r.weightKgPerKm ?? '–', 'Manual', '–', '–', tray.name]);
      }
    }
  }
  const usedRows = [...byCable.values()]
    .sort((a, b) => a.cable.brand.localeCompare(b.cable.brand) || a.cable.sizeMm2 - b.cable.sizeMm2)
    .map(({ cable, trays }) => [...cableValues(cable), [...trays].join(', ')]);
  cableTable(wb.addWorksheet('Cables used'), [...usedRows, ...manual], ['Used in']);

  if (options.catalog) {
    const rows = options.catalog
      .filter((c) => c.status !== 'excluded')
      .map((c) => [...cableValues(c), c.flags.filter((f) => f.severity === 'warning').map((f) => f.message).join(' ')]);
    cableTable(wb.addWorksheet('Catalog'), rows, ['Review notes']);
  }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
