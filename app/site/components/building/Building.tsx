import { motion, type MotionStyle, type TargetAndTransition } from 'framer-motion';
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  BOARD_LIGHTS,
  FIRE_PANEL_LIGHT,
  GEOMETRY,
  LABELS,
  LEVEL_LABELS,
  MEASURE_SECONDS,
  MEASURES,
  RISER_JUNCTIONS,
  ROUTES,
  SCAN_SECONDS,
  SCANS,
  TARGETS,
  TRACE_LEAD,
  TRAVEL_SHARE,
  VIEWBOX,
  labelBox,
  type BuildingLabel,
  type Level,
  type Measure,
} from './geometry';
import { countUp, decode, typeOn, useCycle, useRemeasure, useTelemetry } from './telemetry';
import { useStill } from '../loop';

export type BuildingView = 'all' | 'architecture' | 'trays' | 'power' | 'lighting' | 'fire';

interface Props {
  view: BuildingView;
  /** The drawing's loops run (current, particles, the scan); paused otherwise, and always under reduced motion. */
  flowing: boolean;
  /** What the drawing shows, for screen readers. */
  label: string;
  /** Pointer parallax: the ground, the building and the labels move by different amounts. */
  layers?: { ground?: MotionStyle; building?: MotionStyle; labels?: MotionStyle };
  /** Build itself on load: from the main board level up, then its systems one by one, then the labels as a data feed. */
  entrance?: boolean;
  /** Draw the routes afresh each time the view changes (the showcase); `undefined` until it has scrolled into view. */
  drawKey?: string;
  className?: string;
}

const ease = [0.16, 1, 0.3, 1] as const;

/** The systems in the drawing, each with its own colour and pace. */
export const SYSTEMS = [
  { id: 'power', name: 'Power', colour: 'var(--energy)' },
  { id: 'lighting', name: 'Lighting', colour: 'var(--warn)' },
  { id: 'fire', name: 'Fire alarm', colour: 'var(--fail)' },
] as const;
type Tone = (typeof SYSTEMS)[number]['id'];
const TONE: Record<Tone, string> = { power: 'var(--energy)', lighting: 'var(--warn)', fire: 'var(--fail)' };

/**
 * When each part of the build-up starts, in seconds after load. The columns
 * and the riser rise from the ground while each level slides up in turn, the
 * main board's level first; then power, lighting and fire alarm connect in
 * turn, their routes drawing themselves; the labels follow.
 */
export const BUILD = {
  ground: 0.1,
  columns: 0.3,
  level: (k: number) => 0.35 + k * 0.26,
  facade: 1.5,
  /** Power, lighting, fire alarm. */
  system: (i: number) => 1.3 + i * 0.45,
  label: (i: number) => 1.75 + i * 0.14,
  /** The measurement callouts and particles, once the labels are in. */
  live: 2.6,
};

/**
 * Each level's current has its own pace, so the network never pulses in step:
 * dash speed, packet speed and how fast its brightness drifts, in seconds.
 * Level 2 carries TR-03 and runs fastest; the riser (TR-01) runs slowest.
 */
const LEVEL_PACE = [
  { flow: 1.7, pulse: 3.2, intensity: 5.1 },
  { flow: 1.35, pulse: 2.7, intensity: 4.3 },
  { flow: 1.0, pulse: 2.1, intensity: 3.7 },
  { flow: 1.25, pulse: 2.5, intensity: 4.8 },
];
const RISER_PACE = { flow: 1.9, pulse: 3.4, intensity: 5.6 };
/** Lighting and fire alarm circuits run slower than power, each at its own pace. */
const SYSTEM_PACE: Record<Exclude<Tone, 'power'>, { flow: number; pulse: number; intensity: number }> = {
  lighting: { flow: 2.3, pulse: 3.8, intensity: 6.2 },
  fire: { flow: 3.1, pulse: 4.6, intensity: 7.4 },
};
const pace = (p: { flow: number; pulse: number; intensity: number }) =>
  ({ '--flow-d': `${p.flow}s`, '--pulse-d': `${p.pulse}s`, '--intensity-d': `${p.intensity}s` }) as CSSProperties;

/** Where current runs in each view; elsewhere it is faded out and still. */
const RUNS: Record<BuildingView, readonly string[]> = {
  all: ['feeders', 'circuits', 'riser', 'lcircuits', 'fire'],
  architecture: [],
  trays: ['circuits', 'riser'],
  power: ['feeders', 'circuits', 'riser'],
  lighting: ['lcircuits'],
  fire: ['fire'],
};

