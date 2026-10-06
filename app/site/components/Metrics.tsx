import { motion, useInView } from 'framer-motion';
import { useRef, type ReactNode } from 'react';
import { int } from '../../src/domain/format';
import { APP } from '../data';
import { Wrap } from './ui';
import { useStill } from './loop';

const { catalog, standards, limits } = APP;
const toNumber = (text: string) => Number(text.replace(/,/g, ''));

interface Metric {
  /** Read by screen readers; the rolling digits are hidden from them. */
  text: string;
  value: (roll: boolean) => ReactNode;
  label: string;
  /** Shown on hover, like a measurement's readout. */
  detail: string;
}

const METRICS: Metric[] = [
  {
    text: `${catalog.rows} rows`,
    value: (roll) => (
      <>
        <Odometer value={toNumber(catalog.rows)} roll={roll} /> rows
      </>
    ),
    label: `${catalog.manufacturers} manufacturers' catalogues`,
    detail: `${catalog.checked} checked, ${catalog.needsReview} to review, ${catalog.excluded} excluded`,
  },
  {
    text: `${standards.widths} × ${standards.heights} sizes`,
    value: (roll) => (
      <>
        <Odometer value={toNumber(standards.widths)} roll={roll} /> × <Odometer value={toNumber(standards.heights)} roll={roll} /> sizes
      </>
    ),
    label: 'Standard widths × heights, editable',
    detail: `Widths ${standards.widthRange} mm, heights ${standards.heightRange} mm`,
  },
  {
    text: `${limits.cableRows} rows · ${limits.layers} layers`,
    value: (roll) => (
      <>
        <Odometer value={toNumber(limits.cableRows)} roll={roll} /> rows · <Odometer value={toNumber(limits.layers)} roll={roll} /> layers
      </>
    ),
    label: 'Cable rows and layers per tray',
    detail: `Up to ${limits.quantity} of each cable`,
  },
  {
    text: 'PDF, Excel, SVG',
    value: () => 'PDF, Excel, SVG',
    label: 'Plus PNG and project files',
    detail: 'Title block, page numbers, and numbers you can calculate with',
  },
];

/** Four figures in cells like a title block; their digits roll into place when scrolled into view. */
export function Metrics() {
  const ref = useRef<HTMLUListElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  return (
    <div className="relative border-y border-line bg-bg-2/75">
      <Wrap>
        <ul ref={ref} aria-label="In figures" className="grid grid-cols-2 lg:grid-cols-4">
          {METRICS.map((m, i) => (
            <li
              key={m.label}
              className={`group relative grid content-start gap-1 px-4 py-6 md:px-6 md:py-8 ${i % 2 === 0 ? 'border-r border-line' : ''} ${i < 2 ? 'border-b border-line lg:border-b-0' : ''} ${
                i === 1 ? 'lg:border-r' : ''
              } ${i === 0 ? 'lg:pl-0' : ''}`}
            >
              <Brackets />
              <strong className="font-cond text-[24px] leading-tight font-semibold text-ink md:text-[34px]">
                <span className="sr-only">{m.text}</span>
                <span aria-hidden="true">{m.value(inView)}</span>
              </strong>
              <span className="font-mono text-[11.5px] tracking-[0.06em] text-ink-3 uppercase">{m.label}</span>
              <span className="sr-only">{m.detail}</span>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-full right-4 left-4 z-10 -mt-2 hidden rounded-lg border border-line-2 bg-surface-2 px-2.5 py-1.5 font-mono text-[11.5px] text-ink-2 opacity-0 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.7)] group-hover:opacity-100 motion-safe:transition-opacity md:right-6 md:left-6 [@media(hover:hover)]:block"
              >
                {m.detail}
              </span>
            </li>
          ))}
        </ul>
      </Wrap>
    </div>
  );
}

/** ┌ ┐ └ ┘ marks that appear at the cell's corners on hover. */
function Brackets() {
  const base = 'pointer-events-none absolute h-2.5 w-2.5 border-accent-ink opacity-0 group-hover:opacity-100 motion-safe:transition-opacity';
  return (
    <span aria-hidden="true">
      <span className={`${base} top-1.5 left-1.5 border-t border-l`} />
      <span className={`${base} top-1.5 right-1.5 border-t border-r`} />
      <span className={`${base} bottom-1.5 left-1.5 border-b border-l`} />
      <span className={`${base} right-1.5 bottom-1.5 border-r border-b`} />
    </span>
  );
}

/**
 * Digits that roll up to a value like a meter. Lower digits spin more times
 * than higher ones, so the count reads as rapid ticking that settles.
 */
function Odometer({ value, roll }: { value: number; roll: boolean }) {
  const reduce = useStill();
  const text = int(value);
  const digits = [...text].filter((c) => /\d/.test(c)).length;
  let position = 0;
  return (
    <span className="inline-flex" data-odometer={text}>
      {[...text].map((char, i) => {
        if (!/\d/.test(char)) return <span key={i}>{char}</span>;
        const fromRight = digits - 1 - position++;
        return <DigitColumn key={i} digit={Number(char)} spins={fromRight} roll={roll} still={Boolean(reduce)} />;
      })}
    </span>
  );
}

function DigitColumn({ digit, spins, roll, still }: { digit: number; spins: number; roll: boolean; still: boolean }) {
  const steps = spins * 10 + digit;
  const cells = Array.from({ length: steps + 1 }, (_, i) => i % 10);
  const final = `${(-steps / cells.length) * 100}%`;
  return (
    <span className="relative inline-block h-[1.15em] overflow-hidden leading-[1.15em]" data-digit-window>
      <motion.span
        className="flex flex-col will-change-transform"
        initial={still ? { y: final } : { y: '0%' }}
        animate={{ y: roll || still ? final : '0%' }}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
      >
        {cells.map((d, i) => (
          <span key={i} className="h-[1.15em]">
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  );
}
