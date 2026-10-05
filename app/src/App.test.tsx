import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { loadCatalog } from './data/catalog';
import { sampleProject } from './export/testing/sampleProject';
import { PROJECT_STORAGE_KEY } from './state/persistence';
import { projectFileContent } from './state/projectFile';
import { startAutosave, useProjectStore } from './state/projectStore';
import { THEME_STORAGE_KEY } from './state/theme';

const banner = () => screen.getByRole('status', { name: /^TR-01:/ });

function chooseRadio(groupName: string, option: string) {
  const group = screen.getByRole('group', { name: groupName });
  fireEvent.click(within(group).getByRole('radio', { name: option }));
}

/** Adds a catalog cable through the picker: search, pick the row with this OD, set quantity, add. */
function addFromCatalog(search: string, od: string, quantity: number) {
  fireEvent.click(screen.getByRole('button', { name: '+ Add cable' }));
  const dialog = screen.getByRole('dialog', { name: /Add cable to/ });
  fireEvent.change(within(dialog).getByLabelText('Search'), { target: { value: search } });
  fireEvent.click(within(dialog).getByRole('radio', { name: new RegExp(`OD ${od} mm`) }));
  fireEvent.change(within(dialog).getByLabelText('Quantity'), { target: { value: String(quantity) } });
  fireEvent.click(within(dialog).getByRole('button', { name: `Add ${quantity} cables` }));
}

