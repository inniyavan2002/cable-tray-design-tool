import { describe, expect, it } from 'vitest';
import { BRANDS, loadCatalog } from '../data/catalog';
import { sampleProject } from '../export/testing/sampleProject';
import { convertLegacyState, LEGACY_STORAGE_KEYS } from './legacyImport';
import { loadProject, PROJECT_STORAGE_KEY, REMOVE_PREVIOUS_TOOL_DATA } from './persistence';
import { projectFileContent, projectFileName, readProjectFile } from './projectFile';
import { createProject } from './projectModel';

const catalog = loadCatalog();
const doha240 = catalog.byId.get('doha-1873')!;

/** State as the previous tool saved it: its own field names, a catalog copy and old row ids. */
function oldToolState() {
  return {
    catalog: [{ id: doha240.legacyId, brand: 'Doha Cables', size: '240', coreConfig: '4 Core', od: 60.3 }],
    standards: { widths: [50, 100, 200, 300, 600], heights: [50, 100], clearanceFactors: [0.3, 0.5, 1] },
    trays: [
      {
        id: 'a1',
        name: 'TR-01',
        trayType: 'Ladder',
        arrangement: 'Multi Layer',
        layers: 2,
        spacingLabel: 'Touching (0d)',
        clearanceFactor: 0.5,
        topClearance: 10,
        layerSpaceMode: 'no',
        maxFillPct: 40,
        sparePct: 25,
        service: 'LV Power',
        cables: [
          { id: 'c1', mode: 'catalog', catalogId: doha240.legacyId, od: 60.3, weight: 11780, qty: 2 },
          { id: 'c2', mode: 'manual', catalogId: '', od: 12.5, weight: 0, label: 'Fire alarm', qty: 3 },
          { id: 'c3', mode: 'catalog', catalogId: '', od: 0, weight: 0, qty: 1 },
          { id: 'c4', mode: 'catalog', catalogId: 'mdb_missing', qty: 1, selection: { brand: 'Ducab', coreConfig: '4 Core', size: '95' } },
          { id: 'c5', mode: 'manual', od: 0, qty: 1 },
        ],
      },
      { id: 'a2', name: '', arrangement: 'Single Layer', layers: 3, spacingLabel: '2d', cables: [] },
    ],
    activeTrayId: 'a2',
  };
}

describe('importing from the previous tool', () => {
  it('converts trays, settings, cables and standard sizes', () => {
    const imported = convertLegacyState(oldToolState(), catalog)!;
    const [t1, t2] = imported.project.trays;
    expect(imported.project.trays.map((t) => t.name)).toEqual(['TR-01', 'TR-02']);
    expect(t1!.settings).toMatchObject({ layers: 2, spacing: 0, layerGap: false, topClearancePct: 10, sparePct: 25, maxFillPct: 40, trayType: 'ladder' });
    expect(t2!.settings).toMatchObject({ layers: 1, spacing: 2, trayType: 'perforated' });
    expect(t1!.cables.map((c) => (c.kind === 'catalog' ? [c.catalogId, c.quantity] : [c.label, c.odMm, c.weightKgPerKm, c.quantity]))).toEqual([
      ['doha-1873', 2],
      ['Fire alarm', 12.5, null, 3],
    ]);
    expect(imported.problems).toEqual([
      'TR-01, cable 4: Ducab 4 Core 95 mm² could not be found in the catalog, left out.',
      'TR-01, cable 5: manual cable with no OD, left out.',
    ]);
    expect(imported.project.activeTrayId).toBe(t2!.id);
    expect(imported.project.standards).toEqual({ widthsMm: [50, 100, 200, 300, 600], heightsMm: [50, 100] });
    expect(imported.cableRows).toBe(2);
  });

  it('matches a cable saved under an older id by brand, cores, size and OD', () => {
    const unique = catalog.cables.find(
      (c) => c.cores !== null && catalog.cables.filter((x) => x.brandId === c.brandId && x.sizeMm2 === c.sizeMm2 && x.odMm === c.odMm && x.cores === c.cores).length === 1,
    )!;
    const legacyName = BRANDS.find((b) => b.id === unique.brandId)!.legacyName;
    const state = oldToolState();
    state.catalog = [{ id: 'old_7', brand: legacyName, size: String(unique.sizeMm2), coreConfig: `${unique.cores} Core`, od: unique.odMm }];
    state.trays[0]!.cables = [{ id: 'c1', mode: 'catalog', catalogId: 'old_7', od: unique.odMm, weight: 0, qty: 1 }];
    const imported = convertLegacyState(state, catalog)!;
    expect(imported.project.trays[0]!.cables).toMatchObject([{ kind: 'catalog', catalogId: unique.id }]);
  });

  it('skips the empty tray the previous tool made on first use, and anything that is not its data', () => {
    expect(convertLegacyState({ trays: [{ id: 'x', name: 'TR-01', arrangement: 'Single Layer', spacingLabel: '1d', cables: [] }] }, catalog)).toBeNull();
    expect(convertLegacyState(createProject(), catalog)).toBeNull();
    expect(convertLegacyState('text', catalog)).toBeNull();
  });
});

