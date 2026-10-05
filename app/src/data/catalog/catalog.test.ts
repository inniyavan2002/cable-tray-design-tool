import { describe, expect, it } from 'vitest';
import { conductorAreaMm2 } from './checks';
import { loadCatalog, sourceRows } from './index';

const EXPECTED_ROWS: Record<string, number> = {
  alfanar: 307,
  'Bahra Electric': 241,
  'Doha Cables': 510,
  Ducab: 21,
  'Jeddah Cable Company': 34,
  'Oman Cables': 942,
  RAMCRO: 110,
  'Riyadh Cables': 160,
  'Saudi Cable Company': 130,
};

describe('the catalog', () => {
  const catalog = loadCatalog();

  it('holds every row from the original tool, once, with unique ids', () => {
    expect(sourceRows()).toHaveLength(2455);
    expect(catalog.cables).toHaveLength(2455);
    expect(catalog.byId.size).toBe(2455);
    expect(catalog.byLegacyId.size).toBe(2455);
    const perBrand = Object.fromEntries(Object.entries(catalog.summary.byBrand).map(([b, s]) => [b, s.checked + s['needs-review'] + s.excluded]));
    expect(perBrand).toEqual(EXPECTED_ROWS);
  });

  it('builds with the recorded review decisions', () => {
    // Throws if a decision is invalid or would make an impossible value selectable.
    expect(catalog.cables.filter((c) => c.review).length).toBeGreaterThan(0);
  });

  it('never offers a cable with an impossible OD', () => {
    for (const c of catalog.cables.filter((x) => x.status !== 'excluded')) {
      const area = conductorAreaMm2(c);
      if (area === null) continue;
      const ratio = c.odMm / Math.sqrt((4 * area) / Math.PI);
      expect(ratio, c.id).toBeGreaterThanOrEqual(1);
      expect(ratio, c.id).toBeLessThanOrEqual(12);
    }
  });

  it('gives every excluded row an error and every row needing review a warning', () => {
    for (const c of catalog.cables) {
      const severities = new Set(c.flags.map((f) => f.severity));
      if (c.status === 'excluded') expect(severities.has('error'), c.id).toBe(true);
      if (c.status === 'needs-review') expect(severities.has('warning') && !severities.has('error'), c.id).toBe(true);
      if (c.status === 'checked') expect(severities.has('warning') || severities.has('error'), c.id).toBe(false);
    }
  });

  it('excludes the known lost-decimal ODs unless a reviewer corrected them', () => {
    const originals = new Map(sourceRows().map((row) => [row.id, row.od]));
    const lostDecimal = catalog.cables.filter((c) => originals.get(c.legacyId)! > 150);
    expect(lostDecimal.map((c) => c.legacyId)).toContain('mdb_v13_2057');
    for (const c of lostDecimal) {
      const corrected = c.review?.action === 'correct' && c.odMm !== originals.get(c.legacyId);
      expect(c.status === 'excluded' || corrected, c.id).toBe(true);
    }
  });

  it('keeps the cables used by the reference trays selectable with their catalogue ODs', () => {
    const find = (brandId: string, sizeMm2: number, odMm: number) =>
      catalog.cables.find((c) => c.brandId === brandId && c.cores === 4 && c.sizeMm2 === sizeMm2 && c.odMm === odMm && c.armour === 'SWA');
    for (const [brandId, size, od] of [
      ['doha', 240, 60.3],
      ['doha', 95, 41.2],
      ['doha', 70, 37.5],
      ['doha', 35, 28.9],
      ['oman', 16, 23.5],
    ] as const) {
      expect(find(brandId, size, od)?.status, `${brandId} ${size}`).toBe('checked');
    }
    // Oman lists 1,000 kg/km for its 1.5–6 mm² sizes: a drum length, so the weight is hidden but the OD is kept.
    const oman6 = find('oman', 6, 20)!;
    expect(oman6.status).toBe('needs-review');
    expect(oman6.weightKgPerKm).toBeNull();
    expect(oman6.flags.map((f) => f.code)).toContain('weight-implausible');
  });

  it('marks every text-recognition row from Riyadh for review or excludes it', () => {
    const riyadh = catalog.cables.filter((c) => c.brandId === 'riyadh');
    expect(riyadh.every((c) => c.status !== 'checked')).toBe(true);
  });

  it('builds quickly', () => {
    const start = performance.now();
    loadCatalog();
    expect(performance.now() - start).toBeLessThan(5);
  });
});
