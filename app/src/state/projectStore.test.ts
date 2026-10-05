import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadProject, PROJECT_STORAGE_KEY, saveProject, UNREADABLE_STORAGE_KEY } from './persistence';
import { createProject, MAX_CABLE_ROWS, moveItem, nextTrayName, parseProject } from './projectModel';
import { HISTORY_LIMIT, MERGE_WINDOW_MS, useProjectStore } from './projectStore';

const store = () => useProjectStore.getState();
const active = () => store().project.trays.find((t) => t.id === store().project.activeTrayId)!;

beforeEach(() => {
  useProjectStore.setState({ project: createProject(), past: [], future: [], lastEdit: null, notice: null });
});

const names = () => store().project.trays.map((t) => t.name);

describe('trays', () => {
  it('starts with one empty tray named TR-01', () => {
    expect(store().project.trays.map((t) => t.name)).toEqual(['TR-01']);
    expect(active().cables).toEqual([]);
  });

  it('adds trays with the next free number and selects the new one', () => {
    store().addTray();
    store().addTray();
    expect(store().project.trays.map((t) => t.name)).toEqual(['TR-01', 'TR-02', 'TR-03']);
    expect(active().name).toBe('TR-03');
  });

  it('duplicates a tray with its settings and cables, right after the original', () => {
    const first = active();
    store().updateSettings(first.id, { layers: 2 });
    store().addCable(first.id, { kind: 'catalog', catalogId: 'doha-1873', quantity: 2 });
    store().addTray();
    store().duplicateTray(first.id);
    const trays = store().project.trays;
    expect(trays.map((t) => t.name)).toEqual(['TR-01', 'TR-03', 'TR-02']);
    const copy = trays[1]!;
    expect(copy.settings.layers).toBe(2);
    expect(copy.cables).toHaveLength(1);
    expect(copy.cables[0]!.id).not.toBe(trays[0]!.cables[0]!.id);
    expect(active().id).toBe(copy.id);
  });

  it('removes a tray but always keeps one', () => {
    const first = active().id;
    store().removeTray(first);
    expect(store().project.trays).toHaveLength(1);
    store().addTray();
    store().removeTray(first);
    expect(store().project.trays.map((t) => t.name)).toEqual(['TR-02']);
    expect(active().name).toBe('TR-02');
  });
});

describe('settings and cables', () => {
  it('keeps settings valid when a bad value arrives', () => {
    store().updateSettings(active().id, { maxFillPct: -5, layers: 3 });
    expect(active().settings).toMatchObject({ maxFillPct: 40, layers: 3 });
  });

  it('limits a tray to the maximum number of cable rows', () => {
    const id = active().id;
    for (let i = 0; i < MAX_CABLE_ROWS; i++) expect(store().addCable(id, { kind: 'catalog', catalogId: 'doha-1873', quantity: 1 })).toBe(true);
    expect(store().addCable(id, { kind: 'catalog', catalogId: 'doha-1873', quantity: 1 })).toBe(false);
    expect(active().cables).toHaveLength(MAX_CABLE_ROWS);
  });

  it('keeps quantities between 1 and 999', () => {
    const id = active().id;
    store().addCable(id, { kind: 'manual', label: 'Fire alarm', odMm: 8, weightKgPerKm: null, quantity: 0 });
    const cable = active().cables[0]!;
    expect(cable.quantity).toBe(1);
    store().setCableQuantity(id, cable.id, 5000);
    expect(active().cables[0]!.quantity).toBe(999);
    store().removeCable(id, cable.id);
    expect(active().cables).toEqual([]);
  });
});

describe('nextTrayName', () => {
  it('fills the first gap in the numbering', () => {
    expect(nextTrayName([{ name: 'TR-01' }, { name: 'TR-03' }])).toBe('TR-02');
    expect(nextTrayName([{ name: 'Riser A' }])).toBe('TR-01');
  });
});

describe('saving and loading', () => {
  function memoryStorage() {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      data,
    };
  }

  it('round-trips a project through browser storage', () => {
    const storage = memoryStorage();
    const project = createProject();
    project.name = 'Tower B';
    expect(saveProject(project, storage).status).toBe('saved');
    expect(loadProject(storage)).toEqual({ project, warning: null, imported: null });
  });

  it('starts a new project and keeps a copy when the saved data cannot be read', () => {
    const storage = memoryStorage();
    storage.setItem(PROJECT_STORAGE_KEY, '{not json');
    const loaded = loadProject(storage);
    expect(loaded.warning).toMatch(/could not be read/);
    expect(storage.data.get(UNREADABLE_STORAGE_KEY)).toBe('{not json');
    expect(loaded.project.trays).toHaveLength(1);
  });

  it('reports when storage is blocked', () => {
    const fail = () => {
      throw new Error('blocked');
    };
    const blocked = { getItem: fail, setItem: fail, removeItem: fail };
    expect(loadProject(blocked).warning).toMatch(/blocking saved data/);
    expect(saveProject(createProject(), blocked)).toMatchObject({ status: 'failed' });
  });

  it('repairs invalid parts of a saved project', () => {
    const project = createProject();
    const damaged = {
      ...project,
      activeTrayId: 'missing',
      standards: { widthsMm: [], heightsMm: [100, -1] },
      trays: [{ ...project.trays[0], name: '', settings: { layers: 9 }, cables: [{ id: 'x', kind: 'manual', odMm: -1, quantity: 1 }] }],
    };
    const repaired = parseProject(JSON.parse(JSON.stringify(damaged)))!;
    expect(repaired.activeTrayId).toBe(project.trays[0]!.id);
    expect(repaired.standards.widthsMm.length).toBeGreaterThan(0);
    expect(repaired.standards.heightsMm).toEqual([100]);
    expect(repaired.trays[0]).toMatchObject({ name: 'TR-01', cables: [] });
    expect(repaired.trays[0]!.settings.layers).toBe(1);
    expect(repaired.trayDefaults).toEqual(project.trayDefaults);
    expect(parseProject({ version: 2 })).toBeNull();
  });
});

