import { useRef } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { useUiStore } from '../../state/uiStore';
import { openProjectFile, saveProjectFile, startNewProject } from '../project/projectFiles';
import { ThemeSwitch } from './ThemeSwitch';
import styles from './TopBar.module.css';

export function TopBar() {
  const name = useProjectStore((s) => s.project.name);
  const saveState = useProjectStore((s) => s.saveState);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const undoLabel = useProjectStore((s) => s.past.at(-1)?.label);
  const redoLabel = useProjectStore((s) => s.future[0]?.label);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const openDialog = useUiStore((s) => s.openDialog);
  const openCatalog = useUiStore((s) => s.openCatalog);
  const fileInput = useRef<HTMLInputElement>(null);
  const saveText =
    saveState.status === 'saved' ? 'Saved in this browser' : saveState.status === 'pending' ? 'Saving…' : 'Not saved';

  return (
    <header className={styles.bar}>
      <h1 className={styles.brand}>
        <TrayMark />
        Cable Tray Design
      </h1>
      <div className={styles.project}>
        <input
          className={styles.projectName}
          aria-label="Project name"
          value={name}
          maxLength={80}
          onChange={(e) => setProjectName(e.target.value)}
          onBlur={(e) => {
            if (!e.target.value.trim()) setProjectName('Untitled project');
          }}
        />
        <button type="button" className={styles.link} onClick={() => openDialog('details')}>
          Details
        </button>
        <span className={styles.saveState} data-status={saveState.status} role="status">
          <span key={saveText} className={styles.saveText}>
            {saveText}
          </span>
        </span>
      </div>
      <div className={styles.actions}>
        <div className={styles.history} role="group" aria-label="Undo and redo">
          <button
            type="button"
            className={`${styles.button} ${styles.icon}`}
            aria-label={undoLabel ? `Undo ${undoLabel}` : 'Undo'}
            title={undoLabel ? `Undo ${undoLabel} (Ctrl+Z)` : 'Nothing to undo'}
            disabled={!undoLabel}
            onClick={undo}
          >
            <span aria-hidden="true">↶</span>
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.icon}`}
            aria-label={redoLabel ? `Redo ${redoLabel}` : 'Redo'}
            title={redoLabel ? `Redo ${redoLabel} (Ctrl+Y)` : 'Nothing to redo'}
            disabled={!redoLabel}
            onClick={redo}
          >
            <span aria-hidden="true">↷</span>
          </button>
        </div>
        <div className={styles.group} role="group" aria-label="Project file">
          <button type="button" className={styles.button} title="Start an empty project (Undo brings this one back)" onClick={startNewProject}>
            New
          </button>
          <button type="button" className={styles.button} title="Open a project file (.ctd.json)" onClick={() => fileInput.current?.click()}>
            Open
          </button>
          <button type="button" className={styles.button} title="Save a project file to share or keep (Ctrl+S)" onClick={() => void saveProjectFile()}>
            Save project
          </button>
        </div>
        <div className={styles.group} role="group" aria-label="Catalog and standards">
          <button type="button" className={styles.button} onClick={() => openCatalog()}>
            Catalog
          </button>
          <button type="button" className={styles.button} onClick={() => openDialog('standards')}>
            Standards
          </button>
        </div>
        <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => openDialog('export')}>
          Export
        </button>
      </div>
      <ThemeSwitch />
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className={styles.fileInput}
        aria-label="Project file to open"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void openProjectFile(file);
        }}
      />
    </header>
  );
}

/** Tray section with two cables: the app's mark. */
function TrayMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M3 6v20h26V6" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="10" cy="20" r="4" fill="var(--accent)" />
      <circle cx="19" cy="21" r="3" fill="var(--accent)" />
    </svg>
  );
}
