import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import styles from './InfoTip.module.css';

/** Distance kept between the tip and the window edges, and the "i". */
const MARGIN = 8;

/**
 * A small "i" beside a setting that explains it in plain words, shown on
 * hover, on keyboard focus and on tap. Screen readers hear the explanation as
 * the button's description, so the setting's own name stays as it was. The tip
 * is placed within the window, above the "i" when there is room.
 */
export function InfoTip({ topic, children }: { topic: string; children: ReactNode }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const b = button.current;
    const t = tip.current;
    if (!open || !b || !t) return;
    const anchor = b.getBoundingClientRect();
    const left = Math.min(Math.max(MARGIN, anchor.left + anchor.width / 2 - t.offsetWidth / 2), window.innerWidth - t.offsetWidth - MARGIN);
    const above = anchor.top - t.offsetHeight - MARGIN;
    t.style.left = `${Math.max(MARGIN, left)}px`;
    t.style.top = `${above >= MARGIN ? above : anchor.bottom + MARGIN}px`;
  }, [open]);

  // The tip is fixed to the window, so it closes rather than drift when the page scrolls.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, { capture: true, passive: true });
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, { capture: true });
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <span className={styles.wrap} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        ref={button}
        type="button"
        className={styles.button}
        aria-label={`About ${topic}`}
        aria-describedby={id}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <span aria-hidden="true">i</span>
      </button>
      <span ref={tip} role="tooltip" id={id} className={styles.tip} data-open={open}>
        {children}
      </span>
    </span>
  );
}
