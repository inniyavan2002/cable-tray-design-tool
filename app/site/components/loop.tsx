import { MotionConfig, useInView, useReducedMotion } from 'framer-motion';
import { Pause, Play } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';

/**
 * Motion on the page. It follows the device by default: when the device asks
 * for reduced motion (on Windows: Settings, Accessibility, Visual effects,
 * Animation effects off), everything is still. The reader can choose
 * otherwise with the Play / Pause animation button, and the choice is
 * remembered in this browser. While motion is on, the looping animations run
 * only while they are on screen, and the button pauses them (WCAG 2.2.2).
 *
 * The choice is written on <html> as data-motion="on" or "off", which the
 * stylesheet and Tailwind's motion-safe variant follow (site.css).
 */
type Choice = 'device' | 'on' | 'off';
const STORAGE_KEY = 'ctd.site.motion';

function storedChoice(): Choice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'on' || value === 'off' ? value : 'device';
  } catch {
    return 'device';
  }
}

const MotionContext = createContext<{ moving: boolean; choose: (moving: boolean) => void }>({ moving: true, choose: () => {} });

/** The id of the button that switched motion, so it can take focus again if its section is drawn afresh. */
let refocusId: string | null = null;

export function MotionProvider({ children }: { children: ReactNode }) {
  const deviceReduces = useReducedMotion();
  const [choice, setChoice] = useState<Choice>(storedChoice);
  const moving = choice === 'device' ? !deviceReduces : choice === 'on';

  useEffect(() => {
    document.documentElement.dataset.motion = moving ? 'on' : 'off';
  }, [moving]);

  const choose = useCallback((next: boolean) => {
    refocusId = document.activeElement instanceof HTMLElement && document.activeElement.id ? document.activeElement.id : null;
    const value = next ? 'on' : 'off';
    setChoice(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Storage is blocked (a private window): the choice lasts for this visit.
    }
  }, []);

  const value = useMemo(() => ({ moving, choose }), [moving, choose]);
  return (
    <MotionContext.Provider value={value}>
      <MotionConfig reducedMotion={moving ? 'never' : 'always'}>{children}</MotionConfig>
    </MotionContext.Provider>
  );
}

/** True when nothing should move: the device asks for reduced motion and the reader has not chosen otherwise, or the reader paused. */
export function useStill(): boolean {
  return !useContext(MotionContext).moving;
}

/** Whether the looping animations inside `ref` should run now: motion is on and they are on screen. */
export function useLoopRunning(ref: RefObject<Element | null>): boolean {
  const { moving } = useContext(MotionContext);
  const inView = useInView(ref);
  return moving && inView;
}

/**
 * Pauses all motion on the page, or plays it, also when the device asks for
 * reduced motion: the reader's choice, remembered in this browser. Give it an
 * `id` when its section is drawn afresh on a switch, so it keeps the focus.
 */
export function MotionButton({ id, className = '' }: { id?: string; className?: string }) {
  const { moving, choose } = useContext(MotionContext);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (id && refocusId === id) {
      refocusId = null;
      button.current?.focus();
    }
  }, [id]);
  const Icon = moving ? Pause : Play;
  return (
    <button
      ref={button}
      id={id}
      type="button"
      onClick={() => choose(!moving)}
      className={`glass inline-flex items-center gap-2 rounded-full border border-line-3/60 px-3.5 py-1.5 font-mono text-[12px] font-semibold text-ink-2 hover:border-accent-ink hover:text-ink motion-safe:transition-colors ${className}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {moving ? 'Pause animation' : 'Play animation'}
    </button>
  );
}
