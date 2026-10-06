/**
 * The website's building drawing, in isometric projection: four levels around
 * a riser, with the boards, feeders, cable trays, conduits and lighting that
 * share the ceiling space. Everything is computed once, as SVG path data, so
 * each system is one or two paths; Building.tsx decides what each view shows.
 *
 * Units are metres-ish: x runs along the building (to the lower right on
 * screen), y across it (to the lower left), z up.
 */
import { APP } from '../../data';

type P3 = readonly [x: number, y: number, z: number];

const COS30 = Math.cos(Math.PI / 6);
/** Screen units per building unit. */
const UNIT = 22;
const round = (v: number) => Math.round(v * 10) / 10;

export function project([x, y, z]: P3): [number, number] {
  return [round((x - y) * COS30 * UNIT), round(((x + y) / 2 - z) * UNIT)];
}

const polyline = (...points: P3[]) => points.map((p, i) => `${i ? 'L' : 'M'}${project(p).join(' ')}`).join('');
const polygon = (...points: P3[]) => `${polyline(...points)}Z`;

export const LEVELS = 4;
const LENGTH = 18;
const DEPTH = 10;
const STOREY = 3.2;
const ROOF = LEVELS * STOREY;
const levels = Array.from({ length: LEVELS }, (_, k) => k);
/** Trays hang just below the slab above; lights hang below the trays. */
const trayZ = (k: number) => (k + 1) * STOREY - 0.55;
const lightZ = (k: number) => (k + 1) * STOREY - 1.05;
const steps = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step + 1e-9) + 1 }, (_, i) => from + i * step);

const RISER = { x: 1.6, y: 5, width: 0.8 };
const MAIN = { y: 5, width: 0.76, from: RISER.x, to: 16.8 };
const BRANCHES = [11.5];
const BRANCH_WIDTH = 0.5;
const FIXTURES: ReadonlyArray<readonly [number, number]> = [4.8, 9.8, 15].flatMap((x) => [2.4, 7.6].map((y) => [x, y] as const));

/* ------------------------------------------------------------ architecture */

const slabCorners = (z: number): P3[] => [
  [0, 0, z],
  [LENGTH, 0, z],
  [LENGTH, DEPTH, z],
  [0, DEPTH, z],
];

/** Floor slabs, levels 0 to the roof. */
const slabs = steps(0, LEVELS, 1).map((k) => polygon(...slabCorners(k * STOREY)));

const COLUMNS: ReadonlyArray<readonly [number, number]> = [
  ...[0, 6, 12, 18].flatMap((x) => [0, DEPTH].map((y) => [x, y] as const)),
  [0, 5],
  [LENGTH, 5],
];
/** Each column bottom to top, so it can be drawn rising. */
const columns = COLUMNS.map(([x, y]) => polyline([x, y, 0], [x, y, ROOF]));

/** Window mullions on the two faces towards the viewer. */
const facade = [
  ...steps(1.5, LENGTH - 1.5, 1.5).map((x) => polyline([x, DEPTH, 0], [x, DEPTH, ROOF])),
  ...steps(1.25, DEPTH - 1.25, 1.25).map((y) => polyline([LENGTH, y, 0], [LENGTH, y, ROOF])),
  ...levels.map((k) => polyline([0, DEPTH, k * STOREY + 0.9], [LENGTH, DEPTH, k * STOREY + 0.9], [LENGTH, 0, k * STOREY + 0.9])),
].join('');

/** The ground plane's grid, wider than the building; the drawing fades it out. */
const ground = [...steps(-8, LENGTH + 8, 2).map((x) => polyline([x, -8, 0], [x, DEPTH + 8, 0])), ...steps(-8, DEPTH + 8, 2).map((y) => polyline([-8, y, 0], [LENGTH + 8, y, 0]))].join('');

/* ------------------------------------------------------------------ trays */

interface TrayPaths {
  rails: string;
  rungs: string;
}

/** A ladder tray along x: bottom edges, side-rail tops and rungs. */
function trayAlongX(from: number, to: number, y: number, width: number, z: number): TrayPaths {
  const [a, b] = [y - width / 2, y + width / 2];
  const h = 0.24;
  return {
    rails: [polyline([from, a, z], [to, a, z]), polyline([from, b, z], [to, b, z]), polyline([from, a, z + h], [to, a, z + h]), polyline([from, b, z + h], [to, b, z + h])].join(''),
    rungs: steps(from + 0.3, to, 0.75)
      .map((x) => polyline([x, a, z], [x, b, z]))
      .join(''),
  };
}

