/**
 * Project files (.ctd.json) for backup and for sharing with colleagues. A file
 * holds the project plus the OD and weight of each catalog cable as they were
 * when it was saved, so opening it with a different catalog version can say
 * which cables changed.
 */
import type { Catalog } from '../data/catalog';
import { num1 } from '../domain/format';
import { fileSafe } from './fileName';
import { convertLegacyState } from './legacyImport';
import { parseProject, PROJECT_VERSION, type Project } from './projectModel';
import { catalogTitle } from './trayResult';

export const PROJECT_FILE_FORMAT = 'cable-tray-design-project';
export const PROJECT_FILE_EXTENSION = '.ctd.json';

interface SavedCatalogCable {
  description: string;
  odMm: number;
  weightKgPerKm: number | null;
}

export interface ProjectFile {
  format: typeof PROJECT_FILE_FORMAT;
  formatVersion: typeof PROJECT_VERSION;
  savedAt: string;
  appVersion: string;
  project: Project;
  catalogCables: Record<string, SavedCatalogCable>;
}

export function projectFileName(project: Pick<Project, 'name'>): string {
  return `${fileSafe(project.name, 'project')}${PROJECT_FILE_EXTENSION}`;
}

export function projectFileContent(project: Project, catalog: Catalog, appVersion: string, savedAt = new Date()): string {
  const catalogCables: Record<string, SavedCatalogCable> = {};
  for (const tray of project.trays) {
    for (const cable of tray.cables) {
      const found = cable.kind === 'catalog' ? catalog.byId.get(cable.catalogId) : undefined;
      if (found) catalogCables[found.id] = { description: `${catalogTitle(found)} · ${found.variant}`, odMm: found.odMm, weightKgPerKm: found.weightKgPerKm };
    }
  }
  const file: ProjectFile = {
    format: PROJECT_FILE_FORMAT,
    formatVersion: PROJECT_VERSION,
    savedAt: savedAt.toISOString(),
    appVersion,
    project,
    catalogCables,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export type OpenedProject =
  | { ok: true; project: Project; warnings: string[]; fromPreviousTool: boolean }
  | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Compares the cables saved in the file with this catalog. */
function catalogDifferences(project: Project, saved: unknown, catalog: Catalog): string[] {
  const snapshot = isRecord(saved) ? saved : {};
  const ids = new Set(project.trays.flatMap((t) => t.cables.flatMap((c) => (c.kind === 'catalog' ? [c.catalogId] : []))));
  const warnings: string[] = [];
  for (const id of ids) {
    const then = isRecord(snapshot[id]) ? (snapshot[id] as Partial<SavedCatalogCable>) : null;
    const now = catalog.byId.get(id);
    const name = now ? catalogTitle(now) : typeof then?.description === 'string' ? then.description : id;
    if (!now) warnings.push(`${name} is not in this version of the catalog, so it is not used in sizing.`);
    else if (now.status === 'excluded') warnings.push(`${name} is now excluded from the catalog, so it is not used in sizing.`);
    else if (then && typeof then.odMm === 'number' && then.odMm !== now.odMm) {
      warnings.push(`${name}: OD is ${num1(now.odMm)} mm in this catalog, ${num1(then.odMm)} mm when the file was saved. Sizes use ${num1(now.odMm)} mm.`);
    }
  }
  return warnings;
}

/**
 * Reads a project file. Also accepts a bare project, as kept in browser
 * storage, and the previous tool's saved state.
 */
export function readProjectFile(text: string, catalog: Catalog): OpenedProject {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not a Cable Tray Design project: it could not be read as JSON.' };
  }
  if (isRecord(data) && data.format === PROJECT_FILE_FORMAT) {
    if (data.formatVersion !== PROJECT_VERSION) {
      return { ok: false, error: 'This project file was saved by a newer version of Cable Tray Design. Open it with that version.' };
    }
    const project = parseProject(data.project);
    if (!project) return { ok: false, error: 'This project file is damaged: it has no trays that can be read.' };
    return { ok: true, project, warnings: catalogDifferences(project, data.catalogCables, catalog), fromPreviousTool: false };
  }
  const bare = parseProject(data);
  if (bare) return { ok: true, project: bare, warnings: catalogDifferences(bare, {}, catalog), fromPreviousTool: false };
  const legacy = convertLegacyState(data, catalog);
  if (legacy) return { ok: true, project: legacy.project, warnings: legacy.problems, fromPreviousTool: true };
  return { ok: false, error: 'This file is not a Cable Tray Design project.' };
}
