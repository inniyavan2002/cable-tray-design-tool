import { fillMethod } from './fillMethods';
import { cableAreaMm2, layerWidthMm, requiredHeightMm } from './geometry';
import { arrangeLayers, statsFor, type ArrangeOptions, type LayerStats, type LayoutKey, type OdGroup } from './layerLayout';
import { normalizeRows, normalizeSettings, normalizeStandards } from './normalize';
import { SIZE_EPSILON_MM, selectStandardTray } from './selection';
import type { CableLayer, CableRow, PlacedCable, SizingResult, TrayCandidate, TraySettings, TrayStandards } from './types';

interface RowShare {
  id: string;
  count: number;
}

interface SizedGroup extends OdGroup {
  /** Rows with this OD, in input order, and how many cables each contributes. */
  rows: RowShare[];
}

/**
 * Sizes one tray: arranges the cables in layers, works out the required
 * width and height, and chooses the standard tray.
 */
export function sizeTray(
  rows: readonly CableRow[],
  settings: Partial<TraySettings>,
  standards: TrayStandards,
  options?: ArrangeOptions,
): SizingResult {
  const s = normalizeSettings(settings);
  const sizes = normalizeStandards(standards);
  const cables = normalizeRows(rows);
  const groups = groupByOd(cables);
  const cableCount = groups.reduce((sum, g) => sum + g.count, 0);
  if (cableCount === 0) return emptyResult(s);

  const largestOdMm = groups[0]!.odMm;
  const clearancePerSideMm = s.clearanceFactor * largestOdMm;
  const topClearanceMm = (s.topClearancePct / 100) * largestOdMm;
  const spareFraction = s.sparePct / 100;
  const cableArea = groups.reduce((sum, g) => sum + g.count * cableAreaMm2(g.odMm), 0);
  const method = fillMethod(s.fillMethod);

  const layerWidth = (layer: LayerStats) => layerWidthMm(layer.sumOdMm, layer.minOdMm, s.spacing);

  // Scoring for the layer search follows the selection rule: the smallest
  // passing standard tray, then the narrower one, then the smaller required
  // width and height. Layouts that fit no passing size rank after those that
  // do. The remaining layer widths, widest first, break ties towards evenly
  // filled layers.
  const smallestPassing = smallestPassingTable(sizes.widthsMm, sizes.heightsMm, (w, h) =>
    method.check(cableArea, w, h, s.maxFillPct).passes,
  );
  const score = (layers: readonly LayerStats[]): LayoutKey => {
    const widths = layers.map(layerWidth).sort((a, b) => b - a);
    const widthMm = widths[0]! * (1 + spareFraction) + 2 * clearancePerSideMm;
    const heightMm = requiredHeightMm(
      layers.map((l) => l.maxOdMm),
      s.layerGap,
      topClearanceMm,
    );
    const wi = firstIndexAtLeast(sizes.widthsMm, widthMm);
    const hi = firstIndexAtLeast(sizes.heightsMm, heightMm);
    const fits = wi >= 0 && hi >= 0;
    const pass = fits ? smallestPassing[wi]![hi] : undefined;
    const key = pass ? [0, pass.areaMm2, pass.widthMm, widthMm, heightMm] : [fits ? 1 : 2, widthMm, heightMm];
    for (let i = 1; i < widths.length; i++) key.push(widths[i]!);
    return key;
  };

  const assignment = arrangeLayers(groups, Math.min(s.layers, cableCount), { score, layerWidth }, options);
  const layers = buildLayers(groups, assignment, s);

  const widestLayerMm = Math.max(...layers.map((l) => l.widthMm));
  const spareMm = widestLayerMm * spareFraction;
  const layerHeightsMm = layers.reduce((sum, l) => sum + l.heightMm, 0);
  const layerGapsMm = layers.slice(1).map((l) => (s.layerGap ? l.heightMm : 0));
  const requiredWidthMm = widestLayerMm + spareMm + 2 * clearancePerSideMm;
  const requiredHeightMmValue = layerHeightsMm + layerGapsMm.reduce((sum, g) => sum + g, 0) + topClearanceMm;

  const selection = selectStandardTray(
    { widthMm: requiredWidthMm, heightMm: requiredHeightMmValue },
    cableArea,
    s.maxFillPct,
    sizes,
    method,
  );

  return {
    status: selection.outcome,
    cableCount,
    largestOdMm,
    layers,
    widestLayerMm,
    spareMm,
    clearancePerSideMm,
    requiredWidthMm,
    layerHeightsMm,
    layerGapsMm,
    topClearanceMm,
    requiredHeightMm: requiredHeightMmValue,
    cableAreaMm2: cableArea,
    weightKgPerM: cables.reduce((sum, row) => sum + row.quantity * row.weightKgPerKm, 0) / 1000,
    firstFit: selection.firstFit,
    selected: selection.selected,
    tried: selection.tried,
    drawingSize: selection.selected
      ? { widthMm: selection.selected.widthMm, heightMm: selection.selected.heightMm }
      : { widthMm: requiredWidthMm, heightMm: requiredHeightMmValue },
    settings: s,
  };
}

