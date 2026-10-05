import { loadCatalog, type Catalog } from '../data/catalog';
import { LEGACY_STORAGE_KEYS, readLegacyStorage, type LegacyImport } from './legacyImport';
import { createProject, parseProject, type Project } from './projectModel';

export const PROJECT_STORAGE_KEY = 'ctd.project.v1';
/** Where an unreadable saved project is kept instead of being overwritten. */
export const UNREADABLE_STORAGE_KEY = 'ctd.project.v1.unreadable';

type ProjectStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type SaveState =
  | { status: 'saved'; savedAt: number }
  | { status: 'pending' }
  | { status: 'failed'; message: string };

export interface LoadedProject {
  project: Project;
  /** Shown to the user when the saved project could not be used. */
  warning: string | null;
  /** Set when this first run brought trays across from the previous tool. */
  imported: LegacyImport | null;
}

function defaultStorage(): ProjectStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Decision D9: after importing, remove the previous tool's data, which held a
 * 1.3 MB copy of the catalog. Off while this app is a preview, so tool.html
 * keeps its trays while people still check results against it; turned on for
 * the release that replaces tool.html.
 */
export const REMOVE_PREVIOUS_TOOL_DATA = false;

/**
 * On first run, imports the previous tool's trays. Its data is removed only
 * once the trays are saved in the new format, so nothing is lost if saving fails.
 */
function importFromPreviousTool(storage: ProjectStorage, catalog: () => Catalog, removeOldData: boolean): LoadedProject | null {
  const imported = readLegacyStorage(storage, catalog);
  if (!imported) return null;
  if (saveProject(imported.project, storage).status === 'saved' && removeOldData) {
    for (const key of LEGACY_STORAGE_KEYS) {
      try {
        storage.removeItem(key);
      } catch {
        // Removing is best effort; the import does not run again either way.
      }
    }
  }
  return { project: imported.project, warning: null, imported };
}

export function loadProject(
  storage: ProjectStorage | undefined = defaultStorage(),
  catalog: () => Catalog = loadCatalog,
  removePreviousToolData = REMOVE_PREVIOUS_TOOL_DATA,
): LoadedProject {
  let raw: string | null;
  try {
    if (!storage) throw new Error('unavailable');
    raw = storage.getItem(PROJECT_STORAGE_KEY);
  } catch {
    return { project: createProject(), warning: 'This browser is blocking saved data, so your work will not be kept after you close the page.', imported: null };
  }
  if (raw === null) return importFromPreviousTool(storage, catalog, removePreviousToolData) ?? { project: createProject(), warning: null, imported: null };

  let parsed: Project | null;
  try {
    parsed = parseProject(JSON.parse(raw));
  } catch {
    parsed = null;
  }
  if (parsed) return { project: parsed, warning: null, imported: null };

  try {
    storage.setItem(UNREADABLE_STORAGE_KEY, raw);
  } catch {
    // Keeping a copy is best effort.
  }
  return {
    project: createProject(),
    warning: 'The project saved in this browser could not be read, so a new one was started. A copy of the old data was kept.',
    imported: null,
  };
}

export function saveProject(project: Project, storage: ProjectStorage | undefined = defaultStorage()): SaveState {
  try {
    if (!storage) throw new Error('unavailable');
    storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(project));
    return { status: 'saved', savedAt: Date.now() };
  } catch {
    return { status: 'failed', message: 'Your changes are not being saved in this browser: its storage is full or blocked.' };
  }
}
