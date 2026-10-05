import { motion, useInView, type Variants } from 'framer-motion';
import { ArrowUpRight, Check, Download as DownloadIcon, FileImage, FileSpreadsheet, FileText, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { APP, APP_HREF, CONFIG, FILES, pdfHref } from '../data';
import { CalcPipeline } from './CalcPipeline';
import { ARROW, Button, Reveal, SECTION, SectionHeading, Wrap } from './ui';
import { useStill } from './loop';

const { t2, catalog } = APP;
const ease = [0.16, 1, 0.3, 1] as const;

/** Props that play `variants` staggered the first time the element scrolls into view; nothing under reduced motion. */
function stagger(reduce: boolean | null, gap: number, amount = 0.3) {
  return reduce ? {} : { initial: 'hidden', whileInView: 'shown', viewport: { once: true, amount }, variants: { hidden: {}, shown: { transition: { staggerChildren: gap } } } };
}
const lineIn: Variants = { hidden: { opacity: 0, x: -10 }, shown: { opacity: 1, x: 0, transition: { duration: 0.5, ease } } };

const FORMULAS: Array<{ note: string; name?: string; expr: string }> = [
  { note: 'Width of a layer (largest cable first)', name: 'W_layer', expr: ' = ΣOD + gaps        gap = s × larger OD of the pair' },
  { note: 'Required width', name: 'W', expr: ' = W_layer,max × (1 + spare) + 2 × k × OD_max' },
  { note: 'Required height', name: 'H', expr: ' = Σ layer heights + layer gaps + top clearance' },
  { note: 'Fill', name: 'fill', expr: ' = Σ π/4 × OD² ÷ (tray width × tray height)' },
  { note: 'Selection', expr: 'the smallest standard W × H that fits and meets the fill limit;\non a tie, the narrower tray' },
];

export function Method() {
  const reduce = useStill();
  return (
    <section id="method" aria-labelledby="method-title" className={`${SECTION} border-y border-line bg-bg-2`}>
      <Wrap>
        <SectionHeading id="method-title" intro="The same rules run on screen and in every report, so a checker can follow the size from the cables to the tray.">
          How it sizes a tray
        </SectionHeading>
        <CalcPipeline />
        <Reveal className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          {/* The working is written out line by line, with a rule drawing down beside it. */}
          <pre className="relative m-0 overflow-x-auto rounded-[14px] border border-line-2 bg-bg px-6 py-5 font-mono text-[13.5px] leading-[1.95]">
            {!reduce && (
              <motion.span
                aria-hidden="true"
                className="absolute top-5 bottom-5 left-3 w-px origin-top bg-gradient-to-b from-accent to-energy"
                initial={{ scaleY: 0 }}
                whileInView={{ scaleY: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 1.6, ease }}
              />
            )}
            <motion.code className="block" {...stagger(reduce, 0.28, 0.4)}>
              {FORMULAS.map((f) => (
                <motion.span key={f.note} className="block" variants={lineIn}>
                  <span className="text-ink-3">{f.note}</span>
                  {'\n'}
                  {f.name && <span className="text-accent-ink">{f.name}</span>}
                  {f.expr}
                </motion.span>
              ))}
            </motion.code>
          </pre>
          <div className="grid gap-3 rounded-[14px] border border-accent/40 bg-surface px-6 py-5 shadow-[0_24px_48px_-28px_rgba(37,99,235,0.6)]">
            <h3 className="text-[17px] font-semibold">Worked example: tray T2</h3>
            <p className="font-mono text-sm text-ink-2">
              {t2.cables} mm cables in {t2.layers} touching layers
            </p>
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Tray T2 sizing steps</caption>
              <motion.tbody {...stagger(reduce, 0.3, 0.6)}>
                {[
                  ['Required size', t2.required, ''],
                  [`${t2.firstTry}: fill`, `${t2.firstFill}, over ${t2.maxFill}`, 'text-fail'],
                  [`${t2.selected}: fill`, `${t2.selectedFill}, selected`, 'text-pass'],
                ].map(([name, value, tone]) => (
                  <motion.tr key={name} className="border-t border-line-2" variants={lineIn}>
                    <th scope="row" className="py-2 pr-3 text-left font-normal text-ink-2">
                      {name}
                    </th>
                    <td className={`py-2 text-right font-mono ${tone}`}>{value}</td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
            <p className="text-[13.5px] text-ink-3">
              s is the spacing factor, k the side clearance factor, and spare the spare capacity for width. Layer gaps are the largest OD of the layer above,
              when used.
            </p>
          </div>
        </Reveal>
        <Reveal className="mt-6 grid max-w-[80ch] gap-1.5 rounded-r-lg border-l-[3px] border-warn bg-warn-bg/50 py-3 pr-4 pl-5">
          <h3 className="text-[16.5px] font-semibold">Not covered yet</h3>
          <p className="text-ink-2">
            The NEC 392.22 fill method, solid-bottom trays, tray load and support spans, and current rating. The app does not claim compliance with a particular
            standard, so check the result against your project's specification.
          </p>
        </Reveal>
      </Wrap>
    </section>
  );
}

export function Catalogues() {
  const reduce = useStill();
  // The scan starts outside the table's scroll box, where it never counts as in view, so the table starts it.
  const table = useRef<HTMLTableElement>(null);
  const tableInView = useInView(table, { once: true, amount: 0.3 });
  const validated = useValidated(catalog.brands.length, tableInView, Boolean(reduce));
  return (
    <section id="catalogues" aria-labelledby="catalogues-title" className={SECTION}>
      <Wrap>
        <SectionHeading
          id="catalogues-title"
          intro={`${catalog.rows} rows, read from these catalogues. Rows to review can be used and are marked in reports. Excluded rows have an impossible value and cannot be used.`}
        >
          {catalog.manufacturers} manufacturers' catalogues
        </SectionHeading>
        {/* Relative, so screen-reader-only text stays inside the scroll box and cannot widen the page. */}
        <Reveal scale className="relative mt-10 overflow-x-auto rounded-[14px] border border-line-2 bg-surface">
          {/* A scan passes down the table as its rows come in. */}
          {!reduce && (
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 z-10 h-20 bg-[linear-gradient(180deg,transparent,rgba(62,224,255,0.06)_45%,rgba(124,190,255,0.28)_50%,rgba(62,224,255,0.06)_55%,transparent)]"
              initial={{ top: '-20%', opacity: 1 }}
              animate={tableInView ? { top: '105%', opacity: 0 } : undefined}
              transition={{ duration: 1.9, delay: 0.25, ease: [0.45, 0, 0.3, 1] }}
            />
          )}
          <table ref={table} className="w-full border-collapse text-[14.5px]">
            <thead>
              <tr className="border-b border-line-2 bg-surface-2 font-mono text-[11px] tracking-[0.07em] text-ink-3 uppercase">
                {['Manufacturer', 'Rows', 'Checked', 'To review', 'Excluded', 'Pages', 'Catalogue', 'Checks'].map((h, i) => (
                  <th key={h} scope="col" className={`px-4 py-3 font-semibold whitespace-nowrap ${i >= 1 && i <= 5 ? 'text-right' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <motion.tbody {...stagger(reduce, 0.07)}>
              {catalog.brands.map((b, i) => (
                <motion.tr key={b.name} className="hover:bg-white/[0.03]" variants={lineIn}>
                  <th scope="row" className="px-4 py-2.5 text-left font-semibold whitespace-nowrap">
                    {b.name}
                  </th>
                  {[b.rows, b.checked, b.needsReview, b.excluded, b.pdfPages].map((v, i) => (
                    <td key={i} className="px-4 py-2.5 text-right font-mono whitespace-nowrap text-ink-2">
                      {v}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <a href={pdfHref(b.pdfFile)} className="font-semibold">
                      PDF<span className="sr-only">: {b.name} catalogue,</span> {FILES.pdfMb[b.pdfFile as keyof typeof FILES.pdfMb]} MB
                    </a>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12.5px] whitespace-nowrap">
                    <ValidationState state={i < validated ? 'done' : i === validated ? 'checking' : 'queued'} />
                  </td>
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
        </Reveal>
        <p className="mt-4 max-w-[88ch] text-[13.5px] text-ink-3">
          Values come from the manufacturers' published catalogues and may contain errors, so check them against the latest catalogue. Cable Tray Design is not
          affiliated with or endorsed by any of these manufacturers; their names belong to them. Found a wrong value? <a href="#contact">Tell us</a>.
        </p>
      </Wrap>
    </section>
  );
}

/**
 * How many catalogue rows (manufacturers) the scan has validated: one more
 * every 170 ms once the table is in view; all of them at once under reduced
 * motion.
 */
function useValidated(count: number, start: boolean, reduce: boolean): number {
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (!start || reduce) return;
    const timer = setInterval(() => setDone((n) => (n >= count ? n : n + 1)), 170);
    return () => clearInterval(timer);
  }, [count, start, reduce]);
  return reduce ? count : done;
}

/** A manufacturer's checks: waiting, running as the scan passes, then validated. */
function ValidationState({ state }: { state: 'queued' | 'checking' | 'done' }) {
  if (state === 'done') {
    return (
      <motion.span className="inline-flex items-center gap-1.5 text-pass" initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <Check className="h-3.5 w-3.5" aria-hidden="true" /> Validated
      </motion.span>
    );
  }
  if (state === 'checking') {
    return (
      <span className="inline-flex items-center gap-1.5 text-accent-ink">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-energy" /> Checking
      </span>
    );
  }
  return <span className="text-ink-3">Queued</span>;
}

const SAMPLES = [
  {
    href: 'samples/example-report.pdf',
    icon: FileText,
    title: 'PDF report',
    format: 'PDF',
    text: `${FILES.reportPages} pages with a title block, a tray summary, and each tray's result, drawing, cable schedule and calculation`,
  },
  { href: 'samples/example-workbook.xlsx', icon: FileSpreadsheet, title: 'Excel workbook', format: 'XLSX', text: 'A project sheet, one sheet per tray with its drawing, and the cables used' },
  { href: 'samples/example-section-TR-01.svg', icon: FileImage, title: 'Section drawing', format: 'SVG', text: 'Tray TR-01 as a vector drawing that scales without blurring' },
];

export function Download() {
  const reduce = useStill();
  const list = useRef<HTMLUListElement>(null);
  const listInView = useInView(list, { once: true, amount: 0.5 });
  return (
    <section id="download" aria-labelledby="download-title" className={`${SECTION} border-y border-line bg-bg-2`}>
      <Wrap className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <Reveal className="relative grid gap-5 overflow-hidden rounded-2xl border border-accent/40 bg-surface px-7 py-8 max-md:px-5">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(80%_90%_at_100%_0%,rgba(37,99,235,0.22),transparent_60%)]" />
          <div className="relative grid gap-3">
            <h2 id="download-title" className="section-title">
              Use it without the internet
            </h2>
            <p className="max-w-[56ch] text-ink-2">The app runs in your browser and sends nothing anywhere. Download it once and it works offline.</p>
            <ol className="grid list-decimal gap-1 pl-5 text-ink-2 marker:font-mono marker:text-accent-ink">
              <li>Download the package and unzip it.</li>
              <li>
                Open <b className="text-ink">CableTrayDesign.html</b> in Chrome, Edge or Firefox.
              </li>
              <li>
                Keep the <b className="text-ink">pdfs</b> folder next to it, for catalogue pages.
              </li>
            </ol>
          </div>
          <div className="relative flex flex-wrap items-center gap-3">
            <Button primary href={CONFIG.downloadUrl}>
              <DownloadIcon className={`h-4 w-4 ${ARROW.down}`} aria-hidden="true" /> Download for offline use
            </Button>
            <Button href={APP_HREF}>
              Open the app <ArrowUpRight className={`h-4 w-4 ${ARROW.upRight}`} aria-hidden="true" />
            </Button>
          </div>
          <p className="relative font-mono text-xs text-ink-3">
            Version {APP.version}, about {FILES.offlineMb} MB
          </p>
        </Reveal>
        <Reveal delay={0.1} className="grid gap-4 px-1 pt-2">
          <div>
            <h3 className="font-cond text-[24px] leading-tight font-semibold">See the output before you start</h3>
            <p className="mt-1.5 text-ink-2">Made by the app from an example project with three trays, TR-01 to TR-03.</p>
          </div>
          <ul ref={list} className="grid gap-2.5">
            {SAMPLES.map(({ href, icon: Icon, title, format, text }, i) => (
              <li key={href}>
                <a
                  href={href}
                  className="group grid grid-cols-[40px_minmax(0,1fr)_auto] items-start gap-x-4 rounded-xl border border-line-2 bg-surface px-4 py-3.5 text-ink no-underline hover:border-accent/50 motion-safe:transition-colors"
                >
                  <GeneratedIcon icon={<Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />} start={listInView} delay={0.2 + i * 0.45} still={Boolean(reduce)} />
                  <span className="grid gap-0.5">
                    <b className="text-accent-ink underline underline-offset-2">{title}</b>
                    <span className="text-[14.5px] text-ink-2">{text}</span>
                  </span>
                  <span className="mt-0.5 font-mono text-xs text-ink-3">{format}</span>
                </a>
              </li>
            ))}
          </ul>
        </Reveal>
      </Wrap>
    </section>
  );
}

const QUESTIONS: ReadonlyArray<[string, ReactNode]> = [
  ['Does it work without the internet?', 'Yes. Download the offline package, unzip it and open CableTrayDesign.html. Keep the pdfs folder next to it.'],
  [
    'Where are my projects kept?',
    "In the browser you use, on your computer. Save a project file to back a project up or to share it. Clearing the browser's data removes projects that were not saved to a file.",
  ],
  [
    'Is anything uploaded?',
    "No. The app runs in your browser and sends nothing anywhere. The contact form is the one exception: it sends only what you type, with the app version, to the Cable Tray Design team's feedback sheet.",
  ],
  [
    'Which standard does the method follow?',
    "The area method shown under How it sizes a tray: the cables' cross-section area against tray width × height, with your fill limit (40% unless you change it). The app does not claim compliance with a particular standard. Check the result against your project's specification.",
  ],
  ['Can I use NEC 392.22?', 'Not yet. It is planned as a second calculation method for projects whose specification requires it.'],
  [
    'How do I bring trays over from the old tool?',
    <>
      Open the new app in the same browser you used the old tool in. Your trays are imported the first time, and anything that cannot be matched is listed.
      The old tool stays available for three months as the <a href="previous/tool.html">previous version</a>.
    </>,
  ],
  [
    'I found a wrong catalogue value',
    <>
      Send it through the <a href="#contact">contact form</a> with the manufacturer, the cable and the catalogue page. Corrections are recorded with who made
      them and why.
    </>,
  ],
];

export function Questions() {
  return (
    <section id="questions" aria-labelledby="questions-title" className={SECTION}>
      <Wrap narrow>
        <SectionHeading id="questions-title">Questions</SectionHeading>
        <Reveal className="mt-8 grid gap-2.5">
          {QUESTIONS.map(([question, answer]) => (
            <details key={question} className="group rounded-xl border border-line-2 bg-surface open:border-accent/40 motion-safe:transition-colors">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                {question}
                <Plus aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-3 group-open:rotate-45 group-open:text-accent-ink motion-safe:transition-transform" />
              </summary>
              <p className="max-w-[68ch] px-5 pb-5 text-ink-2">{answer}</p>
            </details>
          ))}
        </Reveal>
      </Wrap>
    </section>
  );
}

/**
 * A sample file's icon, produced from the finished design: a bar fills under
 * it, the icon comes up, and a check marks it done. Each file follows the
 * last; all done at once under reduced motion.
 */
function GeneratedIcon({ icon, start, delay, still }: { icon: ReactNode; start: boolean; delay: number; still: boolean }) {
  const play = start && !still;
  const at = (extra: number, duration = 0.4) => ({ duration: play ? duration : 0, delay: play ? delay + extra : 0, ease });
  const done = still || start;
  return (
    <span aria-hidden="true" className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-lg bg-accent-soft text-accent-ink">
      <motion.span initial={false} animate={{ opacity: done ? 1 : 0.35 }} transition={at(0.5)}>
        {icon}
      </motion.span>
      {!still && (
        <motion.span
          className="absolute inset-x-1 bottom-1 h-[3px] origin-left rounded-full bg-energy"
          initial={{ scaleX: 0, opacity: 1 }}
          animate={start ? { scaleX: 1, opacity: 0 } : { scaleX: 0, opacity: 1 }}
          transition={{ scaleX: at(0, 0.5), opacity: at(0.55, 0.25) }}
        />
      )}
      <motion.span
        className="absolute -top-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-pass text-bg"
        initial={false}
        animate={{ scale: done ? 1 : 0 }}
        transition={at(0.6, 0.3)}
      >
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </motion.span>
    </span>
  );
}
