/**
 * Small motion helpers for the app. Motion here only marks a change of state
 * (a row arrived, a tray moved) and is skipped when the device asks for
 * reduced motion or the browser cannot animate.
 */
import { useLayoutEffect, useRef, type RefObject } from 'react';

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function canAnimate(element: Element): boolean {
  return typeof element.animate === 'function' && !prefersReducedMotion();
}

/** Eases a newly added element into place. */
export function playArrival(element: Element): void {
  if (!canAnimate(element)) return;
  element.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: EASE });
}

/**
 * When the items marked `data-flip="<id>"` inside `container` are reordered,
 * slides each item from its old place to its new one (the FLIP technique), so
 * the reader sees where it went. Adding or removing items is not a reorder.
 */
export function useReorderMotion(container: RefObject<HTMLElement | null>, order: readonly string[]): void {
  const places = useRef(new Map<string, { left: number; top: number }>());
  const lastOrder = useRef<readonly string[]>(order);

  // Offsets rather than screen positions, so scrolling does not count as a move.
  const measure = () => {
    const items = [...(container.current?.querySelectorAll<HTMLElement>('[data-flip]') ?? [])];
    places.current = new Map(items.map((item) => [item.dataset.flip!, { left: item.offsetLeft, top: item.offsetTop }]));
    return items;
  };

  // Keep the recorded places current when the list changes size (fonts loading, a narrower window).
  useLayoutEffect(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(element);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measure reads only refs
  }, [container]);

  useLayoutEffect(() => {
    const before = places.current;
    const previous = lastOrder.current;
    lastOrder.current = order;
    const items = measure();
    const sameItems = previous.length === order.length && order.every((id) => previous.includes(id));
    if (!sameItems || order.every((id, i) => id === previous[i])) return;
    for (const item of items) {
      const from = before.get(item.dataset.flip!);
      const to = places.current.get(item.dataset.flip!)!;
      if (!from || !canAnimate(item) || (from.left === to.left && from.top === to.top)) continue;
      item.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: 'none' }], { duration: 260, easing: EASE });
    }
  });
}

/** Plays `playArrival` on items that were added to the list since the last render of the same list. */
export function useArrivalMotion(container: RefObject<HTMLElement | null>, listKey: string, ids: readonly string[]): void {
  const previous = useRef<{ listKey: string; ids: Set<string> } | null>(null);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { listKey, ids: new Set(ids) };
    // A different list (another tray) is not an arrival.
    if (!before || before.listKey !== listKey) return;
    const added = ids.filter((id) => !before.ids.has(id));
    if (!added.length) return;
    for (const element of container.current?.querySelectorAll('[data-arrive]') ?? []) {
      if (added.includes(element.getAttribute('data-arrive')!)) playArrival(element);
    }
  });
}
