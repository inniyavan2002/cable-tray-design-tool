import { create } from 'zustand';
import { normalizeSettings } from '../domain/normalize';
import type { TraySettings, TrayStandards } from '../domain/types';
import { importSummary } from './legacyImport';
import { loadProject, saveProject, type SaveState } from './persistence';
import {
  clampQuantity,
  createTray,
  MAX_CABLE_ROWS,
  moveItem,
  newId,
  nextTrayName,
  type NewTrayCable,
  type Project,
  type ProjectDetails,
  type Tray,
} from './projectModel';

export interface Notice {
  tone: 'info' | 'warn' | 'error';
  text: string;
  /** Further lines, such as cables that could not be imported. */
  details?: readonly string[];
  /**
   * The project right after the event the notice is about. Such a notice is
   * shown only while the project is unchanged, and offers Undo.
   */
  after?: Project;
}

export interface HistoryEntry {
  project: Project;
  /** What the change did, for "Undo …" and "Redo …", e.g. "add cable". */
  label: string;
}

/** The project-wide settings edited in the Standards and settings dialog. */
export interface ProjectSetup {
  standards: TrayStandards;
  clearanceOptions: number[];
  trayDefaults: TraySettings;
}

interface ProjectState {
  project: Project;
  saveState: SaveState;
  notice: Notice | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** The field changed last and when, so typing into it merges into one undo step. */
  lastEdit: { key: string; at: number } | null;
  undo: () => void;
  redo: () => void;
  setProjectName: (name: string) => void;
  setProjectDetails: (patch: Partial<ProjectDetails>) => void;
  selectTray: (id: string) => void;
  addTray: () => void;
  duplicateTray: (id: string) => void;
  removeTray: (id: string) => void;
  /** Moves a tray to a new position in the list. */
  moveTray: (id: string, toIndex: number) => void;
  updateTray: (id: string, patch: Partial<Pick<Tray, 'name' | 'service'>>) => void;
  updateSettings: (id: string, patch: Partial<TraySettings>) => void;
  /** Returns false when the tray already has the maximum number of cable rows. */
  addCable: (trayId: string, cable: NewTrayCable) => boolean;
  setCableQuantity: (trayId: string, cableId: string, quantity: number) => void;
  removeCable: (trayId: string, cableId: string) => void;
  /** Saves the project-wide settings; with `applyToTrays`, every tray also takes the new tray defaults. */
  updateSetup: (setup: ProjectSetup, applyToTrays?: boolean) => void;
  /** Replaces the whole project, e.g. when a file is opened; can be undone. */
  replaceProject: (project: Project, label: string, notice?: Omit<Notice, 'after'>) => void;
  showNotice: (notice: Notice | null) => void;
}

/** Undo steps kept; older ones are dropped. */
export const HISTORY_LIMIT = 100;
/** Changes to the same field closer together than this are one undo step, so typing a word is undone at once. */
export const MERGE_WINDOW_MS = 1000;

const loaded = loadProject();

function initialNotice(): Notice | null {
  if (loaded.warning) return { tone: 'error', text: loaded.warning };
  if (loaded.imported) {
    const { problems } = loaded.imported;
    return { tone: problems.length ? 'warn' : 'info', text: importSummary(loaded.imported), details: problems };
  }
  return null;
}

function mapTray(project: Project, id: string, change: (tray: Tray) => Tray): Project {
  return { ...project, trays: project.trays.map((t) => (t.id === id ? change(t) : t)) };
}

