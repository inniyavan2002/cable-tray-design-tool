/**
 * The live electrical network behind the hero: thin circuit traces on the
 * drawing sheet's grid, in the space the hero's text and drawing leave free.
 * Services run along the top of the sheet, power nearest the content; a
 * feeder rises beside the text; the supply runs under the text and turns up
 * into the drawing's supply cable, and a power line drops into the top of the
 * riser; the fire alarm runs down beside the drawing past its detectors.
 *
 * Everything is placed from measurements, in the hero's own pixels, on the
 * grid's lines. Whatever has no room at the reader's screen size is left out,
 * so the network never covers the text, a label or the drawing. Every figure
 * it shows comes from the app (facts.json), like the rest of the page.
 */
import { APP } from '../../data';

/** The sheet grid's minor pitch (.sheet-grid in site.css). */
export const GRID = 28;
/** How far the grid layer reaches past the hero (Hero.tsx), which sets where its lines fall. */
export const BLEED = 40;

export type Point = readonly [number, number];
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export type Tone = 'power' | 'lighting' | 'fire';

export interface HeroMeasures {
  width: number;
  height: number;
  /** Nothing goes above this: the header covers it. */
  header: number;
  /** Where the hero's text has ink. */
  text: Box;
  /** The building's outline in the drawing: traces may run into it, nothing else may cover it. */
  building: Box;
  /** The drawing's labels, its monitor and its legend: nothing may cover or cross them. */
  parts: Box[];
  /** The Pause / Play animation button. */
  button: Box;
  /** Where the network runs into the drawing: the supply cable's outer end, and the riser's top. */
  supply: Point;
  riser: Point;
}

export interface Tag {
  kind: 'status' | 'route';
  /** The junction it hangs from. */
  at: Point;
  text: string;
  /** Which side of the junction the text sits, and how far below it its baseline is. */
  side: 'left' | 'right';
  dy: number;
}

/** Tray TR-02's figures as a live readout, hanging on a leader below `at`. */
export interface Readout {
  at: Point;
  /** Top-left corner of the readout's first line. */
  origin: Point;
  rows: Array<[string, string]>;
  fill: { value: string; limit: number; caption: string };
}

/** A run's size written along it, between two ticks, the way tray runs are marked on a layout drawing. */
export interface Dimension {
  /** Centre of the text, on the run. */
  at: Point;
  vertical: boolean;
  text: string;
  /** Distance between the ticks. */
  span: number;
}

export interface Network {
  /** The hero's size, which the circuits' fade towards the edges follows. */
  width: number;
  height: number;
  traces: Array<{ tone: Tone; points: Point[] }>;
  /** Routes particles travel: seconds per trip, how many share it, and whether it comes in from, and goes out past, the sheet's edge. */
  flows: Array<{ tone: Tone; points: Point[]; seconds: number; count: number; edges: [boolean, boolean] }>;
  /** Connection points; `ping` is when its ring first grows, in seconds. */
  junctions: Array<{ at: Point; tone: Tone; ping?: number }>;
  detectors: Point[];
  leaders: Array<[Point, Point]>;
  tags: Tag[];
  readout: Readout | null;
  dims: Dimension[];
}

/** Width of a character of the network's 9.5 px mono text, with its tracking. */
export const CHAR = 6.5;
/** The readout's layout: its width, the pitch of its rows, and the room the fill scale and its caption take under the fill row. */
export const READOUT = { width: 124, pitch: 14, scale: 24 };
const textWidth = (text: string) => text.length * CHAR;
const intersects = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const grow = (b: Box, by: number): Box => ({ left: b.left - by, top: b.top - by, right: b.right + by, bottom: b.bottom + by });
const segment = ([x0, y0]: Point, [x1, y1]: Point): Box => ({ left: Math.min(x0, x1), top: Math.min(y0, y1), right: Math.max(x0, x1), bottom: Math.max(y0, y1) });
const length = (points: Point[]) => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1]), 0);

/** Particle speeds in pixels a second: slow, power the quickest. */
const SPEED: Record<Tone, number> = { power: 62, lighting: 50, fire: 42 };

const tray = (name: string) => APP.trays.find((t) => t.name === name)!;

