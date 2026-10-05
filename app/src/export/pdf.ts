/**
 * The PDF report: A4 landscape, a project page with the title block and tray
 * summary, then each tray with its result, settings, section drawing (drawn
 * as vector graphics), cable schedule and calculation. Page numbers are added
 * last, so "Page n of N" is always right.
 */
import { jsPDF } from 'jspdf';
import { autoTable, type CellHookData, type RowInput } from 'jspdf-autotable';
import { int, num1 } from '../domain/format';
import type { DrawingShape, SectionDrawing } from '../drawing/sectionGeometry';
import monoFontUrl from './fonts/IBMPlexMono-Regular.ttf?inline';
import sansRegularUrl from './fonts/IBMPlexSans-Regular.ttf?inline';
import sansBoldUrl from './fonts/IBMPlexSans-SemiBold.ttf?inline';
import { cableColour, PRINT, rgb } from './palette';
import type { ProjectReport, ReportTone, ReportTray } from './reportModel';

export interface PdfPage {
  number: number;
  /** "Project" or the tray name. */
  section: string;
  footer: string;
}

export interface PdfResult {
  blob: Blob;
  pages: PdfPage[];
}

const PAGE_W = 297;
const PAGE_H = 210;
const M = 12;
const CONTENT_W = PAGE_W - 2 * M;
const BOTTOM = PAGE_H - 14;
const PT_PER_MM = 72 / 25.4;
const SANS = 'Plex';
const MONO = 'PlexMono';

const TONE_TEXT: Record<ReportTone, string> = { pass: PRINT.pass, warn: PRINT.warn, fail: PRINT.fail, neutral: PRINT.ink2 };

function registerFonts(doc: jsPDF): void {
  const fonts: Array<[string, string, string, string]> = [
    ['IBMPlexSans-Regular.ttf', sansRegularUrl, SANS, 'normal'],
    ['IBMPlexSans-SemiBold.ttf', sansBoldUrl, SANS, 'bold'],
    ['IBMPlexMono-Regular.ttf', monoFontUrl, MONO, 'normal'],
  ];
  for (const [file, url, family, style] of fonts) {
    doc.addFileToVFS(file, url.slice(url.indexOf(',') + 1));
    doc.addFont(file, family, style);
  }
}

const fill = (doc: jsPDF, hex: string) => doc.setFillColor(...rgb(hex));
const draw = (doc: jsPDF, hex: string) => doc.setDrawColor(...rgb(hex));
const ink = (doc: jsPDF, hex: string) => doc.setTextColor(...rgb(hex));

function font(doc: jsPDF, size: number, weight: 'normal' | 'bold' = 'normal', family = SANS): void {
  doc.setFont(family, weight);
  doc.setFontSize(size);
}

function finalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const TABLE_STYLE = {
  font: SANS,
  fontSize: 8,
  cellPadding: { top: 1.4, bottom: 1.4, left: 2, right: 2 },
  lineColor: rgb(PRINT.line),
  lineWidth: 0.1,
  textColor: rgb(PRINT.ink),
  valign: 'middle' as const,
};
const HEAD_STYLE = { fillColor: rgb(PRINT.ink), textColor: rgb('#ffffff'), fontStyle: 'bold' as const, fontSize: 7.5 };

function heading(doc: jsPDF, text: string, y: number, x = M): number {
  font(doc, 10, 'bold');
  ink(doc, PRINT.ink);
  doc.text(text, x, y);
  return y + 3;
}

/** Starts a new page if fewer than `needed` mm remain; returns the y to continue from. */
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= BOTTOM) return y;
  doc.addPage();
  return M + 8;
}

// ---------------------------------------------------------------------------
// Project page
// ---------------------------------------------------------------------------