function trayAlongY(from: number, to: number, x: number, width: number, z: number): TrayPaths {
  const [a, b] = [x - width / 2, x + width / 2];
  const h = 0.2;
  return {
    rails: [polyline([a, from, z], [a, to, z]), polyline([b, from, z], [b, to, z]), polyline([a, from, z + h], [a, to, z + h]), polyline([b, from, z + h], [b, to, z + h])].join(''),
    rungs: steps(from + 0.3, to, 0.75)
      .map((y) => polyline([a, y, z], [b, y, z]))
      .join(''),
  };
}

const riserTop = trayZ(LEVELS - 1) + 0.3;
/** The riser's two rails, bottom to top. */
const riserRails = [RISER.y - RISER.width / 2, RISER.y + RISER.width / 2].map((y) => polyline([RISER.x, y, 0.4], [RISER.x, y, riserTop]));
const riser: TrayPaths = {
  rails: riserRails.join(''),
  rungs: steps(0.8, riserTop, 0.7)
    .map((z) => polyline([RISER.x, RISER.y - RISER.width / 2, z], [RISER.x, RISER.y + RISER.width / 2, z]))
    .join(''),
};

function floorTrays(k: number): TrayPaths[] {
  const z = trayZ(k);
  const edge = MAIN.width / 2;
  return [
    trayAlongX(MAIN.from, MAIN.to, MAIN.y, MAIN.width, z),
    ...BRANCHES.flatMap((x) => [trayAlongY(1.2, MAIN.y - edge, x, BRANCH_WIDTH, z), trayAlongY(MAIN.y + edge, 8.8, x, BRANCH_WIDTH, z)]),
  ];
}

/** Where the example trays sit: TR-01 is the riser, TR-03 a main run, TR-02 a branch. */
const TR03_LEVEL = 2;
const TR02_LEVEL = 3;
const tr03Rails = trayAlongX(MAIN.from, MAIN.to, MAIN.y, MAIN.width, trayZ(TR03_LEVEL)).rails;
const tr02Rails = trayAlongY(1.2, MAIN.y - MAIN.width / 2, BRANCHES[0]!, BRANCH_WIDTH, trayZ(TR02_LEVEL)).rails;
/** The riser's centre line, bottom to top, for the light that runs up it. */
const riserLine = polyline([RISER.x, RISER.y, 0.4], [RISER.x, RISER.y, riserTop]);

/* ----------------------------------------------------------------- boards */

type Box = { x: [number, number]; y: [number, number]; z: [number, number] };

/** The three faces of a box that face the viewer. */
function boxFaces({ x: [x0, x1], y: [y0, y1], z: [z0, z1] }: Box) {
  return {
    top: polygon([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]),
    right: polygon([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]),
    left: polygon([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]),
  };
}

/** The outline of a box as seen: its six silhouette corners. */
function boxOutline({ x: [x0, x1], y: [y0, y1], z: [z0, z1] }: Box) {
  return polygon([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y1, z1]);
}

const MDB: Box = { x: [2.6, 4.8], y: [7.3, 8.2], z: [0, 2.3] };
const smdb = (k: number): Box => ({ x: [2.6, 3.9], y: [7.6, 8.2], z: [k * STOREY, k * STOREY + 1.6] });
const boards = [MDB, ...levels.slice(1).map(smdb)].map(boxFaces);

/* ---------------------------------------------------------------- current */

/** Feeders: from the main board, up the riser, to each level's sub-main board. */
const feeders = [
  polyline([4.2, 7.75, MDB.z[1]], [4.2, 7.75, 2.8], [RISER.x, 7.75, 2.8], [RISER.x, RISER.y, 2.8], [RISER.x, RISER.y, riserTop - 0.1]),
  ...levels.slice(1).map((k) => polyline([RISER.x, RISER.y, trayZ(k) + 0.1], [RISER.x, 7.9, trayZ(k) + 0.1], [3.25, 7.9, trayZ(k) + 0.1], [3.25, 7.9, smdb(k).z[1]])),
].join('');

