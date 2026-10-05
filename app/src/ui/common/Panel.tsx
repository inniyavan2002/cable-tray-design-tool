import { useId, type ReactNode } from 'react';
import styles from './Panel.module.css';

interface PanelProps {
  title: string;
  /** Short secondary text shown at the right of the header, e.g. a count. */
  meta?: ReactNode;
  children: ReactNode;
}

export function Panel({ title, meta, children }: PanelProps) {
  const headingId = useId();
  return (
    <section className={styles.panel} aria-labelledby={headingId}>
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
