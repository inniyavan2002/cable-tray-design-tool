import { describe, expect, it } from 'vitest';
import { DEFAULT_STANDARDS } from '../domain/normalize';
import { sizeTray } from '../domain/sizing';
import type { CableRow, SizingResult } from '../domain/types';
import { sectionDrawing, type DrawingShape } from './sectionGeometry';

const row = (id: string, odMm: number, quantity: number): CableRow => ({ id, odMm, quantity, weightKgPerKm: 0 });
const T1 = sizeTray([row('a', 60.3, 2), row('b', 41.2, 3), row('c', 28.9, 4)], {}, DEFAULT_STANDARDS);
const T3 = sizeTray([row('a', 60.3, 2), row('b', 37.5, 4), row('c', 28.9, 6)], { layers: 2, spacing: 0.5, layerGap: true }, DEFAULT_STANDARDS);
const style = (rowId: string) => ({ tag: { a: 1, b: 2, c: 3 }[rowId] ?? 0, colourIndex: { a: 0, b: 1, c: 2 }[rowId] ?? 0 });
const all = { dimensions: true, zones: true };

const of = <K extends DrawingShape['kind']>(shapes: DrawingShape[], kind: K) =>
  shapes.filter((s): s is Extract<DrawingShape, { kind: K }> => s.kind === kind);

describe('sectionDrawing', () => {
  it('draws nothing for an empty tray', () => {
    expect(sectionDrawing(sizeTray([], {}, DEFAULT_STANDARDS), style, all)).toBeNull();
  });

  it('draws the selected tray to scale with every cable inside the rails', () => {
    const d = sectionDrawing(T1, style, all)!;
    expect(d.trayWidthMm).toBe(900);
    expect(d.trayHeightMm).toBe(75);
    const cables = of(d.shapes, 'cable');
    expect(cables).toHaveLength(9);
    const Wd = 900 * d.scale;
    const Hd = 75 * d.scale;
    for (const c of cables) {
      expect(c.cx - c.r).toBeGreaterThanOrEqual(-1e-9);
      expect(c.cx + c.r).toBeLessThanOrEqual(Wd + 1e-9);
      expect(c.cy + c.r).toBeCloseTo(Hd, 9); // one layer: every cable sits on the floor
    }
    // First cable starts after the side clearance.
    const first = cables[0]!;
    expect(first.cx - first.r).toBeCloseTo(30.15 * d.scale, 9);
    expect(first.r).toBeCloseTo(30.15 * d.scale, 9);
    expect(cables.map((c) => c.tag)).toEqual([1, 1, 2, 2, 2, 3, 3, 3, 3]);
  });

  it('shows clearance at both rails, the spare zone and the unused width, adding up to the tray width', () => {
    const d = sectionDrawing(T1, style, all)!;
    const zones = of(d.shapes, 'zone');
    expect(zones.filter((z) => z.role === 'clearance')).toHaveLength(2);
    expect(zones.filter((z) => z.role === 'spare')).toHaveLength(1);
    const { clearancePerSide, spare, unused } = d.zonesMm;
    expect(2 * clearancePerSide + T1.widestLayerMm + spare + unused).toBeCloseTo(900, 9);
    expect(unused).toBeCloseTo(900 - 889.14, 9);
    const labels = of(d.shapes, 'text').map((t) => t.text);
    expect(labels).toEqual(expect.arrayContaining(['cables 690.7', 'spare 138.1', '10.9', '900 standard width', '75', '60.3']));
  });

  it('puts upper-layer cables above the lower layer and labels the layers', () => {
    const d = sectionDrawing(T3, style, all)!;
    const cables = of(d.shapes, 'cable');
    const bottomOfUpper = Math.max(...cables.filter((c) => c.r < (60 * d.scale) / 2 && c.cy < 100 * d.scale).map((c) => c.cy + c.r));
    const topOfLower = Math.min(...cables.filter((c) => c.cy > 100 * d.scale).map((c) => c.cy - c.r));
    expect(bottomOfUpper).toBeLessThanOrEqual(topOfLower + 1e-9);
    expect(of(d.shapes, 'text').filter((t) => t.role === 'layer').map((t) => t.text)).toEqual(['L1', 'L2']);
  });

  it('never overlaps two dimension labels in the same row', () => {
    for (const result of [T1, T3]) {
      const texts = of(sectionDrawing(result, style, all)!.shapes, 'text').filter((t) => t.role === 'dimension' && t.y < 0);
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          const a = texts[i]!;
          const b = texts[j]!;
          if (a.y !== b.y) continue;
          const half = (t: typeof a) => (t.text.length * 13 * 0.6 + 6) / 2;
          expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(half(a) + half(b));
        }
      }
    }
  });

  it('draws a tray beyond the standard sizes at its required size', () => {
    const big: SizingResult = sizeTray([row('a', 60, 20)], {}, DEFAULT_STANDARDS);
    const d = sectionDrawing(big, style, all)!;
    expect(d.standardSize).toBe(false);
    expect(d.trayWidthMm).toBeCloseTo(big.requiredWidthMm, 9);
    expect(d.zonesMm.unused).toBeCloseTo(0, 9);
    expect(of(d.shapes, 'text').some((t) => t.text.endsWith('required width'))).toBe(true);
  });

  it('leaves out zones and dimensions when they are switched off', () => {
    const d = sectionDrawing(T1, style, { dimensions: false, zones: false })!;
    expect(of(d.shapes, 'zone')).toEqual([]);
    expect(of(d.shapes, 'text').filter((t) => t.role === 'dimension')).toEqual([]);
    expect(of(d.shapes, 'cable')).toHaveLength(9);
  });
});