/** A route drawing itself: once in the build-up (at `delay`), or each time the showcase's view changes (`key`). */
type Draw = { key?: string; delay: number };

/**
 * A building's electrical services, drawn in isometric projection. It is an
 * illustration of where cable trays run, not a model from the app; the tray
 * labels and their hover details quote the app's results for the example
 * project.
 *
 * Power runs from the main board up the riser and out along each level, each
 * level at its own pace; lighting and fire alarm circuits run on their own.
 * Hovering a label or the part it names highlights both, sets the rest of the
 * drawing back and shows the part's figures.
 */
export function Building({ view, flowing, label, layers = {}, entrance = false, drawKey, className = '' }: Props) {
  const reduce = useStill();
  const build = entrance && !reduce;
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [hover, setHover] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  // The particles move by SVG animation, which the page's pause stops like everything else.
  useEffect(() => {
    const element = svg.current;
    if (!element || typeof element.pauseAnimations !== 'function') return;
    if (flowing) element.unpauseAnimations();
    else element.pauseAnimations();
  }, [flowing]);
  /** Fades and slides a part up into place at `delay`, when the drawing builds itself. */
  const rise = (delay: number, distance = 18) =>
    build ? { initial: { opacity: 0, y: distance }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay, ease } } : {};
  /** Draws a line from its start (the columns and riser start at the bottom). */
  const draw = (delay: number, duration: number) =>
    build ? { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { duration, delay, ease: [0.45, 0, 0.2, 1] as const } } : {};
  /** How a route draws itself: at `delay` in the build-up, or afresh when the showcase changes view, a little after `offset`. */
  const route = (delay: number, offset = 0): Draw | undefined =>
    build ? { delay } : drawKey !== undefined && !reduce ? { key: drawKey, delay: offset } : undefined;
  const runs = (system: string) => RUNS[view].includes(system);
  const { ground, slabs, columns, facade, riser, riserRails, riserLine, boards, mdbOutline, feeders, supply, firePanel, fireRiser, levels, joints, centre } = GEOMETRY;
  /** What hangs off one level (or off none): hover targets, the scan and the measurement callouts. */
  const attached = (level: number | null) => (
    <>
      {TARGETS.filter((t) => t.level === level).map((t) => (
        <Target key={t.id} target={t} on={hover === t.id} onHover={setHover} />
      ))}
      {SCANS.filter((scan) => scan.level === level).map((scan) => (
        <Scan key={scan.id} {...scan} />
      ))}
      <motion.g {...(build ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.5, delay: BUILD.live } } : {})}>
        {MEASURES.filter((m) => m.level === level).map((m) => (
          <Callout key={m.id} measure={m} running={flowing} />
        ))}
      </motion.g>
    </>
  );
  const roof = slabs.length - 1;
  const feedersAt = BUILD.system(0);

  return (
    <svg
      ref={svg}
      viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.width} ${VIEWBOX.height}`}
      className={`bldg block h-auto w-full overflow-visible ${className}`}
      data-view={view}
      data-flow={flowing ? 'on' : 'off'}
      data-focus={hover ?? undefined}
      role="img"
      aria-label={label}
      focusable="false"
    >
      <defs>
        <radialGradient id={`${id}-fade`} gradientUnits="userSpaceOnUse" cx={centre[0]} cy={centre[1]} r="430">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`${id}-ground`}>
          <rect x={VIEWBOX.x} y={VIEWBOX.y} width={VIEWBOX.width} height={VIEWBOX.height} fill={`url(#${id}-fade)`} />
        </mask>
        <linearGradient id={`${id}-cone`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfeaff" stopOpacity="0.2" />
          <stop offset="1" stopColor="#cfeaff" stopOpacity="0" />
        </linearGradient>
        {/* Each particle's tail, in the particle's own frame: it fades out behind it along the route. */}
        {SYSTEMS.map((system) => (
          <linearGradient key={system.id} id={`${id}-tail-${system.id}`} gradientUnits="userSpaceOnUse" x1={-TAIL} y1="0" x2="0" y2="0">
            <stop offset="0" stopColor={system.colour} stopOpacity="0" />
            <stop offset="1" stopColor={system.colour} stopOpacity="0.7" />
          </linearGradient>
        ))}
      </defs>

      <motion.g style={layers.ground}>
        <motion.g {...rise(BUILD.ground, 0)}>
          <g data-sys="ground" mask={`url(#${id}-ground)`}>
            <path d={ground} fill="none" stroke="var(--b-faint)" strokeWidth="0.8" />
          </g>
        </motion.g>
      </motion.g>

      <motion.g style={layers.building}>
        {/* The columns rise from the ground; the facade follows once the frame is up. */}
        <g data-sys="arch">
          {columns.map((d, i) => (
            <motion.path key={i} d={d} fill="none" stroke="var(--b-soft)" strokeWidth="0.9" {...draw(BUILD.columns + (i % 4) * 0.05, 1.3)} />
          ))}
        </g>
        <motion.g {...rise(BUILD.facade, 0)}>
          <g data-sys="facade">
            <path d={facade} fill="none" stroke="var(--b-faint)" strokeWidth="0.8" />
          </g>
          <g data-sys="levels" className="font-mono" fontSize="10" fill="var(--ink-3)">
            {LEVEL_LABELS.map((l) => (
              <text key={l.text} x={l.at[0] - 12} y={l.at[1]} textAnchor="end">
                {l.text}
              </text>
            ))}
          </g>
        </motion.g>

        {/* The riser rises with the columns, then carries the feeders and a running light. */}
        <g data-sys="trays" fill="none" stroke="var(--b-tray)">
          {riserRails.map((d, i) => (
            <motion.path key={i} d={d} strokeWidth="1" {...draw(BUILD.columns + 0.1, 1.2)} />
          ))}
          <motion.path d={riser.rungs} strokeWidth="0.6" strokeOpacity="0.4" {...rise(BUILD.level(1), 0)} />
        </g>
        <g data-sys="hl">
          {riserRails.map((d, i) => (
            <motion.path key={i} d={d} fill="none" stroke="var(--accent-ink)" strokeWidth="1.6" {...draw(BUILD.columns + 0.1, 1.2)} />
          ))}
        </g>
        {/* Power arrives at the main board from outside and leaves it up the riser, once every level's board is in place. */}
        <Current d={supply} sys="feeders" runs={runs('feeders')} pulse style={pace(RISER_PACE)} draw={route(feedersAt)} />
        <Current d={feeders} sys="feeders" runs={runs('feeders')} pulse style={pace(RISER_PACE)} draw={route(feedersAt + 0.15)} />
        <motion.g {...rise(feedersAt + 0.5, 0)}>
          <g data-sys="riserflow" fill="none" strokeLinecap="round">
            <path d={riserLine} className="b-riser b-riser-glow" data-still={runs('riser') ? undefined : ''} strokeWidth="7" />
            <path d={riserLine} className="b-riser" data-still={runs('riser') ? undefined : ''} strokeWidth="2.4" />
            {/* Each level's joint on the riser lights as the riser's light passes it. */}
            {RISER_JUNCTIONS.map((j, k) => (
              <circle key={k} cx={j.at[0]} cy={j.at[1]} r="3.4" className="b-junction" data-still={runs('riser') ? undefined : ''} style={{ animationDelay: `${j.delay}s` }} />
            ))}
          </g>
        </motion.g>

        {/* The fire alarm panel and its own riser, apart from power. */}
        <motion.g {...rise(BUILD.level(0))}>
          <g data-sys="fire">
            <g strokeWidth="0.9" stroke="#ff8f85" strokeLinejoin="round">
              <path d={firePanel.left} fill="#3a1418" />
              <path d={firePanel.right} fill="#2c0f12" />
              <path d={firePanel.top} fill="#4a1c20" />
            </g>
            <StatusLight light={FIRE_PANEL_LIGHT} />
          </g>
        </motion.g>
        <Current d={fireRiser} sys="fire" tone="fire" runs={runs('fire')} style={pace(SYSTEM_PACE.fire)} draw={route(BUILD.system(2), 0.6)} />

        {/* Each level slides up in turn, the main board's first: its floor, its board, then its trays and services. */}
        {levels.map((level) => (
          <motion.g key={level.k} {...rise(BUILD.level(level.k))}>
            <g data-sys="arch">
              <path d={slabs[level.k]} fill="rgba(70, 120, 210, 0.05)" stroke="var(--b-line)" strokeWidth="0.9" strokeLinejoin="round" />
            </g>
            <g data-sys="boards">
              {level.k === 0 && <path d={mdbOutline} className="b-glow" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinejoin="round" />}
              <Board faces={boards[level.k]!} />
              {BOARD_LIGHTS.filter((light) => light.level === level.k).map((light, i) => (
                <StatusLight key={i} light={light} />
              ))}
            </g>
            <LevelGroup level={level} coneFill={`url(#${id}-cone)`} runs={runs} route={route}>
              {attached(level.k)}
            </LevelGroup>
          </motion.g>
        ))}
        <motion.g {...rise(BUILD.level(roof))}>
          <g data-sys="arch">
            <path d={slabs[roof]} fill="rgba(70, 120, 210, 0.05)" stroke="var(--b-line)" strokeWidth="0.9" strokeLinejoin="round" />
          </g>
        </motion.g>

        <motion.g {...rise(feedersAt + 0.3, 0)}>
          <Joints points={joints} />
          {attached(null)}
        </motion.g>
        {!reduce && (
          <motion.g {...(build ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.6, delay: BUILD.live } } : {})}>
            <Particles tails={id} />
          </motion.g>
        )}
      </motion.g>

      <motion.g style={layers.labels}>
        {LABELS.map((l, i) => (
          <Label key={l.id} label={l} on={hover === l.id} onHover={setHover} start={build ? BUILD.label(i) : null} running={flowing} />
        ))}
      </motion.g>
    </svg>
  );
}

