import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { BRANDS, loadCatalog, type CatalogCable, type CatalogStatus } from '../../data/catalog';
import { FACETS, searchCatalog, type Facet, type Filters } from '../../data/catalog/search';
import { int, num1, plain } from '../../domain/format';
import { MAX_CABLE_ROWS } from '../../state/projectModel';
import { useActiveTray, useProjectStore } from '../../state/projectStore';
import { catalogSubtitle, catalogTitle } from '../../state/trayResult';
import { useUiStore } from '../../state/uiStore';
import { SegmentedControl } from '../common/controls';
import { Dialog } from '../common/Dialog';
import pickerStyles from '../picker/CablePicker.module.css';
import { CatalogRow, CatalogStatusChip, CatalogTableHead, cataloguePdfUrl, FACET_LABELS, FacetSelect, formatFacet } from '../picker/catalogParts';
import styles from './CatalogBrowser.module.css';

/** Rows drawn at once; "Show more" adds this many again. */
const PAGE_ROWS = 200;
/** False in browsers set to download PDFs instead of showing them; unknown in older browsers. */
const canShowPdf = typeof navigator === 'undefined' || navigator.pdfViewerEnabled !== false;

type StatusFilter = CatalogStatus | 'all';

export function CatalogBrowser() {
  const open = useUiStore((s) => s.dialog === 'catalog');
  const focusId = useUiStore((s) => s.catalogFocusId);
  const openDialog = useUiStore((s) => s.openDialog);
  return (
    <Dialog open={open} title="Cable catalog" onClose={() => openDialog(null)} size="full">
      {open && <CatalogContent focusId={focusId} />}
    </Dialog>
  );
}

function CatalogContent({ focusId }: { focusId: string | null }) {
  const catalog = loadCatalog();
  const focus = focusId ? (catalog.byId.get(focusId) ?? null) : null;
  const searchId = useId();
  const [query, setQuery] = useState('');
  // Opened on one cable: show its brand, cores and size, so it is in the list.
  const [filters, setFilters] = useState<Filters>(() =>
    focus ? { brand: [focus.brand], ...(focus.cores !== null && { cores: [String(focus.cores)] }), sizeMm2: [String(focus.sizeMm2)] } : {},
  );
  const [status, setStatus] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(focus?.id ?? null);
  const [limit, setLimit] = useState(PAGE_ROWS);
  const result = useMemo(() => searchCatalog(catalog.cables, { query, filters, includeExcluded: true }), [catalog, query, filters]);
  const rows = status === 'all' ? result.cables : result.cables.filter((c) => c.status === status);
  const selected = selectedId ? (catalog.byId.get(selectedId) ?? null) : null;
  const count = (s: CatalogStatus) => result.cables.filter((c) => c.status === s).length;
  const { byStatus, total } = catalog.summary;

  const setFacet = (facet: Facet, value: string) => {
    setFilters((current) => ({ ...current, [facet]: value ? [value] : [] }));
    setLimit(PAGE_ROWS);
  };

  return (
    <div className={styles.browser}>
      <p className={styles.summary}>
        {int(total)} rows from {BRANDS.length} manufacturers · {int(byStatus.checked)} checked · {int(byStatus['needs-review'])} need review ·{' '}
        {int(byStatus.excluded)} excluded. "Checked" means the row passed every automatic check; rows needing review can be used and are marked in
        reports; excluded rows have an impossible value and cannot be used.
      </p>

      <div className={styles.filters}>
        <div className={pickerStyles.searchRow}>
          <label htmlFor={searchId} className={pickerStyles.searchLabel}>
            Search
          </label>
          <input
            id={searchId}
            className={pickerStyles.search}
            type="search"
            value={query}
            placeholder="e.g. 4c 240 cu xlpe swa, or a product code"
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE_ROWS);
            }}
          />
        </div>
        <SegmentedControl<StatusFilter>
          legend="Status"
          options={[
            { value: 'all', label: `All ${int(result.cables.length)}` },
            { value: 'checked', label: `Checked ${int(count('checked'))}` },
            { value: 'needs-review', label: `Needs review ${int(count('needs-review'))}` },
            { value: 'excluded', label: `Excluded ${int(count('excluded'))}` },
          ]}
          value={status}
          onChange={(value) => {
            setStatus(value);
            setLimit(PAGE_ROWS);
          }}
        />
        <div className={pickerStyles.facets}>
          {FACETS.map((facet) => (
            <FacetSelect
              key={facet}
              label={FACET_LABELS[facet]}
              value={filters[facet]?.[0] ?? ''}
              options={result.facets[facet]}
              format={(v) => formatFacet(facet, v)}
              onChange={(value) => setFacet(facet, value)}
            />
          ))}
          <button
            type="button"
            className={pickerStyles.clear}
            onClick={() => {
              setFilters({});
              setQuery('');
              setStatus('all');
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div className={styles.split}>
        <div className={styles.listPane}>
          <p className={pickerStyles.count} aria-live="polite">
            {rows.length === 0 ? 'No rows match. Remove a filter or change the search.' : `${int(rows.length)} row${rows.length === 1 ? '' : 's'}`}
          </p>
          <div className={pickerStyles.tableWrap}>
            <table className={pickerStyles.table}>
              <CatalogTableHead />
              <tbody>
                {rows.slice(0, limit).map((c) => (
                  <CatalogRow key={c.id} cable={c} group="catalog-row" selected={c.id === selectedId} onSelect={() => setSelectedId(c.id)} />
                ))}
              </tbody>
            </table>
            {rows.length > limit && (
              <button type="button" className={styles.more} onClick={() => setLimit((n) => n + PAGE_ROWS)}>
                Show {int(Math.min(PAGE_ROWS, rows.length - limit))} more of {int(rows.length - limit)}
              </button>
            )}
          </div>
        </div>
        <CableDetail cable={selected} />
      </div>
    </div>
  );
}

