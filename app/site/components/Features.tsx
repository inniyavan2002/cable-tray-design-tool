import { motion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ComponentType, type RefObject } from 'react';
import type { DrawingShape } from '../../src/drawing/sectionGeometry';
import { APP, FILES, T2_DRAWING } from '../data';
import { countUp } from './building/telemetry';
import { MotionButton, useLoopRunning, useStill } from './loop';
import { RoutePulse } from './pulse';
import { SECTION, SectionHeading, Wrap } from './ui';

const { t2, catalog, trays } = APP;
/** Tray T2 of the example project, named TR-02 in it: the tray the workflow follows from start to finish. */
const tray = trays.find((t) => t.name === 'TR-02')!;
const toNumber = (text: string) => Number(text.replace(/[,%]/g, ''));
const ease = [0.16, 1, 0.3, 1] as const;

type State = 'queued' | 'running' | 'done';
interface VizProps {
  state: State;
  still: boolean;
}

interface Stage {
  name: string;
  /** The stage's status while it runs, and once it has. */
  running: string;
  done: string;
  /** How long it runs, in seconds. */
  seconds: number;
  title: string;
  text: string;
  /** A figure from the app, shown when the stage is hovered or focused. */
  detail: string;
  more: string;
  moreLabel: string;
  tint: string;
  Viz: ComponentType<VizProps>;
}

/**
 * The app's workflow for one tray, in the order the app works: the checked
 * catalogue the cables come from, the tray's cables, the calculation, the
 * standard size and its fill, the section drawing and the reports. Every
 * figure is tray TR-02's in the example project, from the app (facts.json).
 */
const STAGES: Stage[] = [
  {
    name: 'Catalogue validation',
    running: 'Validating',
    done: 'Verified',
    seconds: 2.6,
    title: 'Uses checked catalogue data',
    text: `${catalog.rows} rows from ${catalog.manufacturers} manufacturers' catalogues, each checked for impossible diameters and weights and linked to its catalogue page.`,
    detail: `${catalog.checked} checked, ${catalog.needsReview} to review, ${catalog.excluded} excluded`,
    more: '#catalogues',
    moreLabel: 'the catalogues',
    tint: 'bg-[radial-gradient(80%_120%_at_50%_40%,rgba(95,220,155,0.08),transparent_65%)]',
    Viz: CatalogueViz,
  },
  {
    name: 'Cable input',
    running: 'Input',
    done: `${tray.cables} cables`,
    seconds: 2.2,
    title: 'Handles whole projects',
    text: 'Many trays per project, compared side by side. Save a project file to share with colleagues, and undo any change.',
    detail: 'Project files: .ctd.json',
    more: '#screens',
    moreLabel: 'the compare screen',
    tint: 'bg-[radial-gradient(90%_120%_at_50%_0%,rgba(124,176,255,0.12),transparent_65%)]',
    Viz: InputViz,
  },
  {
    name: 'Cable calculation',
    running: 'Calculating',
    done: 'Calculated',
    seconds: 2.2,
    title: 'Shows the calculation',
    text: 'Width, height, fill and every size it tried, the same on screen, in the PDF and in Excel.',
    detail: `Σ π/4 × OD² = ${t2.cableArea} mm²`,
    more: '#method',
    moreLabel: 'the method',
    tint: 'bg-[linear-gradient(160deg,rgba(62,224,255,0.07),transparent_55%)]',
    Viz: CalcViz,
  },
  {
    name: 'Sizing and fill check',
    running: 'Checking',
    done: 'Pass',
    seconds: 4.4,
    title: 'Sizes to your standard trays',
    text: 'Picks the smallest standard size by cross-section that fits the cables and meets the fill limit. When fill fails, it moves up a size and says why.',
    detail: `${t2.firstTry} gave ${t2.firstFill}, so ${t2.selected} was used`,
    more: '#method',
    moreLabel: 'how it sizes a tray',
    tint: 'bg-[radial-gradient(90%_120%_at_85%_0%,rgba(37,99,235,0.2),transparent_60%)]',
    Viz: SizingViz,
  },
  {
    name: 'Drawing',
    running: 'Drawing',
    done: 'Drawn',
    seconds: 2.8,
    title: 'Draws the section to scale',
    text: 'Cables by layer, clearance at both rails, the spare zone and every dimension, saved as PNG or SVG.',
    detail: `Clearance ${t2.clearance}, spare ${t2.spare}`,
    more: '#showcase',
    moreLabel: 'the section of tray TR-03',
    tint: 'bg-[linear-gradient(var(--grid-major)_1px,transparent_1px),linear-gradient(90deg,var(--grid-major)_1px,transparent_1px)] bg-[size:28px_28px]',
    Viz: DrawingViz,
  },
  {
    name: 'PDF and Excel',
    running: 'Generating',
    done: 'Report ready',
    seconds: 2.8,
    title: 'Writes the reports',
    text: 'A PDF with your title block and page numbers, and an Excel workbook where diameters, quantities and weights are numbers you can work with.',
    detail: `The example report runs to ${FILES.reportPages} pages`,
    more: '#download',
    moreLabel: 'the sample reports',
    tint: 'bg-[radial-gradient(90%_120%_at_100%_100%,rgba(37,99,235,0.18),transparent_60%)]',
    Viz: ReportViz,
  },
];
const SECONDS = STAGES.map((s) => s.seconds);
const LAST = STAGES.length - 1;
/** Seconds a result takes to pass along the wire to the next stage, and how long a finished run holds before it starts again. */
const PASS = 0.7;
const HOLD = 4;

/* ------------------------------------------------------------------ run */

