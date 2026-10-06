import { motion, useMotionTemplate, useMotionValue, useScroll, useSpring, useTransform, type Variants } from 'framer-motion';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { useRef, useState, type AnimationEvent } from 'react';
import { APP, APP_HREF } from '../data';
import { BUILD, Building, SYSTEMS } from './building/Building';
import { MotionButton, useLoopRunning, useStill } from './loop';
import { BLEED } from './network/layout';
import { NetworkTags, NetworkTraces, useNetwork } from './network/Network';
import { ARROW, Button, Wrap } from './ui';

const ease = [0.16, 1, 0.3, 1] as const;
const group: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 22 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.6, ease } },
};
/** The headline's two lines: the first rises out of its line, then the blue one is uncovered left to right. */
const headline: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.28 } } };
const lineUp: Variants = {
  hidden: { opacity: 0, y: '105%' },
  shown: { opacity: 1, y: 0, transition: { duration: 0.6, ease } },
};
const wipe: Variants = {
  hidden: { clipPath: 'inset(-20% 102% -30% -4%)' },
  shown: { clipPath: 'inset(-20% -4% -30% -4%)', transition: { duration: 0.6, ease }, transitionEnd: { clipPath: 'none' } },
};

const { trays } = APP;
const LABEL = `Illustration of a four-level building: power leaves the main board, rises in the riser tray TR-01 and runs out along the floor trays, such as TR-03 (${trays[2]!.selected}); lighting and fire alarm circuits run alongside.`;

/** Still, soft light behind the drawing; the drawing itself carries the motion. */
const LIGHT = [
  'top-[-10%] left-[42%] h-[780px] w-[980px] bg-[radial-gradient(closest-side,rgba(37,99,235,0.22),transparent)]',
  'bottom-[-25%] left-[-12%] h-[620px] w-[620px] bg-[radial-gradient(closest-side,rgba(62,224,255,0.06),transparent)]',
];

/** How far the grid layer reaches past the hero, so parallax never shows its edge. The network's layout follows the grid's lines from it. */
const GRID_BLEED = BLEED;

