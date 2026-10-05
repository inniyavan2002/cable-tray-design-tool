import { describe, expect, it } from 'vitest';
import { fillMethod } from './fillMethods';
import { cleanSizeList, selectStandardTray } from './selection';

const standard = fillMethod('standard-area');
const sizes = { widthsMm: [50, 75, 100, 150, 200, 300, 450, 600, 750, 900, 1000], heightsMm: [25, 50, 75, 100, 150, 200] };

describe('selectStandardTray', () => {
  it('keeps the first size that fits when it meets the fill limit', () => {
    const s = selectStandardTray({ widthMm: 889.14, heightMm: 60.3 }, 12335, 40, sizes, standard);
    expect(s.outcome).toBe('pass');
    expect(s.firstFit).toEqual({ widthMm: 900, heightMm: 75 });
    expect(s.selected).toMatchObject({ widthMm: 900, heightMm: 75 });
    expect(s.tried).toHaveLength(1);
  });

  it('moves to the smallest passing cross-section, the narrower one on a tie (T2)', () => {
    const s = selectStandardTray({ widthMm: 288.7, heightMm: 47 }, 7718.2, 40, sizes, standard);
    expect(s.outcome).toBe('pass-upsized');
    expect(s.firstFit).toEqual({ widthMm: 300, heightMm: 50 });
    expect(s.selected).toMatchObject({ widthMm: 300, heightMm: 75 });
    expect(s.tried.map((c) => [c.widthMm, c.heightMm, c.passesFill])).toEqual([
      [300, 50, false],
      [300, 75, true],
      [450, 50, true],
    ]);
  });

  it('prefers the narrower of two equal-area sizes', () => {
    const s = selectStandardTray(
      { widthMm: 100, heightMm: 50 },
      8000,
      40,
      { widthsMm: [150, 300], heightsMm: [75, 150] },
      standard,
    );
    expect(s.selected).toMatchObject({ widthMm: 150, heightMm: 150 });
  });

  it('returns the largest fitting size when none meets the fill limit', () => {
    const s = selectStandardTray({ widthMm: 90, heightMm: 45 }, 1590, 10, { widthsMm: [100, 150], heightsMm: [50] }, standard);
    expect(s.outcome).toBe('fill-not-met');
    expect(s.selected).toMatchObject({ widthMm: 150, heightMm: 50, passesFill: false });
    expect(s.tried.map((c) => c.widthMm)).toEqual([100, 150]);
  });

  it('reports when the requirement is beyond the standard sizes', () => {
    const wide = selectStandardTray({ widthMm: 1200, heightMm: 50 }, 5000, 40, sizes, standard);
    const tall = selectStandardTray({ widthMm: 300, heightMm: 210 }, 5000, 40, sizes, standard);
    for (const s of [wide, tall]) {
      expect(s.outcome).toBe('exceeds-standards');
      expect(s.selected).toBeNull();
      expect(s.firstFit).toBeNull();
    }
  });

  it('treats a requirement equal to a standard size as fitting despite rounding', () => {
    const s = selectStandardTray({ widthMm: 300 + 1e-9, heightMm: 75 }, 1000, 40, sizes, standard);
    expect(s.firstFit).toEqual({ widthMm: 300, heightMm: 75 });
  });

  it('accepts a fill exactly at the limit', () => {
    const s = selectStandardTray({ widthMm: 100, heightMm: 50 }, 0.4 * 100 * 50, 40, sizes, standard);
    expect(s.outcome).toBe('pass');
  });
});

describe('cleanSizeList', () => {
  it('sorts, removes duplicates and drops values that are not positive numbers', () => {
    expect(cleanSizeList([300, 100, Number.NaN, -50, 0, 100, 150, Infinity])).toEqual([100, 150, 300]);
  });
});
