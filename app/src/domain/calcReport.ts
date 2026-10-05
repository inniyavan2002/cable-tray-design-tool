import { int, mm, num1, percent, plain, size } from './format';
import type { CableLayer, SizingResult, TrayCandidate } from './types';

export interface CalcRow {
  label: string;
  value: string;
  /** "total" marks a result line (required width, required height, selected tray). */
  emphasis?: 'total';
}

/** The calculation summary. The screen, the PDF and Excel all show these rows. */
export interface CalcReport {
  width: CalcRow[];
  height: CalcRow[];
  selection: CalcRow[];
}

/** Longest list of checked sizes shown before the middle is summarised. */
const MAX_TRIED_ROWS = 8;

export function buildCalcReport(result: SizingResult): CalcReport {
  if (result.status === 'empty') return { width: [], height: [], selection: [] };
  return { width: widthRows(result), height: heightRows(result), selection: selectionRows(result) };
}

function spacingLabel(spacing: number): string {
  return spacing === 0 ? 'touching' : `${plain(spacing)}d`;
}

function odTerms(layer: CableLayer): string {
  const counts = new Map<number, number>();
  for (const cable of layer.cables) counts.set(cable.odMm, (counts.get(cable.odMm) ?? 0) + 1);
  return [...counts.entries()].map(([od, n]) => (n > 1 ? `${n}×${num1(od)}` : num1(od))).join(' + ');
}

function widthRows(r: SizingResult): CalcRow[] {
  const s = r.settings;
  const rows: CalcRow[] = [];
  r.layers.forEach((layer, index) => {
    const n = index + 1;
    const odSum = layer.cables.reduce((sum, c) => sum + c.odMm, 0);
    const gapSum = layer.gapsMm.reduce((sum, g) => sum + g, 0);
    rows.push({
      label: `Layer ${n} cable ODs`,
      value: layer.cables.length > 1 ? `${odTerms(layer)} = ${mm(odSum)}` : mm(odSum),
    });
    const gaps = layer.cables.length === 1 ? 'no gaps' : s.spacing === 0 ? 'touching' : mm(gapSum);
    rows.push({
      label: `Layer ${n} gaps (${spacingLabel(s.spacing)})`,
      value: `${gaps} → layer width ${mm(layer.widthMm)}`,
    });
  });
  if (r.layers.length > 1) {
    const widest = r.layers.findIndex((l) => l.widthMm === r.widestLayerMm);
    rows.push({ label: 'Widest layer', value: `Layer ${widest + 1}: ${mm(r.widestLayerMm)}` });
  }
  rows.push({
    label: `Spare capacity (${plain(s.sparePct)}%)`,
    value: `${plain(s.sparePct)}% × ${num1(r.widestLayerMm)} = ${mm(r.spareMm)}`,
  });
  rows.push({
    label: 'Side clearance, both sides',
    value: `2 × (${plain(s.clearanceFactor)} × ${num1(r.largestOdMm)}) = ${mm(2 * r.clearancePerSideMm)}`,
  });
  rows.push({
    label: 'Required width',
    value: `${num1(r.widestLayerMm)} + ${num1(r.spareMm)} + ${num1(2 * r.clearancePerSideMm)} = ${mm(r.requiredWidthMm)}`,
    emphasis: 'total',
  });
  return rows;
}

function heightRows(r: SizingResult): CalcRow[] {
  const s = r.settings;
  const rows: CalcRow[] = r.layers.map((layer, index) => ({
    label: `Layer ${index + 1} height`,
    value: `largest OD ${mm(layer.heightMm)}`,
  }));
  const multiLayer = r.layers.length > 1;
  if (multiLayer && s.layerGap) {
    r.layers.slice(1).forEach((layer, index) => {
      rows.push({ label: `Gap under layer ${index + 2}`, value: `largest OD in layer ${index + 2} = ${mm(layer.heightMm)}` });
    });
  } else if (multiLayer) {
    rows.push({ label: 'Gap between layers', value: 'none, layers touch' });
  }
  rows.push({
    label: `Top clearance (${plain(s.topClearancePct)}% of ${num1(r.largestOdMm)})`,
    value: mm(r.topClearanceMm),
  });
  const gaps = r.layerGapsMm.reduce((sum, g) => sum + g, 0);
  const terms = multiLayer
    ? `${num1(r.layerHeightsMm)} layers + ${num1(gaps)} gaps + ${num1(r.topClearanceMm)} top`
    : `${num1(r.layerHeightsMm)} layer + ${num1(r.topClearanceMm)} top`;
  rows.push({ label: 'Required height', value: `${terms} = ${mm(r.requiredHeightMm)}`, emphasis: 'total' });
  return rows;
}

function selectionRows(r: SizingResult): CalcRow[] {
  const maxFill = r.settings.maxFillPct;
  const rows: CalcRow[] = [{ label: 'Cable cross-section area', value: `Σ π/4 × OD² = ${int(r.cableAreaMm2)} mm²` }];

  if (r.status === 'exceeds-standards' || !r.firstFit || !r.selected) {
    rows.push({
      label: 'Standard sizes',
      value: `none is at least ${num1(r.requiredWidthMm)} × ${num1(r.requiredHeightMm)} mm`,
    });
    rows.push({ label: 'Selected tray', value: 'None: exceeds the standard sizes', emphasis: 'total' });
    return rows;
  }

  rows.push({ label: 'Smallest standard size that fits', value: `${size(r.firstFit.widthMm, r.firstFit.heightMm)} mm` });
  const selected = r.selected;
  const fillRow = (c: TrayCandidate): CalcRow => {
    const sameAreaWider = c !== selected && c.areaMm2 === selected.areaMm2 && c.passesFill;
    const verdict = c.passesFill ? `≤ ${plain(maxFill)}%, passes` : `> ${plain(maxFill)}%, fails`;
    return {
      label: `Fill at ${size(c.widthMm, c.heightMm)}`,
      value: `${int(r.cableAreaMm2)} ÷ ${int(c.areaMm2)} = ${percent(c.fill)} ${verdict}${sameAreaWider ? ' (wider, not chosen)' : ''}`,
    };
  };

  const tried = r.tried;
  if (tried.length <= MAX_TRIED_ROWS) {
    rows.push(...tried.map(fillRow));
  } else {
    const selectedIndex = tried.indexOf(selected);
    const skipped = selectedIndex - 3;
    rows.push(...tried.slice(0, 3).map(fillRow));
    rows.push({ label: '…', value: `${skipped} more sizes over the ${plain(maxFill)}% limit` });
    rows.push(...tried.slice(selectedIndex).map(fillRow));
  }

  const note =
    r.status === 'pass-upsized' ? ' · upsized for fill' : r.status === 'fill-not-met' ? ' · fill limit not met' : '';
  if (r.status === 'fill-not-met') {
    rows.push({ label: 'Fill limit', value: `no standard size meets ${plain(maxFill)}%; showing the largest that fits` });
  }
  rows.push({ label: 'Selected tray', value: `${size(selected.widthMm, selected.heightMm)} mm${note}`, emphasis: 'total' });
  return rows;
}
