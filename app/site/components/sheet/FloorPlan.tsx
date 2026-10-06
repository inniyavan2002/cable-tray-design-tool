import { useEffect, useRef, useState } from 'react';
import { APP } from '../../data';
import { PLAN } from '../building/geometry';
import { useLoopRunning, useStill } from '../loop';
import { RoutePulse, type PulseRoute } from '../pulse';
import { useSheetParallax } from './PageSheet';

/** The plan's extent in metres: the building with room around it for its grid lines and dimensions. */
const VB = { x: -3.6, y: -3.6, width: 25.2, height: 16.2 };
const { length: L, depth: D, main, riser, branches, branchWidth, fixtures, columns, mdb, firePanel } = PLAN;
const BRANCH = branches[0]!;
/** The corridor the main tray runs along, and the rooms either side of it. */
const CORRIDOR = [main.y - 0.6, main.y + 0.6] as const;
const PARTITIONS = [6, 9, 12, 15];
const DOOR = 0.9;
const COLUMN_LINES = [...new Set(columns.map(([x]) => x))].sort((a, b) => a - b);
/** Metres to the centimetres the plan's words are set in. */
const cm = (metres: number) => Math.round(metres * 1000) / 10;
const ROW_LINES = [...new Set(columns.map(([, y]) => y))].sort((a, b) => a - b);

/** A corridor wall at y, with a door into each room, the way the rooms are divided. */
function corridorWall(y: number): string {
  const rooms = [0.2, ...PARTITIONS, L - 0.2];
  return rooms
    .slice(1)
    .map((end, i) => {
      const start = rooms[i]!;
      const door = start + 0.5;
      return `M${start} ${y}H${door}M${door + DOOR} ${y}H${end}`;
    })
    .join('');
}

/**
 * Behind the showcase: a typical floor of the drawing's building in plan,
 * as on a coordination drawing: walls and rooms either side of the
 * corridor, the columns on their grid lines with grid bubbles and the bays
 * dimensioned, the riser, the main board and the fire alarm panel, the light
 * fittings, and the cable trays where the drawing runs them, along the
 * corridor from the riser with a branch across. Pulses travel the trays
 * slowly. Mostly monochrome, the trays alone in cyan; hidden on phones.
 */
