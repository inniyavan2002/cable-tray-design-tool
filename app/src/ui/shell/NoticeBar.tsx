import { useProjectStore } from '../../state/projectStore';
import { saveProjectFile } from '../project/projectFiles';
import styles from './NoticeBar.module.css';

/**
 * Short messages under the top bar: a failed browser save (with a way to keep
 * the work), and the outcome of opening, importing or starting a project.
 */
export function NoticeBar() {
  const notice = useProjectStore((s) => s.notice);
  const project = useProjectStore((s) => s.project);
  const saveState = useProjectStore((s) => s.saveState);
  const undo = useProjectStore((s) => s.undo);
  const showNotice = useProjectStore((s) => s.showNotice);

  if (saveState.status === 'failed') {
    return (
      <div className={styles.notice} data-tone="error" role="alert">
        <p className={styles.text}>{saveState.message} Save a project file to keep your work.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={() => void saveProjectFile()}>
            Save project file
          </button>
        </div>
      </div>
    );
  }
  // A notice about an event disappears once the project changes again.
  if (!notice || (notice.after && notice.after !== project)) return null;

  return (
    <div className={styles.notice} data-tone={notice.tone} role={notice.tone === 'error' ? 'alert' : 'status'}>
      <div className={styles.text}>
        <p>{notice.text}</p>
        {notice.details && notice.details.length > 0 && (
          <ul className={styles.details}>
            {notice.details.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
      <div className={styles.actions}>
        {notice.after && (
          <button type="button" className={styles.button} onClick={undo}>
            Undo
          </button>
        )}
        <button type="button" className={styles.button} onClick={() => showNotice(null)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