interface Run {
  /** How many times the whole workflow has finished. */
  cycle: number;
  /** The stage running: -1 before the first, past the last once all are done. */
  stage: number;
  /** The stage's result is passing along the wire to the next. */
  passing: boolean;
  /** How many times each stage has started, so its drawing plays afresh each time. */
  starts: number[];
}

/**
 * Runs the workflow stage by stage while it is on screen and motion is on:
 * each stage runs, passes its result to the next, and after the last the
 * finished run holds, then starts again. Stages not yet reached in a later
 * run keep showing their last result. Under reduced motion it stays still.
 */
function useRun(running: boolean, still: boolean): Run {
  const [run, setRun] = useState<Run>({ cycle: 0, stage: -1, passing: false, starts: SECONDS.map(() => 0) });
  useEffect(() => {
    if (still || !running) return;
    const begin = (r: Run, stage: number, cycle = r.cycle): Run => ({ cycle, stage, passing: false, starts: r.starts.map((n, i) => (i === stage ? n + 1 : n)) });
    const [wait, next]: [number, (r: Run) => Run] =
      run.stage < 0
        ? [0.8, (r) => begin(r, 0)]
        : run.stage > LAST
          ? [HOLD, (r) => begin(r, 0, r.cycle + 1)]
          : run.passing
            ? [PASS, (r) => begin(r, r.stage + 1)]
            : [SECONDS[run.stage]!, (r) => (r.stage === LAST ? { ...r, stage: LAST + 1 } : { ...r, passing: true })];
    const timer = setTimeout(() => setRun(next), wait * 1000);
    return () => clearTimeout(timer);
  }, [run, running, still]);
  return run;
}

const stateOf = (run: Run, i: number, still: boolean): State => {
  if (still || run.stage > i || (run.stage === i && run.passing)) return 'done';
  if (run.stage === i) return 'running';
  return run.cycle > 0 ? 'done' : 'queued';
};

/* -------------------------------------------------------------- section */

/**
 * The features as the app's workflow for one tray: six stages wired in
 * order, each running in turn and passing its result along the wire to the
 * next, on a slowly drifting drawing sheet. Every stage's drawing shows
 * what that stage does to tray TR-02; hovering a stage lifts it and reveals
 * a little more of its working.
 */
export function Features() {
  const still = useStill();
  const section = useRef<HTMLElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const running = useLoopRunning(section);
  const run = useRun(running, still);
  const complete = still || run.stage > LAST;
  const status = complete ? 'Report ready' : run.stage < 0 ? 'Queued' : `Running ${String(run.stage + 1).padStart(2, '0')} of ${String(STAGES.length).padStart(2, '0')}`;

  return (
    <section ref={section} id="features" aria-labelledby="features-title" data-flow={running ? 'on' : 'off'} className={`${SECTION} isolate overflow-hidden`}>
      <Wrap>
        <SectionHeading id="features-title" intro="Every figure on this page comes from the app's own calculation of its example project.">
          From cable list to checked report
        </SectionHeading>
        <div className="relative mt-12 rounded-[14px] border border-line-2 bg-bg/60 p-3 md:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 md:mb-5">
            <p className="font-mono text-[11.5px] tracking-[0.08em] text-ink-2 uppercase">
              Engineering workflow <span className="text-ink-3">· {tray.name} {tray.service}</span>
            </p>
            <div className="flex items-center gap-3">
              <p aria-hidden="true" data-run={status} className="inline-flex items-center gap-2 font-mono text-[11.5px] tracking-[0.08em] text-ink-3 uppercase">
                <span className={`h-1.5 w-1.5 rounded-full ${complete ? 'bg-pass' : run.stage < 0 ? 'bg-line-3' : 'fw-led bg-energy'}`} />
                {status}
              </p>
              <MotionButton id="features-motion" />
            </div>
          </div>
          <div ref={grid} className="relative grid gap-7 md:grid-cols-2 lg:grid-cols-3">
            <Wires
              grid={grid}
              lit={STAGES.slice(1).map((_, i) => still || run.stage > i || (run.stage === i && run.passing))}
              passing={!still && run.passing ? run.stage : -1}
              running={running}
              still={still}
            />
            {STAGES.map((stage, i) => (
              <StageCard key={stage.name} stage={stage} index={i} state={stateOf(run, i, still)} start={run.starts[i]!} still={still} />
            ))}
          </div>
        </div>
      </Wrap>
    </section>
  );
}

