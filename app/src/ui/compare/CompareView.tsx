import { useMemo } from 'react';
import { sectionDrawing } from '../../drawing/sectionGeometry';
import { num1, percent, plain } from '../../domain/format';
import { buildProjectReport, type ReportTray } from '../../export/reportModel';
import { useProjectStore } from '../../state/projectStore';
import { useUiStore } from '../../state/uiStore';
import { Chip } from '../common/controls';
import { SectionSvg, sectionLabel } from '../drawing/SectionView';
import { STATUS_TEXT } from '../results/status';
import styles from './CompareView.module.css';

/** Several trays side by side: a card with a small section for each, then one table. */
export function CompareView() {
  const project = useProjectStore((s) => s.project);
  const selectTray = useProjectStore((s) => s.selectTray);
  const hidden = useUiStore((s) => s.compareHidden);
  const setHidden = useUiStore((s) => s.setCompareHidden);
  const setView = useUiStore((s) => s.setView);
  const report = useMemo(
    () =>
      buildProjectReport(
        project,
        project.trays.filter((t) => !hidden.includes(t.id)).map((t) => t.id),
      ),
    [project, hidden],
  );

  const open = (id: string) => {
    selectTray(id);
    setView('tray');
  };
  // Every label that any shown tray has, results before settings, so rows line up across trays.
  const labels = (pick: (t: ReportTray) => Array<[string, string]>) => report.trays.flatMap((t) => pick(t).map(([label]) => label));
  const rows = [...new Set([...labels((t) => t.resultRows), ...labels((t) => t.settingsRows)])];
  const value = (t: ReportTray, label: string) => [...t.resultRows, ...t.settingsRows].find(([l]) => l === label)?.[1] ?? '–';

  return (
    <section className={styles.compare} aria-labelledby="compare-heading">
      <header className={styles.head}>
        <h2 id="compare-heading" className={styles.title}>
          Compare trays
        </h2>
        <button type="button" className={styles.back} onClick={() => setView('tray')}>
          Back to tray
        </button>
      </header>

      <fieldset className={styles.picker}>
        <legend className={styles.legend}>Trays to compare</legend>
        {project.trays.map((t) => (
          <label key={t.id} className={styles.check}>
            <input
              type="checkbox"
              checked={!hidden.includes(t.id)}
              onChange={(e) => setHidden(e.target.checked ? hidden.filter((id) => id !== t.id) : [...hidden, t.id])}
            />
            {t.name}
          </label>
        ))}
      </fieldset>

      {report.trays.length === 0 ? (
        <p className={styles.empty}>Choose at least one tray to compare.</p>
      ) : (
        <>
          <ul className={styles.cards} aria-label="Trays">
            {report.trays.map((t) => (
              <li key={t.id}>
                <CompareCard tray={t} onOpen={() => open(t.id)} />
              </li>
            ))}
          </ul>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">Trays side by side</caption>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  {report.trays.map((t) => (
                    <th key={t.id} scope="col">
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Service</th>
                  {report.trays.map((t) => (
                    <td key={t.id}>{t.service || '–'}</td>
                  ))}
                </tr>
                {rows.map((label) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    {report.trays.map((t) => (
                      <td key={t.id}>{value(t, label)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function CompareCard({ tray, onOpen }: { tray: ReportTray; onOpen: () => void }) {
  const { result, resolved } = tray.outcome;
  const status = STATUS_TEXT[result.status];
  const drawing = useMemo(() => {
    const byRow = new Map(resolved.map((r) => [r.cable.id, { tag: r.tag, colourIndex: r.colourIndex }]));
    return sectionDrawing(result, (rowId) => byRow.get(rowId) ?? { tag: 0, colourIndex: 0 }, { dimensions: false, zones: true });
  }, [result, resolved]);

  return (
    <article className={styles.card} aria-label={tray.name}>
      <header className={styles.cardHead}>
        <span className={styles.name}>{tray.name}</span>
        <Chip tone={status.tone}>{status.short}</Chip>
      </header>
      <span className={styles.service}>{tray.service || 'No service set'}</span>
      <div className={styles.drawing}>
        {drawing ? <SectionSvg drawing={drawing} label={sectionLabel(tray.outcome)} className={styles.svg} /> : <span className={styles.noDrawing}>No cables</span>}
      </div>
      <p className={styles.size}>{tray.sizeText}</p>
      <p className={styles.facts}>
        {result.status === 'empty' ? (
          'No cables yet'
        ) : (
          <>
            Required {num1(result.requiredWidthMm)} × {num1(result.requiredHeightMm)} mm
            <br />
            Fill {result.selected ? percent(result.selected.fill) : '–'} of {plain(result.settings.maxFillPct)}% · {result.cableCount} cable{result.cableCount === 1 ? '' : 's'}
          </>
        )}
      </p>
      <button type="button" className={styles.open} onClick={onOpen} aria-label={`Open ${tray.name}`}>
        Open
      </button>
    </article>
  );
}