/** Final circuits on level k: from its board up into the floor trays, then out along them. */
function circuits(k: number): string {
  const z = trayZ(k) + 0.1;
  const source = k === 0 ? MDB : smdb(k);
  return [
    polyline([3.6, 7.9, source.z[1]], [3.6, 7.9, z], [3.6, MAIN.y, z], [MAIN.to - 0.2, MAIN.y, z]),
    ...BRANCHES.flatMap((x) => [polyline([x, MAIN.y, z], [x, 1.35, z]), polyline([x, MAIN.y, z], [x, 8.65, z])]),
  ].join('');
}

/** Lighting circuits on level k: in conduit from the main tray down to each fitting. */
function lightingCircuits(k: number): string {
  return FIXTURES.map(([x, y]) => {
    const edge = y < MAIN.y ? MAIN.y - MAIN.width / 2 : MAIN.y + MAIN.width / 2;
    const end = y < MAIN.y ? y + 0.25 : y - 0.25;
    return polyline([x, edge, trayZ(k)], [x, edge, lightZ(k)], [x, end, lightZ(k)]);
  }).join('');
}

/* --------------------------------------------------------------- lighting */

function hull(points: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Array<[number, number]>) => {
    const out: Array<[number, number]> = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

const rect = (x: number, y: number, w: number, d: number, z: number): P3[] => [
  [x - w, y - d, z],
  [x + w, y - d, z],
  [x + w, y + d, z],
  [x - w, y + d, z],
];

const fixtures = (k: number) => FIXTURES.map(([x, y]) => polygon(...rect(x, y, 0.7, 0.22, lightZ(k)))).join('');
/** Each fitting's light on level k, from the fitting to a pool on the floor. */
const cones = (k: number) =>
  FIXTURES.map(([x, y]) => {
    const points = [...rect(x, y, 0.7, 0.22, lightZ(k)), ...rect(x, y, 1.1, 0.8, k * STOREY + 0.02)].map(project);
    return `${hull(points)
      .map((p, i) => `${i ? 'L' : 'M'}${p.join(' ')}`)
      .join('')}Z`;
  });

/* ----------------------------------------------------------------- labels */

export interface BuildingLabel {
  /** Also the id of the part it names (TARGETS). */
  id: string;
  anchor: [number, number];
  /** Where the label box sits, relative to its anchor. */
  offset: [number, number];
  title: string;
  detail?: string;
  /** The views that show it. */
  show: string;
  /** Shown while the label or its part is hovered: figures from the app, or what the part connects. */
  specs: Array<[string, string]>;
  /** A status line that steps through these while the drawing runs: the state of the animation, not of a real installation. */
  status?: string[];
  /** A tray's fill against its limit, in percent of the cross-section, as the app works it out; `text` is the fill as the app writes it. */
  meter?: { fill: number; limit: number; text: string };
}

const tray = (name: string) => APP.trays.find((t) => t.name === name)!;
const trayLabel = (name: string) => `${tray(name).service}, ${tray(name).selected}`;
const trayMeter = (name: string) => ({ fill: parseFloat(tray(name).fill), limit: parseFloat(tray(name).maxFill), text: tray(name).fill });
/** A tray's figures as the app works them out for the example project. */
function traySpecs(name: string): Array<[string, string]> {
  const t = tray(name);
  const unknown = t.rowsWithoutWeight ? ` (${t.rowsWithoutWeight} row${t.rowsWithoutWeight === 1 ? '' : 's'} unknown)` : '';
  return [
    ['Size', `${t.selected} mm`],
    ['Fill', `${t.fill} of ${t.maxFill}`],
    ['Cables', `${t.cables} in ${t.layers} layer${t.layers === '1' ? '' : 's'}`],
    ['System', t.service],
    ['Weight', `${t.weight}${unknown}`],
  ];
}

export const LABELS: BuildingLabel[] = [
  {
    id: 'mdb',
    anchor: project([MDB.x[1], MDB.y[1], MDB.z[1]]),
    offset: [34, 34],
    title: 'Main board',
    detail: 'MDB, level 0',
    show: 'all power',
    status: ['SYSTEM ACTIVE', 'POWER FLOW', 'DISTRIBUTION ONLINE'],
    specs: [
      ['Feeds', 'SMDB-1 to SMDB-3'],
      ['Route', 'up the TR-01 riser'],
    ],
  },
  {
    id: 'smdb',
    anchor: project([3.9, 8.2, smdb(3).z[1]]),
    offset: [-110, -72],
    title: 'SMDB-3',
    detail: 'Sub-main board',
    show: 'power',
    specs: [
      ['Fed from', 'the main board'],
      ['Feeds', 'the level 3 trays'],
    ],
  },
  {
    id: 'tr01',
    anchor: project([RISER.x, RISER.y - RISER.width / 2, 5.4]),
    offset: [-120, -46],
    title: 'TR-01 riser',
    detail: trayLabel('TR-01'),
    show: 'all trays power',
    specs: traySpecs('TR-01'),
    meter: trayMeter('TR-01'),
  },
  {
    id: 'tr03',
    anchor: project([15.5, MAIN.y + MAIN.width / 2, trayZ(TR03_LEVEL)]),
    offset: [36, 20],
    title: 'TR-03',
    detail: trayLabel('TR-03'),
    show: 'all trays',
    specs: traySpecs('TR-03'),
    meter: trayMeter('TR-03'),
  },
  {
    id: 'tr02',
    anchor: project([BRANCHES[0]!, 2.2, trayZ(TR02_LEVEL) + 0.2]),
    // Clear of the fill callout below it, now the label carries a meter.
    offset: [40, -64],
    title: 'TR-02',
    detail: trayLabel('TR-02'),
    show: 'all trays',
    specs: traySpecs('TR-02'),
    meter: trayMeter('TR-02'),
  },
  {
    id: 'lights',
    anchor: project([15, 7.6, lightZ(1)]),
    offset: [40, 30],
    title: 'Lighting',
    detail: 'Circuits in conduit',
    show: 'lighting',
    specs: [
      ['Fittings', '6 on each level'],
      ['Route', 'tray, then conduit'],
    ],
  },
];

/**
 * A label's box in the drawing. Positive offsets put its top-left corner
 * there; negative ones its top-right corner. A meter needs room for its
 * caption, a readable bar and the figure.
 */
export function labelBox(label: BuildingLabel): { left: number; top: number; width: number; height: number } {
  const [ax, ay] = label.anchor;
  const [ox, oy] = label.offset;
  const width = Math.max(Math.round(Math.max(label.title.length * 8.6, (label.detail?.length ?? 0) * 6.9) + 24), label.meter ? 150 : 0);
  const height = (label.detail ? 46 : 30) + (label.status ? 15 : 0) + (label.meter ? 14 : 0);
  return { left: ox >= 0 ? ax + ox : ax + ox - width, top: ay + oy, width, height };
}

export const LEVEL_LABELS = levels.map((k) => ({ text: `Level ${k}`, at: project([0, DEPTH, k * STOREY + 0.25]) }));

/* --------------------------------------------------------------- viewBox */

const corners = [...slabCorners(0), ...slabCorners(ROOF)].map(project);
const xs = corners.map((p) => p[0]);
const ys = corners.map((p) => p[1]);
/** Room around the building for the labels. */
const PAD = { left: 150, right: 170, top: 36, bottom: 40 };

export const VIEWBOX = {
  x: Math.floor(Math.min(...xs) - PAD.left),
  y: Math.floor(Math.min(...ys) - PAD.top),
  width: Math.ceil(Math.max(...xs) - Math.min(...xs) + PAD.left + PAD.right),
  height: Math.ceil(Math.max(...ys) - Math.min(...ys) + PAD.top + PAD.bottom),
};

/**
 * Where the drawing has ink in the overall view, in drawing units: the
 * building's outline and each label shown there. The hero's background
 * network keeps clear of these.
 */
export const INK: Array<{ left: number; top: number; right: number; bottom: number }> = [
  { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) },
  ...LABELS.filter((l) => l.show.split(' ').includes('all')).map((l) => {
    const box = labelBox(l);
    return { left: box.left, top: box.top, right: box.left + box.width, bottom: box.top + box.height };
  }),
];

