/**
 * Every figure the product website quotes, computed from the app itself: the
 * catalog, the default standards and the example trays T1–T3. The website build
 * reads them from site/facts.json (written by `npm run site:facts`), and a test
 * fails when that file no longer matches, so the page cannot drift from the app.
 */
import type { Catalog } from '../data/catalog';
import { sectionDrawing, type DrawingShape, type SectionDrawing } from '../drawing/sectionGeometry';
import { int, num1, percent, plain, size } from '../domain/format';
import { DEFAULT_STANDARDS } from '../domain/normalize';
import { sampleProject } from '../export/testing/sampleProject';
import { MAX_CABLE_ROWS, MAX_QUANTITY } from '../state/projectModel';
import { cachedTrayOutcome, type TrayOutcome } from '../state/trayResult';

export interface SiteBrand {
  name: string;
  rows: string;
  checked: string;
  needsReview: string;
  excluded: string;
  pdfFile: string;
  pdfPages: string;
}

export interface SiteFacts {
  version: string;
  catalog: { rows: string; manufacturers: string; checked: string; needsReview: string; excluded: string; brands: SiteBrand[] };
  standards: { widths: string; heights: string; widthRange: string; heightRange: string };
  limits: { cableRows: string; layers: string; quantity: string };
  /** The example trays T1 to T3 as the app sizes them, for the labels and hover details in the website's building drawing. */
  trays: Array<{
    name: string;
    service: string;
    selected: string;
    fill: string;
    maxFill: string;
    cables: string;
    layers: string;
    weight: string;
    /** Rows whose catalogue entry has no weight, so the weight is a lower bound; 0 when every row has one. */
    rowsWithoutWeight: number;
  }>;
  /** Tray T2: upsized for fill, the worked example, and the tray the features' workflow follows. */
  t2: {
    cables: string;
    layers: string;
    required: string;
    firstTry: string;
    firstFill: string;
    selected: string;
    selectedFill: string;
    maxFill: string;
    clearance: string;
    spare: string;
    cableArea: string;
  };
  /** Tray T3: the hero screenshot. */
  t3: {
    name: string;
    service: string;
    cables: string;
    layers: string;
    spacing: string;
    clearanceFactor: string;
    selected: string;
    required: string;
    fill: string;
    maxFill: string;
    clearance: string;
    spare: string;
    unused: string;
    cableArea: string;
  };
  /** Tray T3's section, drawn by the app's own geometry, for the website's live preview. */
  t3Drawing: Pick<SectionDrawing, 'viewBox' | 'shapes'>;
  /** Tray T2's section, drawn the same way, for the features' workflow. */
  t2Drawing: Pick<SectionDrawing, 'viewBox' | 'shapes'>;
}

/** Two decimals are plenty for a drawing about 900 units wide, and keep facts.json small. */
function roundShape(shape: DrawingShape): DrawingShape {
  const round = (value: unknown) => (typeof value === 'number' ? Math.round(value * 100) / 100 : value);
  return Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, round(value)])) as DrawingShape;
}

const range = (values: readonly number[]) => `${int(Math.min(...values))}-${int(Math.max(...values))}`;

/** "12 × Ø23.5 + 8 × Ø20.0" */
function cableList(o: TrayOutcome): string {
  return o.resolved.map((r) => `${r.cable.quantity} × Ø${num1(r.odMm ?? 0)}`).join(' + ');
}

