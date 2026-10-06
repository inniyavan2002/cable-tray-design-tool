import { useEffect, useId } from 'react';
import type { Tray } from '../../state/projectModel';
import { useUiStore } from '../../state/uiStore';
import styles from './FirstRunGuide.module.css';
import { goToStep } from './StepBar';
import { STEP_TARGETS } from './steps';

const STEPS = [
  'Name the tray and what it carries.',
  'Add cables from the catalogue, or enter an OD by hand.',
  'Set the layers, spacing and allowances.',
  'Check the fill against your limit.',
  'Export the drawing and the report.',
];

/**
 * A short first-time guide above the inputs. It stays out of the way (no
 * overlay) and goes for good once dismissed or once the first cable is added.
 */
export function FirstRunGuide({ tray }: { tray: Tray }) {
  const dismissed = useUiStore((s) => s.guideDismissed);
  const dismiss = useUiStore((s) => s.dismissGuide);
  const headingId = useId();
  const started = tray.cables.length > 0;

  // Adding a cable means the guide has done its job.
  useEffect(() => {
    if (started && !dismissed) dismiss();
  }, [started, dismissed, dismiss]);

  if (dismissed || started) return null;
  return (
    <section className={styles.guide} aria-labelledby={headingId}>
      <div className={styles.head}>
        <h3 id={headingId} className={styles.title}>
          Let's size your first cable tray
        </h3>
        <button type="button" className={styles.close} aria-label="Hide the guide" title="Hide the guide" onClick={dismiss}>
          ×
        </button>
      </div>
      <ol className={styles.steps}>
        {STEPS.map((text, i) => (
          <li key={text}>
            <span className={styles.n} aria-hidden="true">
              {i + 1}
            </span>
            {text}
          </li>
        ))}
      </ol>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.start}
          onClick={() => {
            dismiss();
            goToStep('tray');
            requestAnimationFrame(() => document.getElementById(STEP_TARGETS.tray)?.querySelector('input')?.focus());
          }}
        >
          Start designing
        </button>
        <span className={styles.aside}>The result updates as you type; nothing leaves your browser.</span>
      </div>
    </section>
  );
}