/* ------------------------------------------------------------- fire alarm */

/**
 * The fire alarm system runs apart from power and lighting: a panel on the
 * front wall, its own riser, and on each level a circuit along the front of
 * the building past the detectors.
 */
const FIRE_PANEL: Box = { x: [5.6, 6.5], y: [9.35, 9.75], z: [0.6, 1.7] };
const FIRE = { x: 6.05, y: 9.55 };
const fireZ = (k: number) => (k + 1) * STOREY - 0.28;
const fireRiser = polyline([FIRE.x, FIRE.y, FIRE_PANEL.z[1]], [FIRE.x, FIRE.y, fireZ(LEVELS - 1)]);
const fireCircuit = (k: number) => polyline([FIRE.x, FIRE.y, fireZ(k)], [16.8, FIRE.y, fireZ(k)], [16.8, 6.2, fireZ(k)]);
const fireDetectors = (k: number): Array<[number, number]> => [
  project([9, FIRE.y, fireZ(k)]),
  project([12, FIRE.y, fireZ(k)]),
  project([15, FIRE.y, fireZ(k)]),
  project([16.8, 7.6, fireZ(k)]),
];

/* -------------------------------------------------------------- live flow */

const round2 = (v: number) => Math.round(v * 100) / 100;
/** Length on screen of a route through these points. */
const screenLength = (points: readonly P3[]) =>
  points.slice(1).reduce((sum, p, i) => {
    const [x0, y0] = project(points[i]!);
    const [x1, y1] = project(p);
    return sum + Math.hypot(x1 - x0, y1 - y0);
  }, 0);
