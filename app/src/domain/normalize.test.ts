import { describe, expect, it } from 'vitest';
import { DEFAULT_TRAY_SETTINGS, normalizeRows, normalizeSettings } from './normalize';
import type { TraySettings } from './types';

describe('normalizeSettings', () => {
  it('fills in defaults for missing settings', () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_TRAY_SETTINGS);
  });

  it('keeps valid settings', () => {
    const settings: TraySettings = {
      layers: 3,
      spacing: 0.5,
      layerGap: false,
      clearanceFactor: 1,
      topClearancePct: 15,
      sparePct: 0,
      maxFillPct: 50,
      trayType: 'ladder',
      fillMethod: 'standard-area',
    };
    expect(normalizeSettings(settings)).toEqual(settings);
  });

  it('replaces invalid values with defaults', () => {
    const bad = {
      layers: 4,
      spacing: 3,
      clearanceFactor: -1,
      topClearancePct: Number.NaN,
      sparePct: -5,
      maxFillPct: 0,
    } as unknown as Partial<TraySettings>;
    const s = normalizeSettings(bad);
    expect(s.layers).toBe(1);
    expect(s.spacing).toBe(1);
    expect(s.clearanceFactor).toBe(0.5);
    expect(s.topClearancePct).toBe(0);
    expect(s.sparePct).toBe(20);
    expect(s.maxFillPct).toBe(40);
  });

  it('caps the maximum fill at 100%', () => {
    expect(normalizeSettings({ maxFillPct: 150 }).maxFillPct).toBe(100);
  });
});

describe('normalizeRows', () => {
  it('drops rows without a usable OD or quantity and rounds quantities down', () => {
    const rows = normalizeRows([
      { id: 'a', odMm: 20, weightKgPerKm: 300, quantity: 2.7 },
      { id: 'b', odMm: 0, weightKgPerKm: 300, quantity: 1 },
      { id: 'c', odMm: 20, weightKgPerKm: 300, quantity: 0 },
      { id: 'd', odMm: Number.NaN, weightKgPerKm: 300, quantity: 1 },
      { id: 'e', odMm: 15, weightKgPerKm: -1, quantity: 1 },
    ]);
    expect(rows).toEqual([
      { id: 'a', odMm: 20, weightKgPerKm: 300, quantity: 2 },
      { id: 'e', odMm: 15, weightKgPerKm: 0, quantity: 1 },
    ]);
  });
});