function titleBlock(doc: jsPDF, report: ProjectReport): number {
  const top = M;
  const height = 40;
  const leftW = CONTENT_W * 0.55;
  draw(doc, PRINT.ink);
  doc.setLineWidth(0.4);
  doc.rect(M, top, CONTENT_W, height);
  doc.line(M + leftW, top, M + leftW, top + height);

  font(doc, 7.5, 'bold');
  ink(doc, PRINT.accentInk);
  doc.text('CABLE TRAY SIZING REPORT', M + 5, top + 8);
  font(doc, 18, 'bold');
  ink(doc, PRINT.ink);
  doc.text(doc.splitTextToSize(report.projectName, leftW - 10)[0] as string, M + 5, top + 19);
  font(doc, 8);
  ink(doc, PRINT.ink2);
  const generated = report.generatedAt.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  doc.text(`Generated ${generated} with Cable Tray Design v${__APP_VERSION__}`, M + 5, top + 28);
  doc.text(`${report.trays.length} tray${report.trays.length === 1 ? '' : 's'} in this report`, M + 5, top + 34);

  const d = report.details;
  const cells: Array<[string, string]> = [
    ['Project number', d.number],
    ['Client', d.client],
    ['Prepared by', d.preparedBy],
    ['Checked by', d.checkedBy],
    ['Revision', d.revision],
    ['Date', formatDate(d.date)],
  ];
  const cellW = (CONTENT_W - leftW) / 2;
  const cellH = height / 3;
  doc.setLineWidth(0.15);
  draw(doc, PRINT.line2);
  cells.forEach(([label, value], i) => {
    const x = M + leftW + (i % 2) * cellW;
    const y = top + Math.floor(i / 2) * cellH;
    if (i % 2 === 1) doc.line(x, y, x, y + cellH);
    if (i >= 2) doc.line(x, y, x + cellW, y);
    font(doc, 6.5, 'bold');
    ink(doc, PRINT.ink3);
    doc.text(label.toUpperCase(), x + 3, y + 4.5);
    font(doc, 10, 'bold');
    ink(doc, PRINT.ink);
    doc.text((doc.splitTextToSize(value || '–', cellW - 6)[0] as string) ?? '', x + 3, y + 10.5);
  });
  return top + height + 9;
}

