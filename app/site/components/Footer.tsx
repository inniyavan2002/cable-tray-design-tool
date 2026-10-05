import { ArrowUp, GitBranch } from 'lucide-react';
import { APP, APP_HREF, CONFIG } from '../data';
import { TrayMark, Wrap } from './ui';

const COLUMNS: ReadonlyArray<[string, ReadonlyArray<[string, string]>]> = [
  [
    'Product',
    [
      [APP_HREF, 'Open the app'],
      ['#features', 'Features'],
      ['#showcase', 'Showcase'],
      ['#workflow', 'Workflow'],
    ],
  ],
  [
    'Resources',
    [
      ['#method', 'How it sizes a tray'],
      ['#catalogues', 'Catalogues'],
      ['samples/example-report.pdf', 'Sample report'],
      ['previous/tool.html', 'Previous version'],
    ],
  ],
  [
    'Project',
    [
      [`${CONFIG.repository}/releases`, 'Release notes'],
      ['#download', 'Download'],
      ['#contact', 'Contact'],
    ],
  ],
];

export function Footer() {
  return (
    <footer className="relative border-t border-line bg-bg-2 pb-[env(safe-area-inset-bottom,0px)]">
      <Wrap className="grid gap-10 py-14 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,0.7fr))]">
        <div className="grid content-start gap-3">
          <a href="#top" className="inline-flex items-center gap-2.5 justify-self-start font-cond text-lg font-semibold text-ink no-underline">
            <TrayMark />
            Cable Tray Design
          </a>
          <p className="max-w-[40ch] text-[14.5px] text-ink-2">
            Cable tray sizing from {APP.catalog.rows} catalogue rows from {APP.catalog.manufacturers} manufacturers, in your browser.
          </p>
          <p className="text-[13.5px] text-ink-3">Results must be checked by a qualified engineer.</p>
          {CONFIG.publisher && <p className="text-[13.5px] text-ink-3">Published by {CONFIG.publisher}.</p>}
        </div>
        {COLUMNS.map(([title, links]) => (
          <nav key={title} aria-label={title} className="grid content-start gap-3">
            <h2 className="font-mono text-[11.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">{title}</h2>
            <ul className="grid gap-2 text-[14.5px]">
              {links.map(([href, text]) => (
                <li key={text}>
                  <a href={href} className="text-ink-2 no-underline hover:text-ink hover:underline">
                    {text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Wrap>
      <div className="border-t border-line">
        <Wrap className="flex flex-wrap items-center justify-between gap-4 py-5">
          <a
            href={CONFIG.repository}
            className="inline-flex items-center gap-2 rounded-lg border border-line-2 px-3 py-1.5 text-[13.5px] text-ink-2 no-underline hover:border-accent-ink hover:text-ink"
          >
            <GitBranch className="h-4 w-4" aria-hidden="true" /> Source on GitHub
          </a>
          <a href="#top" className="inline-flex items-center gap-1.5 text-[13.5px] text-ink-2 no-underline hover:text-ink">
            Back to top <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </a>
        </Wrap>
      </div>
    </footer>
  );
}
