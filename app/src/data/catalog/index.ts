import { BRANDS } from './brands';
import foundPages from './foundPages.json';
import { normalizeRow } from './normalize';
import reviewDecisions from './review.json';
import { applyReview, type ReviewDecision } from './review';
import type { CatalogBrand, CatalogCable, CatalogStatus, FlagCode, LegacyCatalogRow } from './types';

export interface CatalogSummary {
  total: number;
  byStatus: Record<CatalogStatus, number>;
  byBrand: Record<string, Record<CatalogStatus, number>>;
  /** Rows carrying each flag (warnings and errors only). */
  byFlag: Partial<Record<FlagCode, number>>;
}

export interface Catalog {
  cables: readonly CatalogCable[];
  byId: ReadonlyMap<string, CatalogCable>;
  byLegacyId: ReadonlyMap<string, CatalogCable>;
  brands: readonly CatalogBrand[];
  summary: CatalogSummary;
}

// Loaded through Vite's glob import so the type checker does not have to read
// 1.3 MB of JSON; the files are still bundled into the app.
const sources = import.meta.glob<LegacyCatalogRow[]>('./source/*.json', { eager: true, import: 'default' });

export function sourceRows(): LegacyCatalogRow[] {
  return Object.keys(sources)
    .sort()
    .flatMap((path) => sources[path]!);
}

export function summarize(cables: readonly CatalogCable[]): CatalogSummary {
  const emptyCounts = (): Record<CatalogStatus, number> => ({ checked: 0, 'needs-review': 0, excluded: 0 });
  const summary: CatalogSummary = { total: cables.length, byStatus: emptyCounts(), byBrand: {}, byFlag: {} };
  for (const c of cables) {
    summary.byStatus[c.status] += 1;
    (summary.byBrand[c.brand] ??= emptyCounts())[c.status] += 1;
    for (const code of new Set(c.flags.filter((f) => f.severity !== 'info').map((f) => f.code))) {
      summary.byFlag[code] = (summary.byFlag[code] ?? 0) + 1;
    }
  }
  return summary;
}

/**
 * Builds the catalog from the original rows. `pages` fills in catalogue pages
 * the original rows lack (see foundPages.json), keyed by old row id.
 */
export function buildCatalog(rows: readonly LegacyCatalogRow[], decisions: readonly ReviewDecision[], pages: Readonly<Record<string, number>> = {}): Catalog {
  const normalized = rows.map((row) => {
    const cable = normalizeRow(row);
    const page = pages[row.id];
    return cable.source.page === null && page ? { ...cable, source: { ...cable.source, page } } : cable;
  });
  const ids = new Set<string>();
  for (const c of normalized) {
    if (ids.has(c.id)) throw new Error(`Duplicate catalog id "${c.id}"`);
    ids.add(c.id);
  }
  const cables = applyReview(normalized, decisions);
  return {
    cables,
    byId: new Map(cables.map((c) => [c.id, c])),
    byLegacyId: new Map(cables.map((c) => [c.legacyId, c])),
    brands: BRANDS,
    summary: summarize(cables),
  };
}

let cached: Catalog | null = null;

/** The checked catalog, built once on first use. */
export function loadCatalog(): Catalog {
  cached ??= buildCatalog(sourceRows(), reviewDecisions as ReviewDecision[], foundPages.pages);
  return cached;
}

export { BRANDS } from './brands';
export type { ReviewDecision } from './review';
export * from './types';
