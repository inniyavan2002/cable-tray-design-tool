import type { MouseEvent } from 'react';
import type { Tray } from '../../state/projectModel';
import type { TrayOutcome } from '../../state/trayResult';
import { useUiStore } from '../../state/uiStore';
import { prefersReducedMotion } from '../common/motion';
import styles from './StepBar.module.css';
import { designProgress, STEP_TARGETS, type StepKey, type StepState } from './steps';

const STATE_TEXT: Record<StepState, string> = { done: 'done', current: 'current step', attention: 'needs attention', todo: 'not reached yet' };

/** Brings a step's panel into view, switching panes on narrow screens, and moves focus to it. */
export function goToStep(key: StepKey): void {
  useUiStore.getState().setCompactPane(key === 'check' || key === 'result' ? 'result' : 'inputs');
  // After the pane switch has rendered.
  requestAnimationFrame(() => {
    const target = document.getElementById(STEP_TARGETS[key]);
    if (!target) return;
    target.scrollIntoView?.({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
  });
}

/** 01 Tray → 02 Cables → 03 Arrangement → 04 Check → 05 Result, read from the tray as it stands. */
export function StepBar({ tray, outcome }: { tray: Tray; outcome: TrayOutcome }) {
  const { steps, next } = designProgress(tray, outcome);
  const go = (key: StepKey) => (event: MouseEvent) => {
    event.preventDefault();
    goToStep(key);
  };
  return (
    <nav className={styles.bar} aria-label="Design steps">
      <ol className={styles.steps}>
        {steps.map((step, i) => (
          <li key={step.key} className={styles.step} data-state={step.state}>
            <a href={`#${STEP_TARGETS[step.key]}`} className={styles.link} aria-current={step.state === 'current' ? 'step' : undefined} onClick={go(step.key)}>
              <span className={styles.index} aria-hidden="true">
                {step.state === 'done' ? '✓' : step.state === 'attention' ? '!' : String(i + 1).padStart(2, '0')}
              </span>
              <span className={styles.text}>
                <span className={styles.label}>
                  <span className={styles.number}>{String(i + 1).padStart(2, '0')}</span> {step.label}
                </span>
                <span className={styles.detail}>{step.detail}</span>
              </span>
              <span className="sr-only">, {STATE_TEXT[step.state]}</span>
            </a>
          </li>
        ))}
      </ol>
      <p className={styles.next} data-tone={steps.some((s) => s.state === 'attention') ? 'warn' : undefined}>
        <b>Next</b>
        {next}
      </p>
    </nav>
  );
}
