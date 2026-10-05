import { describe, expect, it } from 'vitest';
import { arrangeLayers, compareKeys, layoutCount, type LayoutObjective } from './layerLayout';
import { DEFAULT_STANDARDS } from './normalize';
import { sizeTray } from './sizing';
import { randomTrays } from './testing/corpus';
import type { LayerCount, SizingResult } from './types';

describe('compareKeys', () => {
  it('compares element by element and ignores rounding noise', () => {
    expect(compareKeys([0, 100, 5], [0, 100, 6])).toBeLessThan(0);
    expect(compareKeys([1, 0], [0, 999])).toBeGreaterThan(0);
    expect(compareKeys([0, 1 + 1e-12], [0, 1])).toBe(0);
  });
});

describe('layoutCount', () => {
  it('counts the ways to split each group across the layers', () => {
    expect(
      layoutCount(
        [
          { odMm: 30, count: 2 },
          { odMm: 20, count: 3 },
        ],
        2,
      ),
    ).toBe(3 * 4);
  });
});

describe('arrangeLayers', () => {
  const objective: LayoutObjective = {
    score: (layers) => [Math.max(...layers.map((l) => l.sumOdMm))],
    layerWidth: (layer) => layer.sumOdMm,
  };

  it('refuses more layers than cables', () => {
    expect(() => arrangeLayers([{ odMm: 30, count: 2 }], 3, objective)).toThrow(RangeError);
  });

  it('puts at least one cable in every layer, with either search method', () => {
    const groups = [
      { odMm: 60, count: 1 },
      { odMm: 20, count: 6 },
    ];
    for (const method of ['exact', 'heuristic'] as const) {
      const layout = arrangeLayers(groups, 3, objective, { method });
      expect(layout.every((layer) => layer.some((n) => n > 0))).toBe(true);
      expect(layout.reduce((sum, layer) => sum + layer[1]!, 0)).toBe(6);
    }
  });
});

describe('heuristic search quality', () => {
  const trayKey = (r: SizingResult) =>
    r.status === 'pass' || r.status === 'pass-upsized' ? [r.selected!.areaMm2, r.selected!.widthMm] : null;

  it.each([
    [2, 5, 4, 13],
    [3, 5, 4, 14],
    [2, 6, 5, 21],
    [3, 6, 3, 22],
  ] as const)(
    'picks the same standard tray as the exhaustive search (%i layers, up to %i sizes × %i)',
    (layers, maxRows, maxQuantity, seed) => {
      let compared = 0;
      let differ = 0;
      for (const tray of randomTrays(250, seed, { layers: layers as LayerCount, maxRows, maxQuantity })) {
        const exact = trayKey(sizeTray(tray.rows, tray.settings, DEFAULT_STANDARDS, { method: 'exact' }));
        if (!exact) continue;
        compared += 1;
        const heuristic = trayKey(sizeTray(tray.rows, tray.settings, DEFAULT_STANDARDS, { method: 'heuristic' }));
        if (!heuristic || compareKeys(heuristic, exact) !== 0) differ += 1;
      }
      expect(compared).toBeGreaterThan(50);
      expect(differ / compared).toBeLessThanOrEqual(0.01);
    },
  );
});
