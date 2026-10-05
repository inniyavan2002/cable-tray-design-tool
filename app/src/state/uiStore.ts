import { create } from 'zustand';
import { applyThemePreference, readThemePreference, writeThemePreference, type ThemePreference } from './theme';

/** Which pane is visible when the screen is too narrow to show both. */
export type CompactPane = 'inputs' | 'result';
/** The main area: one tray's inputs and result, or several trays side by side. */
export type MainView = 'tray' | 'compare';
export type TopDialog = 'details' | 'export' | 'standards' | 'catalog' | null;

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
}));
