import { describe, expect, it } from 'vitest';
import { cableAreaMm2 } from './geometry';
import { DEFAULT_STANDARDS } from './normalize';
import { sizeTray } from './sizing';
import type { CableRow, SizingResult, TraySettings } from './types';

const row = (id: string, odMm: number, quantity: number, weightKgPerKm = 0): CableRow => ({ id, odMm, quantity, weightKgPerKm });

// Reference trays from the frontend plan, section 3.5 (Cu/XLPE/SWA 4-core ODs from the catalog).
const T1 = [row('240', 60.3, 2), row('95', 41.2, 3), row('35', 28.9, 4)];
const T2 = [row('16', 23.5, 12), row('6', 20.0, 8)];
const T3 = [row('240', 60.3, 2), row('70', 37.5, 4), row('35', 28.9, 6)];
const T2_SETTINGS: Partial<TraySettings> = { layers: 2, spacing: 0, layerGap: false };
const T3_SETTINGS: Partial<TraySettings> = { layers: 2, spacing: 0.5, layerGap: true };

const layerOds = (r: SizingResult) => r.layers.map((l) => l.cables.map((c) => c.odMm));

describe('reference trays', () => {
  it('T1: one layer of feeders fits 900 × 75 at 18.3% fill', () => {
    const r = sizeTray(T1, {}, DEFAULT_STANDARDS);
    expect(r.status).toBe('pass');
    expect(r.widestLayerMm).toBeCloseTo(690.7, 9);
    expect(r.spareMm).toBeCloseTo(138.14, 9);
    expect(r.clearancePerSideMm).toBeCloseTo(30.15, 9);
    expect(r.requiredWidthMm).toBeCloseTo(889.14, 9);
    expect(r.requiredHeightMm).toBeCloseTo(60.3, 9);
    expect(r.cableAreaMm2).toBeCloseTo(2 * cableAreaMm2(60.3) + 3 * cableAreaMm2(41.2) + 4 * cableAreaMm2(28.9), 9);
    expect(r.selected).toMatchObject({ widthMm: 900, heightMm: 75 });
    expect(r.selected!.fill).toBeCloseTo(r.cableAreaMm2 / (900 * 75), 12);
  });

  it('T2: two touching layers fit 300 × 50, which fails fill, so 300 × 75 is chosen', () => {
    const r = sizeTray(T2, T2_SETTINGS, DEFAULT_STANDARDS);
    expect(r.status).toBe('pass-upsized');
    expect(r.requiredWidthMm).toBeCloseTo(288.7, 9);
    expect(r.requiredHeightMm).toBeCloseTo(47, 9);
    expect(r.firstFit).toEqual({ widthMm: 300, heightMm: 50 });
    expect(r.selected).toMatchObject({ widthMm: 300, heightMm: 75 });
    expect(r.selected!.fill).toBeCloseTo(0.343, 3);
  });

  it('T3: keeping both 240 mm² cables on the bottom layer gives 450 × 150', () => {
    const r = sizeTray(T3, T3_SETTINGS, DEFAULT_STANDARDS);
    expect(r.status).toBe('pass');
    expect(layerOds(r)).toEqual([
      [60.3, 60.3, 37.5, 37.5, 28.9],
      [37.5, 37.5, 28.9, 28.9, 28.9, 28.9, 28.9],
    ]);
    expect(r.requiredWidthMm).toBeCloseTo(447.06, 9);
    expect(r.requiredHeightMm).toBeCloseTo(135.3, 9);
    expect(r.selected).toMatchObject({ widthMm: 450, heightMm: 150 });
  });
});

describe('sizing rules', () => {
  const single = (settings: Partial<TraySettings>) => sizeTray([row('a', 50, 1)], { sparePct: 0, ...settings }, DEFAULT_STANDARDS);

  it('applies side clearance at both rails', () => {
    expect(single({ clearanceFactor: 0.5 }).requiredWidthMm).toBe(50 + 2 * 25);
    expect(single({ clearanceFactor: 1 }).requiredWidthMm).toBe(50 + 2 * 50);
  });

  it('applies spare capacity to the width only', () => {
    const without = sizeTray(T1, { sparePct: 0 }, DEFAULT_STANDARDS);
    const withSpare = sizeTray(T1, { sparePct: 50 }, DEFAULT_STANDARDS);
    expect(withSpare.requiredWidthMm - without.requiredWidthMm).toBeCloseTo(0.5 * 690.7, 9);
    expect(withSpare.requiredHeightMm).toBe(without.requiredHeightMm);
  });

  it('adds top clearance as a percentage of the largest OD', () => {
    expect(single({ topClearancePct: 20 }).requiredHeightMm).toBe(60);
  });

  it('leaves a gap under an upper layer equal to its largest OD when layer gaps are on', () => {
    const rows = [row('big', 50, 1), row('small', 20, 1)];
    const withGap = sizeTray(rows, { layers: 2, layerGap: true }, DEFAULT_STANDARDS);
    expect(withGap.requiredHeightMm).toBe(90);
    expect(withGap.layers[1]!.bottomMm).toBe(70);
    expect(withGap.layerGapsMm).toEqual([20]);

    const touching = sizeTray(rows, { layers: 2, layerGap: false }, DEFAULT_STANDARDS);
    expect(touching.requiredHeightMm).toBe(70);
    expect(touching.layers[1]!.bottomMm).toBe(50);
  });

  it('gives the same size for perforated and ladder trays', () => {
    const perforated = sizeTray(T3, { ...T3_SETTINGS, trayType: 'perforated' }, DEFAULT_STANDARDS);
    const ladder = sizeTray(T3, { ...T3_SETTINGS, trayType: 'ladder' }, DEFAULT_STANDARDS);
    expect({ ...ladder, settings: null }).toEqual({ ...perforated, settings: null });
  });
});

