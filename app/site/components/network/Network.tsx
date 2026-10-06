import { motion } from 'framer-motion';
import { useEffect, useId, useState, type RefObject } from 'react';
import { INK, PORTS, VIEWBOX } from '../building/geometry';
import { countUp, useRemeasure } from '../building/telemetry';
import { RoutePulse } from '../pulse';
import { APP } from '../../data';
import { BLEED, CHAR, READOUT, STRIP, layoutNetwork, type Box, type HeroMeasures, type Network, type Panel, type Point, type Readout as ReadoutData, type SingleLine, type Tag, type Tone } from './layout';

const ease = [0.16, 1, 0.3, 1] as const;
const TONE: Record<Tone, string> = { power: 'var(--energy)', lighting: 'var(--warn)', fire: 'var(--fail)' };
const round = (v: number) => Math.round(v * 10) / 10;
const path = (points: readonly Point[]) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${round(x)} ${round(y)}`).join('');
/** The network's coordinates are the hero's; its layers reach past the hero by the grid's bleed. Half a pixel puts 1 px lines on the grid's own. */
const ORIGIN = `translate(${BLEED + 0.5} ${BLEED + 0.5})`;
/** Seconds after the hero opens that the network starts to draw itself: once the drawing has built and its labels are in. */
const NETWORK_AT = 2.9;

/** An element's layout box in `root`'s coordinates, ignoring transforms (the hero's parts float and sway). */
function boxIn(el: HTMLElement, root: HTMLElement): Box | null {
  let left = 0;
  let top = 0;
  for (let e: HTMLElement | null = el; e !== root; e = e.offsetParent as HTMLElement | null) {
    if (!e) return null;
    left += e.offsetLeft;
    top += e.offsetTop;
  }
  return { left, top, right: left + el.offsetWidth, bottom: top + el.offsetHeight };
}

const union = (boxes: Box[]): Box => ({
  left: Math.min(...boxes.map((b) => b.left)),
  top: Math.min(...boxes.map((b) => b.top)),
  right: Math.max(...boxes.map((b) => b.right)),
  bottom: Math.max(...boxes.map((b) => b.bottom)),
});

/** Where the hero's text, drawing and button are, or null below the two-column layout. */
function measure(section: HTMLElement): HeroMeasures | null {
  if (!window.matchMedia('(min-width: 1024px)').matches) return null;
  const text = section.querySelector<HTMLElement>('[data-hero-text]');
  const drawing = section.querySelector<HTMLElement>('[data-hero-drawing]');
  const monitor = section.querySelector<HTMLElement>('[data-hero-monitor]');
  const button = section.querySelector<HTMLElement>('#hero-motion');
  const legend = [...section.querySelectorAll<HTMLElement>('[data-hero-legend] li')];
  if (!text || !drawing || !monitor || !button || !legend.length) return null;
  const textBox = boxIn(text, section);
  const svg = boxIn(drawing, section);
  const monitorBox = boxIn(monitor, section);
  const buttonBox = boxIn(button, section);
  const legendBoxes = legend.map((li) => boxIn(li, section));
  if (!textBox || !svg || !monitorBox || !buttonBox || legendBoxes.some((b) => !b)) return null;
  // The text's ink across: its lines and its pill and buttons (only ever moved up and down, so their sides are where the layout put them).
  const origin = section.getBoundingClientRect().left;
  const sides: DOMRect[] = [];
  const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    range.selectNodeContents(node);
    sides.push(...range.getClientRects());
  }
  for (const el of text.querySelectorAll<HTMLElement>('a, p')) if (getComputedStyle(el).display.startsWith('inline')) sides.push(el.getBoundingClientRect());
  const ink = sides.filter((r) => r.width > 0);
  // The drawing scales to its box; map its units to the hero's pixels.
  const scale = (svg.right - svg.left) / VIEWBOX.width;
  const at = ([x, y]: readonly [number, number]): Point => [svg.left + (x - VIEWBOX.x) * scale, svg.top + (y - VIEWBOX.y) * scale];
  const fromDrawing = (b: Box): Box => {
    const [left, top] = at([b.left, b.top]);
    const [right, bottom] = at([b.right, b.bottom]);
    return { left, top, right, bottom };
  };
  return {
    width: section.clientWidth,
    height: section.clientHeight,
    header: parseFloat(getComputedStyle(section).paddingTop),
    text: {
      left: Math.min(...ink.map((r) => r.left)) - origin,
      right: Math.max(...ink.map((r) => r.right)) - origin,
      top: textBox.top,
      bottom: textBox.bottom,
    },
    building: fromDrawing(INK[0]!),
    parts: [...INK.slice(1).map(fromDrawing), monitorBox, union(legendBoxes as Box[])],
    monitor: monitorBox,
    button: buttonBox,
    supply: at(PORTS.supply),
    riser: at(PORTS.riser),
  };
}

/**
 * The hero's background network, laid out afresh whenever the hero changes
 * size or its fonts arrive. `appear` is when it starts drawing itself, in
 * seconds; null when it is complete at once (motion off).
 */
export function useNetwork(section: RefObject<HTMLElement | null>, still: boolean): { net: Network; appear: number | null } | null {
  const [state, setState] = useState<{ net: Network; appear: number | null; key: string } | null>(null);
  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const opened = performance.now();
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const m = measure(element);
        const key = JSON.stringify(m);
        setState((prev) => {
          if (prev?.key === key) return prev;
          if (!m) return null;
          // Drawn in once, after the drawing has built; later layouts (a resize) just replace it.
          const appear = prev ? prev.appear : still ? null : Math.max(0, NETWORK_AT - (performance.now() - opened) / 1000);
          return { net: layoutNetwork(m), appear, key };
        });
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    const text = element.querySelector('[data-hero-text]');
    if (text) observer.observe(text);
    const wide = window.matchMedia('(min-width: 1024px)');
    wide.addEventListener('change', update);
    void document.fonts.ready.then(update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      wide.removeEventListener('change', update);
    };
  }, [section, still]);
  return state && { net: state.net, appear: state.appear };
}

interface LayerProps {
  net: Network;
  /** The loops run (particles, pings, live figures); paused otherwise. */
  running: boolean;
  still: boolean;
  appear: number | null;
}

/** Places an HTML mark at a point of the network: the layer reaches past the hero by the bleed, and lines sit half a pixel in. */
const at = ([x, y]: Point) => ({ left: round(x + BLEED + 0.5), top: round(y + BLEED + 0.5) });

/**
 * The network's circuits: traces on the grid's lines, each run's tray size,
 * the fire alarm's detectors, the connection points, and pulses travelling
 * the circuits. It moves with the grid when the mouse moves.
 *
 * The circuits never change once drawn. They fade towards the sheet's edges
 * as the grid does, by their strokes' own gradient rather than a mask, which
 * would repaint the whole sheet every frame. What moves on them (pulses and
 * the rings at connection points) are small HTML marks animated by transform
 * and opacity only, which the browser runs without repainting anything.
 */
export function NetworkTraces({ net, running, still, appear }: LayerProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const fade = (delay: number) => (appear === null ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.8, delay: appear + delay } });
  // The sheet's fade: an ellipse over the grid layer, like .sheet-grid's mask, opaque to about halfway out.
  const [w, h] = [net.width + 2 * BLEED, net.height + 2 * BLEED];
  const sheet = `translate(${round(0.55 * w - BLEED)} ${round(0.45 * h - BLEED)}) scale(${round(0.8 * w)} ${round(0.78 * h)})`;
  return (
    <>
      <svg aria-hidden="true" focusable="false" className="net absolute inset-0 h-full w-full overflow-visible">
        <defs>
          {(Object.keys(TONE) as Tone[]).map((tone) => (
            <radialGradient key={tone} id={`${id}-sheet-${tone}`} gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform={sheet}>
              <stop offset="0.52" stopColor={TONE[tone]} />
              <stop offset="1" stopColor={TONE[tone]} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>
        <g transform={ORIGIN}>
          {net.traces.map((t, i) => (
            <motion.path
              key={i}
              d={path(t.points)}
              className="net-trace"
              stroke={`url(#${id}-sheet-${t.tone})`}
              data-tone={t.tone}
              {...(appear === null ? {} : { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: 1.4, delay: appear + i * 0.12, ease: [0.45, 0, 0.2, 1] } })}
            />
          ))}
          <motion.g {...fade(0.9)}>
            {net.dims.map((dim) => (
              <Dimension key={dim.text} {...dim} />
            ))}
            {net.detectors.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="2.4" className="net-detector" />
            ))}
            {net.singleLine && <SingleLineDiagram diagram={net.singleLine} />}
            {net.junctions.map(({ at: [x, y], tone }, i) => (
              <circle key={i} cx={x} cy={y} r="2" className="net-node" fill={TONE[tone]} />
            ))}
            {net.notes.map(({ at: [x, y], text, anchor }) => (
              <text key={text} x={x} y={y} textAnchor={anchor} className="net-note">
                {text}
              </text>
            ))}
            {net.zones.columns.map(({ x, label }) => (
              <text key={label} x={x} y={net.zones.top} textAnchor="middle" className="net-zone">
                {label}
              </text>
            ))}
            {net.zones.rows.map(({ y, label }) => (
              <text key={label} x={net.zones.left} y={y} textAnchor="middle" className="net-zone">
                {label}
              </text>
            ))}
          </motion.g>
        </g>
      </svg>
      <motion.div aria-hidden="true" className="net absolute inset-0" {...fade(0.9)}>
        {net.junctions.map(({ at: point, tone, ping }, i) =>
          ping === undefined ? null : <span key={i} className="net-ring" data-tone={tone} style={{ ...at(point), animationDelay: `${ping}s` }} />,
        )}
      </motion.div>
      {!still && (
        <motion.div aria-hidden="true" className="net absolute inset-0" {...fade(1.5)}>
          {net.flows.flatMap((flow, i) =>
            Array.from({ length: flow.count }, (_, k) => <RoutePulse key={`${i}-${k}`} route={flow} lead={(k / flow.count + i * 0.37) % 1} running={running} origin={[BLEED + 0.5, BLEED + 0.5]} />),
          )}
        </motion.div>
      )}
    </>
  );
}

