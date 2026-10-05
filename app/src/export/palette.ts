/**
 * Print colours for exported drawings and reports. Exports always use the
 * light theme, whatever theme the screen shows, so printouts look the same.
 * They match the light values in src/styles/tokens.css.
 */
export const PRINT = {
  ink: '#1b2a38',
  ink2: '#4b5b68',
  ink3: '#6b7882',
  line: '#e0dacd',
  line2: '#c9c2b2',
  paper: '#f6f4ee',
  surface2: '#efebe1',
  accent: '#b5651d',
  accentInk: '#8f4e14',
  pass: '#2a7248',
  passBg: '#e1efe6',
  warn: '#835a00',
  warnBg: '#f6ecd2',
  fail: '#a93628',
  failBg: '#f6e0db',
  hatch: '#8e989f',
  /** The screen's translucent spare tint, flattened onto white. */
  spare: '#f4e7da',
  requiredLine: '#9a6a00',
  cableStroke: '#1b2a38',
  cableTag: '#ffffff',
  cables: ['#c07a35', '#3f7896', '#5e8a4a', '#8a5a9e', '#2f8f8a', '#b8902a', '#5f6f80', '#b5566b', '#7d8a2e', '#4f5fb0', '#9c5a3c', '#3c93b8'],
} as const;

export function cableColour(colourIndex: number): string {
  return PRINT.cables[colourIndex % PRINT.cables.length]!;
}

/** "#b5651d" → [181, 101, 29] */
export function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
