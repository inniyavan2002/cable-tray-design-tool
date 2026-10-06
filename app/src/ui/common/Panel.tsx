import { useId, useState, type ReactNode } from 'react';
import styles from './Panel.module.css';

interface PanelProps {
  title: string;
  /** Short secondary text shown at the right of the header, e.g. a count. */
  meta?: ReactNode;
  /** Anchor for the step bar; the panel can then take focus when a step is chosen. */
  id?: string;
  className?: string;
  children: ReactNode;
}

export function Panel({ title, meta, id, className, children }: PanelProps) {
  const headingId = useId();
  return (
    <section id={id} tabIndex={id ? -1 : undefined} className={`${styles.panel} ${className ?? ''}`} aria-labelledby={headingId}>
      <header className={styles.head}>
        <h3 id={headingId} className={styles.title}>
          {title}
        </h3>
        {meta !== undefined && <span className={styles.meta}>{meta}</span>}
      </header>
      {children}
    </section>
  );
}

interface CollapsiblePanelProps {
  title: string;
  /** The current values in a few words, shown while the panel is closed. */
  summary: string;
  id?: string;
  children: ReactNode;
}

/** A settings panel that folds to one line showing its current values. Open by default. */
export function CollapsiblePanel({ title, summary, id, children }: CollapsiblePanelProps) {
  const [open, setOpen] = useState(true);
  const headingId = useId();
  const bodyId = useId();
  return (
    <section id={id} tabIndex={id ? -1 : undefined} className={styles.panel} data-open={open} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.foldHead}>
        <button type="button" className={styles.fold} aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
          <span className={styles.title}>{title}</span>
          {!open && <span className={styles.foldSummary}>{summary}</span>}
          <svg className={styles.chevron} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <path d="M3 4.5 6 7.5 9 4.5" />
          </svg>
        </button>
      </h3>
      <div id={bodyId} className={styles.foldBody} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