const dedupe = (points: P3[]) => points.filter((p, i) => i === 0 || p.some((v, j) => v !== points[i - 1]![j]));
/** Spread evenly but irregularly, the same on every visit. */
const scatter = (seed: number) => ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1;

/** The supply cable entering the main board from outside the building. */
const SUPPLY: P3[] = [
  [-5, 7.75, 0.35],
  [2.6, 7.75, 0.35],
];

/**
 * Where the hero's background network runs into the drawing, in drawing
 * units: the supply cable's outer end, and the top of the riser.
 */
export const PORTS = { supply: project(SUPPLY[0]!), riser: project([RISER.x, RISER.y, riserTop]) };

/** From the main board to level k's board: up the riser, across to the sub-main board, and out of it. */
function boardFeed(k: number): P3[] {
  if (k === 0) return [[3.6, 7.9, MDB.z[1]]];
  const z = trayZ(k) + 0.1;
  const top = smdb(k).z[1];
  return [[4.2, 7.75, MDB.z[1]], [4.2, 7.75, 2.8], [RISER.x, 7.75, 2.8], [RISER.x, RISER.y, 2.8], [RISER.x, RISER.y, z], [RISER.x, 7.9, z], [3.25, 7.9, z], [3.25, 7.9, top], [3.6, 7.9, top]];
}

/** From level k's board up into the floor tray and along the main run to where the branch leaves it. */
function intoTray(k: number): P3[] {
  const z = trayZ(k) + 0.1;
  const top = k === 0 ? MDB.z[1] : smdb(k).z[1];
  return [[3.6, 7.9, top], [3.6, 7.9, z], [3.6, MAIN.y, z]];
}

/**
 * A route that energy particles follow, one continuous path. Each level's
 * current moves at its own speed, so the network never pulses in step.
 */
export interface Route {
  /** The system it belongs to, for its colour and the views that show it. */
  tone: 'power' | 'lighting' | 'fire';
  d: string;
  /** One trip and the pause after it, in seconds. */
  seconds: number;
  /** Negative, so every particle is already on its way when the page opens. */
  begin: number;
  size: number;
}

/** Screen units per second, and each level's speed against it: TR-03's level (2) runs fastest, level 0 slowest. */
const PARTICLE_SPEED = 105;
const LEVEL_SPEED = [0.8, 1, 1.22, 0.95];
/** Share of the cycle spent travelling; for the rest the particle is gone, then it starts again. */
export const TRAVEL_SHARE = 0.82;

function route(points: P3[], speed: number, seed: number, tone: Route['tone'] = 'power'): Route {
  const clean = dedupe(points);
  const seconds = round2(screenLength(clean) / (PARTICLE_SPEED * speed) / TRAVEL_SHARE);
  return { tone, d: polyline(...clean), seconds, begin: -round2(seconds * scatter(seed)), size: round2(1.7 + scatter(seed + 7) * 0.9) };
}

