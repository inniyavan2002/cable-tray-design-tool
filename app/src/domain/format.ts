const oneDecimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const upToTwo = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** Adding 0 turns -0 into 0, so rounding never prints "-0.0". */
const noNegativeZero = (value: number) => value + 0;

/**
 * Rounds half away from zero to `decimals` places, ignoring floating-point
 * noise: 30.15 becomes 30.2 whether it was computed as 30.1499999… or
 * 30.1500…1, so the same length never prints two ways.
 */
export function roundHalfUp(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const scaled = value * factor;
  return Math.round(Math.abs(scaled) + 1e-7) * Math.sign(scaled) / factor;
}

/** Millimetres to one decimal place, without the unit: "1,241.3". */
export function num1(value: number): string {
  return oneDecimal.format(noNegativeZero(roundHalfUp(value, 1)));
}

export function mm(value: number): string {
  return `${num1(value)} mm`;
}

/** Whole number with thousands separators: "12,335". */
export function int(value: number): string {
  return whole.format(noNegativeZero(value));
}

/** A fraction as a percentage to one decimal place: 0.343 → "34.3%". */
export function percent(fraction: number): string {
  return `${num1(fraction * 100)}%`;
}

/** A user-entered percentage or factor, without trailing zeros: 20 → "20", 0.5 → "0.5". */
export function plain(value: number): string {
  return upToTwo.format(noNegativeZero(value));
}

/** Standard tray size: "300 × 75". */
export function size(widthMm: number, heightMm: number): string {
  return `${plain(widthMm)} × ${plain(heightMm)}`;
}
