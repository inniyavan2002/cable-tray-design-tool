import { cleanSizeList } from '../domain/selection';
import { DEFAULT_STANDARDS, DEFAULT_TRAY_SETTINGS, normalizeSettings } from '../domain/normalize';
import type { TraySettings, TrayStandards } from '../domain/types';

export const PROJECT_VERSION = 1;
/** Decision D4: up to 30 cable rows per tray. */
export const MAX_CABLE_ROWS = 30;
export const MAX_QUANTITY = 999;
export const DEFAULT_CLEARANCE_OPTIONS: readonly number[] = [0.3, 0.5, 1];

export interface CatalogTrayCable {
  id: string;
  kind: 'catalog';
  catalogId: string;
  quantity: number;
}

/** A cable that is not in the catalog, entered by hand (decision D5). */
export interface ManualTrayCable {
  id: string;
  kind: 'manual';
  label: string;
  odMm: number;
  weightKgPerKm: number | null;
  quantity: number;
}

export type TrayCable = CatalogTrayCable | ManualTrayCable;
export type NewTrayCable = Omit<CatalogTrayCable, 'id'> | Omit<ManualTrayCable, 'id'>;

export interface Tray {
  id: string;
  /** Tray ID shown to the user, e.g. "TR-01". */
  name: string;
  service: string;
  settings: TraySettings;
  cables: TrayCable[];
}

/** Shown in the report title block. */
export interface ProjectDetails {
  number: string;
  client: string;
  preparedBy: string;
  checkedBy: string;
  revision: string;
  /** YYYY-MM-DD */
  date: string;
}

export interface Project {
  version: typeof PROJECT_VERSION;
  name: string;
  details: ProjectDetails;
  trays: Tray[];
  activeTrayId: string;
  standards: TrayStandards;
  clearanceOptions: number[];
  /** Settings given to each new tray. */
  trayDefaults: TraySettings;
}

export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function defaultDetails(): ProjectDetails {
  return { number: '', client: '', preparedBy: '', checkedBy: '', revision: 'A', date: today() };
}

export function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}-${random}`;
}

/** "TR-01", "TR-02" …: the lowest number not used by another tray. */
export function nextTrayName(trays: readonly Pick<Tray, 'name'>[]): string {
  const used = new Set(trays.map((t) => /^TR-(\d+)$/i.exec(t.name.trim())?.[1]).filter(Boolean).map(Number));
  let n = 1;
  while (used.has(n)) n += 1;
  return `TR-${String(n).padStart(2, '0')}`;
}

export function createTray(name: string, settings: TraySettings = DEFAULT_TRAY_SETTINGS): Tray {
  return { id: newId('tray'), name, service: '', settings: { ...settings }, cables: [] };
}

/** A new project with one empty tray. `setup` carries standard sizes and tray defaults over from another project. */
export function createProject(setup?: Pick<Project, 'standards' | 'clearanceOptions' | 'trayDefaults'>): Project {
  const trayDefaults = { ...(setup?.trayDefaults ?? DEFAULT_TRAY_SETTINGS) };
  const tray = createTray('TR-01', trayDefaults);
  const standards = setup?.standards ?? DEFAULT_STANDARDS;
  return {
    version: PROJECT_VERSION,
    name: 'Untitled project',
    details: defaultDetails(),
    trays: [tray],
    activeTrayId: tray.id,
    standards: { widthsMm: [...standards.widthsMm], heightsMm: [...standards.heightsMm] },
    clearanceOptions: [...(setup?.clearanceOptions ?? DEFAULT_CLEARANCE_OPTIONS)],
    trayDefaults,
  };
}

/** Moves an item to a new position, keeping the others in order. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const result = [...items];
  if (from < 0 || from >= items.length) return result;
  const [item] = result.splice(from, 1);
  result.splice(Math.max(0, Math.min(to, result.length)), 0, item!);
  return result;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const positive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;

export function clampQuantity(value: number): number {
  return Math.min(MAX_QUANTITY, Math.max(1, Math.floor(Number.isFinite(value) ? value : 1)));
}

function parseCable(value: unknown): TrayCable | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.quantity !== 'number') return null;
  const quantity = clampQuantity(value.quantity);
  if (value.kind === 'catalog' && typeof value.catalogId === 'string') {
    return { id: value.id, kind: 'catalog', catalogId: value.catalogId, quantity };
  }
  if (value.kind === 'manual' && positive(value.odMm)) {
    return {
      id: value.id,
      kind: 'manual',
      label: str(value.label, 'Manual cable'),
      odMm: value.odMm as number,
      weightKgPerKm: positive(value.weightKgPerKm) ? (value.weightKgPerKm as number) : null,
      quantity,
    };
  }
  return null;
}

function parseTray(value: unknown, index: number): Tray | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const cables = Array.isArray(value.cables) ? value.cables.map(parseCable).filter((c): c is TrayCable => c !== null) : [];
  return {
    id: value.id,
    name: str(value.name).trim() || `TR-${String(index + 1).padStart(2, '0')}`,
    service: str(value.service),
    settings: normalizeSettings(isRecord(value.settings) ? (value.settings as Partial<TraySettings>) : {}),
    cables: cables.slice(0, MAX_CABLE_ROWS),
  };
}

function parseDetails(value: unknown): ProjectDetails {
  const d = isRecord(value) ? value : {};
  const defaults = defaultDetails();
  return {
    number: str(d.number),
    client: str(d.client),
    preparedBy: str(d.preparedBy),
    checkedBy: str(d.checkedBy),
    revision: str(d.revision, defaults.revision),
    date: /^\d{4}-\d{2}-\d{2}$/.test(str(d.date)) ? str(d.date) : defaults.date,
  };
}

/**
 * Reads a saved project, repairing anything missing or invalid. Returns null
 * when the data is not a project at all.
 */
export function parseProject(value: unknown): Project | null {
  if (!isRecord(value) || value.version !== PROJECT_VERSION || !Array.isArray(value.trays)) return null;
  const trays = value.trays.map(parseTray).filter((t): t is Tray => t !== null);
  if (!trays.length) return null;
  const standards = isRecord(value.standards) ? value.standards : {};
  const widths = cleanSizeList(Array.isArray(standards.widthsMm) ? (standards.widthsMm as number[]) : []);
  const heights = cleanSizeList(Array.isArray(standards.heightsMm) ? (standards.heightsMm as number[]) : []);
  const clearance = cleanSizeList(Array.isArray(value.clearanceOptions) ? (value.clearanceOptions as number[]) : []);
  const activeTrayId = trays.some((t) => t.id === value.activeTrayId) ? (value.activeTrayId as string) : trays[0]!.id;
  return {
    version: PROJECT_VERSION,
    name: str(value.name).trim() || 'Untitled project',
    trays,
    activeTrayId,
    standards: {
      widthsMm: widths.length ? widths : [...DEFAULT_STANDARDS.widthsMm],
      heightsMm: heights.length ? heights : [...DEFAULT_STANDARDS.heightsMm],
    },
    clearanceOptions: clearance.length ? clearance : [...DEFAULT_CLEARANCE_OPTIONS],
    trayDefaults: normalizeSettings(isRecord(value.trayDefaults) ? (value.trayDefaults as Partial<TraySettings>) : {}),
    details: parseDetails(value.details),
  };
}
