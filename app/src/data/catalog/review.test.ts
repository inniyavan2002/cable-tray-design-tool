import { describe, expect, it } from 'vitest';
import { normalizeRow } from './normalize';
import { applyReview, CatalogReviewError, type ReviewDecision } from './review';
import type { LegacyCatalogRow } from './types';

const base: LegacyCatalogRow = {
  brand: 'Jeddah Cable Company',
  category: 'LV Power Cable',
  standard: 'IEC 60502-1',
  voltage: '0.6/1kV',
  conductor: 'Copper',
  insulation: 'XLPE',
  armour: 'Unarmoured',
  coreConfig: '1 Core',
  size: '6',
  unit: 'sq.mm',
  phaseSize: '6',
  neutralSize: '',
  form: 're',
  wires: '',
  insulationThickness: '0.7',
  sheathThickness: '1.4',
  od: 713,
  weight: 100,
  code: '',
  drum: '',
  sourcePage: 20,
  raw: '6 0.7 14 713 100',
  id: 'mdb_1',
};
const good: LegacyCatalogRow = { ...base, id: 'mdb_2', size: '10', od: 8.3, weight: 150, sourcePage: 21 };
const rows = [normalizeRow(base), normalizeRow(good)];

const decision = (d: Partial<ReviewDecision> & Pick<ReviewDecision, 'id' | 'action'>): ReviewDecision => ({
  note: 'Checked against the PDF',
  by: 'A. Engineer',
  date: '2026-10-01',
  ...d,
});

describe('applyReview', () => {
  it('leaves rows without a decision to the automatic checks', () => {
    const [bad, ok] = applyReview(rows, []);
    expect(bad!.status).toBe('excluded');
    expect(ok!.status).toBe('checked');
    expect(bad!.review).toBeNull();
  });

  it('applies a correction and checks the corrected values', () => {
    const [fixed] = applyReview(rows, [decision({ id: 'jeddah-1', action: 'correct', set: { odMm: 7.1 } })]);
    expect(fixed!.odMm).toBe(7.1);
    expect(fixed!.status).toBe('checked');
    expect(fixed!.review).toMatchObject({ action: 'correct', by: 'A. Engineer' });
  });

  it('keeps accepted warnings visible as information', () => {
    const [, ok] = applyReview(
      [rows[0]!, { ...rows[1]!, sizeMm2: 46 }],
      [decision({ id: 'jeddah-2', action: 'accept', note: 'Size confirmed in the PDF' })],
    );
    expect(ok!.status).toBe('checked');
    expect(ok!.flags.map((f) => `${f.severity}:${f.code}`)).toContain('info:size-nonstandard');
  });

  it('excludes a row on request', () => {
    const [, ok] = applyReview(rows, [decision({ id: 'jeddah-2', action: 'exclude', note: 'Discontinued product' })]);
    expect(ok!.status).toBe('excluded');
    expect(ok!.flags.at(-1)).toMatchObject({ code: 'excluded-by-review', severity: 'error' });
  });

  it('refuses to accept a row whose value is impossible', () => {
    expect(() => applyReview(rows, [decision({ id: 'jeddah-1', action: 'accept' })])).toThrow(CatalogReviewError);
  });

  it('refuses a correction that is still impossible', () => {
    expect(() => applyReview(rows, [decision({ id: 'jeddah-1', action: 'correct', set: { odMm: 71.3 } })])).toThrow(
      /leaves an impossible value/,
    );
  });

  it.each([
    ['an unknown row', decision({ id: 'nope-1', action: 'accept' }), /no catalog row/],
    ['a missing note', decision({ id: 'jeddah-2', action: 'accept', note: ' ' }), /note and a reviewer/],
    ['a bad date', decision({ id: 'jeddah-2', action: 'accept', date: '01/10/2026' }), /YYYY-MM-DD/],
    ['an empty correction', decision({ id: 'jeddah-2', action: 'correct', set: {} }), /at least one corrected value/],
    ['a field that cannot be corrected', decision({ id: 'jeddah-2', action: 'correct', set: { brand: 'X' } as never }), /cannot be corrected: brand/],
    ['values on an accept', decision({ id: 'jeddah-2', action: 'accept', set: { odMm: 9 } }), /only allowed with action "correct"/],
  ])('rejects %s', (_, bad, message) => {
    expect(() => applyReview(rows, [bad])).toThrow(message);
  });

  it('rejects two decisions for one row', () => {
    const d = decision({ id: 'jeddah-2', action: 'accept' });
    expect(() => applyReview(rows, [d, d])).toThrow(/more than one decision/);
  });
});