function StageCard({ stage, index, state, start, still }: { stage: Stage; index: number; state: State; start: number; still: boolean }) {
  const { Viz } = stage;
  const label = state === 'running' ? stage.running : state === 'done' ? stage.done : 'Queued';
  return (
    <motion.article
      data-stage={index + 1}
      data-state={state}
      className="fw-stage group relative flex flex-col overflow-hidden rounded-[14px] border border-line-2 bg-surface hover:-translate-y-1 hover:border-accent/50 hover:shadow-[0_0_0_1px_rgba(124,176,255,0.18),0_24px_48px_-24px_rgba(37,99,235,0.6)] focus-within:border-accent/50 motion-safe:transition-[translate,border-color,box-shadow] motion-safe:duration-300"
      {...(still ? {} : { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.2 }, transition: { duration: 0.6, delay: (index % 3) * 0.1, ease } })}
    >
      <div aria-hidden="true" className={`fw-viz relative h-[168px] border-b border-line ${stage.tint}`}>
        <Viz key={start} state={state} still={still} />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5 md:p-6">
        <p aria-hidden="true" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 font-mono text-[11px] tracking-[0.08em] uppercase">
          <span className="text-ink-3">
            {String(index + 1).padStart(2, '0')} {stage.name}
          </span>
          <span
            data-status={label}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 motion-safe:transition-colors motion-safe:duration-300 ${
              state === 'running' ? 'border-energy/40 text-energy' : state === 'done' ? 'border-pass/30 text-pass' : 'border-line-2 text-ink-3'
            }`}
          >
            {state === 'done' ? <Check className="h-3 w-3" strokeWidth={3} /> : <span className={`h-1.5 w-1.5 rounded-full ${state === 'running' ? 'fw-led bg-energy' : 'bg-line-3'}`} />}
            {label}
          </span>
        </p>
        <h3 className="text-[18px] leading-snug font-semibold">{stage.title}</h3>
        <p className="text-[15px] text-ink-2">{stage.text}</p>
        <p className="font-mono text-[12.5px] text-accent-ink [@media(hover:hover)]:translate-y-1 [@media(hover:hover)]:opacity-0 group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 motion-safe:transition-[opacity,transform] motion-safe:duration-300">
          {stage.detail}
        </p>
        <a href={stage.more} className="mt-auto inline-flex items-center gap-1.5 self-start pt-2 text-[14px] font-semibold text-accent-ink no-underline hover:underline">
          Learn more<span className="sr-only">: {stage.moreLabel}</span>
          <ArrowRight className="h-4 w-4 motion-safe:transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </a>
      </div>
    </motion.article>
  );
}

/* ---------------------------------------------------------------- wires */

type Point = readonly [number, number];
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
/** Where a wire leaves and enters a stage: level with the middle of its drawing (168 px tall). */
const PORT = 84;

/** The wire from one stage to the next: across to the next in a row; down to the one below; or back along the gap between rows to the start of the next. */
function wire(a: Box, b: Box): Point[] {
  if (Math.abs(a.top - b.top) < 2 && b.left >= a.right) {
    return [
      [a.right, a.top + PORT],
      [b.left, b.top + PORT],
    ];
  }
  const ax = (a.left + a.right) / 2;
  const bx = (b.left + b.right) / 2;
  if (Math.abs(ax - bx) < 2) {
    return [
      [ax, a.bottom],
      [bx, b.top],
    ];
  }
  const mid = (a.bottom + b.top) / 2;
  return [
    [ax, a.bottom],
    [ax, mid],
    [bx, mid],
    [bx, b.top],
  ];
}

const pathOf = (points: readonly Point[]) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`).join('');

/** Statuses beside the stages they describe, outside the panel. */
const TAGS: Array<{ stage: number; text: string; tone: 'pass' | 'energy' }> = [
  { stage: 0, text: 'Checked', tone: 'pass' },
  { stage: 2, text: 'Calculating', tone: 'energy' },
  { stage: 3, text: 'Verified', tone: 'pass' },
  { stage: 5, text: 'Report ready', tone: 'pass' },
];

interface System {
  wires: Point[][];
  /** The drawing frame around the panel, and its zone ticks, where there is room. */
  frame: Box | null;
  /** The catalogue's rows coming in to the first stage, and the reports going out of the last. */
  input: Point[] | null;
  output: Point[] | null;
  tags: Array<{ at: Point; side: 1 | -1; text: string; tone: 'pass' | 'energy' }>;
}

/**
 * The wires between the stages, and around the panel the system they are
 * part of: a drawing frame with its zone ticks, the catalogue's rows coming
 * in to the first stage and the reports going out of the last, and faint
 * statuses beside the stages they describe. All of it is laid out from where
 * the stages are. A wire lights as a stage passes its result along it, a
 * spark running ahead, and the light stays until the run starts again;
 * slower pulses keep travelling the longer runs while the section is on
 * screen.
 */