export function siteFacts(catalog: Catalog): SiteFacts {
  const project = sampleProject();
  const [, t2, t3] = project.trays;
  const o2 = cachedTrayOutcome(t2!, project.standards);
  const o3 = cachedTrayOutcome(t3!, project.standards);
  const first = o2.result.tried[0]!;
  const selected2 = o2.result.selected!;
  const selected3 = o3.result.selected!;
  const draw = (o: TrayOutcome) => {
    const style = new Map(o.resolved.map((r) => [r.cable.id, { tag: r.tag, colourIndex: r.colourIndex }]));
    return sectionDrawing(o.result, (rowId) => style.get(rowId) ?? { tag: 0, colourIndex: 0 }, { dimensions: true, zones: true })!;
  };
  const drawing2 = draw(o2);
  const drawing3 = draw(o3);
  const { byStatus, byBrand, total } = catalog.summary;

  return {
    version: __APP_VERSION__,
    catalog: {
      rows: int(total),
      manufacturers: String(catalog.brands.length),
      checked: int(byStatus.checked),
      needsReview: int(byStatus['needs-review']),
      excluded: int(byStatus.excluded),
      brands: [...catalog.brands]
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
        .map((b) => {
          const s = byBrand[b.name] ?? { checked: 0, 'needs-review': 0, excluded: 0 };
          return {
            name: b.name,
            rows: int(s.checked + s['needs-review'] + s.excluded),
            checked: int(s.checked),
            needsReview: int(s['needs-review']),
            excluded: int(s.excluded),
            pdfFile: b.pdfFile,
            pdfPages: int(b.pdfPages),
          };
        }),
    },
    standards: {
      widths: String(DEFAULT_STANDARDS.widthsMm.length),
      heights: String(DEFAULT_STANDARDS.heightsMm.length),
      widthRange: range(DEFAULT_STANDARDS.widthsMm),
      heightRange: range(DEFAULT_STANDARDS.heightsMm),
    },
    limits: { cableRows: String(MAX_CABLE_ROWS), layers: '3', quantity: int(MAX_QUANTITY) },
    trays: project.trays.map((tray) => {
      const outcome = cachedTrayOutcome(tray, project.standards);
      const { result } = outcome;
      const chosen = result.selected!;
      return {
        name: tray.name,
        service: tray.service,
        selected: size(chosen.widthMm, chosen.heightMm),
        fill: percent(chosen.fill),
        maxFill: `${plain(tray.settings.maxFillPct)}%`,
        cables: String(result.cableCount),
        layers: String(result.layers.length),
        weight: `${num1(result.weightKgPerM)} kg/m`,
        rowsWithoutWeight: outcome.rowsWithoutWeight,
      };
    }),
    t2: {
      cables: cableList(o2),
      layers: String(o2.result.layers.length),
      required: `${num1(o2.result.requiredWidthMm)} × ${num1(o2.result.requiredHeightMm)} mm`,
      firstTry: size(first.widthMm, first.heightMm),
      firstFill: percent(first.fill),
      selected: size(selected2.widthMm, selected2.heightMm),
      selectedFill: percent(selected2.fill),
      maxFill: `${plain(t2!.settings.maxFillPct)}%`,
      clearance: num1(drawing2.zonesMm.clearancePerSide),
      spare: num1(drawing2.zonesMm.spare),
      cableArea: int(o2.result.cableAreaMm2),
    },
    t3: {
      name: t3!.name,
      service: t3!.service,
      cables: String(o3.result.cableCount),
      layers: String(o3.result.layers.length),
      spacing: `${plain(t3!.settings.spacing)} × OD`,
      clearanceFactor: `${plain(t3!.settings.clearanceFactor)} × OD`,
      selected: size(selected3.widthMm, selected3.heightMm),
      required: `${num1(o3.result.requiredWidthMm)} × ${num1(o3.result.requiredHeightMm)} mm`,
      fill: percent(selected3.fill),
      maxFill: `${plain(t3!.settings.maxFillPct)}%`,
      clearance: num1(drawing3.zonesMm.clearancePerSide),
      spare: num1(drawing3.zonesMm.spare),
      unused: num1(drawing3.zonesMm.unused),
      cableArea: int(o3.result.cableAreaMm2),
    },
    t3Drawing: { viewBox: roundShape(drawing3.viewBox as unknown as DrawingShape) as unknown as SectionDrawing['viewBox'], shapes: drawing3.shapes.map(roundShape) },
    t2Drawing: { viewBox: roundShape(drawing2.viewBox as unknown as DrawingShape) as unknown as SectionDrawing['viewBox'], shapes: drawing2.shapes.map(roundShape) },
  };
}
