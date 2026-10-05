import { useUiStore } from '../../state/uiStore';
import styles from './PaneSwitch.module.css';

/** Inputs / Result toggle, shown only when the screen is too narrow for both. */
export function PaneSwitch() {
  const pane = useUiStore((state) => state.compactPane);
  const setPane = useUiStore((state) => state.setCompactPane);
  return (
    <div className={styles.switch} role="group" aria-label="Show">
      <button type="button" className={styles.button} aria-pressed={pane === 'inputs'} onClick={() => setPane('inputs')}>
        Inputs
      </button>
      <button type="button" className={styles.button} aria-pressed={pane === 'result'} onClick={() => setPane('result')}>
        Result
      </button>
    </div>
  );
}