export function FloorPlan() {
  const still = useStill();
  const layer = useRef<HTMLDivElement>(null);
  const plan = useRef<HTMLDivElement>(null);
  const running = useLoopRunning(layer);
  const [scale, setScale] = useState(0);
  useSheetParallax(layer, still);
  useEffect(() => {
    const element = plan.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setScale(element.clientWidth / VB.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const px = ([x, y]: readonly [number, number]) => [(x - VB.x) * scale, (y - VB.y) * scale] as const;
  const routes: PulseRoute[] = scale
    ? [
        { tone: 'power', points: [px([riser.x, main.y]), px([main.to, main.y])], seconds: 14 },
        { tone: 'power', points: [px([BRANCH, main.y]), px([BRANCH, 1.2])], seconds: 6 },
        { tone: 'power', points: [px([BRANCH, main.y]), px([BRANCH, D - 1.2])], seconds: 6.5 },
      ]
    : [];
  const tr03 = APP.trays.find((t) => t.name === 'TR-03')!;
  const halfMain = main.width / 2;
  const halfBranch = branchWidth / 2;
  return (
    <div ref={layer} aria-hidden="true" className="pointer-events-none absolute inset-0 hidden overflow-hidden md:block">
      <div ref={plan} className="floor-plan absolute top-1/2 left-1/2 w-[max(1500px,125%)]">
        <svg viewBox={`${cm(VB.x)} ${cm(VB.y)} ${cm(VB.width)} ${cm(VB.height)}`} className="block h-auto w-full overflow-visible">
          {/* The drawing in metres; its lines keep their width (non-scaling strokes), and its words are set in centimetres below. */}
          <g transform="scale(100)">
            {/* Grid lines and their bubbles, and the bays dimensioned along the top. */}
            <g className="plan-axis">
              {COLUMN_LINES.map((x) => (
                <path key={x} d={`M${x} -2.4V${D + 2.4}`} />
              ))}
              {ROW_LINES.map((y) => (
                <path key={y} d={`M-2.4 ${y}H${L + 2.4}`} />
              ))}
            </g>
            {COLUMN_LINES.map((x) => (
              <circle key={x} cx={x} cy="-2.85" r="0.42" className="plan-bubble" />
            ))}
            {ROW_LINES.map((y) => (
              <circle key={y} cx="-2.85" cy={y} r="0.42" className="plan-bubble" />
            ))}
            <path d={`M0 -1.5H${L}${COLUMN_LINES.map((x) => `M${x - 0.12} -1.38L${x + 0.12} -1.62`).join('')}`} className="plan-thin" />
            {/* Walls: the outside, the corridor with a door into each room, and the rooms. */}
            <path d={`M0 0H${L}V${D}H0Z M0.2 0.2H${L - 0.2}V${D - 0.2}H0.2Z`} className="plan-wall" />
            <path d={`${corridorWall(CORRIDOR[0])}${corridorWall(CORRIDOR[1])}`} className="plan-wall" />
            <path d={PARTITIONS.map((x) => `M${x} 0.2V${CORRIDOR[0]}M${x} ${CORRIDOR[1]}V${D - 0.2}`).join('')} className="plan-thin" />
            {columns.map(([x, y]) => (
              <rect key={`${x}-${y}`} x={x - 0.15} y={y - 0.15} width="0.3" height="0.3" className="plan-column" />
            ))}
            {/* The riser, the main board, the fire alarm panel and the light fittings. */}
            <rect x={riser.x - riser.width / 2} y={riser.y - riser.width / 2} width={riser.width} height={riser.width} className="plan-wall" />
            <path
              d={`M${riser.x - riser.width / 2} ${riser.y - riser.width / 2}l${riser.width} ${riser.width}M${riser.x + riser.width / 2} ${riser.y - riser.width / 2}l${-riser.width} ${riser.width}`}
              className="plan-thin"
            />
            <rect x={mdb.x[0]} y={mdb.y[0]} width={mdb.x[1] - mdb.x[0]} height={mdb.y[1] - mdb.y[0]} className="plan-board" />
            <rect x={firePanel.x[0]} y={firePanel.y[0]} width={firePanel.x[1] - firePanel.x[0]} height={firePanel.y[1] - firePanel.y[0]} className="plan-fire" />
            {fixtures.map(([x, y]) => (
              <rect key={`${x}-${y}`} x={x - 0.7} y={y - 0.22} width="1.4" height="0.44" className="plan-fitting" />
            ))}
            {/* The cable trays: along the corridor from the riser, and the branch across it. */}
            <path
              d={`M${riser.x} ${main.y - halfMain}H${main.to}V${main.y + halfMain}H${riser.x}M${BRANCH - halfBranch} 1.2V${main.y - halfMain}M${BRANCH + halfBranch} 1.2V${main.y - halfMain}M${BRANCH - halfBranch} ${main.y + halfMain}V${D - 1.2}M${BRANCH + halfBranch} ${main.y + halfMain}V${D - 1.2}M${BRANCH - halfBranch} 1.2H${BRANCH + halfBranch}M${BRANCH - halfBranch} ${D - 1.2}H${BRANCH + halfBranch}`}
              className="plan-tray"
            />
            <path d={`M${riser.x} ${main.y}H${main.to}M${BRANCH} 1.2V${D - 1.2}`} className="plan-tray-axis" />
            {[riser.x, BRANCH].map((x) => (
              <circle key={x} cx={x} cy={main.y} r="0.09" className="plan-node" />
            ))}
          </g>
          <g className="plan-text">
            {COLUMN_LINES.map((x, i) => (
              <text key={x} x={cm(x)} y={cm(-2.85) + 6} textAnchor="middle">
                {String.fromCharCode(65 + i)}
              </text>
            ))}
            {ROW_LINES.map((y, i) => (
              <text key={y} x={cm(-2.85)} y={cm(y) + 6} textAnchor="middle">
                {i + 1}
              </text>
            ))}
            {COLUMN_LINES.slice(1).map((x, i) => (
              <text key={x} x={cm((x + COLUMN_LINES[i]!) / 2)} y={cm(-1.66)} textAnchor="middle">
                {Math.round((x - COLUMN_LINES[i]!) * 1000)}
              </text>
            ))}
            <text x={cm(riser.x)} y={cm(riser.y - riser.width / 2 - 0.25)} textAnchor="middle">
              RISER
            </text>
            <text x={cm((mdb.x[0] + mdb.x[1]) / 2)} y={cm(mdb.y[1] + 0.42)} textAnchor="middle">
              MDB
            </text>
            <text x={cm((riser.x + BRANCH) / 2)} y={cm(CORRIDOR[0] + 0.18)} textAnchor="middle" className="plan-text-small">
              {tr03.name} {tr03.selected}
            </text>
            <text x={cm(0)} y={cm(D + 1.2)}>
              LEVEL 2 PLAN
            </text>
          </g>
        </svg>
        {!still && routes.map((r, i) => <RoutePulse key={i} route={r} lead={i * 0.33} running={running} />)}
      </div>
    </div>
  );
}