export const useProjectStore = create<ProjectState>()((set, get) => {
  /**
   * Applies an undoable change. `key` names the field being edited: repeated
   * changes to it within MERGE_WINDOW_MS become one undo step.
   */
  const change = (label: string, next: (project: Project) => Project | null, key?: string) =>
    set((state) => {
      const project = next(state.project);
      if (!project || project === state.project) return {};
      const now = Date.now();
      const merge = key !== undefined && state.lastEdit?.key === key && now - state.lastEdit.at < MERGE_WINDOW_MS && state.past.length > 0;
      return {
        project,
        past: merge ? state.past : [...state.past, { project: state.project, label }].slice(-HISTORY_LIMIT),
        future: [],
        lastEdit: key === undefined ? null : { key, at: now },
      };
    });

  return {
    project: loaded.project,
    saveState: { status: 'saved', savedAt: Date.now() },
    notice: initialNotice(),
    past: [],
    future: [],
    lastEdit: null,

    undo: () =>
      set((state) => {
        const entry = state.past.at(-1);
        if (!entry) return {};
        return {
          project: entry.project,
          past: state.past.slice(0, -1),
          future: [{ project: state.project, label: entry.label }, ...state.future],
          lastEdit: null,
        };
      }),

    redo: () =>
      set((state) => {
        const entry = state.future[0];
        if (!entry) return {};
        return {
          project: entry.project,
          past: [...state.past, { project: state.project, label: entry.label }],
          future: state.future.slice(1),
          lastEdit: null,
        };
      }),

    setProjectName: (name) => change('rename project', (project) => ({ ...project, name }), 'project-name'),

    setProjectDetails: (patch) =>
      change('edit project details', (project) => ({ ...project, details: { ...project.details, ...patch } }), `details:${Object.keys(patch).join()}`),

    // Choosing a tray is not an undo step; undo returns to the tray that was changed.
    selectTray: (id) =>
      set(({ project }) => (project.trays.some((t) => t.id === id) && project.activeTrayId !== id ? { project: { ...project, activeTrayId: id } } : {})),

    addTray: () =>
      change('add tray', (project) => {
        const tray = createTray(nextTrayName(project.trays), project.trayDefaults);
        return { ...project, trays: [...project.trays, tray], activeTrayId: tray.id };
      }),

    duplicateTray: (id) =>
      change('duplicate tray', (project) => {
        const index = project.trays.findIndex((t) => t.id === id);
        const source = project.trays[index];
        if (!source) return null;
        const copy: Tray = {
          ...source,
          id: newId('tray'),
          name: nextTrayName(project.trays),
          settings: { ...source.settings },
          cables: source.cables.map((c) => ({ ...c, id: newId('cable') })),
        };
        const trays = [...project.trays.slice(0, index + 1), copy, ...project.trays.slice(index + 1)];
        return { ...project, trays, activeTrayId: copy.id };
      }),

    removeTray: (id) =>
      change('delete tray', (project) => {
        if (project.trays.length <= 1) return null;
        const index = project.trays.findIndex((t) => t.id === id);
        if (index < 0) return null;
        const trays = project.trays.filter((t) => t.id !== id);
        const activeTrayId = project.activeTrayId === id ? trays[Math.min(index, trays.length - 1)]!.id : project.activeTrayId;
        return { ...project, trays, activeTrayId };
      }),

    moveTray: (id, toIndex) =>
      change('move tray', (project) => {
        const from = project.trays.findIndex((t) => t.id === id);
        const to = Math.max(0, Math.min(toIndex, project.trays.length - 1));
        if (from < 0 || from === to) return null;
        return { ...project, trays: moveItem(project.trays, from, to) };
      }),

    updateTray: (id, patch) =>
      change(
        patch.name !== undefined ? 'rename tray' : 'edit service',
        (project) => mapTray(project, id, (t) => ({ ...t, ...patch })),
        `tray:${id}:${Object.keys(patch).join()}`,
      ),

    updateSettings: (id, patch) =>
      change(
        'change tray settings',
        (project) => mapTray(project, id, (t) => ({ ...t, settings: normalizeSettings({ ...t.settings, ...patch }) })),
        `settings:${id}:${Object.keys(patch).join()}`,
      ),

    addCable: (trayId, cable) => {
      const tray = get().project.trays.find((t) => t.id === trayId);
      if (!tray || tray.cables.length >= MAX_CABLE_ROWS) return false;
      const added = { ...cable, id: newId('cable'), quantity: clampQuantity(cable.quantity) };
      change('add cable', (project) => mapTray(project, trayId, (t) => ({ ...t, cables: [...t.cables, added] })));
      return true;
    },

    setCableQuantity: (trayId, cableId, quantity) =>
      change(
        'change quantity',
        (project) =>
          mapTray(project, trayId, (t) => ({
            ...t,
            cables: t.cables.map((c) => (c.id === cableId ? { ...c, quantity: clampQuantity(quantity) } : c)),
          })),
        `quantity:${cableId}`,
      ),

    removeCable: (trayId, cableId) =>
      change('remove cable', (project) => mapTray(project, trayId, (t) => ({ ...t, cables: t.cables.filter((c) => c.id !== cableId) }))),

    updateSetup: ({ standards, clearanceOptions, trayDefaults }, applyToTrays = false) =>
      change(applyToTrays ? 'apply defaults to every tray' : 'change standards and settings', (project) => {
        const defaults = normalizeSettings(trayDefaults);
        return {
          ...project,
          standards: { widthsMm: [...standards.widthsMm], heightsMm: [...standards.heightsMm] },
          clearanceOptions: [...clearanceOptions],
          trayDefaults: defaults,
          trays: applyToTrays ? project.trays.map((t) => ({ ...t, settings: { ...defaults } })) : project.trays,
        };
      }),

    replaceProject: (next, label, notice) => {
      change(label, () => next);
      set({ notice: notice ? { ...notice, after: next } : null });
    },

    showNotice: (notice) => set({ notice }),
  };
});

export function useActiveTray(): Tray {
  return useProjectStore((s) => s.project.trays.find((t) => t.id === s.project.activeTrayId) ?? s.project.trays[0]!);
}

const SAVE_DELAY_MS = 300;

/**
 * Saves the project to the browser shortly after each change, and straight
 * away when the page is hidden or closed. Returns a function that stops it.
 */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    useProjectStore.setState({ saveState: saveProject(useProjectStore.getState().project) });
  };
  const unsubscribe = useProjectStore.subscribe((state, previous) => {
    if (state.project === previous.project) return;
    if (timer !== undefined) clearTimeout(timer);
    if (state.saveState.status !== 'pending') useProjectStore.setState({ saveState: { status: 'pending' } });
    timer = setTimeout(() => {
      timer = undefined;
      useProjectStore.setState({ saveState: saveProject(useProjectStore.getState().project) });
    }, SAVE_DELAY_MS);
  });
  window.addEventListener('pagehide', flush);
  return () => {
    flush();
    unsubscribe();
    window.removeEventListener('pagehide', flush);
  };
}
