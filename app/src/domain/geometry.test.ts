import { describe, expect, it } from 'vitest';
import { layerWidthMm, requiredHeightMm } from './geometry';
import { seededRandom } from './testing/corpus';

describe('layerWidthMm', () => {
  it('matches adding each cable and each gap in turn, largest cable first', () => {
    const random = seededRandom(1);
    for (let trial = 0; trial < 200; trial++) {
      const ods = Array.from({ length: 1 + Math.floor(random() * 12) }, () => 5 + random() * 90).sort((a, b) => b - a);
      for (const spacing of [0, 0.5, 1, 2]) {
        let explicit = 0;
        ods.forEach((od, i) => {
          explicit += od;
          if (i < ods.length - 1) explicit += spacing * Math.max(od, ods[i + 1]!);
        });
        const sum = ods.reduce((a, b) => a + b, 0);
        expect(layerWidthMm(sum, ods.at(-1)!, spacing)).toBeCloseTo(explicit, 9);
      }
    }
  });

  it('is the OD alone for a single cable', () => {
    expect(layerWidthMm(40, 40, 2)).toBe(40);
  });
});

describe('requiredHeightMm', () => {
  it('adds a gap equal to each upper layer height when layer gaps are on', () => {
    expect(requiredHeightMm([60.3, 37.5], true, 0)).toBeCloseTo(60.3 + 37.5 + 37.5, 9);
  });

  it('stacks layers directly when layer gaps are off', () => {
    expect(requiredHeightMm([60.3, 37.5], false, 0)).toBeCloseTo(97.8, 9);
  });

  it('puts the tallest layer on the floor whatever the order given', () => {
    expect(requiredHeightMm([20, 50, 30], true, 0)).toBeCloseTo(50 + 2 * 20 + 2 * 30, 9);
  });

  it('adds top clearance', () => {
    expect(requiredHeightMm([50], true, 10)).toBe(60);
  });
});