/**
 * The main board as a single-line diagram, drawn on its bus: the busbar
 * between its feeders, a breaker on each feeder and the board it feeds
 * (a box with a diagonal, the distribution board's symbol), and the supply
 * coming in through its transformer.
 */
function SingleLineDiagram({ diagram: { x, bar, feeders, incomer } }: { diagram: SingleLine }) {
  return (
    <g className="net-sld">
      {feeders.map((f) => (
        <g key={f.label}>
          <line x1={x} x2={f.board + 6} y1={f.y} y2={f.y} className="net-feeder" />
          <rect x={x - 20} y={f.y - 3.5} width="7" height="7" className="net-breaker" />
          <rect x={f.board - 6} y={f.y - 5} width="12" height="10" className="net-board" />
          <path d={`M${f.board - 6} ${f.y + 5}L${f.board + 6} ${f.y - 5}`} className="net-board" />
          <text x={f.board - 10} y={f.y + 3} textAnchor="end" className="net-note">
            {f.label}
          </text>
        </g>
      ))}
      <path d={`M${x} ${bar[0]}V${bar[1]}`} className="net-busbar" />
      <circle cx={incomer[0]} cy={incomer[1] - 4} r="5" className="net-transformer" />
      <circle cx={incomer[0]} cy={incomer[1] + 4} r="5" className="net-transformer" />
    </g>
  );
}

