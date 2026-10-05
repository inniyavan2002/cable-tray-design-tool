import { motion, useMotionTemplate, useMotionValueEvent, useScroll, useTransform } from 'framer-motion';
import { Cable, CircleCheck, FileOutput, SlidersHorizontal, SquarePlus, type LucideIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useLoopRunning, useStill } from './loop';
import { SECTION, SectionHeading, Wrap } from './ui';

const STEPS: ReadonlyArray<{ title: string; text: string; icon: LucideIcon }> = [
  { title: 'Add a tray', text: 'Tray ID, service and tray type', icon: SquarePlus },
  { title: 'Set the arrangement', text: 'Layers, spacing and allowances', icon: SlidersHorizontal },
  { title: 'Add cables', text: 'Search the catalog, or enter a cable by hand', icon: Cable },
  { title: 'Check the result', text: 'Size, fill, section and calculation', icon: CircleCheck },
  { title: 'Export', text: 'PDF, Excel, PNG or SVG', icon: FileOutput },
];

/**
 * The five steps on one line that fills as the section scrolls through the
 * screen; each step lights up as the line reaches it, and light keeps running
 * along the lit part from step to step (paused with the page's other loops).
 * With reduced motion, every step is lit from the start.
 */
export function Workflow() {
  const reduce = useStill();
  const list = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: list, offset: ['start 0.85', 'end 0.55'] });
  const [reached, setReached] = useState(0);
  const last = STEPS.length - 1;
  useMotionValueEvent(scrollYProgress, 'change', (p) => setReached(Math.min(last, Math.floor(p * last + 0.02))));
  const fill = useTransform(scrollYProgress, (p) => (reduce ? 1 : Math.min(1, Math.max(0, p))));
  const tip = useTransform(fill, (f) => `${f * 100}%`);
  // The running light stays on the lit part of the line.
  const unlit = useTransform(fill, (f) => `${(1 - f) * 100}%`);
  const litPart = useMotionTemplate`inset(0 ${unlit} 0 0)`;
  const running = useLoopRunning(list);
  const lit = (i: number) => reduce || i <= reached;

  return (
    <section id="workflow" aria-labelledby="workflow-title" className={SECTION}>
      <Wrap>
        <SectionHeading id="workflow-title" intro="From an empty tray to a checked report, the same five steps every time.">
          Five steps for each tray
        </SectionHeading>
        <ol ref={list} data-flow={running ? 'on' : 'off'} className="relative mt-14 grid gap-9 lg:grid-cols-5 lg:gap-6">
          {/* The track and the part already travelled: across on wide screens, down on narrow ones. */}
          <span aria-hidden="true" className="absolute top-7 bottom-7 left-7 w-px bg-line-2 lg:top-7 lg:right-[10%] lg:bottom-auto lg:left-[10%] lg:h-px lg:w-auto" />
          <motion.span
            aria-hidden="true"
            className="absolute top-7 bottom-7 left-[27px] w-[2px] origin-top bg-gradient-to-b from-accent to-energy shadow-[0_0_10px_rgba(62,224,255,0.45)] lg:hidden"
            style={{ scaleY: fill }}
          />
          <motion.span
            aria-hidden="true"
            className="absolute top-[27px] right-[10%] left-[10%] hidden h-[2px] origin-left bg-gradient-to-r from-accent to-energy shadow-[0_0_10px_rgba(62,224,255,0.45)] lg:block"
            style={{ scaleX: fill }}
          />
          <motion.span aria-hidden="true" className="absolute top-[27px] right-[10%] left-[10%] hidden h-[2px] overflow-hidden lg:block" style={{ clipPath: litPart }}>
            <span className="wf-pulse absolute inset-y-0 left-0 w-[10%] bg-gradient-to-r from-transparent via-white to-transparent" />
          </motion.span>
          {/* A spark at the tip of the line, carrying the light from step to step. */}
          <span aria-hidden="true" className="absolute top-7 right-[10%] left-[10%] hidden lg:block">
            <motion.span className="absolute top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-energy shadow-[0_0_14px_3px_rgba(62,224,255,0.7)]" style={{ left: tip }} />
          </span>
          <span aria-hidden="true" className="absolute top-7 bottom-7 left-7 lg:hidden">
            <motion.span className="absolute left-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-energy shadow-[0_0_14px_3px_rgba(62,224,255,0.7)]" style={{ top: tip }} />
          </span>
          {STEPS.map((step, i) => {
            const on = lit(i);
            const Icon = step.icon;
            return (
              <li key={step.title} data-active={on || undefined} className="relative grid grid-cols-[56px_minmax(0,1fr)] content-start items-start gap-x-5 lg:grid-cols-1 lg:justify-items-center lg:text-center">
                <span
                  aria-hidden="true"
                  className={`relative z-10 grid h-14 w-14 place-items-center rounded-full border motion-safe:transition-[border-color,background-color,box-shadow,color] motion-safe:duration-500 ${
                    on
                      ? 'border-accent bg-accent-soft text-energy shadow-[0_0_0_6px_rgba(61,139,255,0.1),0_0_26px_-4px_rgba(62,224,255,0.45)]'
                      : 'border-line-2 bg-surface text-ink-3'
                  }`}
                >
                  <Icon className="h-6 w-6" strokeWidth={1.6} />
                </span>
                <div className="grid gap-1 lg:mt-5">
                  <span className={`font-mono text-[12.5px] font-semibold motion-safe:transition-colors motion-safe:duration-500 ${on ? 'text-accent-ink' : 'text-ink-3'}`}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className={`text-[17px] leading-snug font-semibold motion-safe:transition-colors motion-safe:duration-500 ${on ? 'text-ink' : 'text-ink-2'}`}>{step.title}</h3>
                  <p className="text-[15px] text-ink-2">{step.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Wrap>
    </section>
  );
}