/** An indicator light on a board's front, blinking at its own rate. */
function StatusLight({ light }: { light: { at: [number, number]; colour: string; seconds: number } }) {
  return <circle cx={light.at[0]} cy={light.at[1]} r="1.5" fill={light.colour} className="b-led" style={{ animationDuration: `${light.seconds}s` }} />;
}

function Board({ faces }: { faces: { left: string; right: string; top: string } }) {
  return (
    <g strokeWidth="0.9" stroke="#7fb0f5" strokeLinejoin="round">
      <path d={faces.left} fill="#10284d" />
      <path d={faces.right} fill="#0b1d3a" />
      <path d={faces.top} fill="#1a3a6b" />
    </g>
  );
}

/**
 * One floor: its trays, lights and circuits. Power runs at the level's own
 * pace; lighting and fire alarm each at theirs, connecting in turn in the
 * build-up.
 */
function LevelGroup({
  level,
  coneFill,
  runs,
  route,
  children,
}: {
  level: Level;
  coneFill: string;
  runs: (system: string) => boolean;
  route: (delay: number, offset?: number) => Draw | undefined;
  children: ReactNode;
}) {
  const { k } = level;
  return (
    <g style={pace(LEVEL_PACE[k]!)}>
      <g data-sys="cones">
        {level.cones.map((d, i) => (
          <path key={i} d={d} fill={coneFill} />
        ))}
      </g>
      <g data-sys="trays" fill="none" stroke="var(--b-tray)">
        <path d={level.trayRails} strokeWidth="1" />
        <path d={level.trayRungs} strokeWidth="0.6" strokeOpacity="0.4" />
      </g>
      {level.highlight && (
        <g data-sys="hl">
          <path d={level.highlight} fill="none" stroke="var(--accent-ink)" strokeWidth="1.6" />
        </g>
      )}
      <g data-sys="conduits">
        <path d={level.lightingCircuits} fill="none" stroke="var(--b-line)" strokeWidth="0.8" />
      </g>
      <g data-sys="lights">
        <path d={level.fixtures} fill="#cfe8ff" fillOpacity="0.85" stroke="#9cc9ff" strokeWidth="0.5" />
      </g>
      <Current d={level.circuits} sys="circuits" runs={runs('circuits')} draw={route(BUILD.system(0) + 0.3 + k * 0.08)} />
      <Current
        d={level.lightingCircuits}
        sys="lcircuits"
        tone="lighting"
        runs={runs('lcircuits')}
        style={pace(SYSTEM_PACE.lighting)}
        draw={route(BUILD.system(1) + k * 0.08, 0.3)}
      />
      <Current d={level.fireCircuit} sys="fire" tone="fire" runs={runs('fire')} style={pace(SYSTEM_PACE.fire)} draw={route(BUILD.system(2) + 0.2 + k * 0.08, 0.6)} />
      <g data-sys="fire">
        {level.fireDetectors.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.2" fill="#2c0f12" stroke="var(--fail)" strokeWidth="1" />
        ))}
      </g>
      <Joints points={level.joints} offset={k} />
      {children}
    </g>
  );
}

