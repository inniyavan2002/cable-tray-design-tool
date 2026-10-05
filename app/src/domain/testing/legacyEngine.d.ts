export interface LegacyTray {
  layers: number;
  spacingLabel: 'Touching (0d)' | '0.5d' | '1d' | '2d';
  clearanceFactor: number;
  topClearance: number;
  maxFillPct: number;
  sparePct: number;
  layerSpaceMode: 'yes' | 'no';
  cables: Array<{ id: string; mode: 'manual'; od: number; weight: number; qty: number }>;
}

export interface LegacyResult {
  empty: boolean;
  tiers: Array<Array<{ od: number; rowId: string }>>;
  maxLayerWidth: number;
  clearanceApplied: number;
  requiredWidth: number;
  requiredHeight: number;
  selWidth: number | null;
  selHeight: number | null;
  fillPct: number | null;
  status: 'pass' | 'fail' | 'warn';
}

export function createLegacyComputeTray(standards: { widths: number[]; heights: number[] }): (tray: LegacyTray) => LegacyResult;