function projectPage(doc: jsPDF, report: ProjectReport): void {
  let y = titleBlock(doc, report);
  y = heading(doc, 'Trays in this report', y);
  const tones = report.trays.map((t) => t.statusTone);
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: PAGE_H - BOTTOM },
    head: [report.summary.headers],
    body: report.summary.rows,
    styles: TABLE_STYLE,
    headStyles: HEAD_STYLE,
    alternateRowStyles: { fillColor: rgb(PRINT.paper) },
    columnStyles: { 0: { fontStyle: 'bold' }, 5: { fontStyle: 'bold' } },
    didParseCell: (data: CellHookData) => {
      if (data.section === 'body' && data.column.index === 7) {
        data.cell.styles.textColor = rgb(TONE_TEXT[tones[data.row.index] ?? 'neutral']);
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = finalY(doc) + 9;

  y = paragraphList(doc, 'How the trays were sized', report.method, y);
  paragraphList(doc, 'Points to check', report.warnings.length ? report.warnings : ['None: every cable passed the catalog checks and every tray fits a standard size.'], y + 2);
}

function paragraphList(doc: jsPDF, title: string, items: readonly string[], y: number): number {
  y = ensureSpace(doc, y, 16);
  y = heading(doc, title, y) + 2;
  font(doc, 8.5);
  ink(doc, PRINT.ink);
  for (const item of items) {
    const lines = doc.splitTextToSize(item, CONTENT_W - 6) as string[];
    y = ensureSpace(doc, y, lines.length * 4 + 2);
    doc.text('•', M + 1, y);
    doc.text(lines, M + 5, y);
    y += lines.length * 4 + 1.5;
  }
  return y + 4;
}

// ---------------------------------------------------------------------------
// Tray pages
// ---------------------------------------------------------------------------

function trayBand(doc: jsPDF, tray: ReportTray): number {
  fill(doc, PRINT.ink);
  doc.rect(M, M, CONTENT_W, 13, 'F');
  font(doc, 13, 'bold');
  ink(doc, '#ffffff');
  doc.text(tray.name, M + 4, M + 8.7);
  const nameW = doc.getTextWidth(tray.name);
  if (tray.service) {
    font(doc, 10);
    doc.text(`· ${tray.service}`, M + 7 + nameW, M + 8.7);
  }
  font(doc, 12, 'bold');
  doc.text(tray.sizeText, PAGE_W - M - 4, M + 7.2, { align: 'right' });
  font(doc, 7.5, 'bold');
  ink(doc, tray.statusTone === 'pass' ? '#9fe0b8' : tray.statusTone === 'neutral' ? '#d9dee2' : '#f3cf85');
  doc.text(tray.statusText, PAGE_W - M - 4, M + 11.2, { align: 'right' });
  return M + 19;
}

function keyValueTable(doc: jsPDF, title: string, rows: Array<[string, string]>, x: number, y: number, width: number): number {
  autoTable(doc, {
    startY: y,
    margin: { left: x, right: PAGE_W - x - width, bottom: PAGE_H - BOTTOM },
    tableWidth: width,
    head: [[{ content: title, colSpan: 2 }]],
    body: rows,
    styles: TABLE_STYLE,
    headStyles: { ...HEAD_STYLE, fillColor: rgb(PRINT.surface2), textColor: rgb(PRINT.ink) },
    columnStyles: { 0: { textColor: rgb(PRINT.ink2), cellWidth: width * 0.45 }, 1: { fontStyle: 'bold' } },
  });
  return finalY(doc);
}

function trayPages(doc: jsPDF, tray: ReportTray): void {
  const top = trayBand(doc, tray);
  const leftW = 92;
  let leftEnd = keyValueTable(doc, 'Result', tray.resultRows, M, top, leftW);
  leftEnd = keyValueTable(doc, 'Settings', tray.settingsRows, M, leftEnd + 4, leftW);

  const rightX = M + leftW + 6;
  const rightW = CONTENT_W - leftW - 6;
  let rightEnd: number;
  if (tray.drawing) {
    // Drawing, caption and legend first; the frame is drawn around whatever height they take.
    const pad = 4;
    const used = drawSection(doc, tray.drawing, { x: rightX + pad, y: top + pad, w: rightW - 2 * pad, h: 86 });
    let y = top + pad + Math.max(used, 20) + 4;
    font(doc, 7.5);
    ink(doc, PRINT.ink3);
    doc.text(tray.drawingCaption, rightX + pad, y);
    y = cableLegend(doc, tray, rightX + pad, y + 6, rightW - 2 * pad);
    draw(doc, PRINT.line);
    doc.setLineWidth(0.15);
    doc.rect(rightX, top, rightW, y - top);
    rightEnd = y;
  } else {
    font(doc, 10);
    ink(doc, PRINT.ink2);
    doc.text('No cables in this tray.', rightX, top + 8);
    rightEnd = top + 12;
  }

  let y = Math.max(leftEnd, rightEnd) + 8;
  y = ensureSpace(doc, y, 30);
  y = heading(doc, 'Cable schedule', y);
  cableSchedule(doc, tray, y);
  y = finalY(doc) + 8;

  y = ensureSpace(doc, y, 30);
  heading(doc, 'Calculation', y);
  y += 3;
  for (const [title, rows] of [
    ['Width', tray.calc.width],
    ['Height', tray.calc.height],
    ['Tray selection', tray.calc.selection],
  ] as const) {
    if (!rows.length) continue;
    const totals = rows.map((r) => r.emphasis === 'total');
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: PAGE_H - BOTTOM },
      head: [[{ content: title, colSpan: 2 }]],
      body: rows.map((r) => [r.label, r.value]),
      styles: TABLE_STYLE,
      headStyles: { ...HEAD_STYLE, fillColor: rgb(PRINT.surface2), textColor: rgb(PRINT.ink) },
      columnStyles: { 0: { cellWidth: 95, textColor: rgb(PRINT.ink2) }, 1: { halign: 'right' } },
      didParseCell: (data: CellHookData) => {
        if (data.section === 'body' && totals[data.row.index]) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = rgb(PRINT.ink);
          data.cell.styles.fillColor = rgb(PRINT.paper);
        }
      },
    });
    y = finalY(doc) + 3;
  }
}

function cableLegend(doc: jsPDF, tray: ReportTray, x: number, y: number, width: number): number {
  const drawn = tray.cables.filter((c) => c.odMm !== null && !c.note.startsWith('Not used'));
  font(doc, 7.5);
  const columnW = width / 2;
  drawn.forEach((c, i) => {
    const cx = x + (i % 2) * columnW;
    const cy = y + Math.floor(i / 2) * 5.5;
    tagDot(doc, c.tag, c.colourIndex, cx + 2.1, cy - 1.3, 2.1);
    font(doc, 7.5);
    ink(doc, PRINT.ink);
    const text = `${c.description} · Ø${num1(c.odMm!)} × ${c.quantity}`;
    doc.text(doc.splitTextToSize(text, columnW - 7)[0] as string, cx + 6, cy);
  });
  return y + Math.ceil(drawn.length / 2) * 5.5;
}