function groupByOd(rows: readonly CableRow[]): SizedGroup[] {
  const byOd = new Map<number, SizedGroup>();
  for (const row of rows) {
    let group = byOd.get(row.odMm);
    if (!group) {
      group = { odMm: row.odMm, count: 0, rows: [] };
      byOd.set(row.odMm, group);
    }
    group.count += row.quantity;
    group.rows.push({ id: row.id, count: row.quantity });
  }
  return [...byOd.values()].sort((a, b) => b.odMm - a.odMm);
}

type StandardPair = Pick<TrayCandidate, 'widthMm' | 'heightMm' | 'areaMm2'>;

/** Index of the first size that is at least the requirement, or -1. */
function firstIndexAtLeast(sortedSizes: readonly number[], requiredMm: number): number {
  for (let i = 0; i < sortedSizes.length; i++) if (sortedSizes[i]! >= requiredMm - SIZE_EPSILON_MM) return i;
  return -1;
}

/**
 * table[wi][hi] = the smallest passing standard size among widths from index
 * wi up and heights from index hi up (the narrower on equal area), or
 * undefined when none passes. Built once per tray so scoring a layout is a
 * table lookup.
 */
function smallestPassingTable(
  widths: readonly number[],
  heights: readonly number[],
  passes: (widthMm: number, heightMm: number) => boolean,
): Array<Array<StandardPair | undefined>> {
  const better = (a: StandardPair | undefined, b: StandardPair | undefined) =>
    !a ? b : !b ? a : a.areaMm2 < b.areaMm2 || (a.areaMm2 === b.areaMm2 && a.widthMm < b.widthMm) ? a : b;
  const table = widths.map(() => new Array<StandardPair | undefined>(heights.length).fill(undefined));
  for (let wi = widths.length - 1; wi >= 0; wi--) {
    for (let hi = heights.length - 1; hi >= 0; hi--) {
      const w = widths[wi]!;
      const h = heights[hi]!;
      const here = passes(w, h) ? { widthMm: w, heightMm: h, areaMm2: w * h } : undefined;
      table[wi]![hi] = better(better(here, table[wi + 1]?.[hi]), table[wi]![hi + 1]);
    }
  }
  return table;
}

/**
 * Turns per-group counts into placed cables. The tallest layer goes at the
 * bottom (this keeps the layer gaps smallest); cables of the same OD are taken
 * from the rows in input order.
 */
function buildLayers(groups: readonly SizedGroup[], assignment: number[][], s: TraySettings): CableLayer[] {
  const remaining = groups.map((g) => g.rows.map((r) => ({ ...r })));
  const filled = assignment
    .map((counts) => ({ counts, stats: statsFor(groups, counts) }))
    .filter((layer) => layer.stats.count > 0)
    .sort(
      (a, b) =>
        b.stats.maxOdMm - a.stats.maxOdMm ||
        layerWidthMm(b.stats.sumOdMm, b.stats.minOdMm, s.spacing) - layerWidthMm(a.stats.sumOdMm, a.stats.minOdMm, s.spacing),
    );

  let previousTop = 0;
  return filled.map(({ counts }, index) => {
    const ods: Array<{ rowId: string; odMm: number }> = [];
    groups.forEach((group, g) => {
      let needed = counts[g]!;
      for (const share of remaining[g]!) {
        const take = Math.min(needed, share.count);
        for (let i = 0; i < take; i++) ods.push({ rowId: share.id, odMm: group.odMm });
        share.count -= take;
        needed -= take;
        if (needed === 0) break;
      }
    });

    const gapsMm = ods.slice(0, -1).map((cable, i) => s.spacing * Math.max(cable.odMm, ods[i + 1]!.odMm));
    let x = 0;
    const cables: PlacedCable[] = ods.map((cable, i) => {
      const placed = { ...cable, xMm: x };
      x += cable.odMm + (gapsMm[i] ?? 0);
      return placed;
    });
    const heightMm = ods[0]!.odMm;
    const gapBelow = index > 0 && s.layerGap ? heightMm : 0;
    const bottomMm = previousTop + gapBelow;
    previousTop = bottomMm + heightMm;
    return { cables, gapsMm, widthMm: x, heightMm, bottomMm };
  });
}

function emptyResult(settings: TraySettings): SizingResult {
  return {
    status: 'empty',
    cableCount: 0,
    largestOdMm: 0,
    layers: [],
    widestLayerMm: 0,
    spareMm: 0,
    clearancePerSideMm: 0,
    requiredWidthMm: 0,
    layerHeightsMm: 0,
    layerGapsMm: [],
    topClearanceMm: 0,
    requiredHeightMm: 0,
    cableAreaMm2: 0,
    weightKgPerM: 0,
    firstFit: null,
    selected: null,
    tried: [],
    drawingSize: { widthMm: 0, heightMm: 0 },
    settings,
  };
}
