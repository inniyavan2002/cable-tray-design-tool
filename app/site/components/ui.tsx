import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useStill } from './loop';

/** The page's content width, with at least a 16 px gutter. */
export function Wrap({ children, className = '', narrow = false }: { children: ReactNode; className?: string; narrow?: boolean }) {
  return <div className={`mx-auto w-full px-4 md:px-6 ${narrow ? 'max-w-[860px]' : 'max-w-[1220px]'} ${className}`}>{children}</div>;
}

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * A section's heading and optional introduction. Sections carry no label above
 * the heading: the heading says it. The first time it scrolls into view, the
 * heading rises out of its own line and the introduction follows.
 */
export function SectionHeading({ id, children, intro, className = '' }: { id: string; children: ReactNode; intro?: ReactNode; className?: string }) {
  const reduce = useStill();
  return (
    // The wrapper watches for the heading: the heading itself starts outside its clipped line.
    <motion.div className={className} initial={reduce ? false : 'hidden'} whileInView="shown" viewport={{ once: true, amount: 0.3 }}>
      <h2 id={id} className="section-title">
        <span className="-mb-[0.12em] block overflow-hidden pb-[0.12em]">
          <motion.span className="block" variants={{ hidden: { y: '105%' }, shown: { y: 0, transition: { duration: 0.85, ease } } }}>
            {children}
          </motion.span>
        </span>
      </h2>
      {intro && (
        <motion.p
          className="mt-3.5 max-w-[62ch] text-[17px] text-ink-2"
          variants={{ hidden: { opacity: 0, y: 12 }, shown: { opacity: 1, y: 0, transition: { duration: 0.7, delay: 0.15, ease } } }}
        >
          {intro}
        </motion.p>
      )}
    </motion.div>
  );
}

/** Content that rises gently into place the first time it scrolls into view; with `scale`, it also grows the last few percent. */
export function Reveal({ children, className = '', delay = 0, scale = false }: { children: ReactNode; className?: string; delay?: number; scale?: boolean }) {
  const reduce = useStill();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 18, scale: scale ? 0.97 : 1 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.7, delay, ease }}
    >
      {children}
    </motion.div>
  );
}

/** Arrow icons inside buttons move the way they point when the button is hovered or focused. */
export const ARROW = {
  upRight: 'motion-safe:transition-transform motion-safe:duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-focus-visible:translate-x-0.5 group-focus-visible:-translate-y-0.5',
  down: 'motion-safe:transition-transform motion-safe:duration-300 group-hover:translate-y-0.5 group-focus-visible:translate-y-0.5',
  right: 'motion-safe:transition-transform motion-safe:duration-300 group-hover:translate-x-1 group-focus-visible:translate-x-1',
};

/**
 * A link styled as a button. On hover and keyboard focus it lifts and glows a
 * little, and corner marks close in around it like a CAD selection; a light
 * sweeps across a primary button; it springs down when pressed.
 */
export function Button({
  href,
  children,
  primary = false,
  className = '',
}: {
  href: string;
  children: ReactNode;
  primary?: boolean;
  className?: string;
}) {
  return (
    <motion.a
      href={href}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.96, y: 0 }}
      transition={{ type: 'spring', stiffness: 520, damping: 28 }}
      className={`group relative inline-flex items-center justify-center gap-2 rounded-lg border px-5 py-3 text-[15px] leading-tight font-semibold no-underline will-change-transform ${
        primary
          ? 'border-accent-strong bg-accent-strong text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_28px_-12px_rgba(37,99,235,0.75)] hover:border-[#1e55d6] hover:bg-[#1e55d6] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_0_0_1px_rgba(124,176,255,0.35),0_14px_36px_-10px_rgba(37,99,235,0.95)] active:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_6px_16px_-8px_rgba(37,99,235,0.8)]'
          : 'border-line-3/70 bg-white/[0.03] text-ink hover:border-accent-ink hover:bg-white/[0.06] hover:shadow-[0_0_0_1px_rgba(124,176,255,0.2),0_12px_30px_-14px_rgba(61,139,255,0.7)]'
      } motion-safe:transition-[color,background-color,border-color,box-shadow] motion-safe:duration-300 ${className}`}
    >
      {primary && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <span className="btn-sweep" />
        </span>
      )}
      <CornerMarks />
      {children}
    </motion.a>
  );
}

/** Four L-shaped marks that move in from outside the element's corners. */
export function CornerMarks({ size = 'h-2 w-2', color = 'border-accent-ink' }: { size?: string; color?: string }) {
  const base = `pointer-events-none absolute ${size} ${color} opacity-0 motion-safe:transition-all motion-safe:duration-200 group-hover:opacity-100 group-focus-visible:opacity-100`;
  return (
    <span aria-hidden="true">
      <span className={`${base} -top-2.5 -left-2.5 border-t border-l group-hover:-top-1.5 group-hover:-left-1.5 group-focus-visible:-top-1.5 group-focus-visible:-left-1.5`} />
      <span className={`${base} -top-2.5 -right-2.5 border-t border-r group-hover:-top-1.5 group-hover:-right-1.5 group-focus-visible:-top-1.5 group-focus-visible:-right-1.5`} />
      <span className={`${base} -bottom-2.5 -left-2.5 border-b border-l group-hover:-bottom-1.5 group-hover:-left-1.5 group-focus-visible:-bottom-1.5 group-focus-visible:-left-1.5`} />
      <span className={`${base} -right-2.5 -bottom-2.5 border-r border-b group-hover:-right-1.5 group-hover:-bottom-1.5 group-focus-visible:-right-1.5 group-focus-visible:-bottom-1.5`} />
    </span>
  );
}

/** The app's mark: a tray section with two cables. */
export function TrayMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <path d="M3 6v20h26V6" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="10" cy="20" r="4" fill="var(--accent)" />
      <circle cx="19" cy="21" r="3" fill="var(--energy)" />
    </svg>
  );
}

/** Section spacing, shared so every section breathes the same. */
export const SECTION = 'relative py-24 max-md:py-16';
