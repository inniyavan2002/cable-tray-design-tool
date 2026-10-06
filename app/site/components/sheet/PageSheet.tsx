import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { APP } from '../../data';
import { PLAN } from '../building/geometry';
import { useLoopRunning, useStill } from '../loop';
import { RoutePulse, type PulseRoute } from '../pulse';

/**
 * Lets an element's background drawing follow the mouse a little: sets
 * --sheet-x and --sheet-y (from -0.5 to 0.5 across the window) on that
 * element alone, once a frame at most, so only its own drawing restyles.
 * Nothing follows the mouse when motion is off.
 */
export function useSheetParallax(ref: RefObject<HTMLElement | null>, still: boolean) {
  useEffect(() => {
    const element = ref.current;
    if (!element || still) return;
    let frame = 0;
    let [x, y] = [0, 0];
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      [x, y] = [e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5];
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        element.style.setProperty('--sheet-x', x.toFixed(3));
        element.style.setProperty('--sheet-y', y.toFixed(3));
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      cancelAnimationFrame(frame);
      element.style.removeProperty('--sheet-x');
      element.style.removeProperty('--sheet-y');
    };
  }, [ref, still]);
}

/** The page's content width (Wrap): the fragments sit in the margins outside it. */
const CONTENT = 1172;
const FRAGMENT_WIDTH = 200;
/** Fragments down the page, one every so far, alternating sides. */
const PITCH = 720;
type Kind = 'run' | 'grid' | 'section' | 'tee' | 'levels';
const KINDS: Kind[] = ['run', 'grid', 'section', 'tee', 'levels'];
const HEIGHT: Record<Kind, number> = { run: 280, grid: 230, section: 190, tee: 210, levels: 120 };

/**
 * The drawing sheet the page sits on, below the hero: its grid at three
 * scales, as on an engineering drawing, and in the margins faint fragments
 * of a tray layout (runs and bends, a tee, a tray's section, structural grid
 * lines, levels), labelled with the example project's trays and the
 * building's bays and storeys. Pulses travel the tray runs slowly, and the
 * fragments follow the mouse a little, each at its own depth.
 */
export function PageSheet() {
  const still = useStill();
  const layer = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number; top: number } | null>(null);
  useSheetParallax(layer, still);
  // The sheet covers the page's main and draws below the hero, the element before it.
  useEffect(() => {
    const element = layer.current;
    const hero = element?.previousElementSibling as HTMLElement | null;
    if (!element || !hero) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight - hero.offsetHeight, top: hero.offsetHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);
  const fragments = useMemo(() => {
    if (!size) return [];
    // Where the margins have room for the fragments to show.
    const margin = (size.width - Math.min(size.width, CONTENT)) / 2;
    if (margin < 110) return [];
    const out: Array<{ kind: Kind; index: number; side: 1 | -1; x: number; y: number }> = [];
    for (let i = 0, y = 160; y + 120 < size.height; i++, y += PITCH) {
      const side = i % 2 === 0 ? 1 : -1;
      out.push({ kind: KINDS[i % KINDS.length]!, index: i, side, x: side > 0 ? margin - 24 - FRAGMENT_WIDTH : size.width - margin + 24, y: y + ((i * 97) % 140) });
    }
    return out;
  }, [size]);
  return (
    <div ref={layer} aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      {size && (
        <div className="absolute inset-x-0 bottom-0 overflow-hidden" style={{ top: size.top }}>
          <div className="page-grid absolute inset-0" />
          {fragments.map((f) => (
            <Fragment key={`${f.kind}-${f.index}`} {...f} still={still} />
          ))}
        </div>
      )}
    </div>
  );
}

const trayOf = (name: string) => APP.trays.find((t) => t.name === name)!;
/** The building's bay, the distance between its column lines, in millimetres. */
const COLUMN_LINES = [...new Set(PLAN.columns.map(([cx]) => cx))].sort((a, b) => a - b);
const BAY = String(Math.round((COLUMN_LINES[1]! - COLUMN_LINES[0]!) * 1000));