function tagDot(doc: jsPDF, tag: number, colourIndex: number, x: number, y: number, r: number): void {
  fill(doc, cableColour(colourIndex));
  draw(doc, PRINT.cableStroke);
  doc.setLineWidth(0.15);
  doc.circle(x, y, r, 'FD');
  font(doc, r * 2.7, 'bold');
  ink(doc, PRINT.cableTag);
  doc.text(String(tag), x, y + r * 0.42, { align: 'center' });
}

function cableSchedule(doc: jsPDF, tray: ReportTray, y: number): void {
  const body: RowInput[] = tray.cables.map((c) => [
    String(c.tag),
    c.description,
    c.details,
    c.variant,
    c.odMm === null ? '–' : num1(c.odMm),
    String(c.quantity),
    c.weightKgPerKm === null ? '–' : int(c.weightKgPerKm),
    c.source,
    c.note,
  ]);
  const notes = tray.cables.map((c) => c.note);
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: PAGE_H - BOTTOM },
    head: [['#', 'Cable', 'Details', 'Code / variant', 'OD mm', 'Qty', 'kg/km', 'Catalogue source', 'Note']],
    body: body.length ? body : [[{ content: 'No cables in this tray.', colSpan: 9 }]],
    styles: { ...TABLE_STYLE, fontSize: 7.5 },
    headStyles: HEAD_STYLE,
    alternateRowStyles: { fillColor: rgb(PRINT.paper) },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center', textColor: rgb('#ffffff') },
      1: { cellWidth: 44, fontStyle: 'bold' },
      2: { cellWidth: 58 },
      3: { cellWidth: 30 },
      4: { cellWidth: 14, halign: 'right' },
      5: { cellWidth: 10, halign: 'right' },
      6: { cellWidth: 14, halign: 'right' },
      7: { cellWidth: 36 },
    },
    didParseCell: (data: CellHookData) => {
      if (data.section === 'body' && data.column.index === 8 && notes[data.row.index]) {
        data.cell.styles.textColor = rgb(notes[data.row.index] === 'Manual entry' ? PRINT.ink2 : PRINT.warn);
      }
    },
    didDrawCell: (data: CellHookData) => {
      if (data.section === 'body' && data.column.index === 0 && tray.cables[data.row.index]) {
        const c = tray.cables[data.row.index]!;
        tagDot(doc, c.tag, c.colourIndex, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2, 2.5);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Section drawing as vector graphics
// ---------------------------------------------------------------------------

/** Draws the section into the box, keeping its proportions. Returns the height used, in mm. */
export function drawSection(doc: jsPDF, drawing: SectionDrawing, box: { x: number; y: number; w: number; h: number }): number {
  const vb = drawing.viewBox;
  const k = Math.min(box.w / vb.width, box.h / vb.height);
  const ox = box.x + (box.w - vb.width * k) / 2 - vb.x * k;
  const oy = box.y - vb.y * k;
  const X = (x: number) => ox + x * k;
  const Y = (y: number) => oy + y * k;
  const pt = (units: number) => units * k * PT_PER_MM;

  const lineStyle: Record<Extract<DrawingShape, { kind: 'line' }>['role'], { colour: string; width: number; dash?: [number, number] }> = {
    boundary: { colour: PRINT.line2, width: 1, dash: [3, 3] },
    'required-height': { colour: PRINT.requiredLine, width: 1.3, dash: [7, 4] },
    dimension: { colour: PRINT.ink2, width: 1 },
    extension: { colour: PRINT.ink3, width: 0.6, dash: [2, 2] },
    leader: { colour: PRINT.ink3, width: 0.7 },
  };

  for (const shape of drawing.shapes) {
    switch (shape.kind) {
      case 'zone':
        if (shape.role === 'spare') {
          fill(doc, PRINT.spare);
          doc.rect(X(shape.x), Y(shape.y), shape.width * k, shape.height * k, 'F');
        } else {
          hatch(doc, X(shape.x), Y(shape.y), shape.width * k, shape.height * k, 6 * k * Math.SQRT2, 1.1 * k);
        }
        break;
      case 'line': {
        const style = lineStyle[shape.role];
        draw(doc, style.colour);
        doc.setLineWidth(style.width * k);
        doc.setLineDashPattern(style.dash ? [style.dash[0] * k, style.dash[1] * k] : [], 0);
        doc.line(X(shape.x1), Y(shape.y1), X(shape.x2), Y(shape.y2));
        doc.setLineDashPattern([], 0);
        break;
      }
      case 'rail': {
        const points = railPoints(shape.d);
        draw(doc, PRINT.ink);
        doc.setLineWidth(3 * k);
        for (let i = 1; i < points.length; i++) {
          doc.line(X(points[i - 1]![0]), Y(points[i - 1]![1]), X(points[i]![0]), Y(points[i]![1]));
        }
        break;
      }
      case 'cable':
        fill(doc, cableColour(shape.colourIndex));
        draw(doc, PRINT.cableStroke);
        doc.setLineWidth(1 * k);
        doc.circle(X(shape.cx), Y(shape.cy), shape.r * k, 'FD');
        if (shape.tagSize !== null) {
          font(doc, pt(shape.tagSize), 'bold');
          ink(doc, PRINT.cableTag);
          doc.text(String(shape.tag), X(shape.cx), Y(shape.cy + shape.tagSize * 0.35), { align: 'center' });
        }
        break;
      case 'text':
        font(doc, pt(shape.size), shape.bold ? 'bold' : 'normal', shape.bold ? SANS : MONO);
        ink(doc, PRINT.ink);
        doc.text(shape.text, X(shape.x), Y(shape.y), { align: shape.anchor === 'middle' ? 'center' : shape.anchor === 'end' ? 'right' : 'left' });
        break;
    }
  }
  return vb.height * k;
}

/** Points of the rail path "M0 0 V<h> H<w> V0". */
function railPoints(d: string): Array<[number, number]> {
  const n = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const [x0 = 0, y0 = 0, h = 0, w = 0, top = 0] = n;
  return [
    [x0, y0],
    [x0, h],
    [w, h],
    [w, top],
  ];
}

/** 45° hatching inside a rectangle, clipped to its edges. */
function hatch(doc: jsPDF, x: number, y: number, w: number, h: number, spacing: number, lineWidth: number): void {
  draw(doc, PRINT.hatch);
  doc.setLineWidth(lineWidth);
  for (let t = -h; t < w; t += spacing) {
    const lo = Math.max(0, -t);
    const hi = Math.min(h, w - t);
    if (lo >= hi) continue;
    doc.line(x + t + lo, y + h - lo, x + t + hi, y + h - hi);
  }
}

// ---------------------------------------------------------------------------

export function buildPdf(report: ProjectReport): PdfResult {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  registerFonts(doc);
  doc.setProperties({
    title: `${report.projectName}: cable tray sizing report`,
    subject: 'Cable tray sizing',
    creator: `Cable Tray Design v${__APP_VERSION__}`,
  });

  const sections: string[] = [];
  const markSection = (name: string) => {
    while (sections.length < doc.getNumberOfPages()) sections.push(name);
  };

  projectPage(doc, report);
  markSection('Project');
  for (const tray of report.trays) {
    doc.addPage();
    trayPages(doc, tray);
    markSection(tray.name);
  }

  const total = doc.getNumberOfPages();
  const left = [report.projectName, report.details.number, report.details.revision && `Rev ${report.details.revision}`].filter(Boolean).join(' · ');
  const pages: PdfPage[] = [];
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    const section = sections[page - 1] ?? 'Project';
    draw(doc, PRINT.line2);
    doc.setLineWidth(0.2);
    doc.line(M, PAGE_H - 10, PAGE_W - M, PAGE_H - 10);
    font(doc, 7.5);
    ink(doc, PRINT.ink2);
    doc.text(left, M, PAGE_H - 6);
    doc.text(section === 'Project' ? 'Project summary' : section, PAGE_W / 2, PAGE_H - 6, { align: 'center' });
    const footer = `Page ${page} of ${total}`;
    doc.text(footer, PAGE_W - M, PAGE_H - 6, { align: 'right' });
    // Continuation pages of a tray get a small header, since the band is on its first page only.
    const continued = section !== 'Project' && sections[page - 2] === section;
    if (continued) {
      font(doc, 8, 'bold');
      ink(doc, PRINT.ink3);
      doc.text(`${section} (continued)`, M, M - 4);
    }
    pages.push({ number: page, section, footer });
  }

  return { blob: doc.output('blob'), pages };
}