function Wires({ grid, lit, passing, running, still }: { grid: RefObject<HTMLDivElement | null>; lit: boolean[]; passing: number; running: boolean; still: boolean }) {
  const [system, setSystem] = useState<System>({ wires: [], frame: null, input: null, output: null, tags: [] });
  useEffect(() => {
    const element = grid.current;
    const panel = element?.parentElement;
    const section = element?.closest('section');
    if (!element || !panel || !section) return;
    const measure = () => {
      const boxes = [...element.querySelectorAll<HTMLElement>(':scope > article')].map((c) => ({ left: c.offsetLeft, top: c.offsetTop, right: c.offsetLeft + c.offsetWidth, bottom: c.offsetTop + c.offsetHeight }));
      const wires = boxes.slice(1).map((b, i) => wire(boxes[i]!, b));
      const [g, sr] = [element.getBoundingClientRect(), section.getBoundingClientRect()];
      const edges = { left: sr.left - g.left, right: sr.right - g.left };
      const box = { left: -element.offsetLeft, top: -element.offsetTop, right: panel.offsetWidth - element.offsetLeft, bottom: panel.offsetHeight - element.offsetTop };
      const frame = { left: box.left - 16, top: box.top - 16, right: box.right + 16, bottom: box.bottom + 16 };
      const room = Math.min(frame.left - edges.left, edges.right - frame.right);
      // Stages side by side: the first starts a row on the left, the last ends one on the right.
      const first = boxes[0];
      const last = boxes[boxes.length - 1];
      const sideBySide = !!first && !!last && last.right > first.right + 10;
      const onLeft = (b: Box) => b.left - box.left < 40;
      setSystem({
        wires,
        frame: room >= 28 ? frame : null,
        input: sideBySide ? [[edges.left, first.top + PORT], [first.left, first.top + PORT]] : null,
        output: sideBySide ? [[last.right, last.top + PORT], [edges.right, last.top + PORT]] : null,
        tags:
          sideBySide && room >= 130
            ? TAGS.filter((t) => boxes[t.stage]).map((t) => {
                const b = boxes[t.stage]!;
                const side = onLeft(b) ? -1 : 1;
                return { at: [side < 0 ? frame.left - 12 : frame.right + 12, b.top + PORT - 9], side, text: t.text, tone: t.tone };
              })
            : [],
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(section);
    measure();
    return () => observer.disconnect();
  }, [grid]);
  const { wires, frame, input, output, tags } = system;
  // Slow pulses on the runs long enough to show them: the routes in and out, and the wires that wrap to the next row.
  const flows = [
    ...(input ? [{ tone: 'power' as const, points: input, seconds: 7, edges: [true, false] as const }] : []),
    ...wires.filter((w) => w.length > 2).map((points) => ({ tone: 'power' as const, points, seconds: 6 })),
    ...(output ? [{ tone: 'power' as const, points: output, seconds: 7, edges: [false, true] as const }] : []),
  ];
  return (
    <>
      <svg aria-hidden="true" focusable="false" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {frame && (
          <g className="fw-frame">
            <rect x={frame.left} y={frame.top} width={frame.right - frame.left} height={frame.bottom - frame.top} />
            {/* Zone ticks along the top and the left, a longer one and a letter or number every fifth. */}
            {Array.from({ length: Math.floor((frame.right - frame.left) / 28) }, (_, i) => (
              <path key={`x${i}`} d={`M${frame.left + 28 * (i + 1)} ${frame.top}v${i % 5 === 4 ? -7 : -4}`} />
            ))}
            {Array.from({ length: Math.floor((frame.bottom - frame.top) / 28) }, (_, i) => (
              <path key={`y${i}`} d={`M${frame.left} ${frame.top + 28 * (i + 1)}h${i % 5 === 4 ? -7 : -4}`} />
            ))}
            {Array.from({ length: Math.floor((frame.right - frame.left) / 140) }, (_, i) => (
              <text key={`a${i}`} x={frame.left + 140 * i + 70} y={frame.top - 8} textAnchor="middle">
                {String.fromCharCode(65 + i)}
              </text>
            ))}
            {Array.from({ length: Math.floor((frame.bottom - frame.top) / 140) }, (_, i) => (
              <text key={`n${i}`} x={frame.left - 10} y={frame.top + 140 * i + 73} textAnchor="end">
                {i + 1}
              </text>
            ))}
          </g>
        )}
        {[input, output].map(
          (route, i) =>
            route && (
              <g key={i}>
                <path d={pathOf(route)} className="fw-route" />
                {frame && <circle cx={i ? frame.right : frame.left} cy={route[0]![1]} r="2.5" className="fw-port" data-lit />}
              </g>
            ),
        )}
        {tags.map((t) => (
          <g key={t.text} className="fw-status" data-tone={t.tone}>
            <circle cx={t.at[0] + (t.side < 0 ? -3 : 3)} cy={t.at[1] - 3} r="2.5" />
            <text x={t.at[0] + (t.side < 0 ? -10 : 10)} y={t.at[1]} textAnchor={t.side < 0 ? 'end' : 'start'}>
              {t.text}
            </text>
          </g>
        ))}
        {wires.map((points, i) => {
          const on = lit[i] || undefined;
          return (
            <g key={i}>
              <path d={pathOf(points)} className="fw-wire" />
              <path d={pathOf(points)} pathLength={1} className="fw-wire-lit" data-lit={on} />
              <circle cx={points[0]![0]} cy={points[0]![1]} r="3" className="fw-port" data-lit={on} />
              <circle cx={points[points.length - 1]![0]} cy={points[points.length - 1]![1]} r="3" className="fw-port" data-lit={on} />
            </g>
          );
        })}
      </svg>
      {!still && flows.map((f, i) => <RoutePulse key={`${i}-${f.points.length}`} route={f} lead={(i * 0.37) % 1} running={running} />)}
      {passing >= 0 && wires[passing] && <Spark key={passing} points={wires[passing]!} />}
    </>
  );
}

/** The spark carrying a result along a wire: moved by transform alone, so nothing repaints. */
function Spark({ points }: { points: Point[] }) {
  const mark = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = mark.current;
    if (!element) return;
    const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1]));
    const total = lengths.reduce((a, b) => a + b, 0);
    let done = 0;
    const frames: Keyframe[] = points.map(([x, y], i) => {
      if (i > 0) done += lengths[i - 1]!;
      return { offset: total ? done / total : 0, transform: `translate(${x}px, ${y}px)` };
    });
    const move = element.animate(frames, { duration: PASS * 1000, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' });
    return () => move.cancel();
  }, [points]);
  return <span ref={mark} aria-hidden="true" className="fw-spark" />;
}

/* ---------------------------------------------------------- the drawings */

/**
 * Seconds since the stage started running, frame by frame, up to `length`:
 * 0 while it waits for its first run, and `length` once it has run (or when
 * nothing moves), so its drawing shows the result.
 */
function useStageClock(state: State, still: boolean, length: number): number {
  const live = state === 'running' && !still;
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!live) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(length, (now - start) / 1000);
      setElapsed(t);
      if (t < length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [live, length]);
  return state === 'queued' ? 0 : live ? elapsed : length;
}

/** How far through the span from `from` to `to` seconds the clock is, from 0 to 1. */
const span = (t: number, from: number, to: number) => Math.min(1, Math.max(0, (t - from) / (to - from)));
const easeOut = (p: number) => 1 - (1 - p) ** 3;
const easeInOut = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const VIEWBOX = '0 0 320 168';

/** The verified catalogue at the centre, each manufacturer's rows flowing into it and the ring closing as they are checked. */
const CORE = { x: 160, y: 56, r: 27 };
const BRANDS = catalog.brands.map((b, i) => {
  const left = i < 5;
  const x = left ? 48 : 272;
  const y = left ? 16 + i * 20 : 26 + (i - 5) * 20;
  const angle = Math.atan2(y - CORE.y, x - CORE.x);
  const [checked, review, excluded] = [b.checked, b.needsReview, b.excluded].map(toNumber) as [number, number, number];
  // Each manufacturer's light shows how most of its rows came out.
  const tone = checked >= review && checked >= excluded ? 'var(--pass)' : review >= excluded ? 'var(--warn)' : 'var(--fail)';
  return { name: b.name.split(' ')[0]!, left, x, y, edge: [CORE.x + Math.cos(angle) * CORE.r, CORE.y + Math.sin(angle) * CORE.r] as const, tone };
});

