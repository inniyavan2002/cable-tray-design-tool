import styles from './App.module.css';
import { useActiveTray, useProjectStore } from './state/projectStore';
import { useTrayOutcome } from './state/trayResult';
import { useUiStore } from './state/uiStore';
import { CatalogBrowser } from './ui/catalog/CatalogBrowser';
import { CompareView } from './ui/compare/CompareView';
import { ExportDialog } from './ui/export/ExportDialog';
import { ProjectDetailsDialog } from './ui/project/ProjectDetailsDialog';
import { InputsPane } from './ui/shell/InputsPane';
import { NoticeBar } from './ui/shell/NoticeBar';
import { PaneSwitch } from './ui/shell/PaneSwitch';
import { ResultPane } from './ui/shell/ResultPane';
import { TopBar } from './ui/shell/TopBar';
import { useShortcuts } from './ui/shell/useShortcuts';
import { StandardsDialog } from './ui/standards/StandardsDialog';
import { TrayList } from './ui/trays/TrayList';

export function App() {
  useShortcuts();
  const compactPane = useUiStore((state) => state.compactPane);
  const view = useUiStore((state) => state.view);
  const dialog = useUiStore((state) => state.dialog);
  const openDialog = useUiStore((state) => state.openDialog);
  const tray = useActiveTray();
  const standards = useProjectStore((s) => s.project.standards);
  const outcome = useTrayOutcome(tray, standards);
  const closeDialog = () => openDialog(null);

  return (
    <div className={styles.app}>
      <TopBar />
      <p className={styles.notice} role="note">
        Preview build, phase 6 of 7: every planned feature is in. Tablet and phone layouts, accessibility checks and the user guide follow in phase 7.
        Check results against the current tool before using them for design work.
      </p>
      <NoticeBar />
      <div className={styles.body} data-pane={compactPane} data-view={view}>
        <div className={styles.railArea}>
          <TrayList />
        </div>
        {view === 'compare' ? (
          <div className={styles.compareArea}>
            <CompareView />
          </div>
        ) : (
          <>
            <div className={styles.switchArea}>
              <PaneSwitch />
            </div>
            <section className={styles.inputs} aria-labelledby="inputs-heading">
              <h2 id="inputs-heading" className="sr-only">
                Inputs
              </h2>
              <InputsPane tray={tray} />
            </section>
            <section className={styles.result} aria-labelledby="result-heading">
              <h2 id="result-heading" className="sr-only">
                Result
              </h2>
              <ResultPane tray={tray} outcome={outcome} />
            </section>
          </>
        )}
      </div>
      <footer className={styles.footer}>
        <span>v{__APP_VERSION__}</span>
        <span>{__BUILD_KIND__ === 'single-file' ? 'Single-file offline build' : 'Web build'}</span>
        <span>Runs entirely in your browser</span>
      </footer>
      <ProjectDetailsDialog open={dialog === 'details'} onClose={closeDialog} />
      <ExportDialog open={dialog === 'export'} onClose={closeDialog} />
      <StandardsDialog />
      <CatalogBrowser />
    </div>
  );
}
