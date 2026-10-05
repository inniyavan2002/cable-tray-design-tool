import { motion } from 'framer-motion';
import { Maximize2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import appShot from '../images/app-dark.jpg';
import catalogShot from '../images/catalog-dark.jpg';
import compareShot from '../images/compare-dark.jpg';
import exportShot from '../images/export-dark.jpg';
import { SECTION, SectionHeading, Wrap } from './ui';
import { useStill } from './loop';

interface Screen {
  src: string;
  title: string;
  text: string;
  alt: string;
  span: string;
}

const SCREENS: Screen[] = [
  {
    src: appShot,
    title: 'Tray editor',
    text: 'Settings, cables, the selected size, the section drawing and the calculation on one screen.',
    alt: 'The app with tray TR-03: settings, cables, the selected size, the section drawing and the calculation',
    span: 'lg:col-span-7',
  },
  {
    src: compareShot,
    title: 'Compare trays',
    text: 'A card for each tray with its section, above one table of sizes and fills.',
    alt: 'Three trays compared side by side, each with a small section drawing, above one table',
    span: 'lg:col-span-5',
  },
  {
    src: catalogShot,
    title: 'Catalog',
    text: 'Every value of a cable, its checks, and a link to its catalogue page.',
    alt: 'The catalog showing one cable with all its values, its checks and a link to its catalogue page',
    span: 'lg:col-span-5',
  },
  {
    src: exportShot,
    title: 'Export',
    text: 'This tray, selected trays or the whole project, as PDF, Excel, PNG or SVG.',
    alt: 'The export window: this tray, selected trays or the whole project, as PDF, Excel, PNG or SVG',
    span: 'lg:col-span-7',
  },
];

export function Screens() {
  const reduce = useStill();
  const [open, setOpen] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open !== null && !d.open) d.showModal();
    if (open === null && d.open) d.close();
  }, [open]);

  const screen = open === null ? null : SCREENS[open]!;

  return (
    <section id="screens" aria-labelledby="screens-title" className={SECTION}>
      <Wrap>
        <SectionHeading id="screens-title" intro="The example project as the app shows it. Select a screen to see it full size.">
          Inside the app
        </SectionHeading>
        <ul className="mt-12 grid gap-4 lg:grid-cols-12">
          {SCREENS.map((s, i) => (
            // The list item watches for the screen scrolling into view: a fully clipped element never counts as in view.
            <motion.li key={s.title} className={s.span} initial={reduce ? false : 'hidden'} whileInView="shown" viewport={{ once: true, amount: 0.25 }}>
              <motion.button
                type="button"
                aria-haspopup="dialog"
                onClick={(e) => {
                  opener.current = e.currentTarget;
                  setOpen(i);
                }}
                className="group relative block aspect-[1360/820] w-full overflow-hidden rounded-[14px] border border-line-2 bg-surface text-left hover:border-accent/50 focus-visible:border-accent motion-safe:transition-colors lg:aspect-auto lg:h-[340px]"
                variants={{ hidden: { clipPath: 'inset(0 0 100% 0 round 14px)' }, shown: { clipPath: 'inset(0 0 0% 0 round 14px)' } }}
                transition={{ duration: 1, delay: (i % 2) * 0.12, ease: [0.16, 1, 0.3, 1] }}
              >
                <img
                  src={s.src}
                  width={1360}
                  height={820}
                  loading="lazy"
                  decoding="async"
                  alt={s.alt}
                  className="h-full w-full object-cover object-left-top motion-safe:transition-transform motion-safe:duration-700 motion-safe:group-hover:scale-[1.035]"
                />
                <span className="absolute inset-x-0 bottom-0 grid gap-1 bg-gradient-to-t from-[rgba(4,9,18,0.95)] via-[rgba(4,9,18,0.8)] to-transparent px-5 pt-12 pb-4">
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-cond text-[20px] font-semibold text-ink">{s.title}</span>
                    <Maximize2 className="h-4 w-4 text-ink-2 motion-safe:transition-transform group-hover:scale-110" aria-hidden="true" />
                  </span>
                  <span className="text-[14px] text-ink-2 [@media(hover:hover)]:hidden [@media(hover:hover)]:group-hover:block [@media(hover:hover)]:group-focus-visible:block">
                    {s.text}
                  </span>
                </span>
              </motion.button>
            </motion.li>
          ))}
        </ul>
      </Wrap>

      <dialog
        ref={dialog}
        aria-labelledby="screen-title"
        className="lightbox glass m-auto w-[min(1200px,calc(100vw-32px))] max-w-none rounded-2xl border border-white/10 p-0 text-ink"
        onClose={() => {
          setOpen(null);
          opener.current?.focus();
        }}
        onClick={(e) => {
          // A click on the backdrop lands on the dialog itself.
          if (e.target === e.currentTarget) setOpen(null);
        }}
      >
        {screen && (
          <div className="grid gap-3 p-3 md:p-4">
            <div className="flex items-start justify-between gap-4 px-1">
              <div>
                <h3 id="screen-title" className="font-cond text-[22px] leading-tight font-semibold">
                  {screen.title}
                </h3>
                <p className="text-[14.5px] text-ink-2">{screen.text}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line-3/70 bg-white/[0.04] px-3 py-1.5 text-[14px] font-semibold text-ink hover:border-accent-ink"
              >
                <X className="h-4 w-4" aria-hidden="true" /> Close
              </button>
            </div>
            <img src={screen.src} width={1360} height={820} alt={screen.alt} className="block h-auto max-h-[78vh] w-full rounded-lg border border-line-2 object-contain" />
          </div>
        )}
      </dialog>
    </section>
  );
}
