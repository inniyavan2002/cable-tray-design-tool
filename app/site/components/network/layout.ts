/**
 * The live electrical design around the hero, on the drawing sheet's grid,
 * in the space the hero's text and drawing leave free:
 *
 * - along the top, the services: power nearest the content, dropping into
 *   the top of the riser, then lighting, then the fire alarm with its
 *   detectors; and the sheet's zone letters and numbers, as on a drawing;
 * - on the left, the main board as a single-line diagram: the supply comes
 *   in along the bottom, rises through the MDB busbar, whose breakers feed
 *   the sub-main boards, and leaves along the power line to the riser;
 * - under the text, the supply, which turns up into the drawing's supply
 *   cable, and the status strip of the checks that run;
 * - on the right, the live analysis of the example project's trays.
 *
 * Everything is placed from measurements, in the hero's own pixels, on the
 * grid's lines. Whatever has no room at the reader's screen size is left out,
 * so nothing covers the text, a label or the drawing. Every figure it shows
 * comes from the app (facts.json), like the rest of the page.
 */
import { APP } from '../../data';

/** The sheet grid's minor and major pitch (.sheet-grid in site.css). */
export const GRID = 28;
const MAJOR = 140;
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
  /** The drawing's live monitor, which the tray analysis sits under. */
  monitor: Box;
  /** The Pause / Play animation button. */
  button: Box;
  /** Where the network runs into the drawing: the supply cable's outer end, and the riser's top. */
  supply: Point;
  riser: Point;
}

export interface Tag {
  /** The junction it hangs from. */
  at: Point;
  text: string;
  /** Which side of the junction the text sits, and how far below it its baseline is. */
  side: 'left' | 'right';
  dy: number;
}

/** Tray TR-02's figures as a live readout, hanging on a leader below `at`: where there is no room for the tray analysis. */
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

/** The main board as a single-line diagram: its busbar, and a breaker on each outgoing feeder to a board. */
export interface SingleLine {
  x: number;
  /** The thick busbar, between its first and last feeder. */
  bar: [number, number];
  feeders: Array<{ y: number; board: number; label: string }>;
  /** Where the supply comes in, on the bus. */
  incomer: Point;
}

/** Where an HTML panel goes: its top-left corner and width. */
export interface Panel {
  x: number;
  y: number;
  width: number;
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
  /** Short labels on the sheet: the fire alarm panel, the supply. */
  notes: Array<{ at: Point; text: string; anchor: 'start' | 'end' }>;
  leaders: Array<[Point, Point]>;
  tags: Tag[];
  readout: Readout | null;
  dims: Dimension[];
  singleLine: SingleLine | null;
  /** The live tray analysis (TrayAnalysis), and the status strip under the text. */
  analysis: Panel | null;
  strip: Panel | null;
  /** The sheet's zone letters across the top and numbers down the left. */
  zones: { columns: Array<{ x: number; label: string }>; rows: Array<{ y: number; label: string }>; top: number; left: number };
}

