/**
 * Geometry of the tray section drawing, as plain shapes. The screen renders
 * these with React; the exports (phase 5) render the same shapes to SVG and
 * PNG, so every output shows the same drawing.
 *
 * Coordinates are drawing units: millimetres times `scale`, with the tray's
 * top-left corner (inside the rails) at 0,0 and y pointing down.
 */
import { num1, plain } from '../domain/format';
import type { SizingResult } from '../domain/types';

export interface CableStyle {
  tag: number;
  colourIndex: number;
}

export interface DrawingOptions {
  /** Dimension chains and labels. */
  dimensions: boolean;
  /** Shaded clearance and spare zones. */
  zones: boolean;
}

export type DrawingShape =
  | { kind: 'zone'; role: 'clearance' | 'spare'; x: number; y: number; width: number; height: number }
  | { kind: 'line'; role: 'boundary' | 'required-height' | 'dimension' | 'extension' | 'leader'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'rail'; d: string }
  | { kind: 'cable'; cx: number; cy: number; r: number; colourIndex: number; tag: number; tagSize: number | null }
  | { kind: 'text'; role: 'dimension' | 'layer'; x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end'; size: number; bold: boolean };

export interface SectionDrawing {
  viewBox: { x: number; y: number; width: number; height: number };
  /** Drawing units per millimetre. */
  scale: number;
  shapes: DrawingShape[];
  trayWidthMm: number;
  trayHeightMm: number;
  /** False when no standard size fits and the tray is drawn at its required size. */
  standardSize: boolean;
  zonesMm: { clearancePerSide: number; spare: number; unused: number };
}

const TARGET_WIDTH = 760;
const TARGET_HEIGHT = 300;
const FONT = 13;
const CHAR_WIDTH = FONT * 0.6;
const PAD_LEFT = 36;
const PAD_RIGHT = 120;
const PAD_BOTTOM = 48;
const ROW_STEP = 19;
const CHAIN_Y = -14;
const TICK = 5;
/** Zones narrower than this (mm) are not drawn or dimensioned. */
const MIN_ZONE_MM = 0.05;
/** Circles smaller than this radius (units) are drawn without a tag number. */
const MIN_TAG_RADIUS = 7;

interface Segment {
  fromMm: number;
  toMm: number;
  /** The zone's own length, labelled as is rather than re-derived by subtraction. */
  lengthMm: number;
  name: string;
}

export function sectionDrawing(
  result: SizingResult,
  styleFor: (rowId: string) => CableStyle,
  options: DrawingOptions,
): SectionDrawing | null {
  if (result.status === 'empty') return null;
  const W = result.drawingSize.widthMm;
  const H = result.drawingSize.heightMm;
  const s = Math.min(TARGET_WIDTH / W, TARGET_HEIGHT / H);
  const Wd = W * s;
  const Hd = H * s;
  const c = result.clearancePerSideMm;
  const cablesEnd = c + result.widestLayerMm;
  const spareEnd = cablesEnd + result.spareMm;
  const unused = Math.max(0, W - c - spareEnd);
  const shapes: DrawingShape[] = [];

  if (options.zones) {
    if (c > MIN_ZONE_MM) {
      shapes.push({ kind: 'zone', role: 'clearance', x: 0, y: 0, width: c * s, height: Hd });
      shapes.push({ kind: 'zone', role: 'clearance', x: (W - c) * s, y: 0, width: c * s, height: Hd });
    }
    if (result.spareMm > MIN_ZONE_MM) {
      shapes.push({ kind: 'zone', role: 'spare', x: cablesEnd * s, y: 0, width: result.spareMm * s, height: Hd });
    }
    for (const x of [c, cablesEnd, spareEnd, W - c]) {
      if (x > MIN_ZONE_MM && x < W - MIN_ZONE_MM) shapes.push({ kind: 'line', role: 'boundary', x1: x * s, y1: 0, x2: x * s, y2: Hd });
    }
  }

  if (result.requiredHeightMm < H - MIN_ZONE_MM) {
    const y = (H - result.requiredHeightMm) * s;
    shapes.push({ kind: 'line', role: 'required-height', x1: 0, y1: y, x2: Wd, y2: y });
  }

  result.layers.forEach((layer, index) => {
    for (const cable of layer.cables) {
      const r = (cable.odMm / 2) * s;
      const style = styleFor(cable.rowId);
      shapes.push({
        kind: 'cable',
        cx: (c + cable.xMm + cable.odMm / 2) * s,
        cy: (H - layer.bottomMm - cable.odMm / 2) * s,
        r,
        colourIndex: style.colourIndex,
        tag: style.tag,
        tagSize: r >= MIN_TAG_RADIUS ? Math.min(FONT, r * 0.9) : null,
      });
    }
    if (result.layers.length > 1) {
      const y = (H - layer.bottomMm - layer.heightMm / 2) * s + FONT * 0.35;
      shapes.push({ kind: 'text', role: 'layer', x: -8, y, text: `L${index + 1}`, anchor: 'end', size: FONT - 1, bold: false });
    }
  });

  shapes.push({ kind: 'rail', d: `M0 0 V${Hd} H${Wd} V0` });

  let labelRows = 1;
  if (options.dimensions) {
    const segments: Segment[] = [
      { fromMm: 0, toMm: c, lengthMm: c, name: '' },
      { fromMm: c, toMm: cablesEnd, lengthMm: result.widestLayerMm, name: 'cables ' },
      { fromMm: cablesEnd, toMm: spareEnd, lengthMm: result.spareMm, name: 'spare ' },
      { fromMm: spareEnd, toMm: W - c, lengthMm: unused, name: '' },
      { fromMm: W - c, toMm: W, lengthMm: c, name: '' },
    ].filter((seg) => seg.lengthMm > MIN_ZONE_MM);
    labelRows = dimensionChain(shapes, segments, s, Wd);
    bottomDimension(shapes, Wd, Hd, result.selected ? `${plain(W)} standard width` : `${num1(W)} required width`);
    rightDimensions(shapes, Wd, Hd, H, result.requiredHeightMm, s, result.selected !== null);
  }

  const padTop = options.dimensions ? 24 + labelRows * ROW_STEP : 16;
  return {
    viewBox: { x: -PAD_LEFT, y: -padTop, width: Wd + PAD_LEFT + PAD_RIGHT, height: Hd + padTop + (options.dimensions ? PAD_BOTTOM : 16) },
    scale: s,
    shapes,
    trayWidthMm: W,
    trayHeightMm: H,
    standardSize: result.selected !== null,
    zonesMm: { clearancePerSide: c, spare: result.spareMm, unused },
  };
}

/** Horizontal chain of zone widths above the tray. Returns the number of label rows used. */
function dimensionChain(shapes: DrawingShape[], segments: Segment[], s: number, Wd: number): number {
  shapes.push({ kind: 'line', role: 'dimension', x1: 0, y1: CHAIN_Y, x2: Wd, y2: CHAIN_Y });
  const boundaries = [...new Set(segments.flatMap((seg) => [seg.fromMm, seg.toMm]))];
  for (const mm of boundaries) {
    const x = mm * s;
    shapes.push({ kind: 'line', role: 'dimension', x1: x, y1: CHAIN_Y - TICK, x2: x, y2: CHAIN_Y + TICK });
    shapes.push({ kind: 'line', role: 'extension', x1: x, y1: CHAIN_Y + TICK, x2: x, y2: -2 });
  }

  // Labels sit centred over their zone. One that does not fit moves up a row
  // with a leader line, taking the lowest row where it overlaps nothing.
  const rows: Array<Array<[number, number]>> = [];
  for (const seg of segments) {
    const a = seg.fromMm * s;
    const b = seg.toMm * s;
    const mid = (a + b) / 2;
    const value = num1(seg.lengthMm);
    let text = seg.name + value;
    let width = text.length * CHAR_WIDTH + 6;
    if (width > b - a - 4) {
      text = value;
      width = text.length * CHAR_WIDTH + 6;
    }
    let row = width <= b - a - 4 ? 0 : 1;
    const x0 = Math.max(-PAD_LEFT + 4, Math.min(mid - width / 2, Wd + PAD_RIGHT - 4 - width));
    const x1 = x0 + width;
    while ((rows[row] ?? []).some(([l, r]) => !(x1 + 4 < l || x0 > r + 4))) row += 1;
    (rows[row] ??= []).push([x0, x1]);
    const y = row === 0 ? CHAIN_Y - 6 : CHAIN_Y - 6 - row * ROW_STEP;
    const labelX = (x0 + x1) / 2;
    if (row > 0) shapes.push({ kind: 'line', role: 'leader', x1: labelX, y1: y + 4, x2: mid, y2: CHAIN_Y - 2 });
    shapes.push({ kind: 'text', role: 'dimension', x: labelX, y, text, anchor: 'middle', size: FONT, bold: false });
  }
  return Math.max(1, rows.length);
}

function bottomDimension(shapes: DrawingShape[], Wd: number, Hd: number, label: string): void {
  const y = Hd + 20;
  shapes.push({ kind: 'line', role: 'dimension', x1: 0, y1: y, x2: Wd, y2: y });
  shapes.push({ kind: 'line', role: 'dimension', x1: 0, y1: y - TICK, x2: 0, y2: y + TICK });
  shapes.push({ kind: 'line', role: 'dimension', x1: Wd, y1: y - TICK, x2: Wd, y2: y + TICK });
  shapes.push({ kind: 'text', role: 'dimension', x: Wd / 2, y: y + FONT + 5, text: label, anchor: 'middle', size: FONT, bold: true });
}

function rightDimensions(shapes: DrawingShape[], Wd: number, Hd: number, H: number, requiredMm: number, s: number, standard: boolean): void {
  const vertical = (x: number, y1: number, y2: number) => {
    shapes.push({ kind: 'line', role: 'dimension', x1: x, y1, x2: x, y2 });
    shapes.push({ kind: 'line', role: 'dimension', x1: x - TICK, y1, x2: x + TICK, y2: y1 });
    shapes.push({ kind: 'line', role: 'dimension', x1: x - TICK, y1: y2, x2: x + TICK, y2 });
  };
  const x1 = Wd + 18;
  vertical(x1, 0, Hd);
  shapes.push({ kind: 'text', role: 'dimension', x: x1 + 6, y: Hd / 2 + FONT * 0.35, text: standard ? plain(H) : num1(H), anchor: 'start', size: FONT, bold: true });
  if (requiredMm < H - MIN_ZONE_MM) {
    const x2 = x1 + FONT * 3.8;
    const yReq = (H - requiredMm) * s;
    vertical(x2, yReq, Hd);
    shapes.push({ kind: 'text', role: 'dimension', x: x2 + 6, y: (yReq + Hd) / 2 + FONT * 0.35, text: num1(requiredMm), anchor: 'start', size: FONT, bold: false });
  }
}
