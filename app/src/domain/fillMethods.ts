import type { FillMethodId } from './types';

export interface FillCheck {
  /** Fill as a fraction of the tray cross-section. */
  fill: number;
  passes: boolean;
}

export interface FillMethod {
  id: FillMethodId;
  label: string;
  check(cableAreaMm2: number, widthMm: number, heightMm: number, maxFillPct: number): FillCheck;
}

/** Tolerance so a fill exactly at the limit is not rejected by rounding. */
const FILL_EPSILON = 1e-12;

const standardArea: FillMethod = {
  id: 'standard-area',
  label: 'Standard (cable area ≤ max fill × tray area)',
  check(cableAreaMm2, widthMm, heightMm, maxFillPct) {
    const fill = cableAreaMm2 / (widthMm * heightMm);
    return { fill, passes: fill <= maxFillPct / 100 + FILL_EPSILON };
  },
};

const METHODS: Record<FillMethodId, FillMethod> = { 'standard-area': standardArea };

export function fillMethod(id: FillMethodId): FillMethod {
  return METHODS[id];
}
