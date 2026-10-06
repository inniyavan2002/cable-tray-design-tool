import { AnimatePresence, animate, motion, useInView, useMotionValue, useTransform } from 'framer-motion';
import { BellRing, Building2, Layers, Lightbulb, Zap, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { APP } from '../data';
import { Building, type BuildingView } from './building/Building';
import { MotionButton, useLoopRunning, useStill } from './loop';
import { FloorPlan } from './sheet/FloorPlan';
import { LAID, TrayDrawing } from './TrayDrawing';
import { Reveal, SECTION, SectionHeading, Wrap } from './ui';

const { t3, trays } = APP;
const toNumber = (text: string) => Number(text.replace(/[,%]/g, ''));
const ease = [0.16, 1, 0.3, 1] as const;

interface View {
  id: Exclude<BuildingView, 'all'>;
  tab: string;
  icon: LucideIcon;
  title: string;
  text: string;
  /** What the drawing shows in this view, for screen readers. */
  label: string;
  /** More for the panel: `seen` once the showcase has scrolled into view, `running` while its loops run. */
  extra?: (state: { seen: boolean; running: boolean }) => ReactNode;
}

const VIEWS: View[] = [
  {
    id: 'trays',
    tab: 'Cable trays',
    icon: Layers,
    title: 'Cable trays',
    text: "The riser and the floor runs are ladder trays. Each one gets its size from the cables it carries. These are the example project's trays, sized by the app.",
    label: 'Illustration of a four-level building with its cable trays highlighted: the riser tray TR-01, the floor runs such as TR-03, and branches such as TR-02.',
    extra: ({ seen }) => <TrayList seen={seen} />,
  },
  {
    id: 'power',
    tab: 'Power',
    icon: Zap,
    title: 'Power distribution',
    text: 'Feeders leave the main board (MDB), rise in the riser tray and feed a sub-main board (SMDB) on each level. Final circuits leave each board along the floor trays.',
    label: 'Illustration of a four-level building with its power distribution highlighted: feeders from the main board up the riser to a sub-main board on each level, and circuits along the floor trays.',
    extra: ({ running }) => <SingleLine running={running} />,
  },
  {
    id: 'lighting',
    tab: 'Lighting',
    icon: Lightbulb,
    title: 'Lighting',
    text: 'Lighting circuits run in the floor trays, then in conduit from the tray to each fitting.',
    label: 'Illustration of a four-level building with its lighting highlighted: circuits in conduit from the floor trays to each fitting, and the light from each fitting.',
    extra: () => (
      <Legend
        items={[
          ['var(--warn)', 'Lighting circuits in conduit'],
          ['#e4f4ff', 'Fittings, six on each level'],
        ]}
      />
    ),
  },
  {
    id: 'fire',
    tab: 'Fire alarm',
    icon: BellRing,
    title: 'Fire alarm',
    text: 'Fire alarm circuits run apart from power and lighting: from the fire alarm panel up their own riser, then along each level past the detectors.',
    label: 'Illustration of a four-level building with its fire alarm system highlighted: the panel, its own riser, and a circuit past the detectors on each level.',
    extra: () => (
      <Legend
        items={[
          ['var(--fail)', 'Fire alarm circuits, in their own riser'],
          ['rgba(255, 143, 133, 0.45)', 'Detectors, four on each level'],
        ]}
      />
    ),
  },
  {
    id: 'architecture',
    tab: 'Architecture',
    icon: Building2,
    title: 'Architecture',
    text: "Four levels with a riser near the core. The trays hang just below each slab, in the ceiling space the building's services share.",
    label: 'Illustration of a four-level building showing its slabs, columns and facade.',
    extra: () => <Legend items={[['rgba(150, 186, 240, 0.8)', 'Slabs, columns and mullions, levels 0 to 3']]} />,
  },
];

export function Showcase() {
  const [active, setActive] = useState<View['id']>('trays');
  const stage = useRef<HTMLDivElement>(null);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const running = useLoopRunning(stage);
  // The routes draw themselves the first time the showcase scrolls into view, and again whenever the view changes.
  const seen = useInView(stage, { once: true, amount: 0.3 });
  const view = VIEWS.find((v) => v.id === active)!;

  // Arrow keys move between the views, as in any tab list.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = VIEWS.findIndex((v) => v.id === active);
    const next = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: VIEWS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const wrapped = (next + VIEWS.length) % VIEWS.length;
    setActive(VIEWS[wrapped]!.id);
    tabs.current[wrapped]?.focus();
  };

  return (
    <section id="showcase" aria-labelledby="showcase-title" className={`${SECTION} overflow-hidden border-y border-line bg-bg-2`}>
      <div aria-hidden="true" className="sheet-grid absolute inset-0" />
      <FloorPlan />
      <Wrap className="relative">
        <SectionHeading id="showcase-title" intro="Switch views to follow each system through a building. The trays these systems share are what the app sizes.">
          Where the trays go
        </SectionHeading>

        <Reveal scale className="mt-10 grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.75fr)]">
          <div className="rounded-2xl border border-line-2 bg-bg/95">
            <div role="tablist" aria-label="Building views" onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b border-line-2 p-2">
              {VIEWS.map((v, i) => {
                const selected = v.id === active;
                const Icon = v.icon;
                return (
                  <button
                    key={v.id}
                    ref={(el) => {
                      tabs.current[i] = el;
                    }}
                    id={`view-${v.id}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls="showcase-panel"
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setActive(v.id)}
                    className={`relative inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-[14px] font-semibold motion-safe:transition-colors ${
                      selected ? 'text-ink' : 'text-ink-3 hover:text-ink'
                    }`}
                  >
                    {selected && (
                      <motion.span
                        layoutId="view-indicator"
                        className="absolute inset-0 -z-0 rounded-lg border border-accent/45 bg-accent-soft"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      />
                    )}
                    <Icon className="relative h-4 w-4" aria-hidden="true" />
                    <span className="relative">{v.tab}</span>
                  </button>
                );
              })}
            </div>
            <div ref={stage} className="px-2 pt-4 pb-2 md:px-6">
              <Building view={active} flowing={running} label={view.label} drawKey={seen ? active : undefined} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-2 px-4 py-3">
              <p className="text-[13px] text-ink-3">An illustration of where trays run. The app sizes trays from cable lists; it does not model buildings.</p>
              <MotionButton />
            </div>
          </div>

          <div id="showcase-panel" role="tabpanel" aria-labelledby={`view-${active}`} className="rounded-2xl border border-line-2 bg-surface p-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3, ease }}
                className="grid gap-4"
              >
                <h3 className="font-cond text-[24px] leading-tight font-semibold">{view.title}</h3>
                <p className="text-ink-2">{view.text}</p>
                {view.extra?.({ seen, running })}
              </motion.div>
            </AnimatePresence>
          </div>
        </Reveal>
      </Wrap>
    </section>
  );
}

/** The example project's trays, and TR-03's section as the app draws it, its cables laid one by one as its fill climbs. */
function TrayList({ seen }: { seen: boolean }) {
  return (
    <>
      <ul className="grid gap-1.5 font-mono text-[13px]">
        {trays.map((t) => (
          <li key={t.name} className="flex justify-between gap-3 rounded-lg border border-line-2 bg-bg-2 px-3 py-2">
            <span className="text-ink">
              {t.name} <span className="text-ink-3">{t.service}</span>
            </span>
            <span className="font-semibold text-accent-ink">{t.selected}</span>
          </li>
        ))}
      </ul>
      <figure className="grid gap-2.5 rounded-xl border border-line-2 bg-bg p-3">
        <div role="img" aria-label={`Tray ${t3.name} as the app draws it: ${t3.selected} mm with ${t3.cables} cables in ${t3.layers} layers, fill ${t3.fill} of ${t3.maxFill}`}>
          {/* Laid again once the showcase is in view, so the cables go in where they can be seen. */}
          <TrayDrawing key={seen ? 'seen' : 'waiting'} />
        </div>
        <FillMeter play={seen} />
        <figcaption className="font-mono text-[12px] text-ink-3">
          {t3.name} as the app draws it: {t3.cables} cables in {t3.layers} layers, fill {t3.fill} of {t3.maxFill}
        </figcaption>
      </figure>
    </>
  );
}

/**
 * TR-03's fill climbing as each cable is laid: each step adds that cable's
 * own share of the cross-section, so the meter stops exactly at the app's
 * figure.
 */
function FillMeter({ play }: { play: boolean }) {
  const reduce = useStill();
  const final = toNumber(t3.fill);
  const limit = toNumber(t3.maxFill);
  const fill = useMotionValue(reduce ? final : 0);
  const width = useTransform(fill, (v) => `${v}%`);
  const text = useTransform(fill, (v) => `${v.toFixed(1)}%`);

  useEffect(() => {
    if (!play || reduce) {
      fill.set(reduce ? final : 0);
      return;
    }
    const total = LAID.reduce((sum, c) => sum + c.r * c.r, 0);
    let area = 0;
    const steps = LAID.map((c) => {
      area += c.r * c.r;
      return { value: (final * area) / total, at: c.at };
    });
    const end = steps[steps.length - 1]!.at;
    // Hold at zero until the first cable lands, then rise with each one.
    const values = [0, 0, ...steps.map((s) => s.value)];
    const times = [0, (steps[0]!.at - 0.2) / end, ...steps.map((s) => s.at / end)];
    const controls = animate(fill, values, { duration: end, times, ease: 'easeOut' });
    return () => controls.stop();
  }, [play, reduce, final, fill]);

  return (
    <div className="grid gap-1.5" aria-hidden="true">
      <div className="flex justify-between font-mono text-[11.5px]">
        <span className="text-ink-3">Fill</span>
        <span>
          <motion.span className="font-semibold text-pass">{text}</motion.span>
          <span className="text-ink-3"> of {t3.maxFill}</span>
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-line-2">
        <motion.span className="absolute inset-y-0 left-0 rounded-full bg-pass" style={{ width }} />
        <span className="absolute -top-1 -bottom-1 w-px bg-warn" style={{ left: `${limit}%` }} />
      </div>
    </div>
  );
}

const FEEDS = [
  { to: 'SMDB-3', y: 38, pace: 1.9 },
  { to: 'SMDB-2', y: 74, pace: 1.6 },
  { to: 'SMDB-1', y: 110, pace: 1.4 },
  { to: 'Level 0', y: 146, pace: 1.2 },
];

/**
 * The main board as a single-line diagram: supply in, a breaker on each
 * outgoing feeder, out to each level's board. The connections draw
 * themselves, then current runs along each at its own pace.
 */
function SingleLine({ running }: { running: boolean }) {
  const reduce = useStill();
  const drawn = (delay: number) =>
    reduce ? {} : { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: 0.5, delay, ease: [0.45, 0, 0.2, 1] as const } };
  const appear = (delay: number) => (reduce ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.3, delay } });
  return (
    <figure className="grid gap-2 rounded-xl border border-line-2 bg-bg p-3">
      <svg viewBox="0 0 320 180" className="block h-auto w-full" role="img" aria-label="Single-line diagram: the supply enters the main board, and four feeders leave it through their breakers to SMDB-3, SMDB-2, SMDB-1 and the level 0 circuits." data-flow={running ? 'on' : 'off'}>
        {/* Supply in */}
        <motion.path d="M4 92H52" stroke="var(--energy)" strokeWidth="1.4" fill="none" {...drawn(0)} />
        <motion.text x="6" y="84" className="font-mono" fontSize="9" fill="var(--ink-3)" {...appear(0.2)}>
          SUPPLY
        </motion.text>
        {/* The main board and its busbar */}
        <motion.g {...appear(0.15)}>
          <rect x="52" y="22" width="44" height="140" rx="3" fill="#10284d" stroke="#7fb0f5" strokeWidth="1" />
          <line x1="88" y1="34" x2="88" y2="150" stroke="var(--accent-ink)" strokeWidth="2" />
          <text x="60" y="38" className="font-mono" fontSize="10" fontWeight="600" fill="var(--ink)">
            MDB
          </text>
        </motion.g>
        {FEEDS.map((f, i) => (
          <g key={f.to} style={{ '--flow-d': `${f.pace}s`, '--intensity-d': `${f.pace * 3}s` } as CSSProperties}>
            <motion.path d={`M88 ${f.y}H230`} stroke="rgba(124, 176, 255, 0.45)" strokeWidth="1.2" fill="none" {...drawn(0.35 + i * 0.15)} />
            {/* Breaker */}
            <motion.g {...appear(0.45 + i * 0.15)}>
              <rect x="122" y={f.y - 6} width="12" height="12" fill="var(--bg)" stroke="var(--accent-ink)" strokeWidth="1" />
              <line x1="124" y1={f.y + 4} x2="132" y2={f.y - 4} stroke="var(--accent-ink)" strokeWidth="1" />
            </motion.g>
            <motion.path d={`M88 ${f.y}H230`} className="b-flow" strokeWidth="1.4" fill="none" {...appear(0.8 + i * 0.15)} />
            <motion.g {...appear(0.7 + i * 0.15)}>
              <rect x="230" y={f.y - 11} width="80" height="22" rx="3" fill="var(--surface-2)" stroke="#7fb0f5" strokeWidth="1" />
              <text x="270" y={f.y + 4} textAnchor="middle" className="font-mono" fontSize="10" fill="var(--ink)">
                {f.to}
              </text>
            </motion.g>
          </g>
        ))}
      </svg>
      <figcaption className="font-mono text-[12px] text-ink-3">The main board as a single-line diagram: one feeder and breaker for each level.</figcaption>
    </figure>
  );
}

function Legend({ items }: { items: Array<[string, string]> }) {
  return (
    <ul className="grid gap-2 text-[14px] text-ink-2">
      {items.map(([colour, text]) => (
        <li key={text} className="flex items-center gap-2.5">
          <span aria-hidden="true" className="h-2.5 w-5 shrink-0 rounded-full" style={{ background: colour }} />
          {text}
        </li>
      ))}
    </ul>
  );
}
