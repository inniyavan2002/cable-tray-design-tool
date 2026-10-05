import type { FillMethod } from './fillMethods';
import type { TrayCandidate, TraySize } from './types';

/** Standard sizes within this distance of a requirement still count as fitting. */
export const SIZE_EPSILON_MM = 1e-6;

export type SelectionOutcome = 'pass' | 'pass-upsized' | 'fill-not-met' | 'exceeds-standards';

export interface Selection {
  outcome: SelectionOutcome;
  firstFit: TraySize | null;
  selected: TrayCandidate | null;
  tried: TrayCandidate[];
}

export interface StandardSizes {
  /** Ascending, unique, positive. */
  widthsMm: readonly number[];
  heightsMm: readonly number[];
}

/**
 * Chooses the standard tray for a required width and height:
 * among sizes that fit, the smallest cross-section that meets the fill limit,
 * the narrower one on a tie. If none meets the fill limit, the largest size
 * that fits is returned with outcome "fill-not-met".
 */
export function selectStandardTray(
  required: TraySize,
  cableAreaMm2: number,
  maxFillPct: number,
  standards: StandardSizes,
  method: FillMethod,
): Selection {
  const widths = standards.widthsMm.filter((w) => w >= required.widthMm - SIZE_EPSILON_MM);
  const heights = standards.heightsMm.filter((h) => h >= required.heightMm - SIZE_EPSILON_MM);
  const firstWidth = widths[0];
  const firstHeight = heights[0];
  if (firstWidth === undefined || firstHeight === undefined) {
    return { outcome: 'exceeds-standards', firstFit: null, selected: null, tried: [] };
  }

  const candidates: TrayCandidate[] = [];
  for (const widthMm of widths) {
    for (const heightMm of heights) {
      const { fill, passes } = method.check(cableAreaMm2, widthMm, heightMm, maxFillPct);
      candidates.push({ widthMm, heightMm, areaMm2: widthMm * heightMm, fill, passesFill: passes });
    }
  }
  candidates.sort((a, b) => a.areaMm2 - b.areaMm2 || a.widthMm - b.widthMm);

  const firstFit = { widthMm: firstWidth, heightMm: firstHeight };
  const selected = candidates.find((c) => c.passesFill);
  if (!selected) {
    const largest = candidates.reduce((best, c) => (c.areaMm2 > best.areaMm2 ? c : best));
    const firstFitCandidate = candidates[0]!;
    const tried = largest === firstFitCandidate ? [largest] : [firstFitCandidate, largest];
    return { outcome: 'fill-not-met', firstFit, selected: largest, tried };
  }

  const tried = candidates.filter((c) => c.areaMm2 <= selected.areaMm2);
  const outcome = selected.widthMm === firstWidth && selected.heightMm === firstHeight ? 'pass' : 'pass-upsized';
  return { outcome, firstFit, selected, tried };
}

/** Sorted, de-duplicated, positive sizes; ignores anything that is not a usable number. */
export function cleanSizeList(values: readonly number[]): number[] {
  return [...new Set(values.filter((v) => Number.isFinite(v) && v > 0))].sort((a, b) => a - b);
}
