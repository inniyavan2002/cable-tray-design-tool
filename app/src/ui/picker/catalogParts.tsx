/** Parts shared by the cable picker and the catalog browser. */
import { useId } from 'react';
import type { CatalogCable } from '../../data/catalog';
import type { Facet } from '../../data/catalog/search';
import { int, num1, plain } from '../../domain/format';
import { catalogSubtitle, catalogTitle } from '../../state/trayResult';
import { Chip } from '../common/controls';
import styles from './CablePicker.module.css';

export const FACET_LABELS: Record<Facet, string> = {
  brand: 'Brand',
  category: 'Type',
  cores: 'Cores',
  sizeMm2: 'Size (mm²)',
  conductor: 'Conductor',
  insulation: 'Insulation',
  armour: 'Armour',
  voltage: 'Voltage',
  standard: 'Standard',
};

export function formatFacet(facet: Facet, value: string): string {
  return facet === 'cores' ? `${value} core` : facet === 'sizeMm2' ? `${value} mm²` : value;
}

export function FacetSelect(props: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; count: number }>;
  format: (value: string) => string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className={styles.facet} data-active={props.value ? 'true' : undefined}>
      <label htmlFor={id} className={styles.facetLabel}>
        {props.label}
      </label>
      <select id={id} className={styles.facetSelect} value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">Any</option>
        {props.value && !props.options.some((o) => o.value === props.value) && <option value={props.value}>{props.format(props.value)} (0)</option>}
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {props.format(o.value)} ({o.count})
          </option>
        ))}
      </select>
    </div>
  );
}

export function CatalogStatusChip({ cable }: { cable: CatalogCable }) {
  if (cable.status === 'checked') return <Chip tone="pass">CHECKED</Chip>;
  const flag = cable.flags.find((f) => f.severity === (cable.status === 'excluded' ? 'error' : 'warning'));
  return (
    <Chip tone={cable.status === 'excluded' ? 'fail' : 'warn'} title={flag?.message}>
      {cable.status === 'excluded' ? 'EXCLUDED' : 'NEEDS REVIEW'}
    </Chip>
  );
}

export function CatalogTableHead() {
  return (
    <thead>
      <tr>
        <th aria-label="Select" />
        <th>Brand</th>
        <th>Cable</th>
        <th>Code / variant</th>
        <th className={styles.num}>OD mm</th>
        <th className={styles.num}>kg/km</th>
        <th>Source</th>
        <th>Status</th>
      </tr>
    </thead>
  );
}

export function CatalogRow({ cable: c, group, selected, onSelect }: { cable: CatalogCable; group: string; selected: boolean; onSelect: () => void }) {
  return (
    <tr className={styles.row} data-selected={selected ? 'true' : undefined} data-status={c.status} onClick={onSelect}>
      <td>
        <input type="radio" name={group} aria-label={`${catalogTitle(c)}, ${c.variant}, OD ${num1(c.odMm)} mm`} checked={selected} onChange={onSelect} />
      </td>
      <td>{c.brand}</td>
      <td>
        {c.cores ?? 'Multi'}C {plain(c.sizeMm2)} mm²
        <small className={styles.sub}>{catalogSubtitle(c).split(' · ').slice(0, 3).join(' · ')}</small>
      </td>
      <td className={styles.mono}>{c.variant}</td>
      <td className={styles.num}>{num1(c.odMm)}</td>
      <td className={styles.num}>{c.weightKgPerKm === null ? '–' : int(c.weightKgPerKm)}</td>
      <td>{c.source.page ? `p. ${c.source.page}` : '–'}</td>
      <td>
        <CatalogStatusChip cable={c} />
      </td>
    </tr>
  );
}

/** Link to a catalogue PDF in the pdfs folder, at a page when known. */
export function cataloguePdfUrl(file: string, page?: number | null): string {
  return `${__PDF_BASE__}${encodeURIComponent(file)}${page ? `#page=${page}` : ''}`;
}