/**
 * A soft glow along the path, with the moving current on top. With `draw`,
 * the route draws itself first and the current starts once it is connected.
 */
function Current({
  d,
  sys,
  runs,
  tone = 'power',
  pulse = false,
  draw,
  style,
}: {
  d: string;
  sys: string;
  runs: boolean;
  tone?: Tone;
  pulse?: boolean;
  draw?: Draw;
  style?: CSSProperties;
}) {
  const still = runs ? undefined : '';
  return (
    <g data-sys={sys} fill="none" strokeLinejoin="round" style={style}>
      <motion.path
        key={draw?.key}
        d={d}
        stroke={TONE[tone]}
        strokeOpacity="0.18"
        strokeWidth="4"
        {...(draw ? { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: 0.6, delay: draw.delay, ease: [0.45, 0, 0.2, 1] } } : {})}
      />
      <motion.g key={`${draw?.key}-current`} {...(draw ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.3, delay: draw.delay + 0.5 } } : {})}>
        <path d={d} className="b-flow" data-tone={tone} data-still={still} strokeWidth="1.5" />
        {pulse && <path d={d} className="b-pulse" data-still={still} strokeWidth="2.6" />}
      </motion.g>
    </g>
  );
}

/** Connection points that pulse now and then, each at its own moment. */
function Joints({ points, offset = 0 }: { points: Array<[number, number]>; offset?: number }) {
  return (
    <g data-sys="joints">
      {points.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="2.2" className="b-ping" style={{ animationDelay: `${-(offset * 1.9 + i * 1.3)}s` }} />
          <circle cx={x} cy={y} r="1.9" fill="var(--energy)" />
        </g>
      ))}
    </g>
  );
}

