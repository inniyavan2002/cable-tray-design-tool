import { useId, useMemo, useState } from 'react';
import { loadCatalog } from '../../data/catalog';
import { FACETS, searchCatalog, type Facet, type Filters } from '../../data/catalog/search';
import { int, num1 } from '../../domain/format';
import { MAX_QUANTITY, type NewTrayCable } from '../../state/projectModel';
import { catalogTitle } from '../../state/trayResult';
import type { PickerTab } from '../../state/uiStore';
import { QuantityStepper } from '../common/controls';
import { Dialog } from '../common/Dialog';
import styles from './CablePicker.module.css';
import { CatalogRow, CatalogTableHead, cataloguePdfUrl, FACET_LABELS, FacetSelect, formatFacet } from './catalogParts';
/** Rows shown at once; more means the search should be narrowed. */
const MAX_ROWS = 200;

interface CablePickerProps {
  open: boolean;
  trayName: string;
  /** The tab to show when the dialog opens; null keeps the last one used. */
  tab?: PickerTab | null;
  onClose: () => void;
  onAdd: (cable: NewTrayCable) => void;
}

/** Adds a cable and says what was added: "2 × Doha · 4C 240 mm²". */
type AddCable = (cable: NewTrayCable, description: string) => void;

export function CablePicker({ open, trayName, tab: requestedTab = null, onClose, onAdd }: CablePickerProps) {
  const [tab, setTab] = useState<PickerTab>('catalog');
  // Keeps the dialog open after each add, for entering several cables in a row.
  const [keepOpen, setKeepOpen] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const keepId = useId();
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setAdded([]);
    if (open && requestedTab) setTab(requestedTab);
  }
  const add: AddCable = (cable, description) => {
    onAdd(cable);
    if (keepOpen) setAdded((list) => [...list, description]);
    else onClose();
  };

  return (
    <Dialog open={open} title={`Add cable to ${trayName}`} onClose={onClose} size="wide">
      {open && (
        <div className={styles.picker}>
          <div className={styles.tabs} role="tablist" aria-label="Cable source">
            <button type="button" role="tab" aria-selected={tab === 'catalog'} className={styles.tab} onClick={() => setTab('catalog')}>
              From catalog
            </button>
            <button type="button" role="tab" aria-selected={tab === 'manual'} className={styles.tab} onClick={() => setTab('manual')}>
              Manual cable
            </button>
          </div>
          {tab === 'catalog' ? <CatalogTab onAdd={add} /> : <ManualTab onAdd={add} />}
          <div className={styles.keep}>
            <label htmlFor={keepId} className={styles.keepLabel}>
              <input id={keepId} type="checkbox" checked={keepOpen} onChange={(e) => setKeepOpen(e.target.checked)} />
              Keep this window open to add more cables
            </label>
            <p className={styles.added} aria-live="polite">
              {added.length > 0 && (
                <>
                  <b>Added to {trayName}:</b> {added.join(' · ')}
                </>
              )}
            </p>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function CatalogTab({ onAdd }: { onAdd: AddCable }) {
  const catalog = loadCatalog();
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const result = useMemo(() => searchCatalog(catalog.cables, { query, filters }), [catalog, query, filters]);
  const selected = selectedId ? catalog.byId.get(selectedId) ?? null : null;
  const fromQuery = FACETS.filter((f) => result.queryFilters[f]?.length).map((f) => `${FACET_LABELS[f]}: ${result.queryFilters[f]!.join(', ')}`);

  const setFacet = (facet: Facet, value: string) => setFilters((current) => ({ ...current, [facet]: value ? [value] : [] }));

  return (
    <div className={styles.catalog}>
      <div className={styles.searchRow}>
        <label htmlFor={searchId} className={styles.searchLabel}>
          Search
        </label>
        <input
          id={searchId}
          className={styles.search}
          type="search"
          autoFocus
          value={query}
          placeholder="e.g. 4c 240 cu xlpe swa, or a product code"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className={styles.facets}>
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
          className={styles.clear}
          onClick={() => {
            setFilters({});
            setQuery('');
          }}
        >
          Clear
        </button>
      </div>

      <p className={styles.count} aria-live="polite">
        {result.cables.length === 0
          ? 'No cables match. Remove a filter or change the search.'
          : `${int(result.cables.length)} cable${result.cables.length === 1 ? '' : 's'} match${result.cables.length > MAX_ROWS ? `; showing the first ${MAX_ROWS}` : ''}`}
        {fromQuery.length > 0 && <span className={styles.fromQuery}> · from your search: {fromQuery.join(' · ')}</span>}
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <CatalogTableHead />
          <tbody>
            {result.cables.slice(0, MAX_ROWS).map((c) => (
              <CatalogRow key={c.id} cable={c} group="picker-cable" selected={c.id === selectedId} onSelect={() => setSelectedId(c.id)} />
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        <div className={styles.selection}>
          {selected ? (
            <>
              <strong>
                {catalogTitle(selected)} · Ø {num1(selected.odMm)} mm
              </strong>
              <a className={styles.pageLink} href={cataloguePdfUrl(selected.source.file, selected.source.page)} target="_blank" rel="noopener">
                {selected.source.page ? `View catalogue page ${selected.source.page}` : 'Open the catalogue'} ↗
              </a>
              {selected.status === 'needs-review' && (
                <span className={styles.selectionWarning}>Needs review: {selected.flags.find((f) => f.severity === 'warning')?.message}</span>
              )}
            </>
          ) : (
            <span className={styles.muted}>Select a cable in the table.</span>
          )}
        </div>
        <QuantityStepper label="Quantity to add" value={quantity} max={MAX_QUANTITY} onChange={setQuantity} />
        <button
          type="button"
          className={styles.primary}
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            onAdd({ kind: 'catalog', catalogId: selected.id, quantity }, `${quantity} × ${catalogTitle(selected)}`);
            // Ready for the next cable when the dialog stays open; the search stays, for cables of the same family.
            setSelectedId(null);
            setQuantity(1);
          }}
        >
          Add {quantity} cable{quantity === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  );
}

function ManualTab({ onAdd }: { onAdd: AddCable }) {
  const labelId = useId();
  const odId = useId();
  const weightId = useId();
  const [label, setLabel] = useState('');
  const [od, setOd] = useState('');
  const [weight, setWeight] = useState('');
  const [quantity, setQuantity] = useState(1);
  const odValue = Number(od.replace(',', '.'));
  const weightValue = Number(weight.replace(',', '.'));
  const odError = od.trim() === '' ? null : !(odValue > 0 && odValue <= 200) ? 'Enter an OD between 0 and 200 mm.' : null;
  const weightError = weight.trim() === '' ? null : !(weightValue > 0) ? 'Enter a positive weight, or leave it blank.' : null;
  const canAdd = od.trim() !== '' && !odError && !weightError;

  return (
    <form
      className={styles.manual}
      onSubmit={(e) => {
        e.preventDefault();
        if (!canAdd) return;
        const name = label.trim() || 'Manual cable';
        onAdd({ kind: 'manual', label: name, odMm: odValue, weightKgPerKm: weight.trim() ? weightValue : null, quantity }, `${quantity} × ${name} (Ø ${num1(odValue)} mm)`);
        setLabel('');
        setOd('');
        setWeight('');
        setQuantity(1);
      }}
    >
      <p className={styles.muted}>For cables that are not in the catalog. Manual cables are marked "Manual" in results and reports.</p>
      <label htmlFor={labelId} className={styles.facetLabel}>
        Description
      </label>
      <input id={labelId} className={styles.search} value={label} maxLength={80} placeholder="e.g. Fire alarm 2C 1.5 mm² FP200" onChange={(e) => setLabel(e.target.value)} />
      <div className={styles.manualGrid}>
        <div>
          <label htmlFor={odId} className={styles.facetLabel}>
            Outside diameter (mm)
          </label>
          <input id={odId} className={styles.search} inputMode="decimal" value={od} aria-invalid={odError ? true : undefined} onChange={(e) => setOd(e.target.value)} />
          {odError && <span className={styles.error}>{odError}</span>}
        </div>
        <div>
          <label htmlFor={weightId} className={styles.facetLabel}>
            Weight (kg/km, optional)
          </label>
          <input
            id={weightId}
            className={styles.search}
            inputMode="decimal"
            value={weight}
            aria-invalid={weightError ? true : undefined}
            onChange={(e) => setWeight(e.target.value)}
          />
          {weightError && <span className={styles.error}>{weightError}</span>}
        </div>
      </div>
      <div className={styles.footer}>
        <div className={styles.selection} />
        <QuantityStepper label="Quantity to add" value={quantity} max={MAX_QUANTITY} onChange={setQuantity} />
        <button type="submit" className={styles.primary} disabled={!canAdd}>
          Add {quantity} cable{quantity === 1 ? '' : 's'}
        </button>
      </div>
    </form>
  );
}
