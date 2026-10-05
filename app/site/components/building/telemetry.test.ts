import { describe, expect, it } from 'vitest';
import { countUp, decode, typeOn } from './telemetry';

describe('label feed', () => {
  it('types a title on behind a cursor and ends on the title', () => {
    expect(typeOn('TR-02', 0)).toBe('▍');
    expect(typeOn('TR-02', 0.6)).toBe('TR-▍');
    expect(typeOn('TR-02', 1)).toBe('TR-02');
  });

  it('counts numbers up in their own format and ends on the exact text', () => {
    expect(countUp('Small power, 300 × 75', 0)).toBe('Small power, 0 × 0');
    expect(countUp('14.9 kg/m', 0.5)).toMatch(/^1[23]\.\d kg\/m$/);
    expect(countUp('2,455 rows', 0.999)).toMatch(/^2,45\d rows$/);
    expect(countUp('34.3% of 40%', 1)).toBe('34.3% of 40%');
  });

  it('decodes a text left to right, keeping spaces and symbols, and ends on the text', () => {
    const half = decode('MDB → TR-01', 0.5);
    expect(half.startsWith('MDB →')).toBe(true);
    expect(half).toHaveLength('MDB → TR-01'.length);
    expect(half[5]).toBe(' ');
    expect(decode('MDB → TR-01', 1)).toBe('MDB → TR-01');
  });
});