/** Width of a character of the network's 9.5 px mono text, with its tracking. */
export const CHAR = 6.5;
/** The readout's layout: its width, the pitch of its rows, and the room the fill scale and its caption take under the fill row. */
export const READOUT = { width: 124, pitch: 14, scale: 24 };
/** The room the tray analysis and the status strip take (TrayAnalysis and StatusStrip in Network.tsx). */
export const ANALYSIS = { width: 168, height: 190 };
export const STRIP = { width: 640, height: 24 };
/** The boards the main board feeds in the example building, as the showcase's single-line diagram has them. */
export const BOARDS = ['SMDB-3', 'SMDB-2', 'SMDB-1', 'LEVEL 0'];

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
  const west = -BLEED;
  const east = m.width + BLEED;
  const net: Network = {
    width: m.width,
    height: m.height,
    traces: [],
    flows: [],
    junctions: [],
    detectors: [],
    notes: [],
    leaders: [],
    tags: [],
    readout: null,
    dims: [],
    singleLine: null,
    analysis: null,
    strip: null,
    zones: { columns: [], rows: [], top: m.header + 16, left: 12 },
  };

  const drawing = [m.building, ...m.parts];
  const model = {
    left: Math.min(...drawing.map((b) => b.left)),
    top: Math.min(...drawing.map((b) => b.top)),
  };
  // What text and panels may not cover: the hero's text, each part of the drawing and the button, with room around them.
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
  const flow = (tone: Tone, points: Point[], count = 1, seconds = Math.round((length(points) / SPEED[tone]) * 10) / 10) =>
    net.flows.push({ tone, points, seconds, count, edges: [points[0]![0] === west, points[points.length - 1]![0] === east] });
  const note = (at: Point, text: string, anchor: 'start' | 'end') => {
    const [x, y] = at;
    const w = textWidth(text);
    if (claim({ left: anchor === 'start' ? x : x - w, right: anchor === 'start' ? x + w : x, top: y - 10, bottom: y + 3 })) net.notes.push({ at, text, anchor });
  };

  const [sx, sy] = m.supply;
  const [rx, ry] = m.riser;

  // Rows along the top: power nearest the content, then lighting, then fire alarm.
  const top = m.header + g;
  const yPower = line(Math.min(m.text.top, model.top) - g, Math.floor);
  const row = { power: yPower >= top, lighting: yPower - g >= top, fire: yPower - 2 * g >= top };
  const yLighting = yPower - g;
  const yFire = yPower - 2 * g;
  // The main board's bus beside the text, from the supply to the power row.
  const xBus = line(m.text.left - 2 * g, Math.floor);
  // The supply runs a third of the way down the space under the text and, between the text and the drawing, turns up into it.
  const yBottom = line(Math.max(m.text.bottom + 1.5 * g, m.text.bottom + (m.height - m.text.bottom) / 3), Math.ceil);
  const hasBottom = yBottom <= m.height - g;
  const hasBus = row.power && hasBottom && xBus >= g;
  const xGap = line((m.text.right + model.left) / 2);
  const hasGap = xGap - m.text.right >= 0.75 * g && model.left - xGap >= 0.75 * g;

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

  // Power along the top, dropping into the riser; the main board's bus joins it.
  let drop: Point[] | null = null;
  if (row.power) {
    drop = [
      [rx, yPower],
      [rx, ry - 6],
    ];
    const tail = clear(drop) ? drop : [drop[0]!];
    trace('power', [[west, yPower], ...tail]);
    if (hasBus) {
      const bus: Point[] = [
        [xBus, yBottom],
        [xBus, yPower],
      ];
      trace('power', bus);
      flow('power', [[west, yBottom], ...bus, ...tail]);
      net.junctions.push({ at: [xBus, yPower], tone: 'power' }, { at: [xBus, yBottom], tone: 'power', ping: 4.1 });
    } else flow('power', [[west, yPower], ...tail]);
    net.junctions.push({ at: [rx, yPower], tone: 'power' });
    if (tail.length > 1) net.junctions.push({ at: tail[1]!, tone: 'power', ping: 2.2 });
  }

  // The main board as a single-line diagram on its bus: a breaker on each feeder, the board it feeds, and its name.
  if (hasBus) {
    const middle = line((m.text.top + m.text.bottom) / 2);
    const ys = BOARDS.map((_, i) => line(middle + (i - (BOARDS.length - 1) / 2) * 2 * g));
    const board = xBus - 42;
    const room = Math.max(...BOARDS.map(textWidth));
    const fits = board - 10 - room >= 8 && ys[0]! - g > yPower && ys[ys.length - 1]! + 2 * g < yBottom;
    const labels = ys.map((y) => ({ left: board - 10 - room, right: xBus, top: y - 10, bottom: y + 6 }));
    if (fits && labels.every((b) => inside(b) && !taken.some((t) => intersects(t, b)))) {
      for (const b of labels) claim(b);
      net.singleLine = { x: xBus, bar: [ys[0]! - 10, ys[ys.length - 1]! + 10], feeders: ys.map((y, i) => ({ y, board, label: BOARDS[i]! })), incomer: [xBus, yBottom - g] };
      ys.forEach((y, i) => {
        // A pulse leaves the bus for each board now and then, each at its own pace.
        flow('power', [
          [xBus, y],
          [board, y],
        ], 1, 2.6 + i * 0.45);
        net.junctions.push({ at: [xBus, y], tone: 'power' });
      });
      note([xBus + 7, ys[0]! - 14], 'MDB', 'start');
    }
    note([xBus - 8, yBottom - 7], 'SUPPLY', 'end');
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

  // Fire alarm from its panel, above the text, along the top past its detectors.
  if (row.fire) {
    const panel: Point = [line(m.text.left + 6 * g), yFire];
    const run: Point[] = [panel, [east, yFire]];
    trace('fire', run);
    flow('fire', run);
    net.junctions.push({ at: panel, tone: 'fire', ping: 5.2 });
    note([panel[0] - 8, yFire + 3], 'FACP', 'end');
    for (const [share, ping] of [
      [0.22, 1.3],
      [0.5, 3.6],
      [0.78, 6.1],
    ] as const) {
      const x = line(panel[0] + (m.width - panel[0]) * share);
      const tip: Point = [x, yFire + g / 2];
      if (!claim({ left: x - 5, top: yFire, right: x + 5, bottom: tip[1] + 6 })) continue;
      trace('fire', [[x, yFire], tip]);
      net.detectors.push([x, tip[1] + 3]);
      net.junctions.push({ at: [x, yFire], tone: 'fire', ping });
    }
  }

  // The live tray analysis, beside the drawing and under its monitor.
  {
    const y = line(m.monitor.bottom + g, Math.ceil);
    const beside = [...drawing, m.button].filter((b) => b.bottom > y - 8 && b.top < y + ANALYSIS.height);
    const x = line(Math.max(...beside.map((b) => b.right)) + g, Math.ceil);
    const box = { left: x, top: y - 8, right: x + ANALYSIS.width, bottom: y + ANALYSIS.height };
    if (box.right <= m.width - 10 && claim(box)) net.analysis = { x, y, width: ANALYSIS.width };
  }

  // Where it has no room, tray TR-02's readout hangs from the power row between the text and the drawing instead.
  const t2 = tray('TR-02');
  if (!net.analysis && row.power && hasGap && xGap < rx - g) {
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

  // The status strip under the text, below the supply.
  {
    const y = line((hasBottom ? yBottom : m.text.bottom) + 1.5 * g, Math.ceil);
    const x = line(m.text.left);
    if (claim({ left: x, top: y - STRIP.height / 2, right: x + STRIP.width, bottom: y + STRIP.height / 2 })) net.strip = { x, y: y - STRIP.height / 2, width: STRIP.width };
  }

  // The route tag where the power line drops into the riser.
  if (row.power && drop && clear(drop)) {
    const text = 'MDB → TR-01';
    const box = { left: rx - 12 - textWidth(text), right: rx - 8, top: yPower + 8, bottom: yPower + 22 };
    if (claim(box)) net.tags.push({ at: [rx, yPower], text, side: 'left', dy: 18 });
  }

  // Each run's tray size, as on a layout drawing.
  const dimension = (at: Point, vertical: boolean, text: string) => {
    const span = textWidth(text) + 24;
    const [x, y] = at;
    const box = vertical ? { left: x - 16, right: x, top: y - span / 2, bottom: y + span / 2 } : { left: x - span / 2, right: x + span / 2, top: y - 16, bottom: y };
    if (claim(box)) net.dims.push({ at, vertical, text, span });
  };
  if (row.power) {
    const from = Math.max(hasBus ? xBus : 8, 8);
    const to = net.readout ? xGap : rx;
    if (to - from > textWidth('300 × 75 mm') + 60) dimension([line((from + to) / 2), yPower], false, `${t2.selected} mm`);
  }
  // Down the riser's drop, which runs into TR-01.
  if (drop && clear(drop)) dimension([rx, line(yPower + (drop[1]![1] - yPower) * 0.62)], true, `${tray('TR-01').selected} mm`);
  if (hasBottom) {
    const label = `${tray('TR-03').selected} mm`;
    const room = textWidth(label) + 60;
    const from = 8;
    const to = hasBus ? xBus - 60 : xGap;
    if (to - from > room) dimension([line((from + to) / 2), yBottom], false, label);
    else if (hasBus && xGap - xBus > room) dimension([line((xBus + xGap) / 2), yBottom], false, label);
  }

  // Last, where there is room: the sheet's zones, as on a drawing: letters across the top, numbers down the left, each in the middle of a major square.
  for (let k = 0; -BLEED + k * MAJOR + MAJOR / 2 < m.width - 10; k++) {
    const x = -BLEED + k * MAJOR + MAJOR / 2;
    if (x > 10 && claim({ left: x - 5, right: x + 5, top: net.zones.top - 9, bottom: net.zones.top + 2 })) net.zones.columns.push({ x, label: String.fromCharCode(65 + k) });
  }
  for (let k = 0; -BLEED + k * MAJOR + MAJOR / 2 < m.height - 10; k++) {
    const y = -BLEED + k * MAJOR + MAJOR / 2;
    if (y > m.header + 34 && claim({ left: 6, right: 20, top: y - 9, bottom: y + 3 })) net.zones.rows.push({ y, label: String(k) });
  }

  return net;
}
