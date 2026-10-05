/**
 * Brings across the trays saved by the previous tool (tool.html), which kept
 * its whole state, including a copy of the catalog, under one browser storage
 * key. Catalog cables are matched by their old row id.
 */
import { BRANDS, type Catalog, type CatalogCable } from '../data/catalog';
import { parseCores } from '../data/catalog/normalize';
import { DEFAULT_STANDARDS, normalizeSettings } from '../domain/normalize';
import { cleanSizeList } from '../domain/selection';
import type { LayerCount, SpacingFactor, TraySettings } from '../domain/types';
import { catalogTitle } from './trayResult';
import { clampQuantity, createProject, DEFAULT_CLEARANCE_OPTIONS, MAX_CABLE_ROWS, newId, type Project, type Tray, type TrayCable } from './projectModel';

/** Newest first, the order the previous tool read them in. */
export const LEGACY_STORAGE_KEYS = [
  'cabletray_multi_v19_fixed',
  'cabletray_multi_v18',
  'cabletray_multi_v13',
  'cabletray_multi_v12',
  'cabletray_multi_v11',
  'cabletray_multi_v1',
] as const;

export const IMPORTED_PROJECT_NAME = 'Imported from the previous tool';

const SPACING_BY_LABEL: Record<string, SpacingFactor> = { 'Touching (0d)': 0, '0.5d': 0.5, '1d': 1, '2d': 2 };

export interface LegacyImport {
  project: Project;
  cableRows: number;
  /** Cables that were left out or will not be sized, described for the user. */
  problems: string[];
}

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number.parseFloat(str(v));
  return Number.isFinite(n) ? n : null;
}
const numbers = (v: unknown) => (Array.isArray(v) ? v.map(num).filter((n): n is number => n !== null) : []);

/** True for the previous tool's saved state, recognised by its field names. */
export function isLegacyState(value: unknown): value is Json {
  if (!isRecord(value) || 'version' in value || !Array.isArray(value.trays)) return false;
  const oldTray = value.trays.some((t) => isRecord(t) && ('spacingLabel' in t || 'arrangement' in t || 'layerSpaceMode' in t));
  return oldTray || (isRecord(value.standards) && Array.isArray(value.standards.widths));
}

function legacySettings(t: Json): TraySettings {
  const layers = t.arrangement === 'Multi Layer' ? Math.min(3, Math.max(2, Math.round(num(t.layers) ?? 2))) : 1;
  return normalizeSettings({
    layers: layers as LayerCount,
    spacing: SPACING_BY_LABEL[str(t.spacingLabel)] ?? 1,
    layerGap: t.layerSpaceMode !== 'no',
    clearanceFactor: num(t.clearanceFactor) ?? undefined,
    topClearancePct: num(t.topClearance) ?? undefined,
    sparePct: num(t.sparePct) ?? undefined,
    maxFillPct: num(t.maxFillPct) ?? undefined,
    trayType: str(t.trayType).toLowerCase() === 'ladder' ? 'ladder' : 'perforated',
  });
}

/** Describes an old cable row the way the previous tool showed it, e.g. "Oman Cables 4 Core 16". */
function describeOld(cable: Json, oldRow: Json | undefined): string {
  const source = oldRow ?? (isRecord(cable.selection) ? cable.selection : {});
  const text = [str(source.brand), str(source.coreConfig), str(source.size) && `${str(source.size)} mm²`].filter(Boolean).join(' ');
  return text || 'a catalog cable';
}

/**
 * Finds the cable by its old row id. Older versions of the previous tool used
 * other ids; for those, the row kept in their saved catalog is matched on
 * brand, cores, size and OD, and only an exact single match counts.
 */
function findCatalogCable(catalogId: string, oldRow: Json | undefined, catalog: Catalog): CatalogCable | null {
  const direct = catalog.byLegacyId.get(catalogId);
  if (direct) return direct;
  if (!oldRow) return null;
  const brand = BRANDS.find((b) => b.legacyName === str(oldRow.brand));
  const size = num(oldRow.size);
  const od = num(oldRow.od);
  const cores = parseCores(str(oldRow.coreConfig));
  const matches = catalog.cables.filter((c) => c.brandId === brand?.id && c.sizeMm2 === size && c.odMm === od && c.cores === cores);
  return matches.length === 1 ? matches[0]! : null;
}

/**
 * Converts the previous tool's state into a project. Returns null when it is
 * not that tool's state, or holds nothing worth importing (a single tray with
 * no cables, which that tool created on first use).
 */
