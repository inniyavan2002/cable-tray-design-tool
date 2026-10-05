import { describe, expect, it } from 'vitest';
import { DEFAULT_STANDARDS } from './normalize';
import { sizeTray } from './sizing';
import {
  legacyArrangementWithNewRules,
  randomTrays,
  toLegacyStandards,
  toLegacyTray,
  type CorpusTray,
} from './testing/corpus';
import { createLegacyComputeTray } from './testing/legacyEngine';
import type { SizingResult } from './types';

const legacyComputeTray = createLegacyComputeTray(toLegacyStandards(DEFAULT_STANDARDS));

/** [outcome rank, tray area, tray width]; lower is a better (smaller) tray. */
function trayRank(outcome: string, selected: { areaMm2: number; widthMm: number } | null): number[] {
  if (outcome === 'pass' || outcome === 'pass-upsized') return [0, selected!.areaMm2, selected!.widthMm];
  return [outcome === 'fill-not-met' ? 1 : 2, 0, 0];
}

function compare(tray: CorpusTray) {
  const legacy = legacyComputeTray(toLegacyTray(tray));
  const legacyNewRules = legacyArrangementWithNewRules(legacy, tray, DEFAULT_STANDARDS);
  const current: SizingResult = sizeTray(tray.rows, tray.settings, DEFAULT_STANDARDS);
  return { legacyNewRules, current };
}

const lessOrEqual = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return true;
};

describe('new engine against the legacy engine with the approved rules applied', () => {
  it.each([
    ['1 layer', randomTrays(80, 101, { layers: 1, maxRows: 8, maxQuantity: 8 })],
    ['2 layers', randomTrays(60, 102, { layers: 2, maxRows: 4, maxQuantity: 3 })],
    ['3 layers', randomTrays(40, 103, { layers: 3, maxRows: 3, maxQuantity: 3 })],
  ])('never picks a larger tray (%s)', (_, trays) => {
    for (const tray of trays) {
      const { legacyNewRules, current } = compare(tray);
      const legacyRank = trayRank(legacyNewRules.selection.outcome, legacyNewRules.selection.selected);
      const currentRank = trayRank(current.status, current.selected);
      expect(lessOrEqual(currentRank, legacyRank), tray.name).toBe(true);
    }
  });

  it('gives the same required width and height as the legacy geometry for one layer', () => {
    for (const tray of randomTrays(80, 104, { layers: 1, maxRows: 8, maxQuantity: 8 })) {
      const { legacyNewRules, current } = compare(tray);
      expect(current.requiredWidthMm, tray.name).toBeCloseTo(legacyNewRules.requiredWidthMm, 6);
      expect(current.requiredHeightMm, tray.name).toBeCloseTo(legacyNewRules.requiredHeightMm, 6);
    }
  });
});
