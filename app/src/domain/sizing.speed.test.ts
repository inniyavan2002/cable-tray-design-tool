import { describe, expect, it } from 'vitest';
import { DEFAULT_STANDARDS } from './normalize';
import { sizeTray } from './sizing';
import cableOds from './testing/cableOds.json';
import { seededRandom } from './testing/corpus';
import type { CableRow, TraySettings } from './types';

/** Median time of several runs, after one warm-up run. */
function medianMs(run: () => void, runs = 5): number {
  run();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[Math.floor(runs / 2)]!;
}

describe('sizing speed', () => {
  it('sizes 100 cables of 25 different sizes in 3 layers in under 20 ms', () => {
    const random = seededRandom(2026);
    const rows: CableRow[] = Array.from({ length: 25 }, (_, i) => ({
      id: `r${i}`,
      odMm: cableOds[Math.floor(random() * cableOds.length)]!,
      weightKgPerKm: 0,
      quantity: 4,
    }));
    const settings: Partial<TraySettings> = { layers: 3, spacing: 1, layerGap: true };
    expect(medianMs(() => sizeTray(rows, settings, DEFAULT_STANDARDS))).toBeLessThan(20);
  });

  it('sizes the tray that took the old engine 79 s (12 sizes × 8, 3 layers) in under 20 ms', () => {
    // Same tray as the phase-1 analysis benchmark: ODs 12, 15.7 … 52.7 mm, 8 of each.
    const rows: CableRow[] = Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`,
      odMm: 12 + i * 3.7,
      weightKgPerKm: 0,
      quantity: 8,
    }));
    expect(medianMs(() => sizeTray(rows, { layers: 3, spacing: 1, layerGap: true }, DEFAULT_STANDARDS))).toBeLessThan(20);
  });
});
