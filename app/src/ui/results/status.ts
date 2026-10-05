import { size } from '../../domain/format';
import type { SizingResult, SizingStatus } from '../../domain/types';
import type { Tone } from '../common/controls';

export const STATUS_TEXT: Record<SizingStatus, { long: string; short: string; tone: Tone }> = {
  empty: { long: 'NO CABLES', short: 'EMPTY', tone: 'neutral' },
  pass: { long: 'PASS', short: 'PASS', tone: 'pass' },
  'pass-upsized': { long: 'PASS · UPSIZED FOR FILL', short: 'PASS ↑', tone: 'pass' },
  'fill-not-met': { long: 'FILL LIMIT NOT MET', short: 'FILL', tone: 'warn' },
  'exceeds-standards': { long: 'EXCEEDS STANDARD SIZES', short: 'EXCEEDS', tone: 'warn' },
};

/** "300 × 75 mm", or a short phrase when there is no tray size. */
export function traySizeText(result: SizingResult): string {
  if (result.selected) return `${size(result.selected.widthMm, result.selected.heightMm)} mm`;
  return result.status === 'empty' ? 'No cables' : 'Beyond standard sizes';
}
