/**
 * Everything a report says about a project, independent of the output format.
 * The PDF and Excel builders only lay this out, so they cannot disagree.
 */
import type { CalcReport } from '../domain/calcReport';
import { int, num1, percent, plain, size } from '../domain/format';
import type { TrayStandards } from '../domain/types';
import { sectionDrawing, type SectionDrawing } from '../drawing/sectionGeometry';
export { fileSafe } from '../state/fileName';
import type { Project, ProjectDetails, Tray } from '../state/projectModel';
import { cachedTrayOutcome, type ResolvedCable, type TrayOutcome } from '../state/trayResult';
import { STATUS_TEXT, traySizeText } from '../ui/results/status';

export type ReportTone = 'pass' | 'warn' | 'fail' | 'neutral';

export interface ReportCableRow {
  tag: number;
  colourIndex: number;
  description: string;
  details: string;
  variant: string;
  odMm: number | null;
  quantity: number;
  weightKgPerKm: number | null;
  source: string;
  /** Manual entry, needs review, or not used in sizing. */
  note: string;
}

export interface ReportTray {
  id: string;
  name: string;
  service: string;
  outcome: TrayOutcome;
  sizeText: string;
  statusText: string;
  statusTone: ReportTone;
  resultRows: Array<[string, string]>;
  settingsRows: Array<[string, string]>;
  cables: ReportCableRow[];
  calc: CalcReport;
  drawing: SectionDrawing | null;
  /** Line under the drawing, e.g. "Required 288.7 × 47.0 mm · 2 layers · touching". */
  drawingCaption: string;
}

export interface ProjectReport {
  projectName: string;
  details: ProjectDetails;
  generatedAt: Date;
  standards: TrayStandards;
  trays: ReportTray[];
  /** Header and rows of the project summary table. */
  summary: { headers: string[]; rows: string[][] };
  /** Rules used for every tray, printed once. */
  method: string[];
  /** Things a checker should know about, e.g. cables that need review. */
  warnings: string[];
}

const SPACING_TEXT: Record<number, string> = { 0: 'Touching', 0.5: '0.5 × OD', 1: '1 × OD', 2: '2 × OD' };
const SPACING_CAPTION: Record<number, string> = { 0: 'cables touching', 0.5: 'spacing 0.5 × OD', 1: 'spacing 1 × OD', 2: 'spacing 2 × OD' };

function cableNote(r: ResolvedCable): string {
  if (!r.usable) return `Not used in sizing: ${r.problem?.message ?? ''}`;
  if (r.cable.kind === 'manual') return 'Manual entry';
  if (r.problem) return `Needs review: ${r.problem.message}`;
  return '';
}