describe('first run in a browser that used the previous tool', () => {
  function memoryStorage(entries: Record<string, string>, failKey?: string) {
    const data = new Map(Object.entries(entries));
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (k === failKey) throw new Error('full');
        data.set(k, v);
      },
      removeItem: (k: string) => void data.delete(k),
      data,
    };
  }
  const oldData = { [LEGACY_STORAGE_KEYS[0]]: JSON.stringify(oldToolState()), [LEGACY_STORAGE_KEYS[5]]: '{"trays":[]}' };

  it('imports the trays, saves them and then removes the old data (decision D9)', () => {
    const storage = memoryStorage(oldData);
    const loaded = loadProject(storage, () => catalog, true);
    expect(loaded.imported?.project.trays).toHaveLength(2);
    expect(JSON.parse(storage.data.get(PROJECT_STORAGE_KEY)!).trays).toHaveLength(2);
    for (const key of LEGACY_STORAGE_KEYS) expect(storage.data.has(key)).toBe(false);
  });

  it('keeps the old data while the app is a preview', () => {
    expect(REMOVE_PREVIOUS_TOOL_DATA).toBe(false);
    const storage = memoryStorage(oldData);
    expect(loadProject(storage, () => catalog).imported).not.toBeNull();
    expect(storage.data.has(LEGACY_STORAGE_KEYS[0])).toBe(true);
  });

  it('keeps the old data when the new project cannot be saved', () => {
    const storage = memoryStorage(oldData, PROJECT_STORAGE_KEY);
    expect(loadProject(storage, () => catalog, true).imported).not.toBeNull();
    expect(storage.data.has(LEGACY_STORAGE_KEYS[0])).toBe(true);
  });

  it('runs only once: an existing project is loaded instead', () => {
    const project = createProject();
    const storage = memoryStorage({ ...oldData, [PROJECT_STORAGE_KEY]: JSON.stringify(project) });
    const loaded = loadProject(storage, () => catalog);
    expect(loaded.imported).toBeNull();
    expect(loaded.project).toEqual(project);
    expect(storage.data.has(LEGACY_STORAGE_KEYS[0])).toBe(true);
  });
});

describe('project files', () => {
  const project = sampleProject();

  it('saves and opens a project unchanged', () => {
    const text = projectFileContent(project, catalog, '0.1.0', new Date('2026-09-28T10:30:00Z'));
    const file = JSON.parse(text);
    expect(file).toMatchObject({ format: 'cable-tray-design-project', formatVersion: 1, savedAt: '2026-09-28T10:30:00.000Z', appVersion: '0.1.0' });
    expect(file.catalogCables['doha-1873']).toEqual({ description: 'Doha Cables · 4C 240 mm² · CX1-T105-W20', odMm: 60.3, weightKgPerKm: 11780 });
    expect(readProjectFile(text, catalog)).toEqual({ ok: true, project, warnings: [], fromPreviousTool: false });
  });

  it('says which cables differ from the catalog it is opened with', () => {
    const file = JSON.parse(projectFileContent(project, catalog, '0.1.0'));
    file.catalogCables['doha-1873'].odMm = 61;
    file.project.trays[0].cables.push({ id: 'gone', kind: 'catalog', catalogId: 'doha-99999', quantity: 1 });
    file.catalogCables['doha-99999'] = { description: 'Doha Cables · 4C 400 mm² · X', odMm: 70, weightKgPerKm: null };
    const opened = readProjectFile(JSON.stringify(file), catalog);
    expect(opened.ok && opened.warnings).toEqual([
      'Doha Cables · 4C 240 mm²: OD is 60.3 mm in this catalog, 61.0 mm when the file was saved. Sizes use 60.3 mm.',
      'Doha Cables · 4C 400 mm² · X is not in this version of the catalog, so it is not used in sizing.',
    ]);
  });

  it('opens a bare project and the previous tool’s data, and refuses anything else', () => {
    expect(readProjectFile(JSON.stringify(project), catalog)).toMatchObject({ ok: true, fromPreviousTool: false });
    expect(readProjectFile(JSON.stringify(oldToolState()), catalog)).toMatchObject({ ok: true, fromPreviousTool: true });
    expect(readProjectFile('{not json', catalog)).toMatchObject({ ok: false, error: expect.stringMatching(/could not be read as JSON/) });
    expect(readProjectFile('{"format":"cable-tray-design-project","formatVersion":2}', catalog)).toMatchObject({ ok: false, error: expect.stringMatching(/newer version/) });
    expect(readProjectFile('{"a":1}', catalog)).toMatchObject({ ok: false, error: 'This file is not a Cable Tray Design project.' });
  });

  it('names the file after the project', () => {
    expect(projectFileName({ name: 'Tower B / Level 3' })).toBe('Tower-B-Level-3.ctd.json');
    expect(projectFileName({ name: '  ' })).toBe('project.ctd.json');
  });
});
