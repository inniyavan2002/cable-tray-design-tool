/** Allowed gaps between neighbouring cables, as a multiple of the larger OD. */
export const SPACING_FACTORS = [0, 0.5, 1, 2] as const;
export type SpacingFactor = (typeof SPACING_FACTORS)[number];

export type LayerCount = 1 | 2 | 3;
export type TrayType = 'perforated' | 'ladder';
/** Only the area method exists today; NEC 392.22 is planned as a second method. */
export type FillMethodId = 'standard-area';

export interface TraySettings {
  /** Number of cable layers. Every selected layer is used when there are enough cables. */
  layers: LayerCount;
  spacing: SpacingFactor;
  /** When true, the gap under each upper layer equals the largest OD in that layer. */
  layerGap: boolean;
  /** Side clearance at each rail, as a multiple of the largest cable OD. */
  clearanceFactor: number;
  /** Top clearance as a percentage of the largest cable OD. */
  topClearancePct: number;
  /** Spare capacity as a percentage of the widest layer. Applies to width only. */
  sparePct: number;
  maxFillPct: number;
  /** Shown on reports; does not change sizing yet. */
  trayType: TrayType;
  fillMethod: FillMethodId;
}

export interface CableRow {
  id: string;
  odMm: number;
  weightKgPerKm: number;
  quantity: number;
}

export interface TrayStandards {
  widthsMm: number[];
  heightsMm: number[];
}

export interface TraySize {
  widthMm: number;
  heightMm: number;
}

/** A standard tray size checked during selection. */
export interface TrayCandidate extends TraySize {
  areaMm2: number;
  /** Cable area ÷ tray area, as a fraction (0.343 = 34.3%). */
  fill: number;
  passesFill: boolean;
}

export interface PlacedCable {
  rowId: string;
  odMm: number;
  /** Left edge of the cable, measured from the start of the cable zone (after the side clearance). */
  xMm: number;
}

export interface CableLayer {
  /** Largest cable first. */
  cables: PlacedCable[];
  /** Gap after each cable except the last. */
  gapsMm: number[];
  widthMm: number;
  /** Largest OD in the layer. */
  heightMm: number;
  /** Height of the layer's base above the tray floor. */
  bottomMm: number;
}

export type SizingStatus = 'empty' | 'pass' | 'pass-upsized' | 'fill-not-met' | 'exceeds-standards';

export interface SizingResult {
  status: SizingStatus;
  cableCount: number;
  largestOdMm: number;
  /** Bottom layer first. Only layers that hold cables. */
  layers: CableLayer[];
  widestLayerMm: number;
  spareMm: number;
  clearancePerSideMm: number;
  requiredWidthMm: number;
  /** Sum of the layer heights. */
  layerHeightsMm: number;
  /** Gap under each layer above the bottom one. */
  layerGapsMm: number[];
  topClearanceMm: number;
  requiredHeightMm: number;
  cableAreaMm2: number;
  weightKgPerM: number;
  /** Smallest standard size that fits the cables, before the fill check. */
  firstFit: TraySize | null;
  selected: TrayCandidate | null;
  /** Standard sizes checked in order of area, as shown in the calculation summary. */
  tried: TrayCandidate[];
  /** Size to draw: the selected tray, or the required size when no standard size fits. */
  drawingSize: TraySize;
  settings: TraySettings;
}