describe('App shell', () => {
  it('shows the tray list, inputs and result areas', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Cable Tray Design' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Trays' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Inputs' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Result' })).toBeInTheDocument();
  });

  it('applies and remembers the chosen theme', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    fireEvent.click(screen.getByRole('radio', { name: 'Auto' }));
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });

  it('switches between inputs and result on narrow screens', () => {
    render(<App />);
    const resultButton = screen.getByRole('button', { name: 'Result' });
    fireEvent.click(resultButton);
    expect(resultButton).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('sizing a tray', () => {
  it('starts empty and asks for cables', () => {
    render(<App />);
    expect(banner()).toHaveTextContent('NO CABLES');
    expect(screen.getByText(/No cables yet/)).toBeInTheDocument();
  });

  it('builds reference tray T2 through the cable picker and upsizes it for fill', () => {
    render(<App />);
    chooseRadio('Layers', '2');
    chooseRadio('Spacing between cables', 'Touching');
    fireEvent.click(screen.getByRole('switch', { name: 'Gap between layers' }));

    addFromCatalog('oman 4c 16 cu xlpe swa', '23.5', 12);
    addFromCatalog('oman 4c 6 cu xlpe swa', '20.0', 8);

    expect(banner()).toHaveTextContent('300 × 75 mm');
    expect(banner()).toHaveTextContent('PASS · UPSIZED FOR FILL');
    expect(banner()).toHaveTextContent('Required 288.7 × 47.0 mm');
    expect(screen.getByText(/300 × 50 gave 51.5%/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Section of a 300 by 75 mm tray with 20 cables in 2 layers/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Selected tray 300 × 75 mm · upsized for fill/ })).toBeInTheDocument();
    expect(screen.getByText('2 rows · 20 cables')).toBeInTheDocument();
  });

  it('adds a manual cable and marks it as manual', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add cable' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Manual cable' }));
    fireEvent.change(within(dialog).getByLabelText('Description'), { target: { value: 'Fire alarm FP200' } });
    fireEvent.change(within(dialog).getByLabelText('Outside diameter (mm)'), { target: { value: '50' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add 1 cable' }));

    expect(screen.getByText('Fire alarm FP200')).toBeInTheDocument();
    expect(screen.getByText('MANUAL')).toBeInTheDocument();
    // 50 × 1.2 + 2 × 25 = 110 mm wide → 150 × 50.
    expect(banner()).toHaveTextContent('150 × 50 mm');
    expect(banner()).toHaveTextContent('PASS');
  });

  it('updates the result when a quantity changes and when a cable is removed', () => {
    render(<App />);
    addFromCatalog('doha 4c 240 cu xlpe swa', '60.3', 2);
    expect(banner()).toHaveTextContent('300 × 75 mm');
    fireEvent.click(screen.getByRole('button', { name: 'One more' }));
    fireEvent.click(screen.getByRole('button', { name: 'One more' }));
    expect(screen.getByText('1 row · 4 cables')).toBeInTheDocument();
    expect(banner()).toHaveTextContent('600 × 75 mm');
    fireEvent.click(screen.getByRole('button', { name: /Remove cable 1/ }));
    expect(banner()).toHaveTextContent('NO CABLES');
  });

  it('rejects an invalid setting and keeps the last valid value', () => {
    render(<App />);
    const maxFill = screen.getByLabelText('Max fill');
    fireEvent.change(maxFill, { target: { value: '150' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Must be at most 100.');
    expect(useProjectStore.getState().project.trays[0]!.settings.maxFillPct).toBe(40);
    fireEvent.blur(maxFill);
    expect(maxFill).toHaveValue('40');
  });
});

describe('trays', () => {
  it('adds, renames, duplicates and deletes trays', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add tray' }));
    const trays = screen.getByRole('navigation', { name: 'Trays' });
    expect(within(trays).getByRole('button', { name: /TR-02/, current: true })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tray ID'), { target: { value: 'Riser A' } });
    expect(within(trays).getByRole('button', { name: /^Riser A/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Riser A' }));
    expect(within(trays).getAllByRole('listitem')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Delete TR-02' }));
    fireEvent.click(within(screen.getByRole('group', { name: /Delete TR-02\?/ })).getByRole('button', { name: 'Delete' }));
    expect(within(trays).getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows each tray’s size in the list', () => {
    render(<App />);
    addFromCatalog('doha 4c 240 cu xlpe swa', '60.3', 2);
    const trays = screen.getByRole('navigation', { name: 'Trays' });
    expect(within(trays).getByRole('button', { name: /TR-01.*PASS.*300 × 75 mm/ })).toBeInTheDocument();
  });
});

describe('autosave', () => {
  afterEach(() => vi.useRealTimers());

  it('saves the project to the browser shortly after a change', () => {
    vi.useFakeTimers();
    const stop = startAutosave();
    useProjectStore.getState().setProjectName('Tower B');
    expect(useProjectStore.getState().saveState.status).toBe('pending');
    vi.advanceTimersByTime(400);
    expect(useProjectStore.getState().saveState.status).toBe('saved');
    expect(JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY)!).name).toBe('Tower B');
    stop();
  });
});

describe('undo and redo', () => {
  it('undoes and redoes from the top bar and with Ctrl+Z / Ctrl+Y', () => {
    render(<App />);
    addFromCatalog('doha 4c 240 cu xlpe swa', '60.3', 2);
    expect(banner()).toHaveTextContent('300 × 75 mm');

    fireEvent.click(screen.getByRole('button', { name: 'Undo add cable' }));
    expect(banner()).toHaveTextContent('NO CABLES');
    fireEvent.click(screen.getByRole('button', { name: 'Redo add cable' }));
    expect(banner()).toHaveTextContent('300 × 75 mm');

    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(banner()).toHaveTextContent('NO CABLES');
    fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true });
    expect(banner()).toHaveTextContent('300 × 75 mm');
  });

  it('leaves Ctrl+Z to text fields while typing', () => {
    render(<App />);
    const service = screen.getByLabelText('Service');
    fireEvent.change(service, { target: { value: 'LV' } });
    fireEvent.keyDown(service, { key: 'z', ctrlKey: true });
    expect(useProjectStore.getState().project.trays[0]!.service).toBe('LV');
  });
});

describe('tray order and comparison', () => {
  const order = () =>
    within(screen.getByRole('navigation', { name: 'Trays' }))
      .getAllByRole('button', { name: /^TR-0\d/ })
      .map((b) => b.textContent?.slice(0, 5));

  it('moves the selected tray up the list, also with Alt+arrow keys', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add tray' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move TR-02 up' }));
    expect(order()).toEqual(['TR-02', 'TR-01']);
    const trays = screen.getByRole('navigation', { name: 'Trays' });
    fireEvent.keyDown(within(trays).getByRole('button', { name: /^TR-02/ }), { key: 'ArrowDown', altKey: true });
    expect(order()).toEqual(['TR-01', 'TR-02']);
  });

  it('compares trays side by side and opens one from its card', () => {
    useProjectStore.setState({ project: sampleProject() });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Compare trays/ }));
    const compare = screen.getByRole('region', { name: 'Compare trays' });
    expect(within(compare).getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['TR-01', 'TR-02', 'TR-03']);
    expect(within(compare).getByRole('row', { name: /Selected tray 900 × 75 mm 300 × 75 mm 450 × 150 mm/ })).toBeInTheDocument();

    fireEvent.click(within(compare).getByRole('checkbox', { name: 'TR-02' }));
    expect(within(compare).getAllByRole('article')).toHaveLength(2);

    fireEvent.click(within(compare).getByRole('button', { name: 'Open TR-03' }));
    expect(screen.queryByRole('region', { name: 'Compare trays' })).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: /^TR-03:/ })).toHaveTextContent('450 × 150 mm');
  });
});