describe('undo and redo', () => {
  afterEach(() => vi.useRealTimers());

  it('undoes and redoes a change, back on the tray that was changed', () => {
    const first = active().id;
    store().addCable(first, { kind: 'catalog', catalogId: 'doha-1873', quantity: 2 });
    store().addTray();
    expect(store().past.map((e) => e.label)).toEqual(['add cable', 'add tray']);

    store().undo();
    expect(names()).toEqual(['TR-01']);
    store().undo();
    expect(active().cables).toEqual([]);
    expect(store().past).toEqual([]);

    store().redo();
    expect(active().id).toBe(first);
    expect(active().cables).toHaveLength(1);
    store().redo();
    expect(names()).toEqual(['TR-01', 'TR-02']);
    expect(store().future).toEqual([]);
  });

  it('makes typing into one field a single undo step', () => {
    vi.useFakeTimers();
    for (const name of ['T', 'To', 'Tow', 'Tower']) {
      store().setProjectName(name);
      vi.advanceTimersByTime(200);
    }
    store().updateTray(active().id, { service: 'LV' });
    expect(store().past.map((e) => e.label)).toEqual(['rename project', 'edit service']);
    vi.advanceTimersByTime(MERGE_WINDOW_MS + 1);
    store().setProjectName('Tower B');
    expect(store().past).toHaveLength(3);
    store().undo();
    store().undo();
    store().undo();
    expect(store().project.name).toBe('Untitled project');
  });

  it('does not record choosing a tray, and a new change clears redo', () => {
    store().addTray();
    store().selectTray(store().project.trays[0]!.id);
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(store().future).toHaveLength(1);
    store().setProjectName('Tower B');
    expect(store().future).toEqual([]);
  });

  it(`keeps the last ${HISTORY_LIMIT} steps`, () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) store().updateSettings(active().id, { layers: ((i % 3) + 1) as 1 | 2 | 3 });
    expect(store().past.length).toBeLessThanOrEqual(HISTORY_LIMIT);
  });

  it('ignores changes that change nothing', () => {
    store().moveTray(active().id, 0);
    store().removeTray(active().id);
    expect(store().past).toEqual([]);
  });
});

describe('moving trays', () => {
  it('moves a tray up and down the list', () => {
    store().addTray();
    store().addTray();
    const third = store().project.trays[2]!.id;
    store().moveTray(third, 0);
    expect(names()).toEqual(['TR-03', 'TR-01', 'TR-02']);
    store().moveTray(third, 99);
    expect(names()).toEqual(['TR-01', 'TR-02', 'TR-03']);
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });
});

describe('standards and settings', () => {
  const setup = () => ({
    standards: { widthsMm: [100, 200, 300], heightsMm: [50, 100] },
    clearanceOptions: [0.5, 1],
    trayDefaults: { ...createProject().trayDefaults, layers: 2 as const, maxFillPct: 50 },
  });

  it('gives new trays the project defaults, and leaves existing trays alone', () => {
    store().updateSetup(setup());
    expect(active().settings.layers).toBe(1);
    store().addTray();
    expect(active().settings).toMatchObject({ layers: 2, maxFillPct: 50 });
    expect(store().project.standards.widthsMm).toEqual([100, 200, 300]);
  });

  it('can apply the defaults to every tray in one undo step', () => {
    store().addTray();
    store().updateSetup(setup(), true);
    expect(store().project.trays.map((t) => t.settings.maxFillPct)).toEqual([50, 50]);
    expect(store().past.at(-1)?.label).toBe('apply defaults to every tray');
    store().undo();
    expect(store().project.trays.map((t) => t.settings.maxFillPct)).toEqual([40, 40]);
    expect(store().project.standards.widthsMm).toContain(1000);
  });
});

describe('replacing the project', () => {
  it('can be undone, and shows its notice only until the next change', () => {
    const before = store().project;
    const next = createProject(before);
    next.name = 'Opened';
    store().replaceProject(next, 'open project', { tone: 'info', text: 'Opened x.ctd.json.' });
    expect(store().notice).toMatchObject({ text: 'Opened x.ctd.json.', after: next });
    store().undo();
    expect(store().project).toBe(before);
  });

  it('keeps standard sizes and defaults when starting a new project', () => {
    const project = createProject();
    project.standards = { widthsMm: [150], heightsMm: [60] };
    project.trayDefaults = { ...project.trayDefaults, spacing: 0 };
    const fresh = createProject(project);
    expect(fresh.standards).toEqual({ widthsMm: [150], heightsMm: [60] });
    expect(fresh.trays[0]!.settings.spacing).toBe(0);
  });
});