/** One fragment of the layout, drawn for its side of the page: it turns towards the content. */
function Fragment({ kind, index, side, x, y, still }: { kind: Kind; index: number; side: 1 | -1; x: number; y: number; still: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const running = useLoopRunning(box);
  const height = HEIGHT[kind];
  // Drawn for the left margin; mirrored for the right.
  const X = (v: number) => (side > 0 ? v : FRAGMENT_WIDTH - v);
  const toward = side > 0 ? 'start' : 'end';
  const away = side > 0 ? 'end' : 'start';
  const routes: PulseRoute[] = [];
  let drawing: ReactNode;
  if (kind === 'run') {
    const t = trayOf('TR-02');
    const rungs = [...Array.from({ length: 17 }, (_, i) => `M${X(45)} ${8 + i * 12}H${X(67)}`), ...Array.from({ length: 11 }, (_, i) => `M${X(76 + i * 12)} 219V241`)].join('');
    drawing = (
      <>
        <path d={`M${X(45)} 0V241H${X(200)}M${X(67)} 0V219H${X(200)}`} className="sheet-tray" />
        <path d={rungs} className="sheet-rung" />
        <path d={`M${X(56)} 0V230H${X(200)}`} className="sheet-axis" />
        <path d={`M${X(45)} 34H${X(67)}M${X(45)} 30v8M${X(67)} 30v8`} className="sheet-line" />
        <text x={X(38)} y="37" textAnchor={away} className="sheet-text">
          {t.selected.split(' × ')[0]}
        </text>
        <text x={X(84)} y="120" textAnchor="middle" transform={`rotate(-90 ${X(84)} 120)`} className="sheet-text">
          {t.name} {t.selected}
        </text>
      </>
    );
    routes.push({
      tone: 'power',
      points: [
        [X(56), 0],
        [X(56), 230],
        [X(200), 230],
      ],
      seconds: 9,
      edges: [true, true],
    });
  } else if (kind === 'grid') {
    const letters = [String.fromCharCode(65 + ((index * 2) % 24)), String.fromCharCode(66 + ((index * 2) % 24))];
    drawing = (
      <>
        <path d={`M${X(40)} 34V230M${X(160)} 34V230M${X(26)} 170H${X(200)}`} className="sheet-axis" />
        {[40, 160].map((a, i) => (
          <g key={a}>
            <circle cx={X(a)} cy="22" r="11" className="sheet-bubble" />
            <text x={X(a)} y="25.5" textAnchor="middle" className="sheet-text">
              {letters[i]}
            </text>
            <rect x={X(a) - 4} y="166" width="8" height="8" className="sheet-column" />
          </g>
        ))}
        <circle cx={X(14)} cy="170" r="11" className="sheet-bubble" />
        <text x={X(14)} y="173.5" textAnchor="middle" className="sheet-text">
          {(index % 3) + 1}
        </text>
        <path d={`M${X(40)} 52H${X(160)}M${X(40)} 48v8M${X(160)} 48v8`} className="sheet-line" />
        <text x={X(100)} y="47" textAnchor="middle" className="sheet-text">
          {BAY}
        </text>
      </>
    );
  } else if (kind === 'section') {
    const t = trayOf('TR-03');
    const cables = [...Array.from({ length: 6 }, (_, i) => [42 + i * 19, 131, 8.5]), ...Array.from({ length: 4 }, (_, i) => [44 + i * 17, 114, 7])] as Array<[number, number, number]>;
    drawing = (
      <>
        <path d={`M${X(30)} 95V140H${X(165)}V95`} className="sheet-tray" />
        {cables.map(([cx, cy, r], i) => (
          <circle key={i} cx={X(cx)} cy={cy} r={r} className="sheet-cable" />
        ))}
        <path d={`M${X(30)} 158H${X(165)}M${X(30)} 154v8M${X(165)} 154v8M${X(180)} 95V140M${X(176)} 95h8M${X(176)} 140h8`} className="sheet-line" />
        <text x={X(97)} y="174" textAnchor="middle" className="sheet-text">
          {t.selected.split(' × ')[0]}
        </text>
        <text x={X(192)} y="118" textAnchor="middle" transform={`rotate(-90 ${X(192)} 118)`} className="sheet-text">
          {t.selected.split(' × ')[1]}
        </text>
        <text x={X(30)} y="82" textAnchor={toward} className="sheet-text">
          {t.name} SECTION
        </text>
        <circle cx={X(170)} cy="30" r="10" className="sheet-bubble" />
        <path d={`M${X(170)} 20V40`} className="sheet-line" />
        <text x={X(170) + (side > 0 ? -16 : 16)} y="33" textAnchor="middle" className="sheet-text">
          A
        </text>
      </>
    );
  } else if (kind === 'tee') {
    const [main, branch] = [trayOf('TR-03'), trayOf('TR-02')];
    drawing = (
      <>
        <path d={`M${X(0)} 60H${X(200)}M${X(0)} 80H${X(105)}M${X(119)} 80H${X(200)}M${X(105)} 80V210M${X(119)} 80V210`} className="sheet-tray" />
        <path d={`M${X(0)} 70H${X(200)}M${X(112)} 70V210`} className="sheet-axis" />
        <circle cx={X(112)} cy="70" r="3" className="sheet-node" />
        <text x={X(30)} y="52" textAnchor={toward} className="sheet-text">
          {main.selected.split(' × ')[0]}
        </text>
        <text x={X(128)} y="160" textAnchor={toward} className="sheet-text">
          {branch.selected.split(' × ')[0]}
        </text>
      </>
    );
    routes.push(
      {
        tone: 'power',
        points: [
          [X(0), 70],
          [X(200), 70],
        ],
        seconds: 7,
        edges: [true, true],
      },
      {
        tone: 'power',
        points: [
          [X(112), 70],
          [X(112), 210],
        ],
        seconds: 6,
        edges: [false, true],
      },
    );
  } else {
    // Two floor levels, at the building's storey height.
    const levels = [3, 2].map((k) => ({ k, value: `+${(k * PLAN.storey).toFixed(2)}` }));
    drawing = (
      <>
        {levels.map(({ k, value }, i) => {
          const ly = 30 + i * 60;
          return (
            <g key={k}>
              <path d={`M${X(10)} ${ly}H${X(200)}`} className="sheet-axis" />
              <path d={`M${X(24) - 6} ${ly - 10}h12l-6 10z`} className="sheet-level" />
              <text x={X(40)} y={ly - 6} textAnchor={toward} className="sheet-text">
                LEVEL {k} {value}
              </text>
            </g>
          );
        })}
      </>
    );
  }
  return (
    <div ref={box} className="sheet-fragment absolute" style={{ left: x, top: y, width: FRAGMENT_WIDTH, height, ['--depth' as string]: 6 + (index % 3) * 3 }}>
      <svg width={FRAGMENT_WIDTH} height={height} viewBox={`0 0 ${FRAGMENT_WIDTH} ${height}`} className="block overflow-visible">
        {drawing}
      </svg>
      {!still && routes.map((r, i) => <RoutePulse key={i} route={r} lead={(index * 0.29 + i * 0.5) % 1} running={running} />)}
    </div>
  );
}