/** A run's tray size between two oblique ticks, like a dimension on a layout drawing; turned to read up a vertical run. */
function Dimension({ at: [x, y], vertical, text, span }: { at: Point; vertical: boolean; text: string; span: number }) {
  const h = span / 2;
  return (
    <g className="net-dim" transform={vertical ? `rotate(-90 ${x} ${y})` : undefined}>
      <path d={`M${x - h - 3} ${y + 3}l6 -6M${x + h - 3} ${y + 3}l6 -6`} />
      <text x={x} y={y - 6} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}

/**
 * The network's live data: the route tag where power drops into the riser,
 * the live tray analysis beside the drawing (or, without room for it, tray
 * TR-02's readout), and the status strip under the text. They sit a little
 * nearer than the circuits, so they move a little more with the mouse.
 * `scanning` is the tray the drawing's scan is passing.
 */
export function NetworkTags({ net, running, still, appear, scanning }: LayerProps & { scanning: string }) {
  const show = (delay: number) => (appear === null ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.6, delay: appear + delay, ease } });
  return (
    <>
      <svg aria-hidden="true" focusable="false" className="net absolute inset-0 h-full w-full overflow-visible">
        <g transform={ORIGIN}>
          {net.tags.map((tag, i) => (
            <motion.g key={tag.text} {...show(1.1 + i * 0.2)}>
              <NetTag tag={tag} />
            </motion.g>
          ))}
          {net.readout && (
            <motion.g {...(appear === null ? {} : { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay: appear + 1.3, ease } })}>
              {net.leaders.map(([a, b], i) => (
                <path key={i} d={path([a, b])} className="net-leader" />
              ))}
              <Readout readout={net.readout} running={running} />
            </motion.g>
          )}
        </g>
      </svg>
      {net.analysis && (
        <motion.div aria-hidden="true" className="absolute inset-0" {...show(1.2)}>
          <TrayAnalysis panel={net.analysis} scanning={scanning} still={still} />
        </motion.div>
      )}
      {net.strip && (
        <motion.div aria-hidden="true" className="absolute inset-0" {...show(1.5)}>
          <StatusStrip panel={net.strip} running={running} still={still} />
        </motion.div>
      )}
    </>
  );
}