describe('standards and settings', () => {
  it('changes the standard widths for every tray, and can be undone', () => {
    render(<App />);
    addFromCatalog('doha 4c 240 cu xlpe swa', '60.3', 2);
    fireEvent.click(screen.getByRole('button', { name: 'Standards' }));
    const dialog = screen.getByRole('dialog', { name: 'Standards and settings' });
    const widths = within(dialog).getByLabelText('Widths (mm)');

    fireEvent.change(widths, { target: { value: '400, abc' } });
    expect(within(dialog).getByText(/Not a size between 0 and 5,000: abc/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.change(widths, { target: { value: '600 400' } });
    expect(within(dialog).getByText(/2 values, 400–600 mm/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(banner()).toHaveTextContent('400 × 75 mm');

    fireEvent.click(screen.getByRole('button', { name: 'Undo change standards and settings' }));
    expect(banner()).toHaveTextContent('300 × 75 mm');
  });

  it('gives new trays the default settings', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Standards' }));
    const dialog = screen.getByRole('dialog', { name: 'Standards and settings' });
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Layers' })).getByRole('radio', { name: '3' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Add tray' }));
    expect(within(screen.getByRole('group', { name: 'Layers' })).getByRole('radio', { name: '3' })).toBeChecked();
  });
});

describe('catalog', () => {
  it('shows every value of a row and its catalogue page, and adds it to the tray', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Catalog' }));
    const dialog = screen.getByRole('dialog', { name: 'Cable catalog' });
    fireEvent.change(within(dialog).getByLabelText('Search'), { target: { value: 'CX1-T105-W20' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: /OD 60.3 mm/ }));

    const detail = within(dialog).getByRole('complementary', { name: 'Selected cable' });
    expect(within(detail).getByRole('heading', { name: 'Doha Cables · 4C 240 mm²' })).toBeInTheDocument();
    expect(within(detail).queryByTitle('Doha Cables.pdf, page 89')).not.toBeInTheDocument();
    fireEvent.click(within(detail).getByRole('button', { name: 'Show catalogue pages here' }));
    expect(within(detail).getByTitle('Doha Cables.pdf, page 89')).toHaveAttribute('src', 'pdfs/Doha%20Cables.pdf#page=89&view=FitH');
    expect(within(detail).getByRole('link', { name: /Open in a new tab/ })).toHaveAttribute('href', 'pdfs/Doha%20Cables.pdf#page=89');
    fireEvent.click(within(detail).getByRole('button', { name: 'Next page' }));
    expect(within(detail).getByTitle('Doha Cables.pdf, page 90')).toBeInTheDocument();

    fireEvent.click(within(detail).getByRole('button', { name: 'Add to TR-01' }));
    expect(within(detail).getByText(/Added 1 to TR-01/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.getByText('1 row · 1 cable')).toBeInTheDocument();
  });

  it('lists excluded rows, which cannot be added', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Catalog' }));
    const dialog = screen.getByRole('dialog', { name: 'Cable catalog' });
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Status' })).getByRole('radio', { name: /^Excluded/ }));
    fireEvent.click(within(dialog).getAllByRole('radio', { name: /OD/ })[0]!);
    expect(within(dialog).getByRole('button', { name: 'Add to TR-01' })).toBeDisabled();
    expect(within(dialog).getByText('Excluded rows cannot be used.')).toBeInTheDocument();
  });

  it('opens on a cable from the cable list', () => {
    render(<App />);
    addFromCatalog('oman 4c 16 cu xlpe swa', '23.5', 2);
    fireEvent.click(screen.getByRole('button', { name: 'View cable 1 in the catalog' }));
    const detail = within(screen.getByRole('dialog', { name: 'Cable catalog' })).getByRole('complementary', { name: 'Selected cable' });
    expect(within(detail).getByRole('heading', { name: 'Oman Cables · 4C 16 mm²' })).toBeInTheDocument();
    expect(within(detail).getByText('23.5 mm')).toBeInTheDocument();
  });
});

describe('project files', () => {
  function openFile(text: string, name = 'Example.ctd.json') {
    const input = screen.getByLabelText('Project file to open');
    fireEvent.change(input, { target: { files: [new File([text], name, { type: 'application/json' })] } });
  }

  it('opens a project file, says so, and Undo brings back the previous project', async () => {
    render(<App />);
    openFile(projectFileContent(sampleProject(), loadCatalog(), '0.1.0'));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveValue('Example Project'));
    expect(screen.getByText('Opened Example.ctd.json.')).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Trays' })).getAllByRole('listitem')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveValue('Untitled project');
    expect(screen.queryByText('Opened Example.ctd.json.')).not.toBeInTheDocument();
  });

  it('explains why a file cannot be opened and keeps the project', async () => {
    render(<App />);
    openFile('hello', 'notes.txt');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not open notes.txt. This file is not a Cable Tray Design project'));
    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveValue('Untitled project');
  });

  it('starts a new project', () => {
    useProjectStore.setState({ project: sampleProject() });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveValue('Untitled project');
    expect(screen.getByText(/Started a new project/)).toBeInTheDocument();
  });

  it('offers a project file when the browser cannot save', () => {
    render(<App />);
    act(() => useProjectStore.setState({ saveState: { status: 'failed', message: 'Your changes are not being saved in this browser.' } }));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Save a project file to keep your work.');
    expect(within(alert).getByRole('button', { name: 'Save project file' })).toBeInTheDocument();
  });
});
