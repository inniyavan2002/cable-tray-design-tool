import { animate, motion, useInView, useMotionValue, useTransform, type MotionValue } from 'framer-motion';
import { Check, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { APP } from '../data';
import { countUp, useTelemetry } from './building/telemetry';
import { useStill } from './loop';

const { t2 } = APP;
const toNumber = (text: string) => Number(text.replace(/[,%]/g, ''));
const ease = [0.16, 1, 0.3, 1] as const;

/**
 * When each step of tray T2's calculation lights, in seconds after the
 * pipeline scrolls into view. The fill step tries the first size, finds it
 * over the limit, and tries the next.
 */
const AT = { cables: 0, size: 0.5, firstFill: 1.0, nextSize: 2.2, secondFill: 2.4, standard: 3.3, result: 3.8 };
const STEPS = ['Cable selection', 'Size check', 'Tray fill', 'Standard tray', 'Result'] as const;

/**
 * Tray T2's calculation as the app runs it, step by step: its cables, the
 * size they need, the fill of each standard size it tries, the size it
 * selects, and the result. Every value is the app's own (facts.json).
 */
export function CalcPipeline() {
  const reduce = useStill();
  const ref = useRef<HTMLOListElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const play = inView && !reduce;
  const [elapsed, setElapsed] = useState(0);

  // One clock for the whole sequence; it stops at the end.
  useEffect(() => {
    if (!play) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      setElapsed(t);
      if (t < AT.result + 0.6) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [play]);

  const t = reduce ? Infinity : inView ? elapsed : -1;
  const lit = [AT.cables, AT.size, AT.firstFill, AT.standard, AT.result].map((at) => t >= at);
  const required = useTelemetry(t2.required, countUp, AT.size, 0.5, play);
  const secondTry = t >= AT.nextSize;

  return (
    <div className="mt-10 rounded-[14px] border border-line-2 bg-bg p-4 md:p-5">
      <p className="mb-3 font-mono text-[11.5px] tracking-[0.08em] text-ink-3 uppercase">Tray T2, step by step</p>
      <ol ref={ref} className="grid gap-2 lg:grid-cols-[repeat(5,minmax(0,1fr))] lg:gap-0">
        {STEPS.map((name, i) => (
          <li key={name} data-lit={lit[i] || undefined} className="relative flex items-stretch lg:pr-6">
            <div
              className={`grid w-full content-start gap-1.5 rounded-xl border px-3.5 py-3 motion-safe:transition-[border-color,background-color] motion-safe:duration-500 ${
                lit[i] ? 'border-accent/45 bg-surface' : 'border-line-2 bg-bg-2'
              }`}
            >
              <span className={`font-mono text-[11px] tracking-[0.07em] uppercase motion-safe:transition-colors motion-safe:duration-500 ${lit[i] ? 'text-accent-ink' : 'text-ink-3'}`}>
                {String(i + 1).padStart(2, '0')} {name}
              </span>
              <div className="min-h-[52px] font-mono text-[13px] text-ink">
                {i === 0 && <Reveal on={lit[0]!}>{t2.cables} mm</Reveal>}
                {i === 1 && <Reveal on={lit[1]!}>Required {required}</Reveal>}
                {i === 2 && <FillStep t={t} secondTry={secondTry} />}
                {i === 3 && (
                  <Reveal on={lit[3]!}>
                    <span className="text-ink-3 line-through decoration-fail/70">{t2.firstTry}</span>
                    <span className="mx-1.5 text-ink-3">→</span>
                    <span className="font-semibold text-accent-ink">{t2.selected}</span>
                  </Reveal>
                )}
                {i === 4 && (
                  <Reveal on={lit[4]!}>
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-pass-bg px-2 py-0.5 font-semibold text-pass">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" /> {t2.selected}, PASS
                    </span>
                    <span className="mt-1 block text-[12px] text-ink-3">
                      fill {t2.selectedFill} of {t2.maxFill}
                    </span>
                  </Reveal>
                )}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <ChevronRight
                aria-hidden="true"
                className={`absolute top-1/2 right-0.5 hidden h-5 w-5 -translate-y-1/2 motion-safe:transition-colors motion-safe:duration-500 lg:block ${lit[i + 1] ? 'text-energy' : 'text-line-3'}`}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A value that fades in when its step lights. */
function Reveal({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <motion.div initial={false} animate={{ opacity: on ? 1 : 0, y: on ? 0 : 4 }} transition={{ duration: 0.4, ease }}>
      {children}
    </motion.div>
  );
}

/** The fill step: the first size fills past the limit, then the next size fills and passes. */
function FillStep({ t, secondTry }: { t: number; secondTry: boolean }) {
  const reduce = useStill();
  const limit = toNumber(t2.maxFill);
  const first = useFill(toNumber(t2.firstFill), t >= AT.firstFill, Boolean(reduce));
  const second = useFill(toNumber(t2.selectedFill), t >= AT.secondFill, Boolean(reduce));
  const [size, fill, value, colour, note] = secondTry
    ? [t2.selected, second.width, second.text, 'bg-pass', 'within the limit']
    : [t2.firstTry, first.width, first.text, 'bg-fail', `over ${t2.maxFill}, next size`];
  const shown = t >= AT.firstFill;
  return (
    <motion.div initial={false} animate={{ opacity: shown ? 1 : 0 }} transition={{ duration: 0.3 }} className="grid gap-1.5">
      <div className="flex justify-between gap-2">
        <span>{size}</span>
        <motion.span className={secondTry ? 'text-pass' : 'text-fail'}>{value}</motion.span>
      </div>
      <div className="relative h-1.5 rounded-full bg-line-2">
        <motion.span className={`absolute inset-y-0 left-0 rounded-full ${colour}`} style={{ width: fill }} />
        <span className="absolute -top-1 -bottom-1 w-px bg-warn" style={{ left: `${limit}%` }} />
      </div>
      <span className="text-[11.5px] text-ink-3">{note}</span>
    </motion.div>
  );
}

/** A fill that rises to `final` percent once `start` is true; at once under reduced motion. */
function useFill(final: number, start: boolean, reduce: boolean): { width: MotionValue<string>; text: MotionValue<string> } {
  const value = useMotionValue(reduce ? final : 0);
  useEffect(() => {
    if (reduce) {
      value.set(final);
      return;
    }
    if (!start) return;
    const controls = animate(value, final, { duration: 0.8, ease: [0.45, 0, 0.2, 1] });
    return () => controls.stop();
  }, [start, reduce, final, value]);
  return { width: useTransform(value, (v) => `${v}%`), text: useTransform(value, (v) => `${v.toFixed(1)}%`) };
}