/** Each system's particles: their colour, and the group that fades them with the view. */
const PARTICLE_TONE = {
  power: { core: '#e6fbff', sys: 'particles' },
  lighting: { core: '#fff1c9', sys: 'lcircuits' },
  fire: { core: '#ffd9d4', sys: 'fire' },
} as const;

/** How far a particle's tail reaches behind it. */
const TAIL = 18;

/**
 * Particles travelling each route: power from the main board up the riser,
 * into a level's board and out along the trays; a few on lighting and fire
 * alarm circuits, slower. Each one is a pulse with a tail that fades behind
 * it, turned to follow its route; it vanishes at the end and starts again.
 * SVG animation, so the page's pause stops it (see Building). `tails` is the
 * prefix of the tails' gradients.
 */
function Particles({ tails }: { tails: string }) {
  const fade = `0;1;1;0;0`;
  const fadeTimes = `0;0.06;${(TRAVEL_SHARE - 0.04).toFixed(2)};${TRAVEL_SHARE};1`;
  return (
    <>
      {(Object.keys(PARTICLE_TONE) as Array<keyof typeof PARTICLE_TONE>).map((tone) => (
        <g key={tone} data-sys={PARTICLE_TONE[tone].sys}>
          {ROUTES.filter((r) => r.tone === tone).map((r, i) => (
            <g key={i} className="b-particle" opacity="0">
              <path d={`M0 ${-r.size}L${-TAIL} 0L0 ${r.size}Z`} fill={`url(#${tails}-tail-${tone})`} />
              <circle r={r.size * 2.4} fill={TONE[tone]} opacity="0.16" />
              <circle r={r.size} fill={PARTICLE_TONE[tone].core} />
              <animateMotion
                dur={`${r.seconds}s`}
                begin={`${r.begin}s`}
                repeatCount="indefinite"
                path={r.d}
                rotate="auto"
                keyPoints="0;1;1"
                keyTimes={`0;${TRAVEL_SHARE};1`}
                calcMode="linear"
              />
              <animate attributeName="opacity" values={fade} keyTimes={fadeTimes} dur={`${r.seconds}s`} begin={`${r.begin}s`} repeatCount="indefinite" />
            </g>
          ))}
        </g>
      ))}
    </>
  );
}

/**
 * The scan passing along one tray: first its circuit lights from the main
 * board, a bright head running ahead; as it arrives, a bright band travels the
 * tray's centre line while its rails light up.
 */
