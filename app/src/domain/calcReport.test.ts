import { describe, expect, it } from 'vitest';
import { buildCalcReport } from './calcReport';
import { DEFAULT_STANDARDS } from './normalize';
import { sizeTray } from './sizing';
import type { CableRow } from './types';

const row = (id: string, odMm: number, quantity: number): CableRow => ({ id, odMm, quantity, weightKgPerKm: 0 });
const T1 = [row('240', 60.3, 2), row('95', 41.2, 3), row('35', 28.9, 4)];
const T2 = [row('16', 23.5, 12), row('6', 20.0, 8)];
const T3 = [row('240', 60.3, 2), row('70', 37.5, 4), row('35', 28.9, 6)];

describe('buildCalcReport', () => {
  it('shows the T1 working as in the frontend plan', () => {
    const report = buildCalcReport(sizeTray(T1, {}, DEFAULT_STANDARDS));
    expect(report.width).toEqual([
      { label: 'Layer 1 cable ODs', value: '2×60.3 + 3×41.2 + 4×28.9 = 359.8 mm' },
      { label: 'Layer 1 gaps (1d)', value: '330.9 mm → layer width 690.7 mm' },
      { label: 'Spare capacity (20%)', value: '20% × 690.7 = 138.1 mm' },
      { label: 'Side clearance, both sides', value: '2 × (0.5 × 60.3) = 60.3 mm' },
      { label: 'Required width', value: '690.7 + 138.1 + 60.3 = 889.1 mm', emphasis: 'total' },
    ]);
    expect(report.height).toEqual([
      { label: 'Layer 1 height', value: 'largest OD 60.3 mm' },
      { label: 'Top clearance (0% of 60.3)', value: '0.0 mm' },
      { label: 'Required height', value: '60.3 layer + 0.0 top = 60.3 mm', emphasis: 'total' },
    ]);
    expect(report.selection).toEqual([
      { label: 'Cable cross-section area', value: 'Σ π/4 × OD² = 12,335 mm²' },
      { label: 'Smallest standard size that fits', value: '900 × 75 mm' },
      { label: 'Fill at 900 × 75', value: '12,335 ÷ 67,500 = 18.3% ≤ 40%, passes' },
      { label: 'Selected tray', value: '900 × 75 mm', emphasis: 'total' },
    ]);
  });

  it('shows why T2 was upsized for fill', () => {
    const report = buildCalcReport(sizeTray(T2, { layers: 2, spacing: 0, layerGap: false }, DEFAULT_STANDARDS));
    expect(report.selection).toEqual([
      { label: 'Cable cross-section area', value: 'Σ π/4 × OD² = 7,718 mm²' },
      { label: 'Smallest standard size that fits', value: '300 × 50 mm' },
      { label: 'Fill at 300 × 50', value: '7,718 ÷ 15,000 = 51.5% > 40%, fails' },
      { label: 'Fill at 300 × 75', value: '7,718 ÷ 22,500 = 34.3% ≤ 40%, passes' },
      { label: 'Fill at 450 × 50', value: '7,718 ÷ 22,500 = 34.3% ≤ 40%, passes (wider, not chosen)' },
      { label: 'Selected tray', value: '300 × 75 mm · upsized for fill', emphasis: 'total' },
    ]);
    expect(report.height).toContainEqual({ label: 'Gap between layers', value: 'none, layers touch' });
  });

  it('lists each layer and the gap under the upper layer for T3', () => {
    const report = buildCalcReport(sizeTray(T3, { layers: 2, spacing: 0.5, layerGap: true }, DEFAULT_STANDARDS));
    expect(report.height).toEqual([
      { label: 'Layer 1 height', value: 'largest OD 60.3 mm' },
      { label: 'Layer 2 height', value: 'largest OD 37.5 mm' },
      { label: 'Gap under layer 2', value: 'largest OD in layer 2 = 37.5 mm' },
      { label: 'Top clearance (0% of 60.3)', value: '0.0 mm' },
      { label: 'Required height', value: '97.8 layers + 37.5 gaps + 0.0 top = 135.3 mm', emphasis: 'total' },
    ]);
    expect(report.width).toContainEqual({ label: 'Widest layer', value: 'Layer 1: 322.3 mm' });
  });

  it('is empty when there are no cables', () => {
    expect(buildCalcReport(sizeTray([], {}, DEFAULT_STANDARDS))).toEqual({ width: [], height: [], selection: [] });
  });

  it('says when the tray is beyond the standard sizes', () => {
    const report = buildCalcReport(sizeTray([row('a', 60, 20)], {}, DEFAULT_STANDARDS));
    expect(report.selection.at(-1)).toEqual({
      label: 'Selected tray',
      value: 'None: exceeds the standard sizes',
      emphasis: 'total',
    });
  });

  it('says when no standard size meets the fill limit', () => {
    const r = sizeTray([row('a', 45, 1)], { sparePct: 0, maxFillPct: 10 }, { widthsMm: [100, 150], heightsMm: [50] });
    const report = buildCalcReport(r);
    expect(report.selection).toContainEqual({
      label: 'Fill limit',
      value: 'no standard size meets 10%; showing the largest that fits',
    });
    expect(report.selection.at(-1)).toMatchObject({ value: '150 × 50 mm · fill limit not met' });
  });

  it('summarises a long run of sizes that fail the fill limit', () => {
    const standards = { widthsMm: [100, 150, 200, 250, 300, 350, 400, 450, 500, 600], heightsMm: [50, 75, 100, 150] };
    const r = sizeTray([row('a', 30, 1)], { sparePct: 0, maxFillPct: 2 }, standards);
    const report = buildCalcReport(r);
    expect(r.tried.length).toBeGreaterThan(8);
    const ellipsis = report.selection.find((x) => x.label === '…');
    expect(ellipsis?.value).toMatch(/^\d+ more sizes over the 2% limit$/);
    expect(report.selection.at(-1)?.emphasis).toBe('total');
  });
});
