import { describe, expect, it } from 'vitest';
import { runChecks, statusFromFlags } from './checks';
import type { CatalogCable } from './types';

let next = 1;
function cable(overrides: Partial<CatalogCable> = {}): CatalogCable {
  const id = next++;
  return {
    id: `test-${id}`,
    legacyId: `mdb_${id}`,
    brandId: 'doha',
    brand: 'Doha Cables',
    category: 'LV power',
    standard: 'IEC 60502-1',
    voltage: '0.6/1 kV',
    conductor: 'Cu',
    insulation: 'XLPE',
    armour: 'SWA',
    screen: null,
    cores: 4,
    reducedNeutral: false,
    sizeMm2: 240,
    neutralSizeMm2: null,
    conductorShape: 'sm',
    odMm: 60.3,
    weightKgPerKm: 11780,
    code: `CODE-${id}`,
    variant: `CODE-${id}`,
    details: {},
    source: { file: 'Doha Cables.pdf', page: 89, raw: '' },
    status: 'checked',
    flags: [],
    review: null,
    ...overrides,
  };
}

const codes = (c: CatalogCable) => c.flags.map((f) => `${f.severity}:${f.code}`);

describe('OD checks', () => {
  it('passes a normal cable', () => {
    const [c] = runChecks([cable()]);
    expect(c!.flags).toEqual([]);
    expect(c!.status).toBe('checked');
  });

  it('excludes an OD that lost its decimal point', () => {
    const [c] = runChecks([cable({ cores: 1, sizeMm2: 6, odMm: 713, weightKgPerKm: 100 })]);
    expect(codes(c!)).toContain('error:od-impossible');
    expect(c!.status).toBe('excluded');
  });

  it('excludes an OD smaller than the conductors inside it', () => {
    const [c] = runChecks([cable({ sizeMm2: 70, odMm: 7, weightKgPerKm: null })]);
    expect(codes(c!)).toEqual(['error:od-impossible']);
  });

  it('flags an unusual but possible OD for review', () => {
    const [c] = runChecks([cable({ sizeMm2: 16, odMm: 10, weightKgPerKm: null })]);
    expect(codes(c!)).toEqual(['warning:od-unusual']);
    expect(c!.flags[0]!.message).toMatch(/typically \d+\.\d–\d+\.\d mm/);
    expect(c!.status).toBe('needs-review');
  });

  it('cannot check the OD when the core count is unknown', () => {
    const [c] = runChecks([cable({ cores: null, sizeMm2: 10, odMm: 14.2, weightKgPerKm: 270 })]);
    expect(codes(c!)).toEqual(['warning:cores-unknown']);
  });

  it('flags an OD that shrinks as the size grows within one product range', () => {
    const rows = runChecks([cable({ sizeMm2: 150, odMm: 43.9, weightKgPerKm: null }), cable({ sizeMm2: 185, odMm: 40.6, weightKgPerKm: null })]);
    expect(rows.map(codes)).toEqual([['warning:od-order'], ['warning:od-order']]);
  });

  it('does not compare sizes across different product ranges', () => {
    const rows = runChecks([
      cable({ sizeMm2: 150, odMm: 50, source: { file: 'x', page: 10, raw: '' } }),
      cable({ sizeMm2: 185, odMm: 45, source: { file: 'x', page: 11, raw: '' } }),
    ]);
    expect(rows.flatMap((c) => c.flags)).toEqual([]);
  });
});

describe('other checks', () => {
  it('hides a weight lighter than the conductors and marks the row for review', () => {
    const [c] = runChecks([cable({ odMm: 61, weightKgPerKm: 1000 })]);
    expect(codes(c!)).toEqual(['warning:weight-implausible']);
    expect(c!.weightKgPerKm).toBeNull();
  });

  it('suspects an aluminium conductor labelled copper when the weight fits aluminium, and keeps the weight', () => {
    const [c] = runChecks([cable({ cores: 3, sizeMm2: 70, odMm: 31.1, weightKgPerKm: 1410 })]);
    expect(codes(c!)).toEqual(['warning:conductor-suspect']);
    expect(c!.flags[0]!.message).toMatch(/may be aluminium/);
    expect(c!.weightKgPerKm).toBe(1410);
  });

  it('hides a weight that equals the drum length', () => {
    const [c] = runChecks([cable({ sizeMm2: 1.5, odMm: 15, weightKgPerKm: 1000, details: { 'Drum / package (m)': '1000' } })]);
    expect(codes(c!)).toContain('warning:weight-implausible');
  });

  it('hides a weight repeated across three or more sizes of one product range', () => {
    const rows = runChecks([
      cable({ sizeMm2: 1.5, odMm: 15, weightKgPerKm: 1000, code: null, variant: 'page 49' }),
      cable({ sizeMm2: 2.5, odMm: 16, weightKgPerKm: 1000, code: null, variant: 'page 49' }),
      cable({ sizeMm2: 4, odMm: 18, weightKgPerKm: 1000, code: null, variant: 'page 49' }),
      cable({ sizeMm2: 16, odMm: 23.5, weightKgPerKm: 1245, code: null, variant: 'page 49' }),
    ]);
    expect(rows.map((c) => c.weightKgPerKm)).toEqual([null, null, null, 1245]);
    expect(rows.map((c) => c.status)).toEqual(['needs-review', 'needs-review', 'needs-review', 'checked']);
    expect(rows[0]!.flags[0]!.message).toMatch(/listed for 3 different sizes/);
  });

  it('flags non-standard sizes and missing conductor material', () => {
    const [c] = runChecks([cable({ sizeMm2: 46, conductor: null, odMm: 30, weightKgPerKm: null })]);
    expect(codes(c!)).toEqual(['warning:size-nonstandard', 'warning:conductor-missing']);
  });

  it('notes look-alike rows that the product code tells apart', () => {
    const rows = runChecks([cable({ odMm: 60.3 }), cable({ odMm: 61.5 })]);
    expect(rows.map(codes)).toEqual([['info:lookalike'], ['info:lookalike']]);
    expect(rows.map((c) => c.status)).toEqual(['checked', 'checked']);
  });

  it('flags look-alike rows that nothing tells apart, and labels each one', () => {
    const noCode = { code: null, variant: 'no code or page', source: { file: 'x', page: null, raw: '' } };
    const rows = runChecks([cable({ ...noCode, odMm: 60.3 }), cable({ ...noCode, odMm: 61.5 })]);
    expect(rows.map(codes)).toEqual([['warning:lookalike-unresolved'], ['warning:lookalike-unresolved']]);
    expect(new Set(rows.map((c) => c.variant)).size).toBe(2);
  });

  it('gives the same result when run twice', () => {
    const once = runChecks([cable({ code: null, variant: 'x', source: { file: 'x', page: null, raw: '' } }), cable({ code: null, source: { file: 'x', page: null, raw: '' }, odMm: 62 })]);
    expect(runChecks(once)).toEqual(once);
  });
});

describe('statusFromFlags', () => {
  it('ranks errors over warnings over information', () => {
    expect(statusFromFlags([])).toBe('checked');
    expect(statusFromFlags([{ code: 'lookalike', severity: 'info', message: '' }])).toBe('checked');
    expect(statusFromFlags([{ code: 'od-unusual', severity: 'warning', message: '' }])).toBe('needs-review');
    expect(
      statusFromFlags([
        { code: 'od-unusual', severity: 'warning', message: '' },
        { code: 'od-impossible', severity: 'error', message: '' },
      ]),
    ).toBe('excluded');
  });
});
