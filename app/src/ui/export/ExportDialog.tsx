import { useEffect, useId, useState } from 'react';
import type { ExportFile, ExportFormat } from '../../export/runExport';
import { useProjectStore } from '../../state/projectStore';
import { Dialog } from '../common/Dialog';
import styles from './ExportDialog.module.css';

type Scope = 'tray' | 'selected' | 'project';

const FORMATS: ReadonlyArray<{ value: ExportFormat; label: string; description: string }> = [
  { value: 'pdf', label: 'PDF report', description: 'Title block, tray summary, and each tray’s result, drawing, cable schedule and calculation.' },
  { value: 'excel', label: 'Excel workbook', description: 'A project sheet, one sheet per tray with its drawing, and the cables used.' },
  { value: 'png', label: 'Drawing as PNG', description: 'Section drawing with legend, as an image. Several trays come as a zip file.' },
  { value: 'svg', label: 'Drawing as SVG', description: 'The same drawing as a vector file that scales without blurring.' },
];

const ACTION: Record<ExportFormat, string> = { pdf: 'Preview PDF', excel: 'Save Excel', png: 'Save PNG', svg: 'Save SVG' };

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} title="Export" onClose={onClose} size="wide">
      {open && <ExportForm onClose={onClose} />}
    </Dialog>
  );
}

function ExportForm({ onClose }: { onClose: () => void }) {
  const project = useProjectStore((s) => s.project);
  const active = project.trays.find((t) => t.id === project.activeTrayId) ?? project.trays[0]!;
  const [scope, setScope] = useState<Scope>('tray');
  const [selected, setSelected] = useState<string[]>([active.id]);
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [includeCatalog, setIncludeCatalog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ file: ExportFile; url: string } | null>(null);
  const name = useId();

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  const trayIds = scope === 'tray' ? [active.id] : scope === 'project' ? project.trays.map((t) => t.id) : project.trays.filter((t) => selected.includes(t.id)).map((t) => t.id);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const [{ createExport }, { saveFile }] = await Promise.all([import('../../export/runExport'), import('../../export/browserFiles')]);
      const file = await createExport(project, { format, trayIds, includeCatalog });
      if (format === 'pdf') setPreview({ file, url: URL.createObjectURL(file.blob) });
      else {
        saveFile(file.blob, file.fileName);
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The export failed.');
    } finally {
      setBusy(false);
    }
  };

  if (preview) {
    return (
      <div className={styles.preview}>
        <p className={styles.meta}>
          {preview.file.fileName} · {preview.file.pageCount} page{preview.file.pageCount === 1 ? '' : 's'}. Nothing is saved until you choose Save PDF.
        </p>
        <iframe className={styles.frame} src={preview.url} title="PDF preview" />
        <div className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={() => setPreview(null)}>
            Back
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={async () => {
              const { saveFile } = await import('../../export/browserFiles');
              saveFile(preview.file.blob, preview.file.fileName);
              onClose();
            }}
          >
            Save PDF
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>What to export</legend>
        <label className={styles.option}>
          <input type="radio" name={`${name}-scope`} checked={scope === 'tray'} onChange={() => setScope('tray')} />
          <span>
            <b>This tray</b> <span className={styles.muted}>{active.name}</span>
          </span>
        </label>
        <label className={styles.option}>
          <input type="radio" name={`${name}-scope`} checked={scope === 'selected'} onChange={() => setScope('selected')} />
          <span>
            <b>Selected trays</b>
          </span>
        </label>
        {scope === 'selected' && (
          <div className={styles.trays} role="group" aria-label="Trays to export">
            {project.trays.map((t) => (
              <label key={t.id} className={styles.tray}>
                <input
                  type="checkbox"
                  checked={selected.includes(t.id)}
                  onChange={(e) => setSelected((ids) => (e.target.checked ? [...ids, t.id] : ids.filter((id) => id !== t.id)))}
                />
                {t.name}
              </label>
            ))}
          </div>
        )}
        <label className={styles.option}>
          <input type="radio" name={`${name}-scope`} checked={scope === 'project'} onChange={() => setScope('project')} />
          <span>
            <b>Whole project</b> <span className={styles.muted}>{project.trays.length} tray{project.trays.length === 1 ? '' : 's'}</span>
          </span>
        </label>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Format</legend>
        {FORMATS.map((f) => (
          <label key={f.value} className={styles.option}>
            <input type="radio" name={`${name}-format`} checked={format === f.value} onChange={() => setFormat(f.value)} />
            <span>
              <b>{f.label}</b>
              <span className={styles.description}>{f.description}</span>
            </span>
          </label>
        ))}
        {format === 'excel' && (
          <label className={styles.tray}>
            <input type="checkbox" checked={includeCatalog} onChange={(e) => setIncludeCatalog(e.target.checked)} />
            Also include the whole cable catalog (about 2,400 rows)
          </label>
        )}
      </fieldset>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.footer}>
        <span className={styles.muted}>Project details for the title block are under Details in the top bar.</span>
        <button type="button" className={styles.secondary} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={styles.primary} disabled={busy || trayIds.length === 0} onClick={run}>
          {busy ? 'Preparing…' : ACTION[format]}
        </button>
        {busy && <span className={styles.progress} role="progressbar" aria-label="Preparing the export" />}
      </div>
    </div>
  );
}
