/**
 * Seeded random trays for tests and the engine comparison report, built from
 * real cable ODs in the manufacturer catalog. The same seed always produces
 * the same trays.
 */
import { fillMethod } from '../fillMethods';
import { cableAreaMm2 } from '../geometry';
import { normalizeStandards } from '../normalize';
import { selectStandardTray, type Selection } from '../selection';
import type { CableRow, LayerCount, SpacingFactor, TraySettings, TrayStandards } from '../types';
import cableOds from './cableOds.json';
import type { LegacyResult, LegacyTray } from './legacyEngine';

export interface CorpusTray {
  name: string;
  rows: CableRow[];
  settings: TraySettings;
}

export interface CorpusShape {
  layers: LayerCount;
  maxRows: number;
  maxQuantity: number;
}

/** Small, fast, seedable random number generator (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]!;
}

export function randomTrays(count: number, seed: number, shape: CorpusShape): CorpusTray[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, (_, index) => {
    const rowCount = 1 + Math.floor(random() * shape.maxRows);
    const rows: CableRow[] = Array.from({ length: rowCount }, (_, r) => ({
      id: `r${r + 1}`,
      odMm: pick(random, cableOds),
      weightKgPerKm: 0,
      quantity: 1 + Math.floor(random() * shape.maxQuantity),
    }));
    const settings: TraySettings = {
      layers: shape.layers,
      spacing: pick(random, [0, 0.5, 1, 2] as const),
      layerGap: random() < 0.5,
      clearanceFactor: pick(random, [0.3, 0.5, 1]),
      topClearancePct: pick(random, [0, 10, 20]),
      sparePct: pick(random, [0, 20, 25]),
      maxFillPct: pick(random, [40, 50]),
      trayType: 'perforated',
      fillMethod: 'standard-area',
    };
    return { name: `L${shape.layers}-${seed}-${index + 1}`, rows, settings };
  });
}

const LEGACY_SPACING: Record<SpacingFactor, LegacyTray['spacingLabel']> = {
  0: 'Touching (0d)',
  0.5: '0.5d',
  1: '1d',
  2: '2d',
};

export function toLegacyTray(tray: CorpusTray): LegacyTray {
  const s = tray.settings;
  return {
    layers: s.layers,
    spacingLabel: LEGACY_SPACING[s.spacing],
    clearanceFactor: s.clearanceFactor,
    topClearance: s.topClearancePct,
    maxFillPct: s.maxFillPct,
    sparePct: s.sparePct,
    layerSpaceMode: s.layerGap ? 'yes' : 'no',
    cables: tray.rows.map((r) => ({ id: r.id, mode: 'manual', od: r.odMm, weight: r.weightKgPerKm, qty: r.quantity })),
  };
}

export function toLegacyStandards(standards: TrayStandards): { widths: number[]; heights: number[] } {
  return { widths: [...standards.widthsMm], heights: [...standards.heightsMm] };
}

export function totalCableArea(rows: readonly CableRow[]): number {
  return rows.reduce((sum, r) => sum + r.quantity * cableAreaMm2(r.odMm), 0);
}

export interface RuleStep {
  requiredWidthMm: number;
  requiredHeightMm: number;
  selection: Selection;
}

/**
 * The legacy layer arrangement with the approved rules applied: clearance on
 * both sides, and the new standard-size selection with fill upsizing.
 * Comparing this with the new engine isolates the effect of the new layer search.
 */
export function legacyArrangementWithNewRules(legacy: LegacyResult, tray: CorpusTray, standards: TrayStandards): RuleStep {
  const s = tray.settings;
  const requiredWidthMm = legacy.maxLayerWidth * (1 + s.sparePct / 100) + 2 * legacy.clearanceApplied;
  const requiredHeightMm = legacy.requiredHeight;
  const selection = selectStandardTray(
    { widthMm: requiredWidthMm, heightMm: requiredHeightMm },
    totalCableArea(tray.rows),
    s.maxFillPct,
    normalizeStandards(standards),
    fillMethod(s.fillMethod),
  );
  return { requiredWidthMm, requiredHeightMm, selection };
}

/** Same ordering the new engine optimises: smallest passing tray, narrower, then required width and height. */
export function outcomeKey(selection: Selection, requiredWidthMm: number, requiredHeightMm: number): number[] {
  if (selection.outcome === 'pass' || selection.outcome === 'pass-upsized') {
    return [0, selection.selected!.areaMm2, selection.selected!.widthMm, requiredWidthMm, requiredHeightMm];
  }
  return [selection.outcome === 'fill-not-met' ? 1 : 2, requiredWidthMm, requiredHeightMm];
}