function reportTray(tray: Tray, standards: TrayStandards): ReportTray {
  const outcome = cachedTrayOutcome(tray, standards);
  const { result, resolved } = outcome;
  const s = tray.settings;
  const status = STATUS_TEXT[result.status];
  const cableCount = tray.cables.reduce((sum, c) => sum + c.quantity, 0);
  const styleByRow = new Map(resolved.map((r) => [r.cable.id, { tag: r.tag, colourIndex: r.colourIndex }]));
  const layers = result.layers.length || s.layers;

  const resultRows: Array<[string, string]> = [
    ['Selected tray', traySizeText(result)],
    ['Status', status.long],
    ['Required size', result.status === 'empty' ? '–' : `${num1(result.requiredWidthMm)} × ${num1(result.requiredHeightMm)} mm`],
    ['Fill', result.selected ? `${percent(result.selected.fill)} (limit ${plain(s.maxFillPct)}%)` : '–'],
    ['Cables', `${tray.cables.length} row${tray.cables.length === 1 ? '' : 's'}, ${cableCount} cable${cableCount === 1 ? '' : 's'}`],
    [
      'Cable weight',
      `${num1(result.weightKgPerM)} kg/m${outcome.rowsWithoutWeight ? ` (unknown for ${outcome.rowsWithoutWeight} row${outcome.rowsWithoutWeight === 1 ? '' : 's'})` : ''}`,
    ],
  ];
  if (result.status === 'pass-upsized' && result.tried[0]) {
    const first = result.tried[0];
    resultRows.push(['Upsized for fill', `${size(first.widthMm, first.heightMm)} gave ${percent(first.fill)}`]);
  }

  const settingsRows: Array<[string, string]> = [
    ['Tray type', s.trayType === 'ladder' ? 'Ladder' : 'Perforated'],
    ['Layers', String(s.layers)],
    ['Spacing between cables', SPACING_TEXT[s.spacing] ?? `${plain(s.spacing)} × OD`],
    ['Gap between layers', s.layers === 1 ? 'Not applicable (1 layer)' : s.layerGap ? 'Yes, largest OD of the layer above' : 'No, layers touch'],
    ['Side clearance, each rail', `${plain(s.clearanceFactor)} × largest OD`],
    ['Top clearance', `${plain(s.topClearancePct)}% of largest OD`],
    ['Spare capacity (width)', `${plain(s.sparePct)}%`],
    ['Maximum fill', `${plain(s.maxFillPct)}%`],
  ];

  const cables: ReportCableRow[] = resolved.map((r) => ({
    tag: r.tag,
    colourIndex: r.colourIndex,
    description: r.title,
    details: r.subtitle,
    variant: r.catalog ? r.catalog.variant : 'Manual',
    odMm: r.odMm,
    quantity: r.cable.quantity,
    weightKgPerKm: r.weightKgPerKm,
    source: r.catalog ? `${r.catalog.source.file}${r.catalog.source.page ? `, p. ${r.catalog.source.page}` : ''}` : '–',
    note: cableNote(r),
  }));

  return {
    id: tray.id,
    name: tray.name || 'Unnamed tray',
    service: tray.service,
    outcome,
    sizeText: traySizeText(result),
    statusText: status.long,
    statusTone: status.tone,
    resultRows,
    settingsRows,
    cables,
    calc: outcome.report,
    drawing: sectionDrawing(result, (rowId) => styleByRow.get(rowId) ?? { tag: 0, colourIndex: 0 }, { dimensions: true, zones: true }),
    drawingCaption:
      result.status === 'empty'
        ? ''
        : `Required ${num1(result.requiredWidthMm)} × ${num1(result.requiredHeightMm)} mm · ${layers} layer${layers === 1 ? '' : 's'} · ${SPACING_CAPTION[s.spacing] ?? `spacing ${plain(s.spacing)} × OD`} · all dimensions in mm`,
  };
}

export function buildProjectReport(project: Project, trayIds: readonly string[], generatedAt = new Date()): ProjectReport {
  const trays = project.trays.filter((t) => trayIds.includes(t.id)).map((t) => reportTray(t, project.standards));
  const warnings: string[] = [];
  for (const t of trays) {
    for (const c of t.cables) {
      if (c.note && c.note !== 'Manual entry') warnings.push(`${t.name}, cable ${c.tag} (${c.description}): ${c.note}`);
    }
    if (t.outcome.result.status === 'fill-not-met') warnings.push(`${t.name}: no standard size meets the ${plain(t.outcome.result.settings.maxFillPct)}% fill limit.`);
    if (t.outcome.result.status === 'exceeds-standards') warnings.push(`${t.name}: the required size is larger than every standard size.`);
  }
  const manual = trays.flatMap((t) => t.cables.filter((c) => c.note === 'Manual entry').map((c) => `${t.name} cable ${c.tag}`));
  if (manual.length) warnings.push(`Manual cables, not from the catalog: ${manual.join(', ')}.`);

  return {
    projectName: project.name,
    details: project.details,
    generatedAt,
    standards: project.standards,
    trays,
    summary: {
      headers: ['Tray', 'Service', 'Type', 'Layers', 'Cables', 'Selected tray', 'Fill', 'Status'],
      rows: trays.map((t) => [
        t.name,
        t.service || '–',
        t.settingsRows[0]![1],
        String(t.outcome.result.layers.length || t.outcome.result.settings.layers),
        String(t.outcome.result.cableCount),
        t.sizeText,
        t.outcome.result.selected ? percent(t.outcome.result.selected.fill) : '–',
        t.statusText,
      ]),
    },
    method: [
      'Required width = widest layer + spare capacity + side clearance at both rails (clearance factor × largest cable OD at each rail).',
      'Required height = layer heights + a gap under each upper layer equal to its largest OD (when layer gaps are used) + top clearance.',
      `Fill = total cable cross-section area (Σ π/4 × OD²) ÷ tray width × height. The selected tray is the standard size with the smallest cross-section that fits the cables and meets the fill limit; on a tie, the narrower one.`,
      `Standard widths: ${project.standards.widthsMm.map((w) => int(w)).join(', ')} mm. Standard heights: ${project.standards.heightsMm.map((h) => int(h)).join(', ')} mm.`,
      'Cable ODs come from the manufacturer catalogues. Rows marked "needs review" did not pass every automatic plausibility check.',
    ],
    warnings,
  };
}