export function Hero() {
  const reduce = useStill();
  const section = useRef<HTMLElement>(null);
  const running = useLoopRunning(section);
  // The tray the scan is passing, taken from the scan's own animation, so the monitor stays in step with it.
  const [scanning, setScanning] = useState('tr02');
  const followScan = (e: AnimationEvent) => {
    if (e.animationName !== 'b-scan-band') return;
    const id = (e.target as Element).closest('[data-scan]')?.getAttribute('data-scan');
    if (id) setScanning(id);
  };
  const start = reduce ? false : 'hidden';

  // Where the mouse is over the hero, from -0.5 to 0.5; the layers follow it at different depths.
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const x = useSpring(pointerX, { stiffness: 70, damping: 18 });
  const y = useSpring(pointerY, { stiffness: 70, damping: 18 });
  const layers = {
    ground: { x: useTransform(x, (v) => v * -6), y: useTransform(y, (v) => v * -4) },
    building: { x: useTransform(x, (v) => v * -12), y: useTransform(y, (v) => v * -8) },
    labels: { x: useTransform(x, (v) => v * -20), y: useTransform(y, (v) => v * -12) },
  };
  const grid = { x: useTransform(x, (v) => v * -8), y: useTransform(y, (v) => v * -6) };
  // The network's circuits lie on the grid and move with it; its data sits a little nearer.
  const nodes = { x: useTransform(x, (v) => v * -11), y: useTransform(y, (v) => v * -8) };
  const network = useNetwork(section, Boolean(reduce));
  // The drawing turns a little towards the mouse, at most about 2.5 degrees.
  const tilt = { rotateY: useTransform(x, (v) => v * 5), rotateX: useTransform(y, (v) => v * -4) };
  const spotX = useMotionValue(0);
  const spotY = useMotionValue(0);
  const spotlight = useMotionTemplate`radial-gradient(520px circle at ${spotX}px ${spotY}px, rgba(61, 139, 255, 0.1), transparent 62%)`;
  const gridX = useTransform(spotX, (v) => v + GRID_BLEED);
  const gridY = useTransform(spotY, (v) => v + GRID_BLEED);
  const gridMask = useMotionTemplate`radial-gradient(230px circle at ${gridX}px ${gridY}px, #000 0%, transparent 100%)`;

  // Scrolling away, the model sinks back and dims, the grid moves at its own speed, and the text lifts: moving through the system.
  const { scrollYProgress } = useScroll({ target: section, offset: ['start start', 'end start'] });
  const still = Boolean(reduce);
  const recede = {
    scale: useTransform(scrollYProgress, [0, 1], [1, still ? 1 : 0.88]),
    opacity: useTransform(scrollYProgress, [0, 0.9], [1, still ? 1 : 0.3]),
    y: useTransform(scrollYProgress, [0, 1], [0, still ? 0 : 80]),
  };
  const gridDrift = useTransform(scrollYProgress, [0, 1], [0, still ? 0 : 120]);
  const textLift = { y: useTransform(scrollYProgress, [0, 1], [0, still ? 0 : -50]), opacity: useTransform(scrollYProgress, [0, 0.8], [1, still ? 1 : 0.45]) };

  return (
    <section
      ref={section}
      id="top"
      aria-labelledby="hero-title"
      data-flow={running ? 'on' : 'off'}
      className="group/hero relative isolate flex min-h-[100svh] items-center overflow-hidden pt-[68px]"
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== 'mouse' || !section.current) return;
        const box = section.current.getBoundingClientRect();
        pointerX.set((e.clientX - box.left) / box.width - 0.5);
        pointerY.set((e.clientY - box.top) / box.height - 0.5);
        spotX.set(e.clientX - box.left);
        spotY.set(e.clientY - box.top);
        section.current.dataset.pointer = 'on';
      }}
      onPointerLeave={() => {
        pointerX.set(0);
        pointerY.set(0);
        if (section.current) delete section.current.dataset.pointer;
      }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        {LIGHT.map((className) => (
          <span key={className} className={`absolute rounded-full ${className}`} />
        ))}
      </div>
      {/* The drawing-sheet grid, with the grid lit around the mouse. */}
      <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10" style={{ y: gridDrift }}>
        <motion.div className="absolute" style={{ inset: -GRID_BLEED, ...grid }}>
          <div className="sheet-grid absolute inset-0" />
          <motion.div
            className="grid-spot absolute inset-0 opacity-0 group-data-[pointer=on]/hero:opacity-100 motion-safe:transition-opacity motion-safe:duration-500"
            style={{ maskImage: gridMask, WebkitMaskImage: gridMask }}
          />
        </motion.div>
        {/* A live electrical network on the sheet, in the space the text and the drawing leave (wide screens only). */}
        {network && (
          <>
            <motion.div className="absolute" style={{ inset: -GRID_BLEED, ...grid }}>
              <NetworkTraces net={network.net} running={running} still={Boolean(reduce)} appear={network.appear} />
            </motion.div>
            <motion.div className="absolute" style={{ inset: -GRID_BLEED, ...nodes }}>
              <NetworkTags net={network.net} running={running} still={Boolean(reduce)} appear={network.appear} scanning={running ? scanning : 'tr02'} />
            </motion.div>
          </>
        )}
      </motion.div>
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 group-data-[pointer=on]/hero:opacity-100 motion-safe:transition-opacity motion-safe:duration-500"
        style={{ background: spotlight }}
      />
      {/* Now and then a faint scan passes down the drawing sheet, and more slowly another across it. */}
      {!reduce && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <span className="grid-scan" />
          <span className="grid-scan-across" />
        </div>
      )}

      <Wrap className="relative grid items-center gap-6 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:py-16">
        <motion.div data-hero-text variants={group} initial={start} animate="shown" className="relative z-10 grid content-start gap-5" style={textLift}>
          <motion.p
            variants={item}
            className="inline-flex items-center gap-2 justify-self-start rounded-full border border-accent/35 bg-accent-soft/70 px-3 py-1 font-mono text-[11.5px] font-semibold tracking-[0.1em] text-accent-ink uppercase"
          >
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-energy" />
            For electrical and MEP design engineers
          </motion.p>
          <motion.h1 variants={headline} id="hero-title" className="font-cond text-[clamp(44px,4.6vw,68px)] leading-[0.98] font-semibold tracking-[-0.02em]">
            <span className="-mb-[0.1em] block overflow-hidden pb-[0.1em]">
              <motion.span variants={lineUp} className="block">
                Cable tray sizing
              </motion.span>
            </span>{' '}
            <motion.span variants={wipe} className="block text-accent-ink">
              you can check
            </motion.span>
          </motion.h1>
          <motion.p variants={item} className="max-w-[40ch] text-lg text-ink-2 md:text-xl">
            Choose cables from {APP.catalog.rows} catalogue rows. Get the smallest standard tray that meets your fill limit, drawn to scale.
          </motion.p>
          <motion.div variants={item} className="mt-2 grid gap-3 sm:flex sm:flex-wrap">
            <Button primary href={APP_HREF}>
              Open the app <ArrowUpRight className={`h-4 w-4 ${ARROW.upRight}`} aria-hidden="true" />
            </Button>
            <Button href="#features">
              Explore the features <ArrowDown className={`h-4 w-4 ${ARROW.down}`} aria-hidden="true" />
            </Button>
          </motion.div>
        </motion.div>
        <motion.div data-hero-model className="relative" style={recede}>
          <motion.div
            className="relative -mx-2 md:mx-0 lg:-mr-[14%] lg:-ml-[4%]"
            initial={reduce ? false : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2, ease }}
          >
            <div aria-hidden="true" className="tray-glow pointer-events-none absolute inset-[-6%_-2%_-6%_4%] -z-10 rounded-full" />
            <Monitor scanning={running ? scanning : 'tr02'} still={Boolean(reduce)} />
            <motion.div style={{ ...tilt, transformPerspective: 1400 }}>
              {/* Two slow sways with unrelated periods, so the model drifts like a live 3D view and never repeats a path. */}
              <div className="hero-orbit">
                <div data-hero-drawing className="hero-float" onAnimationStart={followScan} onAnimationIteration={followScan}>
                  <Building view="all" flowing={running} label={LABEL} layers={layers} entrance className="bldg-hero" />
                </div>
              </div>
            </motion.div>
            <SystemsLegend reduce={Boolean(reduce)} />
          </motion.div>
        </motion.div>
      </Wrap>
      <MotionButton id="hero-motion" className="absolute right-4 bottom-4 md:right-6 md:bottom-6" />
    </section>
  );
}