function Scan({ id, path, rails, trace, delay }: { id: string; path: string; rails: string; trace: string; delay: number }) {
  const timing = { animationDelay: `${delay}s`, animationDuration: `${SCAN_SECONDS}s` };
  const traceTiming = { animationDelay: `${delay - TRACE_LEAD}s`, animationDuration: `${SCAN_SECONDS}s` };
  return (
    <g data-sys="scan" data-scan={id}>
      <path d={trace} pathLength={1} className="b-trace b-trace-glow" style={traceTiming} />
      <path d={trace} pathLength={1} className="b-trace" style={traceTiming} />
      <path d={trace} pathLength={1} className="b-trace-head" style={traceTiming} />
      <path d={rails} className="b-scan-lit" style={timing} />
      <path d={path} pathLength={1} className="b-scan-band" style={timing} />
    </g>
  );
}

/** A measurement callout that re-measures now and then: its value counts up and settles on the app's figure. */
function Callout({ measure, running }: { measure: Measure; running: boolean }) {
  const format = /\d/.test(measure.text) ? countUp : decode;
  const text = useRemeasure(measure.text, format, MEASURE_SECONDS, measure.offset, 1.1, running);
  const [x, y] = measure.at;
  return (
    <g data-sys="measure">
      {measure.lines && <path d={measure.lines} fill="none" stroke="var(--energy)" strokeWidth="0.9" />}
      <text
        x={x}
        y={y}
        transform={measure.angle ? `rotate(${measure.angle} ${x} ${y})` : undefined}
        textAnchor={measure.anchor}
        className="font-mono"
        fontSize="9.5"
        letterSpacing="0.06em"
        fill="var(--energy)"
      >
        {text}
      </text>
    </g>
  );
}

/**
 * A tray's fill as a bar across its whole cross-section, with the limit
 * marked; the part past the limit is fainter, as it may not be used. The bar
 * grows on load (at `grow`) and, while the drawing runs, empties and fills
 * again as the scan passes the tray. `top` is the top of its row.
 */
function Meter({
  meter,
  text,
  left,
  top,
  width,
  grow,
  scan,
}: {
  meter: NonNullable<BuildingLabel['meter']>;
  text: string;
  left: number;
  top: number;
  width: number;
  grow: number | null;
  scan?: { delay: number };
}) {
  const [from, to] = [left + 40, left + width - 47];
  const at = (percent: number) => from + ((to - from) * percent) / 100;
  const y = top + 2.5;
  const fillWidth = at(meter.fill) - from;
  return (
    <g data-meter={meter.text}>
      <text x={left + 12} y={top + 7} className="font-mono" fontSize="8.5" letterSpacing="0.08em" fill="var(--ink-3)">
        FILL
      </text>
      <rect x={from} y={y} width={at(meter.limit) - from} height="3" rx="1.5" className="b-meter-room" />
      <rect x={at(meter.limit)} y={y} width={to - at(meter.limit)} height="3" rx="1.5" className="b-meter-past" />
      <motion.rect
        x={from}
        y={y}
        width={fillWidth}
        height="3"
        rx="1.5"
        className="b-meter-fill"
        style={scan ? { animationDelay: `${scan.delay}s`, animationDuration: `${SCAN_SECONDS}s` } : undefined}
        {...(grow !== null ? { initial: { width: 0 }, animate: { width: fillWidth }, transition: { duration: 0.6, delay: grow, ease } } : {})}
      />
      <path d={`M${at(meter.limit)} ${y - 2.5}v8`} className="b-meter-limit" />
      <text x={left + width - 12} y={top + 7} textAnchor="end" className="font-mono" fontSize="9.5" fill="var(--ink-2)">
        {text}
      </text>
    </g>
  );
}

/**
 * The part a label names: highlighted while it or its label is hovered, its
 * outline running like a selection in a model viewer, with a wider invisible
 * edge to hover.
 */
function Target({ target, on, onHover }: { target: (typeof TARGETS)[number]; on: boolean; onHover: (id: string | null) => void }) {
  const hoverable = target.kind !== 'lights';
  return (
    <g>
      <path d={target.d} className="b-target" data-on={on || undefined} data-kind={target.kind} />
      {hoverable && <path d={target.d} className="b-select" data-on={on || undefined} />}
      {hoverable && (
        <path d={target.d} className="b-hit" data-kind={target.kind} onPointerEnter={() => onHover(target.id)} onPointerLeave={() => onHover(null)} />
      )}
    </g>
  );
}