export function convertLegacyState(value: unknown, catalog: Catalog): LegacyImport | null {
  if (!isLegacyState(value)) return null;
  const oldCatalog = new Map((Array.isArray(value.catalog) ? value.catalog : []).filter(isRecord).map((r) => [str(r.id), r]));
  const problems: string[] = [];
  const oldTrays = (value.trays as unknown[]).filter(isRecord);
  let cableRows = 0;
  let chosenRows = 0;

  const trays: Tray[] = oldTrays.map((t, index) => {
    const name = str(t.name).trim() || `TR-${String(index + 1).padStart(2, '0')}`;
    const cables: TrayCable[] = [];
    (Array.isArray(t.cables) ? t.cables : []).filter(isRecord).forEach((c, row) => {
      const where = `${name}, cable ${row + 1}`;
      const quantity = clampQuantity(num(c.qty) ?? 1);
      if (c.mode === 'manual') {
        chosenRows += 1;
        const od = num(c.od);
        if (od === null || od <= 0) {
          problems.push(`${where}: manual cable with no OD, left out.`);
          return;
        }
        const weight = num(c.weight);
        cables.push({ id: newId('cable'), kind: 'manual', label: str(c.label).trim() || 'Manual cable', odMm: od, weightKgPerKm: weight !== null && weight > 0 ? weight : null, quantity });
        return;
      }
      const catalogId = str(c.catalogId);
      // A row where no cable had been chosen yet.
      if (!catalogId) return;
      chosenRows += 1;
      const oldRow = oldCatalog.get(catalogId);
      const found = findCatalogCable(catalogId, oldRow, catalog);
      if (!found) {
        problems.push(`${where}: ${describeOld(c, oldRow)} could not be found in the catalog, left out.`);
        return;
      }
      if (found.status === 'excluded') problems.push(`${where}: ${catalogTitle(found)} has an impossible catalog value, so it is not used in sizing until replaced.`);
      cables.push({ id: newId('cable'), kind: 'catalog', catalogId: found.id, quantity });
    });
    if (cables.length > MAX_CABLE_ROWS) problems.push(`${name}: only the first ${MAX_CABLE_ROWS} cable rows were kept.`);
    cableRows += Math.min(cables.length, MAX_CABLE_ROWS);
    return { id: newId('tray'), name, service: str(t.service), settings: legacySettings(t), cables: cables.slice(0, MAX_CABLE_ROWS) };
  });

  if (!trays.length || (trays.length === 1 && chosenRows === 0)) return null;

  const activeIndex = oldTrays.findIndex((t) => t.id === value.activeTrayId);
  const standards = isRecord(value.standards) ? value.standards : {};
  const widths = cleanSizeList(numbers(standards.widths));
  const heights = cleanSizeList(numbers(standards.heights));
  const clearance = cleanSizeList(numbers(standards.clearanceFactors));
  const project: Project = {
    ...createProject(),
    name: IMPORTED_PROJECT_NAME,
    trays,
    activeTrayId: trays[Math.max(0, activeIndex)]!.id,
    standards: {
      widthsMm: widths.length ? widths : [...DEFAULT_STANDARDS.widthsMm],
      heightsMm: heights.length ? heights : [...DEFAULT_STANDARDS.heightsMm],
    },
    clearanceOptions: clearance.length ? clearance : [...DEFAULT_CLEARANCE_OPTIONS],
  };
  return { project, cableRows, problems };
}

/** Reads the newest state the previous tool left in this browser that has something to import. */
export function readLegacyStorage(storage: Pick<Storage, 'getItem'>, catalog: () => Catalog): LegacyImport | null {
  for (const key of LEGACY_STORAGE_KEYS) {
    let raw: string | null;
    try {
      raw = storage.getItem(key);
    } catch {
      return null;
    }
    if (!raw) continue;
    try {
      const imported = convertLegacyState(JSON.parse(raw), catalog());
      if (imported) return imported;
    } catch {
      // Unreadable: try an older key.
    }
  }
  return null;
}

/** One-line summary for the notice shown after an import. */
export function importSummary(imported: LegacyImport): string {
  const trays = imported.project.trays.length;
  return `Imported ${trays} tray${trays === 1 ? '' : 's'} and ${imported.cableRows} cable row${imported.cableRows === 1 ? '' : 's'} from the previous tool. Sizes follow the new calculation rules, so some trays may differ from what the old tool showed.`;
}