/** An HTML panel's place in the layer, which reaches past the hero by the bleed. */
const placed = (panel: Panel) => ({ left: round(panel.x + BLEED + 0.5), top: round(panel.y + BLEED + 0.5), width: panel.width });

/**
 * The example project's trays under live analysis: each tray's size and fill
 * against the limit, the tray the drawing's scan is passing lit and its fill
 * measured afresh, with that tray's cable count. The figures are the app's;
 * the status is the animation's, as the monitor's is.
 */
function TrayAnalysis({ panel, scanning, still }: { panel: Panel; scanning: string; still: boolean }) {
  const active = APP.trays.find((t) => t.name.toLowerCase().replace('-', '') === scanning) ?? APP.trays[1]!;
  return (
    <div data-analysis className="net-analysis absolute" style={placed(panel)}>
      <p className="net-analysis-title">Live tray analysis</p>
      <ul className="mt-2.5 grid gap-2.5">
        {APP.trays.map((t) => {
          const on = t === active;
          return (
            <li key={t.name} data-tray={t.name} data-active={on || undefined} className="net-tray">
              <div className="flex items-baseline gap-2">
                <span className="net-tray-name w-[42px] shrink-0">{t.name}</span>
                <span className="flex-1 whitespace-nowrap">{t.selected}</span>
                <span>{t.fill}</span>
              </div>
              <div className="net-meter">
                {/* Measured afresh each time the scan reaches this tray. */}
                <span key={on ? `on-${scanning}` : 'off'} className="net-meter-fill" style={{ width: t.fill }} />
                <span className="net-meter-limit" style={{ left: t.maxFill }} />
              </div>
            </li>
          );
        })}
      </ul>
      <dl className="net-analysis-figures mt-3 grid gap-1 pt-2.5">
        <div className="flex justify-between gap-2">
          <dt>Cables</dt>
          <dd>
            {active.cables} <span className="text-ink-3">{active.name}</span>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Fill limit</dt>
          <dd>{active.maxFill}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>System status</dt>
          <dd className={`inline-flex items-center gap-1.5 ${still ? 'text-ink-3' : 'text-energy'}`}>
            <span className={`net-dot ${still ? 'bg-ink-3' : 'bg-energy'}`} />
            {still ? 'Paused' : 'Active'}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** The checks in turn, as a status strip: the stage running lit, with its light; all checked when nothing moves. */
const STAGES = ['Power flow', 'Cable route check', 'Tray sizing', 'Fill validation', 'Verified'];
const STAGE_SECONDS = 1.8;

function StatusStrip({ panel, running, still }: { panel: Panel; running: boolean; still: boolean }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setStage((s) => (s + 1) % STAGES.length), STAGE_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [running]);
  const active = still ? STAGES.length - 1 : stage;
  return (
    <ol data-strip className="net-strip absolute flex items-center gap-3" style={{ ...placed(panel), height: STRIP.height }}>
      {STAGES.map((name, i) => (
        <li key={name} data-state={i < active ? 'done' : i === active ? 'active' : 'next'} className="flex items-center gap-3">
          {i > 0 && <span className="net-strip-arrow">→</span>}
          <span className="inline-flex items-center gap-2">
            <span className="net-strip-dot" />
            {name}
          </span>
        </li>
      ))}
    </ol>
  );
}

function NetTag({ tag }: { tag: Tag }) {
  const [x, y] = tag.at;
  const right = tag.side === 'right';
  const baseline = y + tag.dy;
  const textX = right ? x + 10 : x - 10;
  return (
    <g className="net-tag">
      <text x={textX} y={baseline} textAnchor={right ? 'start' : 'end'}>
        {tag.text}
      </text>
    </g>
  );
}

/** Tray TR-02's figures as a live readout: its fill and cable count measure afresh now and then, the fill scale with them. */
function Readout({ readout, running }: { readout: ReadoutData; running: boolean }) {
  const [x0, y0] = readout.origin;
  const { pitch, scale: room, width } = READOUT;
  const fill = useRemeasure(readout.fill.value, countUp, 12, 3, 1.2, running);
  const cables = useRemeasure(readout.rows[2]![1], countUp, 12, 2.6, 1.2, running);
  const shown = (name: string, value: string) => (name === 'FILL' ? fill : name === 'CABLES' ? cables : value);
  const bar = width - 8;
  const limitX = x0 + (bar * readout.fill.limit) / 100;
  const scaleY = y0 + pitch + 6;
  return (
    <g className="net-readout">
      {readout.rows.map(([name, value], i) => {
        const y = y0 + i * pitch + (i >= 2 ? room : 0);
        return (
          <text key={name} x={x0} y={y} data-row={name}>
            {/* SVG collapses runs of spaces, so the values' column is placed, not padded: names take seven characters. */}
            <tspan className={i === 0 ? 'net-key-strong' : 'net-key'}>{name} </tspan>
            <tspan x={x0 + 7 * CHAR} className="net-value">
              {shown(name, value)}
            </tspan>
          </text>
        );
      })}
      {/* Fill across the tray's whole cross-section, against the limit. */}
      <rect x={x0} y={scaleY} width={bar} height="2" className="net-scale" />
      <rect x={x0} y={scaleY} width={(bar * (parseFloat(fill) || 0)) / 100} height="2" className="net-scale-fill" />
      <path d={`M${limitX} ${scaleY - 3}v8M${limitX - 3} ${scaleY + 10}l3 -4l3 4z`} className="net-scale-limit" />
      <text x={limitX + 6} y={scaleY + 14} className="net-caption">
        {readout.fill.caption}
      </text>
    </g>
  );
}