/**
 * A label in the drawing. On load its leader line draws out from the part,
 * the box opens, the title types on and the detail's numbers count up. A
 * tray's label also shows its fill against the limit, which measures afresh
 * each time the scan passes the tray. While hovered, it lists the part's
 * figures below.
 */
function Label({
  label,
  on,
  onHover,
  start,
  running,
}: {
  label: BuildingLabel;
  on: boolean;
  onHover: (id: string | null) => void;
  start: number | null;
  running: boolean;
}) {
  const play = start !== null;
  const t = start ?? 0;
  const title = useTelemetry(label.title, typeOn, t + 0.3, 0.4, play);
  const detail = useTelemetry(label.detail ?? '', countUp, t + 0.4, 0.6, play);
  const fill = useTelemetry(label.meter?.text ?? '', countUp, t + 0.4, 0.6, play);
  const status = useCycle(label.status ?? [], 3.2, running);
  const scan = SCANS.find((s) => s.id === label.id);
  const { meter } = label;

  const [ax, ay] = label.anchor;
  const [ox] = label.offset;
  const { left, top, width, height } = labelBox(label);
  const attach: [number, number] = [ox >= 0 ? left : left + width, top + height / 2];
  // Names are padded to 9 characters of 11 px mono (about 6.7 px each).
  const specWidth = Math.max(width, Math.round(Math.max(...label.specs.map(([, v]) => (9 + v.length) * 6.7)) + 24));
  const specLeft = ox >= 0 ? left : left + width - specWidth;
  const appear = (delay: number, from: TargetAndTransition) => (play ? { initial: from, animate: { opacity: 1, x: 0, scale: 1 }, transition: { duration: 0.3, delay, ease } } : {});

  return (
    <g data-sys="label" data-show={label.show} data-on={on || undefined} onPointerEnter={() => onHover(label.id)} onPointerLeave={() => onHover(null)}>
      <motion.path
        d={`M${ax} ${ay}L${attach[0]} ${attach[1]}`}
        className="b-leader"
        strokeWidth="0.8"
        fill="none"
        {...(play ? { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: 0.3, delay: t, ease } } : {})}
      />
      <motion.g {...appear(t, { opacity: 0 })}>
        <circle cx={ax} cy={ay} r="2.6" className="b-ping" />
      </motion.g>
      <motion.circle cx={ax} cy={ay} r="2.6" fill="var(--energy)" {...appear(t, { opacity: 0, scale: 0 })} />
      <motion.g {...appear(t + 0.2, { opacity: 0, x: ox >= 0 ? -8 : 8 })}>
        <rect
          x={left}
          y={top}
          width={width}
          height={height}
          rx="7"
          className={`b-label-box ${scan ? 'b-label-scan' : ''}`}
          strokeWidth="0.8"
          style={scan ? { animationDelay: `${scan.delay}s`, animationDuration: `${SCAN_SECONDS}s` } : undefined}
        />
        <text x={left + 12} y={top + 19} className="font-mono" fontSize="13.5" fontWeight="600" fill="var(--ink)">
          {title}
        </text>
        {label.detail && (
          <text x={left + 12} y={top + 36} className="font-mono" fontSize="11.5" fill="var(--ink-2)">
            {detail}
          </text>
        )}
        {label.status && (
          <g>
            <circle cx={left + 15} cy={top + 47.5} r="2.4" fill="var(--energy)" className="b-status-dot" />
            <text x={left + 23} y={top + 51} className="font-mono" fontSize="9.5" letterSpacing="0.06em" fill="var(--energy)">
              {status}
            </text>
          </g>
        )}
        {meter && <Meter meter={meter} text={fill} left={left} top={top + 46} width={width} grow={play ? t + 0.4 : null} scan={scan} />}
      </motion.g>
      {/* The part's figures, shown while hovered. */}
      <g className="b-spec">
        <rect x={specLeft} y={top + height + 5} width={specWidth} height={label.specs.length * 17 + 12} rx="7" className="b-spec-box" strokeWidth="0.8" />
        {label.specs.map(([name, value], i) => (
          <text key={name} x={specLeft + 12} y={top + height + 22 + i * 17} className="font-mono" fontSize="11">
            <tspan fill="var(--ink-3)">{name.padEnd(9, ' ')}</tspan>
            <tspan fill="var(--ink)">{value}</tspan>
          </text>
        ))}
      </g>
    </g>
  );
}
