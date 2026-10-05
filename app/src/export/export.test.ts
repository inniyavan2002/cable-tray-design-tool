import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../data/catalog';
import { drawingSvg } from './drawingSvg';
import { buildExcel } from './excel';
import { buildPdf } from './pdf';
import { buildProjectReport, fileSafe } from './reportModel';
import { sampleProject } from './testing/sampleProject';

const project = sampleProject();
const allTrays = project.trays.map((t) => t.id);
const generatedAt = new Date(2026, 8, 28, 10, 30);

describe('report model', () => {
  const report = buildProjectReport(project, allTrays, generatedAt);

  it('summarises every chosen tray with its size and status', () => {
    expect(report.summary.rows).toEqual([
      ['TR-01', 'LV feeders', 'Perforated', '1', '9', '900 × 75 mm', '18.3%', 'PASS'],
      ['TR-02', 'Small power', 'Perforated', '2', '20', '300 × 75 mm', '34.3%', 'PASS · UPSIZED FOR FILL'],
      ['TR-03', 'Mixed', 'Perforated', '2', '12', '450 × 150 mm', '20.8%', 'PASS'],
    ]);
  });

  it('includes only the chosen trays', () => {
    expect(buildProjectReport(project, [project.trays[1]!.id]).trays.map((t) => t.name)).toEqual(['TR-02']);
  });

  it('gives each tray its result, settings, cable schedule and calculation', () => {
    const t2 = report.trays[1]!;
    expect(t2.resultRows).toContainEqual(['Upsized for fill', '300 × 50 gave 51.5%']);
    expect(t2.settingsRows).toContainEqual(['Gap between layers', 'No, layers touch']);
    expect(t2.cables.map((c) => [c.tag, c.odMm, c.quantity, c.weightKgPerKm])).toEqual([
      [1, 23.5, 12, 1245],
      [2, 20, 8, null],
    ]);
    expect(t2.cables[1]!.note).toMatch(/^Needs review: Weight of 1,000 kg\/km is listed for \d+ different sizes/);
    expect(t2.resultRows).toContainEqual(['Cable weight', '14.9 kg/m (unknown for 1 row)']);
    expect(t2.calc.selection.at(-1)?.value).toBe('300 × 75 mm · upsized for fill');
    expect(t2.drawing?.trayWidthMm).toBe(300);
  });

  it('lists points to check: cables needing review and manual cables', () => {
    const p = sampleProject();
    p.trays[0]!.cables.push({ id: 'x1', kind: 'catalog', catalogId: 'oman-100555', quantity: 1 });
    p.trays[0]!.cables.push({ id: 'x2', kind: 'manual', label: 'Fire alarm', odMm: 9, weightKgPerKm: null, quantity: 2 });
    const r = buildProjectReport(p, [p.trays[0]!.id]);
    expect(r.warnings.some((w) => w.startsWith('TR-01, cable 4') && w.includes('Needs review'))).toBe(true);
    expect(r.warnings).toContain('Manual cables, not from the catalog: TR-01 cable 5.');
    expect(r.trays[0]!.cables[4]!.note).toBe('Manual entry');
  });

  it('makes safe file names', () => {
    expect(fileSafe('Tower B / Level 3: risers')).toBe('Tower-B-Level-3-risers');
    expect(fileSafe('   ')).toBe('tray');
  });
});

describe('SVG drawing', () => {
  const report = buildProjectReport(project, allTrays, generatedAt);

  it('is a well-formed SVG with every cable and a legend line per cable row', () => {
    const doc = drawingSvg(report.trays[0]!, report.projectName)!;
    const parsed = new DOMParser().parseFromString(doc.svg, 'image/svg+xml');
    expect(parsed.getElementsByTagName('parsererror')).toHaveLength(0);
    // 9 cables in the drawing plus 3 legend dots.
    expect(parsed.getElementsByTagName('circle')).toHaveLength(12);
    expect(doc.svg).toContain('TR-01 · LV feeders');
    expect(doc.svg).toContain('900 × 75 mm · PASS');
    expect(doc.svg).toContain("font-family:'Plex Mono'");
    expect(doc.width).toBeGreaterThan(600);
  });

  it('is not made for a tray without cables', () => {
    const p = sampleProject();
    p.trays[0]!.cables = [];
    expect(drawingSvg(buildProjectReport(p, [p.trays[0]!.id]).trays[0]!, p.name)).toBeNull();
  });
});

