import { useDeferredValue, useMemo } from 'react';
import { loadCatalog, type Catalog, type CatalogCable } from '../data/catalog';
import { buildCalcReport, type CalcReport } from '../domain/calcReport';
import { num1, plain } from '../domain/format';
import { sizeTray } from '../domain/sizing';
import type { CableRow, SizingResult, TrayStandards } from '../domain/types';
import type { Tray, TrayCable } from './projectModel';

/** Number of distinct cable colours; tags keep rows apart beyond that. */
export const CABLE_COLOURS = 12;

export interface CableProblem {
  severity: 'error' | 'warning';
  message: string;
}

export interface ResolvedCable {
  cable: TrayCable;
  /** Number shown on the cable in the list and the drawing. */
  tag: number;
  colourIndex: number;
  title: string;
  subtitle: string;
  odMm: number | null;
  weightKgPerKm: number | null;
  catalog: CatalogCable | null;
  problem: CableProblem | null;
  /** False when the cable cannot be sized (not in the catalog or excluded). */
  usable: boolean;
}

export function catalogTitle(c: CatalogCable): string {
  return `${c.brand} · ${c.cores ?? 'multi'}C ${plain(c.sizeMm2)} mm²`;
}

export function catalogSubtitle(c: CatalogCable): string {
  const materials = [c.conductor, c.insulation, c.armour].filter(Boolean).join(' / ');
  const page = c.source.page ? `p. ${c.source.page}` : null;
  return [materials, c.voltage, c.standard, c.code ?? page].filter(Boolean).join(' · ');
}

export function resolveTrayCables(tray: Tray, catalog: Catalog): ResolvedCable[] {
  return tray.cables.map((cable, index) => {
    const base = { cable, tag: index + 1, colourIndex: index % CABLE_COLOURS };
    if (cable.kind === 'manual') {
      return {
        ...base,
        title: cable.label || 'Manual cable',
        subtitle: `Manual entry · Ø ${num1(cable.odMm)} mm`,
        odMm: cable.odMm,
        weightKgPerKm: cable.weightKgPerKm,
        catalog: null,
        problem: null,
        usable: true,
      };
    }
    const found = catalog.byId.get(cable.catalogId) ?? null;
    if (!found) {
      return {
        ...base,
        title: 'Cable not found',
        subtitle: `Catalog id ${cable.catalogId}`,
        odMm: null,
        weightKgPerKm: null,
        catalog: null,
        problem: { severity: 'error', message: 'This cable is no longer in the catalog. Remove it and choose another.' },
        usable: false,
      };
    }
    const warning = found.flags.find((f) => f.severity === 'warning');
    const problem: CableProblem | null =
      found.status === 'excluded'
        ? { severity: 'error', message: `Excluded from the catalog: ${found.flags.find((f) => f.severity === 'error')?.message ?? ''}` }
        : found.status === 'needs-review' && warning
          ? { severity: 'warning', message: warning.message }
          : null;
    return {
      ...base,
      title: catalogTitle(found),
      subtitle: catalogSubtitle(found),
      odMm: found.odMm,
      weightKgPerKm: found.weightKgPerKm,
      catalog: found,
      problem,
      usable: found.status !== 'excluded',
    };
  });
}

export function engineRows(resolved: readonly ResolvedCable[]): CableRow[] {
  return resolved
    .filter((r) => r.usable && r.odMm !== null)
    .map((r) => ({ id: r.cable.id, odMm: r.odMm!, weightKgPerKm: r.weightKgPerKm ?? 0, quantity: r.cable.quantity }));
}

export interface TrayOutcome {
  resolved: ResolvedCable[];
  result: SizingResult;
  report: CalcReport;
  /** Cable rows whose weight is unknown, so the weight total leaves them out. */
  rowsWithoutWeight: number;
}

export function trayOutcome(tray: Tray, standards: TrayStandards, catalog: Catalog = loadCatalog()): TrayOutcome {
  const resolved = resolveTrayCables(tray, catalog);
  const result = sizeTray(engineRows(resolved), tray.settings, standards);
  return {
    resolved,
    result,
    report: buildCalcReport(result),
    rowsWithoutWeight: resolved.filter((r) => r.usable && r.weightKgPerKm === null).length,
  };
}

// Trays and standards are replaced, never changed in place, so the objects
// themselves identify an unchanged input.
const cache = new WeakMap<Tray, { standards: TrayStandards; outcome: TrayOutcome }>();

/** Sizing for a tray, reused until the tray or the standard sizes change. */
export function cachedTrayOutcome(tray: Tray, standards: TrayStandards): TrayOutcome {
  const hit = cache.get(tray);
  if (hit && hit.standards === standards) return hit.outcome;
  const outcome = trayOutcome(tray, standards);
  cache.set(tray, { standards, outcome });
  return outcome;
}

/**
 * Sizing for the tray being edited. While the user types, React may show the
 * previous result for a moment instead of blocking input.
 */
export function useTrayOutcome(tray: Tray, standards: TrayStandards): TrayOutcome {
  const deferredTray = useDeferredValue(tray);
  return useMemo(() => cachedTrayOutcome(deferredTray, standards), [deferredTray, standards]);
}
