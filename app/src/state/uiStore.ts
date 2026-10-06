import { create } from 'zustand';
import { applyThemePreference, readThemePreference, writeThemePreference, type ThemePreference } from './theme';

/** Which pane is visible when the screen is too narrow to show both. */
export type CompactPane = 'inputs' | 'result';
/** The main area: one tray's inputs and result, or several trays side by side. */
export type MainView = 'tray' | 'compare';
export type TopDialog = 'details' | 'export' | 'standards' | 'catalog' | null;
export type PickerTab = 'catalog' | 'manual';

/** Remembers that the first-time guide was dismissed, in this browser. */
export const GUIDE_STORAGE_KEY = 'ctd.guide.dismissed';

function readGuideDismissed(): boolean {
  try {
    return window.localStorage.getItem(GUIDE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeGuideDismissed(): void {
  try {
    window.localStorage.setItem(GUIDE_STORAGE_KEY, '1');
  } catch {
    // Storage is blocked (a private window): the guide stays hidden for this visit.
  }
}

interface UiState {
  theme: ThemePreference;
  compactPane: CompactPane;
  view: MainView;
  /** Trays left out of the comparison; new trays are included. */
  compareHidden: string[];
  dialog: TopDialog;
  /** Catalog row to show when the catalog opens. */
  catalogFocusId: string | null;
  /** Whether the catalog shows catalogue pages beside each row; off until asked, since each is a large PDF. */
  showCataloguePages: boolean;
  setTheme: (theme: ThemePreference) => void;
  setCompactPane: (pane: CompactPane) => void;
  setView: (view: MainView) => void;
  setCompareHidden: (ids: string[]) => void;
  openDialog: (dialog: TopDialog) => void;
  /** Opens the catalog, showing one row when an id is given. */
  openCatalog: (cableId?: string) => void;
  setShowCataloguePages: (show: boolean) => void;
  /**
   * A request to open the add-cable dialog from outside the cable list (the
   * empty drawing, the first-time guide). A new object each time, so the cable
   * list sees every request; `tab` picks the dialog's tab, or keeps the last one.
   */
  cablePickerRequest: { tab: PickerTab | null } | null;
  requestCablePicker: (tab?: PickerTab) => void;
  /** Whether the first-time guide has been dismissed in this browser. */
  guideDismissed: boolean;
  dismissGuide: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  theme: readThemePreference(),
  compactPane: 'inputs',
  view: 'tray',
  compareHidden: [],
  dialog: null,
  catalogFocusId: null,
  showCataloguePages: false,
  setTheme: (theme) => {
    writeThemePreference(theme);
    applyThemePreference(theme);
    set({ theme });
  },
  setCompactPane: (compactPane) => set({ compactPane }),
  setView: (view) => set({ view }),
  setCompareHidden: (compareHidden) => set({ compareHidden }),
  openDialog: (dialog) => set({ dialog }),
  openCatalog: (cableId) => set({ dialog: 'catalog', catalogFocusId: cableId ?? null }),
  setShowCataloguePages: (showCataloguePages) => set({ showCataloguePages }),
  cablePickerRequest: null,
  // The dialog lives in the cable list, so narrow screens switch to the inputs to show it.
  requestCablePicker: (tab) => set({ cablePickerRequest: { tab: tab ?? null }, compactPane: 'inputs' }),
  guideDismissed: typeof window === 'undefined' ? false : readGuideDismissed(),
  dismissGuide: () => {
    writeGuideDismissed();
    set({ guideDismissed: true });
  },
}));
