/**
 * Search and filters for the cable picker. A typed query such as
 * "4c 240 cu xlpe swa" is read into filters; anything not recognised is
 * matched as text against codes and the catalogue text. Each filter lists the
 * values still available, with counts, given the other filters.
 */
import { BRANDS } from './brands';
import type { CatalogCable } from './types';

export const FACETS = ['brand', 'category', 'cores', 'sizeMm2', 'conductor', 'insulation', 'armour', 'voltage', 'standard'] as const;
export type Facet = (typeof FACETS)[number];
/** Selected values per facet; several values in one facet mean "any of these". */
export type Filters = Partial<Record<Facet, readonly string[]>>;

export interface FacetCount {
  value: string;
  count: number;
}

export interface SearchOptions {
  query?: string;
  filters?: Filters;
  /** The catalog browser shows excluded rows too; the cable picker does not. */
  includeExcluded?: boolean;
}

export interface SearchResult {
  cables: CatalogCable[];
  facets: Record<Facet, FacetCount[]>;
  /** Filters read from the query, so the picker can show them as chips. */
  queryFilters: Filters;
  /** Query words matched as text rather than as a filter. */
  textTerms: string[];
}

export function facetValue(c: CatalogCable, facet: Facet): string | null {
  switch (facet) {
    case 'brand':
      return c.brand;
    case 'cores':
      return c.cores === null ? null : String(c.cores);
    case 'sizeMm2':
      return String(c.sizeMm2);
    default:
      return c[facet];
  }
}

const WORDS: ReadonlyArray<[RegExp, Facet, string]> = [
  [/^(cu|copper)$/, 'conductor', 'Cu'],
  [/^(al|alu|aluminium|aluminum)$/, 'conductor', 'Al'],
  [/^pvc$/, 'insulation', 'PVC'],
  [/^xlpe$/, 'insulation', 'XLPE'],
  [/^swa$/, 'armour', 'SWA'],
  [/^sta$/, 'armour', 'STA'],
  [/^awa$/, 'armour', 'AWA'],
  [/^(unarmou?red|ua)$/, 'armour', 'Unarmoured'],
  [/^0\.6\/1(kv)?$/, 'voltage', '0.6/1 kV'],
  [/^1\.8\/3(kv)?$/, 'voltage', '1.8/3 kV'],
  [/^1\.9\/3\.3(kv)?$/, 'voltage', '1.9/3.3 kV'],
];

/** Reads a typed query into filters and leftover text terms. */
export function parseQuery(query: string): { filters: Filters; textTerms: string[] } {
  const filters: Record<string, string[]> = {};
  const add = (facet: Facet, value: string) => {
    const list = (filters[facet] ??= []);
    if (!list.includes(value)) list.push(value);
  };
  const textTerms: string[] = [];
  for (const token of query.toLowerCase().split(/[\s,;]+/).filter(Boolean)) {
    const coresBySize = /^(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)(mm2|mm²|sqmm)?$/.exec(token);
    const cores = /^(\d+)\s*-?\s*(c|core|cores)$/.exec(token);
    const size = /^(\d+(?:\.\d+)?)(mm2|mm²|sqmm)?$/.exec(token);
    const word = WORDS.find(([pattern]) => pattern.test(token));
    const brand = token.length >= 3 && BRANDS.find((b) => b.id.startsWith(token) || b.name.toLowerCase().startsWith(token));
    if (coresBySize) {
      add('cores', String(Number(coresBySize[1])));
      add('sizeMm2', String(Number(coresBySize[2])));
    } else if (cores) {
      add('cores', String(Number(cores[1])));
    } else if (size) {
      add('sizeMm2', String(Number(size[1])));
    } else if (word) {
      add(word[1], word[2]);
    } else if (brand) {
      add('brand', brand.name);
    } else {
      textTerms.push(token);
    }
  }
  return { filters, textTerms };
}

function matchesText(c: CatalogCable, terms: readonly string[]): boolean {
  if (!terms.length) return true;
  const haystack = [c.code, c.variant, c.source.raw, c.standard, c.category, c.brand].join(' ').toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

function mergeFilters(a: Filters, b: Filters): Filters {
  const merged: Record<string, string[]> = {};
  for (const facet of FACETS) {
    const values = [...(a[facet] ?? []), ...(b[facet] ?? [])];
    if (values.length) merged[facet] = [...new Set(values)];
  }
  return merged;
}

function matchesFilters(c: CatalogCable, filters: Filters, skip?: Facet): boolean {
  return FACETS.every((facet) => {
    const wanted = filters[facet];
    if (facet === skip || !wanted?.length) return true;
    const value = facetValue(c, facet);
    return value !== null && wanted.includes(value);
  });
}

function compareCables(a: CatalogCable, b: CatalogCable): number {
  return (a.cores ?? 99) - (b.cores ?? 99) || a.sizeMm2 - b.sizeMm2 || a.odMm - b.odMm || a.brand.localeCompare(b.brand) || a.id.localeCompare(b.id);
}

function sortFacetValues(facet: Facet, counts: Map<string, number>): FacetCount[] {
  const numeric = facet === 'cores' || facet === 'sizeMm2';
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => (numeric ? Number(a.value) - Number(b.value) : a.value.localeCompare(b.value)));
}

export function searchCatalog(cables: readonly CatalogCable[], options: SearchOptions = {}): SearchResult {
  const { filters: queryFilters, textTerms } = parseQuery(options.query ?? '');
  const filters = mergeFilters(options.filters ?? {}, queryFilters);
  const pool = cables.filter((c) => (options.includeExcluded || c.status !== 'excluded') && matchesText(c, textTerms));

  const facets = {} as Record<Facet, FacetCount[]>;
  for (const facet of FACETS) {
    const counts = new Map<string, number>();
    for (const c of pool) {
      if (!matchesFilters(c, filters, facet)) continue;
      const value = facetValue(c, facet);
      if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    facets[facet] = sortFacetValues(facet, counts);
  }

  return {
    cables: pool.filter((c) => matchesFilters(c, filters)).sort(compareCables),
    facets,
    queryFilters,
    textTerms,
  };
}