/**
 * The drawing's monitor, in the style of a BIM dashboard: whether it is live
 * or paused, and the tray the scan is passing, with that tray's figures from
 * the app. It describes the animation, not a real installation, so screen
 * readers skip it.
 */
function Monitor({ scanning, still }: { scanning: string; still: boolean }) {
  const status = still ? 'PAUSED: TR-02 ASSEMBLY' : 'LIVE: TR-02 ASSEMBLY ACTIVE';
  const tray = trays.find((t) => t.name.toLowerCase().replace('-', '') === scanning) ?? trays[1]!;
  return (
    <motion.div
      aria-hidden="true"
      data-hero-monitor
      className="relative z-10 mb-3 grid justify-items-end gap-1.5 lg:absolute lg:-top-3 lg:right-[10%] lg:mb-0"
      initial={still ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: BUILD.label(4), ease }}
    >
      <span
        data-live-badge={status}
        className="glass inline-flex items-center gap-2 rounded-md border border-energy/30 px-3 py-1.5 font-mono text-[11.5px] font-semibold tracking-[0.08em] text-ink-2 uppercase"
      >
        <span className="text-ink-3">[</span>
        <span className={`h-2 w-2 rounded-full ${still ? 'bg-ink-3' : 'live-dot bg-energy shadow-[0_0_0_3px_rgba(62,224,255,0.25)]'}`} />
        {status}
        <span className="text-ink-3">]</span>
      </span>
      <span data-scan-readout={tray.name} className="glass inline-flex items-center gap-3 rounded-md border border-line-3/40 px-3 py-1 font-mono text-[10.5px] tracking-[0.06em] text-ink-2 uppercase">
        <span className="text-ink-3">{still ? 'Tray' : 'Scan'}</span>
        <motion.span key={tray.name} className="inline-flex gap-3" initial={still ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease }}>
          <span className="font-semibold text-energy">{tray.name}</span>
          <span>{tray.selected}</span>
          <span>Fill {tray.fill}</span>
          <span>{tray.cables} cables</span>
        </motion.span>
      </span>
    </motion.div>
  );
}

/** Which colour is which system in the drawing. Each one comes on in turn as the drawing finishes building. */
function SystemsLegend({ reduce }: { reduce: boolean }) {
  return (
    <ul data-hero-legend aria-label="Systems in the drawing" className="mt-1 flex flex-wrap justify-end gap-x-4 gap-y-1 pr-[6%] font-mono text-[11px] tracking-[0.06em] text-ink-2 uppercase">
      {SYSTEMS.map((system, i) => (
        <motion.li
          key={system.id}
          className="inline-flex items-center gap-2"
          initial={reduce ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: BUILD.system(i), ease }}
        >
          <span aria-hidden="true" className="h-[3px] w-5 rounded-full" style={{ background: system.colour }} />
          {system.name}
        </motion.li>
      ))}
    </ul>
  );
}
