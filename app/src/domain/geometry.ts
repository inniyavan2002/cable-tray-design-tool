/**
 * Width of one layer with its cables placed largest to smallest. Each gap is
 * spacing × the larger neighbour, which in that order is the earlier cable, so
 * the gaps add up to spacing × (ΣOD − smallest OD).
 */
export function layerWidthMm(sumOdMm: number, smallestOdMm: number, spacing: number): number {
  return sumOdMm + spacing * (sumOdMm - smallestOdMm);
}

/**
 * Required tray height for a set of layer heights (largest OD per layer).
 * The tallest layer sits on the tray floor; with layer gaps on, every layer
 * above it gets a gap equal to its own height underneath it.
 */
export function requiredHeightMm(layerHeightsMm: readonly number[], layerGap: boolean, topClearanceMm: number): number {
  const total = layerHeightsMm.reduce((sum, h) => sum + h, 0);
  const gaps = layerGap && layerHeightsMm.length > 1 ? total - Math.max(...layerHeightsMm) : 0;
  return total + gaps + topClearanceMm;
}

export function cableAreaMm2(odMm: number): number {
  return (Math.PI / 4) * odMm * odMm;
}