describe('layers', () => {
  it('uses every selected layer when there are enough cables', () => {
    const r = sizeTray([row('a', 30, 5)], { layers: 3 }, DEFAULT_STANDARDS);
    expect(r.layers).toHaveLength(3);
    for (const layer of r.layers) expect(layer.cables.length).toBeGreaterThan(0);
  });

  it('uses fewer layers when there are fewer cables than layers', () => {
    const r = sizeTray([row('a', 30, 2)], { layers: 3 }, DEFAULT_STANDARDS);
    expect(r.layers).toHaveLength(2);
  });

  it('puts the tallest layer at the bottom and stacks the rest above it', () => {
    const r = sizeTray(T3, T3_SETTINGS, DEFAULT_STANDARDS);
    expect(r.layers[0]!.heightMm).toBe(Math.max(...r.layers.map((l) => l.heightMm)));
    expect(r.layers[0]!.bottomMm).toBe(0);
    expect(r.layers[1]!.bottomMm).toBeCloseTo(60.3 + 37.5, 9);
  });

  it('places cables largest first with the spacing gap between neighbours', () => {
    const r = sizeTray(T1, {}, DEFAULT_STANDARDS);
    const layer = r.layers[0]!;
    expect(layer.cables.map((c) => c.xMm)).toEqual([0, 120.6, 241.2].concat(layer.cables.slice(3).map((c) => c.xMm)));
    layer.cables.forEach((cable, i) => {
      const next = layer.cables[i + 1];
      if (next) expect(next.xMm - cable.xMm - cable.odMm).toBeCloseTo(Math.max(cable.odMm, next.odMm), 9);
    });
    const last = layer.cables.at(-1)!;
    expect(last.xMm + last.odMm).toBeCloseTo(layer.widthMm, 9);
  });

  it('keeps track of which row each cable came from', () => {
    const r = sizeTray([row('a', 20, 2), row('b', 20, 3), row('c', 35, 1)], { layers: 2 }, DEFAULT_STANDARDS);
    const counts = new Map<string, number>();
    for (const layer of r.layers) for (const c of layer.cables) counts.set(c.rowId, (counts.get(c.rowId) ?? 0) + 1);
    expect(Object.fromEntries(counts)).toEqual({ a: 2, b: 3, c: 1 });
  });

  it('gives the same result every time for the same input', () => {
    const rows = [row('a', 23.5, 7), row('b', 41.2, 5), row('c', 17.1, 9), row('d', 60.3, 2)];
    const settings: Partial<TraySettings> = { layers: 3, spacing: 1, layerGap: true };
    expect(sizeTray(rows, settings, DEFAULT_STANDARDS)).toEqual(sizeTray(rows, settings, DEFAULT_STANDARDS));
  });
});

describe('outcomes', () => {
  it('returns an empty result when there are no usable cables', () => {
    expect(sizeTray([], {}, DEFAULT_STANDARDS).status).toBe('empty');
    expect(sizeTray([row('a', 0, 3)], {}, DEFAULT_STANDARDS).status).toBe('empty');
  });

  it('reports trays beyond the standard sizes and draws them at the required size', () => {
    const r = sizeTray([row('a', 60, 20)], {}, DEFAULT_STANDARDS);
    expect(r.status).toBe('exceeds-standards');
    expect(r.selected).toBeNull();
    expect(r.drawingSize).toEqual({ widthMm: r.requiredWidthMm, heightMm: r.requiredHeightMm });
  });

  it('reports when no standard size meets the fill limit', () => {
    const r = sizeTray([row('a', 45, 1)], { sparePct: 0, maxFillPct: 10 }, { widthsMm: [100, 150], heightsMm: [50] });
    expect(r.status).toBe('fill-not-met');
    expect(r.selected).toMatchObject({ widthMm: 150, heightMm: 50, passesFill: false });
  });

  it('totals the cable weight per metre', () => {
    const r = sizeTray([row('a', 30, 2, 1000), row('b', 20, 3, 500)], {}, DEFAULT_STANDARDS);
    expect(r.weightKgPerM).toBeCloseTo(3.5, 12);
  });
});