function CableDetail({ cable }: { cable: CatalogCable | null }) {
  const tray = useActiveTray();
  const addCable = useProjectStore((s) => s.addCable);
  const showPages = useUiStore((s) => s.showCataloguePages);
  const setShowPages = useUiStore((s) => s.setShowCataloguePages);
  const [added, setAdded] = useState<string | null>(null);
  const [pageOffset, setPageOffset] = useState(0);
  const [seenId, setSeenId] = useState(cable?.id);
  const ref = useRef<HTMLElement>(null);

  // A different row starts again at its own page.
  if (cable?.id !== seenId) {
    setSeenId(cable?.id);
    setPageOffset(0);
    setAdded(null);
  }
  useEffect(() => {
    ref.current?.scrollTo?.({ top: 0 });
  }, [cable?.id]);

  if (!cable) {
    return (
      <aside className={styles.detail} aria-label="Selected cable">
        <p className={styles.placeholder}>Select a row to see all its values and the catalogue page it came from.</p>
      </aside>
    );
  }

  const brand = BRANDS.find((b) => b.id === cable.brandId);
  const page = cable.source.page === null ? null : Math.min(Math.max(1, cable.source.page + pageOffset), brand?.pdfPages ?? Infinity);
  const full = tray.cables.length >= MAX_CABLE_ROWS;
  const fields: Array<[string, string | null]> = [
    ['Brand', cable.brand],
    ['Type', cable.category],
    ['Standard', cable.standard],
    ['Voltage', cable.voltage],
    ['Conductor', cable.conductor],
    ['Insulation', cable.insulation],
    ['Armour', cable.armour],
    ['Screen', cable.screen],
    ['Cores', cable.cores === null ? 'Multi core' : `${cable.cores}${cable.reducedNeutral ? ', reduced neutral' : ''}`],
    ['Size', `${plain(cable.sizeMm2)} mm²${cable.neutralSizeMm2 ? ` (neutral ${plain(cable.neutralSizeMm2)} mm²)` : ''}`],
    ['Conductor shape', cable.conductorShape],
    ['Outside diameter', `${num1(cable.odMm)} mm`],
    ['Weight', cable.weightKgPerKm === null ? 'Not used (see checks)' : `${int(cable.weightKgPerKm)} kg/km`],
    ['Product code', cable.code],
    ...Object.entries(cable.details),
    ['Catalogue', `${cable.source.file}${cable.source.page ? `, page ${cable.source.page}` : ''}`],
    ['Catalog id', cable.id],
  ];

  return (
    <aside ref={ref} className={styles.detail} aria-label="Selected cable">
      <header className={styles.detailHead}>
        <h3 className={styles.detailTitle}>{catalogTitle(cable)}</h3>
        <CatalogStatusChip cable={cable} />
      </header>
      <p className={styles.subtitle}>{catalogSubtitle(cable)}</p>

      {cable.flags.length > 0 && (
        <ul className={styles.flags} aria-label="Checks">
          {cable.flags.map((f) => (
            <li key={f.code} data-severity={f.severity}>
              {f.message}
            </li>
          ))}
        </ul>
      )}
      {cable.review && (
        <p className={styles.review}>
          Reviewed{cable.review.by ? ` by ${cable.review.by}` : ''}
          {cable.review.date ? ` on ${cable.review.date}` : ''}: {cable.review.action}
          {cable.review.note ? `. ${cable.review.note}` : ''}
        </p>
      )}

      <div className={styles.addRow}>
        <button
          type="button"
          className={pickerStyles.primary}
          disabled={cable.status === 'excluded' || full}
          onClick={() => {
            if (addCable(tray.id, { kind: 'catalog', catalogId: cable.id, quantity: 1 })) setAdded(tray.name);
          }}
        >
          Add to {tray.name}
        </button>
        <span className={styles.addNote} role="status">
          {cable.status === 'excluded'
            ? 'Excluded rows cannot be used.'
            : full
              ? `${tray.name} already has ${MAX_CABLE_ROWS} cable rows.`
              : added
                ? `Added 1 to ${added}. Change the quantity in the cable list.`
                : ''}
        </span>
      </div>

      <dl className={styles.fields}>
        {fields
          .filter((f): f is [string, string] => Boolean(f[1]))
          .map(([label, value]) => (
            <div key={label} className={styles.field}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      {cable.source.raw && (
        <p className={styles.raw}>
          <span className={styles.rawLabel}>Text read from the catalogue</span>
          {cable.source.raw}
        </p>
      )}

      <section className={styles.pdf} aria-label="Catalogue page">
        <div className={styles.pdfBar}>
          {page === null ? (
            <span>The catalogue page of this row was not recorded.</span>
          ) : (
            <>
              <button type="button" className={styles.pageButton} disabled={page <= 1} onClick={() => setPageOffset((n) => n - 1)} aria-label="Previous page">
                ‹
              </button>
              <span>
                {cable.source.file}, page {page}
                {brand ? ` of ${brand.pdfPages}` : ''}
              </span>
              <button
                type="button"
                className={styles.pageButton}
                disabled={brand ? page >= brand.pdfPages : false}
                onClick={() => setPageOffset((n) => n + 1)}
                aria-label="Next page"
              >
                ›
              </button>
            </>
          )}
          <a className={styles.pdfLink} href={cataloguePdfUrl(cable.source.file, page)} target="_blank" rel="noopener">
            Open in a new tab ↗
          </a>
        </div>
        {page !== null &&
          (!canShowPdf ? (
            <p className={styles.pdfNote}>This browser downloads PDFs rather than showing them, so use Open in a new tab to see the page.</p>
          ) : showPages ? (
            <iframe
              key={`${cable.source.file}#${page}`}
              className={styles.frame}
              src={`${cataloguePdfUrl(cable.source.file, page)}&view=FitH`}
              title={`${cable.source.file}, page ${page}`}
            />
          ) : (
            <button type="button" className={styles.showPages} onClick={() => setShowPages(true)}>
              Show catalogue pages here
            </button>
          ))}
        <p className={styles.pdfNote}>Catalogue pages open from the pdfs folder next to this app. Keep that folder with it.</p>
      </section>
    </aside>
  );
}
