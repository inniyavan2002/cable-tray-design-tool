import { describe, expect, it } from 'vitest';
import { int, num1, percent, plain, roundHalfUp, size } from './format';

describe('number formatting', () => {
  it('rounds halves up whatever floating-point noise a value carries', () => {
    expect(num1(30.15)).toBe('30.2');
    expect(num1(0.5 * 60.3)).toBe('30.2');
    expect(num1(900 - (900 - 0.5 * 60.3))).toBe('30.2');
    expect(num1(-30.15)).toBe('-30.2');
    expect(roundHalfUp(2.675, 2)).toBe(2.68);
  });

  it('never prints negative zero', () => {
    expect(num1(-0.01)).toBe('0.0');
  });

  it('formats thousands, percentages, plain values and sizes', () => {
    expect(num1(1241.34)).toBe('1,241.3');
    expect(int(12335.4)).toBe('12,335');
    expect(percent(0.3430)).toBe('34.3%');
    expect(plain(0.5)).toBe('0.5');
    expect(plain(20)).toBe('20');
    expect(size(300, 75)).toBe('300 × 75');
  });
});