/** A lighting circuit on level k: along the main tray, then down in conduit to the fitting at (9.8, 2.4). */
function lightingRoute(k: number): P3[] {
  const edge = MAIN.y - MAIN.width / 2;
  return [
    [3.6, edge, trayZ(k)],
    [9.8, edge, trayZ(k)],
    [9.8, edge, lightZ(k)],
    [9.8, 2.65, lightZ(k)],
  ];
}

/** A fire alarm circuit on level k: from the panel up its riser, then along the level past the detectors. */
function fireRoute(k: number): P3[] {
  return [
    [FIRE.x, FIRE.y, FIRE_PANEL.z[1]],
    [FIRE.x, FIRE.y, fireZ(k)],
    [16.8, FIRE.y, fireZ(k)],
    [16.8, 6.2, fireZ(k)],
  ];
}

export const ROUTES: Route[] = [
  route(SUPPLY, 0.9, 1),
  route(SUPPLY, 0.9, 2.5),
  ...levels.flatMap((k) => {
    const z = trayZ(k) + 0.1;
    const lead = [...boardFeed(k), ...intoTray(k)];
    const branch = BRANCHES[0]!;
    return [
      route([...lead, [MAIN.to - 0.2, MAIN.y, z]], LEVEL_SPEED[k]!, 10 + k),
      route([...lead, [branch, MAIN.y, z], [branch, 1.35, z]], LEVEL_SPEED[k]! * 1.08, 20 + k),
      route([...lead, [branch, MAIN.y, z], [branch, 8.65, z]], LEVEL_SPEED[k]! * 0.93, 30 + k),
    ];
  }),
  // Lighting and fire alarm run slower, a few particles each.
  route(lightingRoute(1), 0.55, 40, 'lighting'),
  route(lightingRoute(3), 0.5, 41, 'lighting'),
  route(fireRoute(1), 0.45, 50, 'fire'),
  route(fireRoute(3), 0.42, 51, 'fire'),
];

/** The light that runs up the riser (.b-riser in site.css): a 38-unit dash, a 420-unit gap, 2.8 s per pass, at a steady speed. */
export const RISER_PULSE = { dash: 38, gap: 420, seconds: 2.8 };
const RISER_FOOT = 0.4;
/** Where the riser meets each level, and when the riser's light reaches it, so the joint lights as it passes. */
export const RISER_JUNCTIONS = levels.map((k) => {
  const z = trayZ(k) + 0.1;
  return { at: project([RISER.x, RISER.y, z]), delay: round2((((z - RISER_FOOT) * UNIT) / (RISER_PULSE.dash + RISER_PULSE.gap)) * RISER_PULSE.seconds) };
});

/**
 * The scan: every nine seconds a highlight runs along TR-01, then TR-02, then
 * TR-03, as if the system were being checked tray by tray. `path` is the
 * tray's centre line in the direction the highlight travels; `rails` light up
 * while it passes. Just before, `trace` lights the tray's circuit from the
 * main board: up the riser, through the level's board and along the tray.
 */
export const SCAN_SECONDS = 9;
/** How long the trace takes to reach the tray from the main board, so the scan starts as it arrives (.b-trace in site.css). */
export const TRACE_LEAD = 1.1;
/** The circuit from the main board to level k's tray, then on through `along`. */
const circuitTo = (k: number, ...along: P3[]) => polyline(...dedupe([...boardFeed(k), ...intoTray(k), ...along]));
const branchZ = trayZ(TR02_LEVEL) + 0.1;
export const SCANS: Array<{ id: string; path: string; rails: string; trace: string; delay: number; level: number | null }> = [
  {
    id: 'tr01',
    path: riserLine,
    rails: riserRails.join(''),
    trace: polyline([4.2, 7.75, MDB.z[1]], [4.2, 7.75, 2.8], [RISER.x, 7.75, 2.8], [RISER.x, RISER.y, 2.8], [RISER.x, RISER.y, riserTop]),
    delay: 0,
    level: null,
  },
  {
    id: 'tr02',
    path: polyline([BRANCHES[0]!, MAIN.y - MAIN.width / 2, trayZ(TR02_LEVEL) + 0.12], [BRANCHES[0]!, 1.2, trayZ(TR02_LEVEL) + 0.12]),
    rails: tr02Rails,
    trace: circuitTo(TR02_LEVEL, [BRANCHES[0]!, MAIN.y, branchZ], [BRANCHES[0]!, 1.2, branchZ]),
    delay: 3,
    level: TR02_LEVEL,
  },
  {
    id: 'tr03',
    path: polyline([RISER.x, MAIN.y, trayZ(TR03_LEVEL) + 0.12], [MAIN.to, MAIN.y, trayZ(TR03_LEVEL) + 0.12]),
    rails: tr03Rails,
    trace: circuitTo(TR03_LEVEL, [MAIN.to, MAIN.y, trayZ(TR03_LEVEL) + 0.1]),
    delay: 6,
    level: TR03_LEVEL,
  },
];