export function layoutNetwork(m: HeroMeasures): Network {
  const g = GRID;
  /** The nearest grid line to v (or the one below or above it, with Math.floor or Math.ceil). */
  const line = (v: number, round: (n: number) => number = Math.round) => round((v + BLEED) / g) * g - BLEED;
  const net: Network = { width: m.width, height: m.height, traces: [], flows: [], junctions: [], detectors: [], leaders: [], tags: [], readout: null, dims: [] };

  const drawing = [m.building, ...m.parts];
  const model = {
    left: Math.min(...drawing.map((b) => b.left)),
    right: Math.max(...drawing.map((b) => b.right)),
    top: Math.min(...drawing.map((b) => b.top)),
    bottom: Math.max(...drawing.map((b) => b.bottom)),
  };
  // What text may not cover: the hero's text, each part of the drawing and the button, with room around them.
  const taken: Box[] = [grow(m.text, g / 2), ...drawing.map((b) => grow(b, g / 3)), grow(m.button, g / 2)];
  const inside = (b: Box) => b.left >= 6 && b.right <= m.width - 6 && b.top >= m.header + 6 && b.bottom <= m.height - 6;
  /** Claims the box if it is on screen and free. */
  const claim = (b: Box) => {
    if (!inside(b) || taken.some((t) => intersects(t, b))) return false;
    taken.push(grow(b, 6));
    return true;
  };
  /** True when a trace's segments stay clear of the text, the labels, the monitor and the legend (the building itself may be entered). */
  const clear = (points: Point[]) => {
    const keepOut = [grow(m.text, g / 3), ...m.parts.map((b) => grow(b, 4)), m.button];
    return points.slice(1).every((p, i) => !keepOut.some((k) => intersects(k, segment(points[i]!, p))));
  };
  const trace = (tone: Tone, points: Point[]) => net.traces.push({ tone, points });
  const west = -BLEED;
  const east = m.width + BLEED;
  const flow = (tone: Tone, points: Point[], count = 1) =>
    net.flows.push({
      tone,
      points,
      seconds: Math.round((length(points) / SPEED[tone]) * 10) / 10,
      count,
      edges: [points[0]![0] === west, points[points.length - 1]![0] === east],
    });
  const [sx, sy] = m.supply;
  const [rx, ry] = m.riser;

  // Rows along the top: power nearest the content, then lighting, then fire alarm.
  const top = m.header + g;
  const yPower = line(Math.min(m.text.top, model.top) - g, Math.floor);
  const row = { power: yPower >= top, lighting: yPower - g >= top, fire: yPower - 2 * g >= top };
  const yLighting = yPower - g;
  const yFire = yPower - 2 * g;
  // A feeder rises beside the text, from the supply to the power row, stepping out away from the text halfway up.
  const xFeeder = line(m.text.left - 2 * g, Math.floor);
  const xRise = xFeeder - 2 * g;
  const yStep = line((m.text.top + m.text.bottom) / 2);
  // The supply runs a third of the way down the space under the text and, between the text and the drawing, turns up into it.
  const yBottom = line(Math.max(m.text.bottom + 1.5 * g, m.text.bottom + (m.height - m.text.bottom) / 3), Math.ceil);
  const hasBottom = yBottom <= m.height - g;
  const hasFeeder = row.power && hasBottom && xFeeder >= g;
  const feeder: Point[] = xRise >= g
    ? [
        [xFeeder, yBottom],
        [xFeeder, yStep],
        [xRise, yStep],
        [xRise, yPower],
      ]
    : [
        [xFeeder, yBottom],
        [xFeeder, yPower],
      ];
  const feederTop = feeder[feeder.length - 1]!;
  const xGap = line((m.text.right + model.left) / 2);
  const hasGap = xGap - m.text.right >= 0.75 * g && model.left - xGap >= 0.75 * g;
  // The fire alarm runs down beside the drawing.
  const xSide = line(model.right + g, Math.ceil);
  const yEnd = line(Math.min(model.bottom, m.button.top - g), Math.floor);
  const hasSide = row.fire && m.width - xSide >= 2 * g && yEnd - yFire >= 6 * g;

  // The supply: along the bottom, up between the text and the drawing, and into the supply cable along its own line.
  if (hasBottom) {
    const yEntry = line(sy - g / 3, Math.floor);
    const entry: Point[] = [
      [xGap, yBottom],
      [xGap, yEntry],
      [sx - (sy - yEntry) * Math.sqrt(3), yEntry],
      [sx, sy],
    ];
    const supply: Point[] = [[west, yBottom], ...entry];
    if (hasGap && entry[2]![0] > xGap + g / 2 && clear(supply)) {
      trace('power', supply);
      flow('power', supply, 2);
      net.junctions.push({ at: [sx, sy], tone: 'power', ping: 0 });
    } else {
      const end: Point = [line(m.text.right + g / 2), yBottom];
      trace('power', [[west, yBottom], end]);
      flow('power', [[west, yBottom], end]);
      net.junctions.push({ at: end, tone: 'power' });
    }
  }

  // Power along the top, dropping into the riser; the feeder joins it.
  const powerFrom: Point = [west, yPower];
  let drop: Point[] | null = null;
  if (row.power) {
    drop = [
      [rx, yPower],
      [rx, ry - 6],
    ];
    const tail = clear(drop) ? drop : [drop[0]!];
    trace('power', [powerFrom, ...tail]);
    if (hasFeeder) {
      trace('power', feeder);
      flow('power', [[west, yBottom], ...feeder, ...tail]);
      net.junctions.push({ at: feederTop, tone: 'power' }, { at: [xFeeder, yBottom], tone: 'power', ping: 4.1 });
    } else flow('power', [powerFrom, ...tail]);
    net.junctions.push({ at: [rx, yPower], tone: 'power' });
    if (tail.length > 1) net.junctions.push({ at: tail[1]!, tone: 'power', ping: 2.2 });
  }

  // Lighting across the whole top.
  if (row.lighting) {
    const run: Point[] = [
      [west, yLighting],
      [east, yLighting],
    ];
    trace('lighting', run);
    flow('lighting', run);
  }

  // Fire alarm from its panel, above the text, along the top and down beside the drawing past two detectors.
  if (row.fire) {
    const panel: Point = [line(m.text.left + 6 * g), yFire];
    const run: Point[] = hasSide
      ? [
          panel,
          [xSide, yFire],
          [xSide, yEnd],
        ]
      : [panel, [east, yFire]];
    trace('fire', run);
    flow('fire', run);
    net.junctions.push({ at: panel, tone: 'fire', ping: 5.2 });
    if (hasSide) {
      net.junctions.push({ at: [xSide, yEnd], tone: 'fire' });
      for (const [share, ping] of [
        [0.45, 1.3],
        [0.78, 3.6],
      ] as const) {
        const y = line(yFire + (yEnd - yFire) * share);
        const tip: Point = [xSide + g / 2, y];
        if (!claim({ left: xSide, top: y - 5, right: tip[0] + 6, bottom: y + 5 })) continue;
        trace('fire', [[xSide, y], tip]);
        net.detectors.push([tip[0] + 3, y]);
        net.junctions.push({ at: [xSide, y], tone: 'fire', ping });
      }
    }
  }

  // Tray TR-02's readout, hanging from the power row between the text and the drawing.
  const t2 = tray('TR-02');
  if (row.power && hasGap && xGap < rx - g) {
    const rows: Array<[string, string]> = [
      ['TR-02', t2.selected],
      ['FILL', t2.fill],
      ['CABLES', t2.cables],
      ['WT', t2.weight],
    ];
    const origin: Point = [xGap + 10, yPower + g];
    // Names take seven characters.
    const width = Math.max(READOUT.width, ...rows.map(([, v]) => (7 + v.length) * CHAR));
    if (claim({ left: origin[0], top: origin[1] - 10, right: origin[0] + width, bottom: origin[1] + rows.length * READOUT.pitch + READOUT.scale })) {
      net.readout = { at: [xGap, yPower], origin, rows, fill: { value: t2.fill, limit: parseFloat(t2.maxFill), caption: `${t2.maxFill} FILL LIMIT` } };
      net.leaders.push([
        [xGap, yPower],
        [xGap, origin[1] - 4],
      ]);
      net.junctions.push({ at: [xGap, yPower], tone: 'power' });
    }
  }

  // Status and route tags at the junctions.
  const tag = (t: Tag) => {
    const w = textWidth(t.text) + (t.kind === 'status' ? 10 : 0);
    const [x, y] = t.at;
    const box = t.side === 'right' ? { left: x + 8, right: x + 12 + w } : { left: x - 12 - w, right: x - 8 };
    if (!claim({ ...box, top: y + t.dy - 10, bottom: y + t.dy + 4 })) return;
    net.tags.push(t);
    if (!net.junctions.some((j) => j.at[0] === x && j.at[1] === y)) net.junctions.push({ at: t.at, tone: 'power' });
  };
  if (hasFeeder) tag({ kind: 'status', at: [xFeeder, Math.min(yStep + 2 * g, yBottom - 2 * g)], text: 'SYSTEM ACTIVE', side: 'left', dy: 4 });
  if (hasBottom) tag({ kind: 'status', at: hasFeeder ? [xFeeder, yBottom] : [line(m.text.left + g), yBottom], text: 'POWER FLOW', side: 'right', dy: 18 });
  if (row.power && drop && clear(drop)) tag({ kind: 'route', at: [rx, yPower], text: 'MDB → TR-01', side: 'left', dy: 18 });

  // Each run's tray size, as on a layout drawing.
  const dimension = (at: Point, vertical: boolean, text: string) => {
    const span = textWidth(text) + 24;
    const [x, y] = at;
    const box = vertical ? { left: x - 16, right: x, top: y - span / 2, bottom: y + span / 2 } : { left: x - span / 2, right: x + span / 2, top: y - 16, bottom: y };
    if (claim(box)) net.dims.push({ at, vertical, text, span });
  };
  if (row.power) {
    const from = Math.max(hasFeeder ? feederTop[0] : 8, 8);
    const to = net.readout ? xGap : rx;
    if (to - from > textWidth('300 × 75 mm') + 60) dimension([line((from + to) / 2), yPower], false, `${t2.selected} mm`);
  }
  // Up the feeder's upper part, clear of its step.
  if (hasFeeder) dimension([feederTop[0], line((yPower + (feeder.length > 2 ? yStep : yBottom)) / 2)], true, `${tray('TR-01').selected} mm`);
  if (hasBottom) {
    const label = `${tray('TR-03').selected} mm`;
    const room = textWidth(label) + 60;
    const from = 8;
    const to = hasFeeder ? xFeeder : xGap;
    if (to - from > room) dimension([line((from + to) / 2), yBottom], false, label);
    else if (hasFeeder && xGap - xFeeder > room) dimension([line((xFeeder + xGap) / 2), yBottom], false, label);
  }

  return net;
}
