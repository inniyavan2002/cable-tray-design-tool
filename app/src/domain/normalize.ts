import { cleanSizeList, type StandardSizes } from './selection';
import { SPACING_FACTORS, type CableRow, type LayerCount, type TraySettings, type TrayStandards } from './types';

export const DEFAULT_TRAY_SETTINGS: TraySettings = {
  layers: 1,
  spacing: 1,
  layerGap: true,
  clearanceFactor: 0.5,
  topClearancePct: 0,
  sparePct: 20,
  maxFillPct: 40,
  trayType: 'perforated',
  fillMethod: 'standard-area',
};

export const DEFAULT_STANDARDS: TrayStandards = {
  widthsMm: [50, 75, 100, 150, 200, 300, 450, 600, 750, 900, 1000],
  heightsMm: [25, 50, 75, 100, 150, 200],
};

function finiteAtLeast(value: unknown, min: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min ? value : fallback;
}

/** Replaces missing or invalid settings with defaults so sizing never runs on bad input. */
export function normalizeSettings(input: Partial<TraySettings> = {}): TraySettings {
  const d = DEFAULT_TRAY_SETTINGS;
  const layers = input.layers === 1 || input.layers === 2 || input.layers === 3 ? input.layers : d.layers;
  const spacing = SPACING_FACTORS.find((f) => f === input.spacing) ?? d.spacing;
  const maxFill = finiteAtLeast(input.maxFillPct, Number.MIN_VALUE, d.maxFillPct);
  return {
    layers: layers as LayerCount,
    spacing,
    layerGap: typeof input.layerGap === 'boolean' ? input.layerGap : d.layerGap,
    clearanceFactor: finiteAtLeast(input.clearanceFactor, 0, d.clearanceFactor),
    topClearancePct: finiteAtLeast(input.topClearancePct, 0, d.topClearancePct),
    sparePct: finiteAtLeast(input.sparePct, 0, d.sparePct),
    maxFillPct: Math.min(100, maxFill),
    trayType: input.trayType === 'ladder' ? 'ladder' : 'perforated',
    fillMethod: 'standard-area',
  };
}

export function normalizeStandards(input: TrayStandards): StandardSizes {
  return { widthsMm: cleanSizeList(input.widthsMm), heightsMm: cleanSizeList(input.heightsMm) };
}

/** Keeps rows with a positive OD and at least one cable; quantities become whole numbers. */
export function normalizeRows(rows: readonly CableRow[]): CableRow[] {
  return rows
    .filter((row) => Number.isFinite(row.odMm) && row.odMm > 0 && Number.isFinite(row.quantity) && row.quantity >= 1)
    .map((row) => ({
      ...row,
      quantity: Math.floor(row.quantity),
      weightKgPerKm: Number.isFinite(row.weightKgPerKm) && row.weightKgPerKm > 0 ? row.weightKgPerKm : 0,
    }));
}