/**
 * Indicator lights on the boards' fronts, each blinking at its own rate:
 * three on the main board, one on each sub-main board. `level` places each
 * with its board.
 */
export const BOARD_LIGHTS: Array<{ at: [number, number]; colour: string; seconds: number; level: number }> = [
  { at: project([3.05, MDB.y[1], 1.95]), colour: 'var(--energy)', seconds: 1.1, level: 0 },
  { at: project([3.5, MDB.y[1], 1.95]), colour: 'var(--pass)', seconds: 1.9, level: 0 },
  { at: project([3.95, MDB.y[1], 1.95]), colour: 'var(--accent-ink)', seconds: 2.7, level: 0 },
  ...levels.slice(1).map((k) => ({ at: project([3.25, smdb(k).y[1], smdb(k).z[1] - 0.35]), colour: 'var(--pass)', seconds: 1.5 + k * 0.45, level: k })),
];

/** The fire alarm panel's light: a slow red blink. */
export const FIRE_PANEL_LIGHT = { at: project([6.05, FIRE_PANEL.y[1], 1.45]), colour: 'var(--fail)', seconds: 2.4 };

/**
 * Measurement callouts drawn on the trays, which re-measure every so often:
 * the value counts up and settles on the app's figure. `lines` are the
 * callout's strokes; the text sits at `at`, turned by `angle` degrees.
 */
export interface Measure {
  id: string;
  lines: string;
  text: string;
  at: [number, number];
  angle: number;
  anchor: 'start' | 'middle' | 'end';
  level: number | null;
  /** Seconds into the re-measure cycle. */
  offset: number;
}

const tr03End = MAIN.to;
const zTr03 = trayZ(TR03_LEVEL);
const [sectionA, sectionB] = [MAIN.y - MAIN.width / 2, MAIN.y + MAIN.width / 2];
const tr02 = tray('TR-02');
const tr03 = tray('TR-03');

export const MEASURES: Measure[] = [
  {
    // TR-03's section, end on, with its width dimensioned below it.
    id: 'tr03-section',
    lines: [
      polyline([tr03End, sectionA, zTr03 + 0.24], [tr03End, sectionA, zTr03], [tr03End, sectionB, zTr03], [tr03End, sectionB, zTr03 + 0.24]),
      polyline([tr03End, sectionA, zTr03 - 0.45], [tr03End, sectionB, zTr03 - 0.45]),
      polyline([tr03End, sectionA, zTr03 - 0.3], [tr03End, sectionA, zTr03 - 0.6]),
      polyline([tr03End, sectionB, zTr03 - 0.3], [tr03End, sectionB, zTr03 - 0.6]),
    ].join(''),
    text: `${tr03.selected} mm`,
    // Above the tray's end, clear of TR-03's label below it.
    at: (() => {
      const [x, y] = project([tr03End, MAIN.y, zTr03 + 0.3]);
      return [x + 12, y - 12];
    })(),
    angle: 0,
    anchor: 'start',
    level: TR03_LEVEL,
    offset: 0,
  },
  {
    id: 'tr02-fill',
    lines: polyline([BRANCHES[0]! + 0.45, 2.2, trayZ(TR02_LEVEL)], [BRANCHES[0]! + 1.3, 2.2, trayZ(TR02_LEVEL)]),
    text: `FILL ${tr02.fill}`,
    at: (() => {
      const [x, y] = project([BRANCHES[0]! + 1.4, 2.2, trayZ(TR02_LEVEL)]);
      return [x + 4, y + 4];
    })(),
    angle: 0,
    anchor: 'start',
    level: TR02_LEVEL,
    offset: 3.3,
  },
  {
    id: 'tr01-service',
    lines: '',
    text: tray('TR-01').service.toUpperCase(),
    at: (() => {
      const [x, y] = project([RISER.x, RISER.y + RISER.width / 2, 6.6]);
      return [x - 9, y];
    })(),
    angle: -90,
    anchor: 'middle',
    level: null,
    offset: 6.6,
  },
  {
    id: 'mdb-route',
    lines: '',
    text: 'MDB → TR-01',
    at: (() => {
      const [x, y] = project([3.1, 7.75, 2.8]);
      return [x - 4, y - 8];
    })(),
    angle: 0,
    anchor: 'end',
    level: null,
    offset: 8.1,
  },
];