function CatalogueViz({ state, still }: VizProps) {
  const t = useStageClock(state, still, 2.6);
  const checked = easeOut(span(t, 0.2, 2.4));
  const total = toNumber(catalog.rows);
  const parts = [
    { n: catalog.checked, label: 'checked', colour: 'var(--pass)' },
    { n: catalog.needsReview, label: 'to review', colour: 'var(--warn)' },
    { n: catalog.excluded, label: 'excluded', colour: 'var(--fail)' },
  ];
  let x = 36;
  return (
    <svg viewBox={VIEWBOX} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
      {BRANDS.map((brand, i) => {
        const sent = 0.15 + i * 0.18;
        return (
          <g key={brand.name}>
            <line x1={brand.x} y1={brand.y} x2={brand.edge[0]} y2={brand.edge[1]} stroke="var(--line-2)" />
            {[0, 0.25].map((lag) => {
              const p = span(t, sent + lag, sent + lag + 0.7);
              return p > 0 && p < 1 ? <circle key={lag} cx={lerp(brand.x, brand.edge[0], p)} cy={lerp(brand.y, brand.edge[1], p)} r="1.8" fill="var(--energy)" /> : null;
            })}
            <circle cx={brand.x} cy={brand.y} r="3.4" fill={t >= sent + 0.95 ? brand.tone : 'var(--line-3)'} />
            <text className="fw-hover font-mono" x={brand.left ? brand.x - 7 : brand.x + 7} y={brand.y + 3} textAnchor={brand.left ? 'end' : 'start'} fontSize="8" fill="var(--ink-2)">
              {brand.name}
            </text>
          </g>
        );
      })}
      <circle cx={CORE.x} cy={CORE.y} r={CORE.r} fill="var(--surface-2)" stroke="var(--line-3)" />
      <circle cx={CORE.x} cy={CORE.y} r={CORE.r} fill="none" stroke="var(--pass)" strokeWidth="2" pathLength={1} strokeDasharray={`${checked} 1`} transform={`rotate(-90 ${CORE.x} ${CORE.y})`} />
      <text x={CORE.x} y={CORE.y + 2} textAnchor="middle" className="font-mono" fontSize="12" fontWeight="600" fill="var(--ink)">
        {countUp(catalog.rows, checked)}
      </text>
      <text x={CORE.x} y={CORE.y + 13} textAnchor="middle" className="font-mono" fontSize="7.5" letterSpacing="0.1em" fill="var(--ink-3)">
        ROWS
      </text>
      <text x={CORE.x} y="100" textAnchor="middle" className="font-mono" fontSize="8.5" letterSpacing="0.12em" fill="var(--accent-ink)">
        VERIFIED CATALOGUE
      </text>
      <rect x="36" y="110" width="248" height="7" rx="3.5" fill="var(--line)" />
      {parts.map((p) => {
        const w = (toNumber(p.n) / total) * 248;
        const segment = <rect key={p.label} x={x} y="110" width={Math.max(w * checked - 2, 0)} height="7" fill={p.colour} />;
        x += w;
        return segment;
      })}
      {parts.map((p, i) => (
        <g key={p.label} opacity={checked > 0 ? 1 : 0.4}>
          <circle cx={[40, 132, 222][i]} cy="137" r="3" fill={p.colour} />
          <text x={[47, 139, 229][i]} y="140" className="font-mono" fontSize="9" fill="var(--ink-2)">
            {countUp(p.n, checked)} {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Tray TR-02's cables, as the app lists them: "12 × Ø23.5" and so on. */
const CABLE_GROUPS = t2.cables.split(' + ').map((text) => {
  const [count, od] = text.split(' × Ø').map(Number) as [number, number];
  return { text, count, od };
});

/** The project's trays, and TR-02's cables coming in one by one from the checked catalogue. */
function InputViz({ state, still }: VizProps) {
  const t = useStageClock(state, still, 2.2);
  const on = state !== 'queued';
  const step = 0.065;
  const laid = (k: number) => easeOut(span(t, 0.45 + k * step, 0.75 + k * step));
  const count = countUp(tray.cables, span(t, 0.45, 0.75 + toNumber(tray.cables) * step));
  const inflow = span(t, 0.1, 0.5);
  let k = 0;
  return (
    <svg viewBox={VIEWBOX} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
      <text x="20" y="28" className="font-mono" fontSize="8.5" letterSpacing="0.1em" fill="var(--ink-3)">
        EXAMPLE PROJECT
      </text>
      {trays.map((tr, i) => {
        const y = 52 + i * 26;
        const active = tr.name === tray.name;
        return (
          <g key={tr.name}>
            {active && <rect x="14" y={y - 14} width="80" height="20" rx="4" fill="var(--accent-soft)" stroke="var(--accent)" strokeOpacity={on ? 0.7 : 0.3} />}
            <path d={`M22 ${y - 9}v7h12v-7`} fill="none" stroke={active ? 'var(--accent-ink)' : 'var(--ink-3)'} strokeWidth="1.4" />
            <text x="40" y={y} className="font-mono" fontSize="10.5" fontWeight={active ? 600 : 400} fill={active ? 'var(--ink)' : 'var(--ink-2)'}>
              {tr.name}
            </text>
            {/* On hover: each tray's fill against its limit, side by side. */}
            <g className="fw-hover">
              <rect x="40" y={y + 5} width="44" height="2" fill="var(--line-2)" />
              <rect x="40" y={y + 5} width={(44 * toNumber(tr.fill)) / toNumber(tr.maxFill)} height="2" fill="var(--pass)" />
            </g>
          </g>
        );
      })}
      <path d="M94 74H114m-4 -3l4 3-4 3" fill="none" stroke={on ? 'var(--accent-ink)' : 'var(--line-3)'} strokeWidth="1.2" />
      {inflow > 0 && inflow < 1 && <circle cx={lerp(94, 114, inflow)} cy="74" r="2" fill="var(--energy)" />}
      <rect x="118" y="16" width="186" height="132" rx="6" fill="rgba(6,13,25,0.5)" stroke="var(--line-2)" />
      <text x="128" y="33" className="font-mono" fontSize="8.5" letterSpacing="0.1em" fill="var(--ink-3)">
        {tray.name} CABLES
      </text>
      <text x="294" y="34" textAnchor="end" className="font-mono" fontSize="12" fontWeight="600" fill="var(--ink)">
        {count}
      </text>
      {CABLE_GROUPS.map((group, gi) => {
        const r = group.od * 0.19;
        const y = 56 + gi * 44;
        return (
          <g key={group.text}>
            <text x="128" y={y} className="font-mono" fontSize="9.5" fill="var(--ink-2)">
              {group.text}
            </text>
            {Array.from({ length: group.count }, (_, i) => {
              const p = laid(k++);
              return <circle key={i} cx={130 + r + i * (2 * r + 1.4)} cy={y + 15 - (1 - p) * 8} r={r} opacity={p} fill={`var(--cab-${gi + 1})`} stroke="var(--cab-stroke)" strokeWidth="0.6" />;
            })}
          </g>
        );
      })}
    </svg>
  );
}

/** The calculation written out line by line, each value counting up to the app's figure as the cursor reaches it. */
const CALC: Array<[string, string]> = [
  ['cables', t2.cables],
  ['layers', t2.layers],
  ['Σ π/4 × OD²', `${t2.cableArea} mm²`],
  ['required W × H', t2.required],
];

function CalcViz({ state, still }: VizProps) {
  const t = useStageClock(state, still, 2.2);
  const at = (i: number) => 0.15 + i * 0.45;
  const cursor = state === 'running' && !still && t < 2 ? Math.min(CALC.length - 1, Math.floor((t - 0.15) / 0.45)) : -1;
  return (
    <svg viewBox={VIEWBOX} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
      {cursor >= 0 && <rect x="18" y={14 + cursor * 30} width="284" height="24" rx="4" fill="var(--accent-soft)" />}
      {CALC.map(([name, value], i) => {
        const p = span(t, at(i), at(i) + 0.55);
        const y = 30 + i * 30;
        return (
          <g key={name} opacity={Math.min(1, p * 3)}>
            <text x="28" y={y} className="font-mono" fontSize="11.5" fill="var(--ink-3)">
              {name}
            </text>
            <text x="292" y={y} textAnchor="end" className="font-mono" fontSize="12.5" fontWeight="600" fill={i === CALC.length - 1 ? 'var(--accent-ink)' : 'var(--ink)'}>
              {countUp(value, easeOut(p))}
            </text>
            <line x1="28" x2="292" y1={y + 9} y2={y + 9} stroke="var(--line-2)" />
          </g>
        );
      })}
      <text className="fw-hover font-mono" x="28" y="156" fontSize="9" fill="var(--accent-ink)">
        fill = Σ π/4 × OD² ÷ (tray width × tray height)
      </text>
    </svg>
  );
}

type Cable = Extract<DrawingShape, { kind: 'cable' }>;
/** TR-02's cables as the app lays them in its section, bottom layer first, left to right. */
const T2_CABLES = T2_DRAWING.shapes.filter((s): s is Cable => s.kind === 'cable').sort((a, b) => b.cy - a.cy || a.cx - b.cx);
const [TRAY_W, FIRST_H] = t2.firstTry.split(' × ').map(Number) as [number, number];
const SELECTED_H = Number(t2.selected.split(' × ')[1]);
/** The drawing's rail ("M0 0 V<height> H<width> V0"): the tray's selected size in the drawing's own units. */
const RAIL = T2_DRAWING.shapes.find((s): s is Extract<DrawingShape, { kind: 'rail' }> => s.kind === 'rail')!;
const [, RAIL_H, RAIL_W] = RAIL.d.match(/V([\d.]+)\s*H([\d.]+)/)!.map(Number) as [number, number, number];
const UNITS_PER_MM = RAIL_W / TRAY_W;

/**
 * The smallest standard size that fits takes the cables, drawn to scale as
 * the app lays them; the fill climbs past the limit, the tray moves up to
 * the next size, and the fill settles under the limit.
 */
function SizingViz({ state, still }: VizProps) {
  const t = useStageClock(state, still, 4.4);
  const [first, selected, limit] = [t2.firstFill, t2.selectedFill, t2.maxFill].map(toNumber) as [number, number, number];
  const rising = easeOut(span(t, 0.35, 1.9));
  const grow = easeInOut(span(t, 2.1, 2.6));
  const settling = easeInOut(span(t, 2.75, 3.8));
  const fill = t < 2.75 ? first * rising : lerp(first, selected, settling);
  const passed = t >= 3.8;
  const next = !passed && t >= 2.1 && t < 2.75;
  const over = !passed && !next && fill > limit;
  const caption = passed ? 'PASS, UNDER THE LIMIT' : next ? 'NEXT STANDARD SIZE' : over ? 'OVER THE LIMIT' : t < 0.35 ? 'SMALLEST THAT FITS' : 'CHECKING FILL';
  const tone = over ? 'var(--fail)' : passed ? 'var(--pass)' : next ? 'var(--warn)' : 'var(--accent-ink)';
  const shown = passed ? t2.selectedFill : rising === 1 && t < 2.75 ? t2.firstFill : `${fill.toFixed(1)}%`;
  const heightMm = lerp(FIRST_H, SELECTED_H, grow);
  // The tray, 132 units wide, standing on y = 112.
  const [x0, base, width] = [22, 112, 132];
  const scale = width / RAIL_W;
  const h = heightMm * UNITS_PER_MM;
  const gauge = { x: 178, w: 120, y: 84 };
  const limitX = gauge.x + (gauge.w * limit) / 100;
  const requiredMm = t2.required.split(' × ').map((v) => parseFloat(v)) as [number, number];
  return (
    <svg viewBox={VIEWBOX} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
      <text x={x0} y="34" className="font-mono" fontSize="8.5" letterSpacing="0.1em" fill="var(--ink-3)">
        STANDARD TRAY
      </text>
      <text x={x0} y="52" className="font-mono" fontSize="13" fontWeight="600" fill="var(--ink)">
        {grow < 0.5 ? t2.firstTry : t2.selected}
      </text>
      <g transform={`translate(${x0} ${base}) scale(${scale}) translate(0 ${-RAIL_H})`}>
        {T2_CABLES.map((c, i) => (
          <circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill={`var(--cab-${c.colourIndex + 1})`} opacity={state === 'queued' ? 0.35 : 0.9} />
        ))}
        <path d={`M0 ${RAIL_H - h}V${RAIL_H}H${RAIL_W}V${RAIL_H - h}`} fill="none" stroke={over ? 'var(--fail)' : 'var(--ink-2)'} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </g>
      <text x={x0} y="138" className="font-mono" fontSize="8.5" fill="var(--ink-3)">
        required {t2.required}
      </text>
      {/* On hover: the tray's width and height, and the space the cables need, dashed. */}
      <g className="fw-hover" fill="none" stroke="var(--ink-2)" strokeWidth="0.8">
        <rect
          x={x0 + (width - (width * requiredMm[0]) / TRAY_W) / 2}
          y={base - (width * requiredMm[1]) / TRAY_W}
          width={(width * requiredMm[0]) / TRAY_W}
          height={(width * requiredMm[1]) / TRAY_W}
          stroke="var(--req-line)"
          strokeDasharray="3 2"
        />
        <path d={`M${x0} ${base + 7}h${width}M${x0} ${base + 4}v6M${x0 + width} ${base + 4}v6`} />
        <path d={`M${x0 + width + 7} ${base}v${-h * scale}M${x0 + width + 4} ${base}h6M${x0 + width + 4} ${base - h * scale}h6`} />
        <text x={x0 + width + 12} y={base - (h * scale) / 2 + 3} className="font-mono" fontSize="8" fill="var(--ink-2)" stroke="none">
          {Math.round(heightMm)}
        </text>
      </g>
      <text x={gauge.x} y="34" className="font-mono" fontSize="8.5" letterSpacing="0.1em" fill="var(--ink-3)">
        FILL
      </text>
      <text x={gauge.x + gauge.w} y="56" textAnchor="end" className="font-mono" fontSize="20" fontWeight="600" fill={tone}>
        {shown}
      </text>
      <rect x={gauge.x} y={gauge.y} width={gauge.w} height="8" rx="4" fill="var(--line-2)" />
      <rect x={gauge.x} y={gauge.y} width={(gauge.w * Math.min(fill, 100)) / 100} height="8" rx="4" fill={tone} />
      <line x1={limitX} x2={limitX} y1={gauge.y - 9} y2={gauge.y + 15} stroke="var(--warn)" strokeDasharray="3 3" strokeWidth="1.2" />
      <text x={limitX} y={gauge.y - 13} textAnchor="middle" className="font-mono" fontSize="8.5" fill="var(--warn)">
        limit {t2.maxFill}
      </text>
      <text x={gauge.x} y="120" className="font-mono" fontSize="8.5" letterSpacing="0.1em" fill={tone}>
        {caption}
      </text>
    </svg>
  );
}

/** TR-02's section as the app draws it: the rail, then the cables laid bottom layer first, then its zones and dimensions. */
function DrawingViz({ state, still }: VizProps) {
  const t = useStageClock(state, still, 2.8);
  const hatch = `hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { viewBox, shapes } = T2_DRAWING;
  const order = new Map(T2_CABLES.map((c, i) => [c, i]));
  const rail = span(t, 0, 0.4);
  const zones = span(t, 1.75, 2.2);
  const dims = easeOut(span(t, 1.9, 2.6));
  return (
    <svg viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`} className="absolute inset-x-3 inset-y-2 h-[calc(100%-16px)] w-[calc(100%-24px)]" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id={hatch} patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="10" stroke="var(--hatch)" strokeWidth="2" />
        </pattern>
      </defs>
      {shapes.map((shape, i) => {
        switch (shape.kind) {
          case 'zone':
            return <rect key={i} x={shape.x} y={shape.y} width={shape.width} height={shape.height} fill={shape.role === 'clearance' ? `url(#${hatch})` : 'var(--zone-spare)'} opacity={zones} />;
          case 'rail':
            return <path key={i} d={shape.d} fill="none" stroke="var(--ink)" strokeWidth="6" pathLength={1} strokeDasharray={`${rail} 1`} />;
          case 'cable': {
            const p = span(t, 0.3 + (order.get(shape) ?? 0) * 0.07, 0.65 + (order.get(shape) ?? 0) * 0.07);
            // A little overshoot as each cable settles.
            const drop = (1 - p) * -60 + Math.sin(p * Math.PI) * 4;
            return (
              <g key={i} transform={`translate(0 ${drop})`} opacity={Math.min(1, p * 2)}>
                <circle cx={shape.cx} cy={shape.cy} r={shape.r} fill={`var(--cab-${shape.colourIndex + 1})`} stroke="var(--cab-stroke)" strokeWidth="2" />
                {shape.tagSize !== null && (
                  <text x={shape.cx} y={shape.cy + shape.tagSize * 0.35} fontSize={shape.tagSize * 1.4} textAnchor="middle" fill="var(--cab-tag)" fontFamily="var(--mono)" fontWeight="600">
                    {shape.tag}
                  </text>
                )}
              </g>
            );
          }
          case 'line': {
            const dashed = shape.role === 'boundary' || shape.role === 'required-height' || shape.role === 'extension';
            const stroke = shape.role === 'required-height' ? 'var(--req-line)' : shape.role === 'dimension' ? 'var(--ink-2)' : 'var(--ink-3)';
            return <line key={i} x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke={stroke} strokeWidth="2" strokeDasharray={dashed ? '8 6' : undefined} opacity={dims} />;
          }
          case 'text':
            // The app's dimension figures are too small to read at this size; the main ones are written larger below.
            return null;
        }
      })}
      <g className="font-mono" fontSize="34" fill="var(--ink-2)" opacity={dims}>
        <text x={RAIL_W / 2} y={viewBox.y + viewBox.height - 6} textAnchor="middle">
          {TRAY_W} mm
        </text>
        <text x={RAIL_W + 44} y={RAIL_H / 2 + 12}>{SELECTED_H}</text>
      </g>
      {/* On hover: each zone's width as the app works it out, written up the zone (the detail line names them). */}
      <g className="fw-hover font-mono" fontSize="28" fill="var(--ink)">
        {shapes
          .filter((s): s is Extract<DrawingShape, { kind: 'zone' }> => s.kind === 'zone')
          .map((z) => {
            const [cx, cy] = [z.x + z.width / 2, z.y + z.height / 2];
            return (
              <text key={z.x} x={cx} y={cy + 10} textAnchor="middle" transform={`rotate(-90 ${cx} ${cy})`}>
                {z.role === 'spare' ? `spare ${t2.spare}` : t2.clearance}
              </text>
            );
          })}
      </g>
    </svg>
  );
}

/** The report produced from the calculation: the PDF page by page, then the workbook and the drawing, each checked off. */
const DOCS = [
  { name: 'SVG', x: 176, fan: 'group-hover:translate-x-6 group-hover:rotate-6' },
  { name: 'XLSX', x: 148, fan: 'group-hover:translate-x-2 group-hover:rotate-2' },
  { name: 'PDF', x: 120, fan: 'group-hover:-translate-x-3 group-hover:-rotate-2' },
];

function ReportViz({ state, still }: VizProps) {
  const t = useStageClock(state, still, 2.8);
  const pages = toNumber(FILES.reportPages);
  const inflow = span(t, 0, 0.4);
  return (
    <svg viewBox={VIEWBOX} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
      <path d="M18 84H110m-4 -3l4 3-4 3" fill="none" stroke={state === 'queued' ? 'var(--line-3)' : 'var(--accent-ink)'} strokeWidth="1.2" />
      {inflow > 0 && inflow < 1 && <circle cx={lerp(18, 110, inflow)} cy="84" r="2" fill="var(--energy)" />}
      {DOCS.map((doc, i) => {
        // The PDF (in front) is produced first, then the workbook, then the drawing.
        const start = 0.35 + (2 - i) * 0.75;
        const made = span(t, start, start + 0.6);
        const ready = t >= start + 0.7;
        const y = 26 + (2 - i) * 6;
        const page = Math.max(1, Math.ceil(span(t, start, start + 0.6) * pages));
        return (
          <g key={doc.name}>
            <g className={`origin-bottom [transform-box:fill-box] motion-safe:transition-transform motion-safe:duration-500 ${doc.fan}`}>
              <rect x={doc.x} y={y} width="84" height="112" rx="6" fill="var(--surface-2)" stroke="var(--line-3)" strokeOpacity="0.7" />
              <rect x={doc.x + 8} y={y + 8} width="30" height="12" rx="3" fill={i === 2 ? 'var(--accent-strong)' : 'var(--line-2)'} />
              <text x={doc.x + 23} y={y + 17.5} textAnchor="middle" className="font-mono" fontSize="8" fontWeight="600" fill="#fff">
                {doc.name}
              </text>
              {[0, 1, 2, 3].map((l) => (
                <line key={l} x1={doc.x + 8} x2={doc.x + 8 + (68 - (l % 2) * 18) * span(made, l * 0.2, l * 0.2 + 0.4)} y1={y + 32 + l * 10} y2={y + 32 + l * 10} stroke="var(--line-3)" strokeOpacity="0.8" />
              ))}
              {i === 2 && (
                <>
                  <path d={`M${doc.x + 14} ${y + 78}v20h56v-20`} fill="none" stroke="var(--accent-ink)" strokeWidth="1.5" opacity={made} />
                  <text x={doc.x + 76} y={y + 17.5} textAnchor="end" className="font-mono" fontSize="7.5" fill="var(--ink-2)" opacity={made > 0 ? 1 : 0}>
                    {page}/{pages}
                  </text>
                </>
              )}
              <rect x={doc.x + 8} y={y + 104} width={68 * made} height="2" rx="1" fill="var(--energy)" opacity={ready ? 0 : 0.9} />
            </g>
            {ready && (
              <g transform={`translate(${doc.x + 84} ${y})`}>
                <circle r="7" fill="var(--pass)" />
                <path d="M-3 0l2 2.2L3.2 -2.4" fill="none" stroke="var(--bg)" strokeWidth="1.8" />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