describe('PDF report', () => {
  it('has a project page, then each tray from a new page, all numbered "Page n of N"', () => {
    const { pages, blob } = buildPdf(buildProjectReport(project, allTrays, generatedAt));
    expect(blob.size).toBeGreaterThan(10_000);
    expect(pages[0]!.section).toBe('Project');
    const firstPageOf = (name: string) => pages.find((p) => p.section === name)!.number;
    expect(firstPageOf('TR-01')).toBeLessThan(firstPageOf('TR-02'));
    expect(firstPageOf('TR-02')).toBeLessThan(firstPageOf('TR-03'));
    pages.forEach((p, i) => expect(p.footer).toBe(`Page ${i + 1} of ${pages.length}`));
  });

  it('continues a long cable schedule on further pages of the same tray', () => {
    const p = sampleProject();
    const ids = loadCatalog().cables.filter((c) => c.status === 'checked' && c.brandId === 'doha').slice(0, 30);
    p.trays[0]!.cables = ids.map((c, i) => ({ id: `long${i}`, kind: 'catalog', catalogId: c.id, quantity: 1 }));
    const { pages } = buildPdf(buildProjectReport(p, [p.trays[0]!.id], generatedAt));
    expect(pages.filter((page) => page.section === 'TR-01').length).toBeGreaterThan(1);
    expect(pages.at(-1)!.footer).toBe(`Page ${pages.length} of ${pages.length}`);
  });
});

describe('Excel report', () => {
  async function workbook(options: Parameters<typeof buildExcel>[1] = {}, p = project) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildExcel(buildProjectReport(p, p.trays.map((t) => t.id), generatedAt), options));
    return wb;
  }
  const text = (ws: ExcelJS.Worksheet) => {
    const values: string[] = [];
    ws.eachRow((row) => row.eachCell((cell) => values.push(String(cell.value))));
    return values;
  };

  it('has a project sheet, one sheet per tray and the cables used', async () => {
    const wb = await workbook();
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(['Project', 'TR-01', 'TR-02', 'TR-03', 'Cables used']);
    expect(text(wb.getWorksheet('Project')!)).toEqual(expect.arrayContaining(['Example Project', 'EX-2026-014', '300 × 75 mm', 'PASS · UPSIZED FOR FILL']));
    const t2 = text(wb.getWorksheet('TR-02')!);
    expect(t2).toEqual(expect.arrayContaining(['Selected tray', '300 × 75 mm', 'Fill at 300 × 50', '300 × 75 mm · upsized for fill']));
  });

  it('stores ODs and quantities as numbers', async () => {
    const ws = (await workbook()).getWorksheet('TR-01')!;
    let found = false;
    ws.eachRow((row) => {
      if (row.getCell(2).value === 'Doha Cables · 4C 240 mm²') {
        expect(row.getCell(5).value).toBe(60.3);
        expect(row.getCell(6).value).toBe(2);
        found = true;
      }
    });
    expect(found).toBe(true);
  });

  it('lists each catalog cable used once, with the trays it is used in', async () => {
    const ws = (await workbook()).getWorksheet('Cables used')!;
    const rows: Array<[string, string]> = [];
    ws.eachRow((row, i) => {
      if (i > 1) rows.push([String(row.getCell(10).value), String(row.getCell(16).value)]);
    });
    expect(rows).toHaveLength(6);
    expect(rows).toContainEqual(['CX1-T105-W20', 'TR-01, TR-03']);
  });

  it('adds the catalog sheet only when asked, and keeps sheet names unique and valid', async () => {
    const p = sampleProject();
    p.trays[1]!.name = 'TR-01';
    p.trays[2]!.name = 'Riser: A/B';
    const wb = await workbook({ catalog: loadCatalog().cables }, p);
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(['Project', 'TR-01', 'TR-01 2', 'Riser- A-B', 'Cables used', 'Catalog']);
    expect(wb.getWorksheet('Catalog')!.rowCount).toBe(loadCatalog().summary.byStatus.checked + loadCatalog().summary.byStatus['needs-review'] + 1);
  });
});