export const MEASURE_SECONDS = 10;

/** One floor's trays and services, drawn as a group so each level can float on its own. */
export interface Level {
  k: number;
  trayRails: string;
  trayRungs: string;
  /** The example tray on this level, drawn brighter in the cable tray view. */
  highlight: string;
  circuits: string;
  lightingCircuits: string;
  fixtures: string;
  cones: string[];
  /** Connection points: where the circuits enter the main tray and where the branch leaves it. */
  joints: Array<[number, number]>;
  /** This level's fire alarm circuit and its detectors. */
  fireCircuit: string;
  fireDetectors: Array<[number, number]>;
}

const LEVEL_GEOMETRY: Level[] = levels.map((k) => {
  const trays = floorTrays(k);
  const z = trayZ(k) + 0.1;
  return {
    k,
    trayRails: trays.map((t) => t.rails).join(''),
    trayRungs: trays.map((t) => t.rungs).join(''),
    highlight: k === TR03_LEVEL ? tr03Rails : k === TR02_LEVEL ? tr02Rails : '',
    circuits: circuits(k),
    lightingCircuits: lightingCircuits(k),
    fixtures: fixtures(k),
    cones: cones(k),
    joints: [project([3.6, MAIN.y, z]), ...BRANCHES.map((x) => project([x, MAIN.y, z]))],
    fireCircuit: fireCircuit(k),
    fireDetectors: fireDetectors(k),
  };
});

/**
 * What a label points at, highlighted while the label or the part itself is
 * hovered. `level` places it in that level's group, so it floats with it.
 */
export const TARGETS: Array<{ id: string; d: string; level: number | null; kind: 'tray' | 'board' | 'lights' }> = [
  { id: 'tr01', d: riser.rails, level: null, kind: 'tray' },
  { id: 'tr03', d: tr03Rails, level: TR03_LEVEL, kind: 'tray' },
  { id: 'tr02', d: tr02Rails, level: TR02_LEVEL, kind: 'tray' },
  { id: 'mdb', d: boxOutline(MDB), level: null, kind: 'board' },
  { id: 'smdb', d: boxOutline(smdb(3)), level: null, kind: 'board' },
  { id: 'lights', d: `${lightingCircuits(1)}${fixtures(1)}`, level: 1, kind: 'lights' },
];

export const GEOMETRY = {
  ground,
  slabs,
  columns,
  facade,
  riser,
  riserRails,
  riserLine,
  boards,
  mdbOutline: boxOutline(MDB),
  feeders,
  supply: polyline(...SUPPLY),
  firePanel: boxFaces(FIRE_PANEL),
  fireRiser,
  levels: LEVEL_GEOMETRY,
  /** Connection points off the levels: the main board, the riser at each level and each sub-main board. */
  joints: [
    project([4.2, 7.75, MDB.z[1]]),
    project([RISER.x, RISER.y, 2.8]),
    ...levels.slice(1).flatMap((k) => [project([RISER.x, RISER.y, trayZ(k) + 0.1]), project([3.25, 7.9, smdb(k).z[1]])]),
  ],
  /** Centre of the building's footprint on screen, for the ground fade. */
  centre: project([LENGTH / 2, DEPTH / 2, 0]),
};

/**
 * The building in plan, in metres, for the showcase's floor plan: its size,
 * storey height, columns, riser, trays, fittings and boards, as the drawing
 * has them.
 */
export const PLAN = {
  length: LENGTH,
  depth: DEPTH,
  storey: STOREY,
  columns: COLUMNS,
  riser: RISER,
  main: MAIN,
  branches: BRANCHES,
  branchWidth: BRANCH_WIDTH,
  fixtures: FIXTURES,
  mdb: { x: MDB.x, y: MDB.y },
  firePanel: { x: FIRE_PANEL.x, y: FIRE_PANEL.y },
};
