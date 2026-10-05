/**
 * The building labels' "data feed" entrance: titles type on behind a block
 * cursor, and the numbers in a detail count up to their final value, keeping
 * its decimals and thousands separators. Both take the progress from 0 to 1
 * and end on exactly the final text.
 */
import { useEffect, useState } from 'react';

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const CURSOR = '▍';

export function typeOn(text: string, progress: number): string {
  if (progress >= 1) return text;
  return `${text.slice(0, Math.floor(text.length * Math.max(0, progress)))}${CURSOR}`;
}

/** Characters settle left to right; the rest show changing hex digits, like a feed being decoded. Spaces and symbols stay. */
export function decode(text: string, progress: number): string {
  if (progress >= 1) return text;
  const settled = Math.floor(text.length * Math.max(0, progress));
  const tick = Math.floor(progress * 40);
  return [...text].map((c, i) => (i < settled || !/[A-Za-z0-9]/.test(c) ? c : '0123456789ABCDEF'[(i * 7 + tick * 3) % 16])).join('');
}

export function countUp(text: string, progress: number): string {
  if (progress >= 1) return text;
  const eased = 1 - (1 - Math.max(0, progress)) ** 3;
  return text.replace(NUMBER, (token) => {
    const decimals = token.split('.')[1]?.length ?? 0;
    const value = Number(token.replace(/,/g, '')) * eased;
    const fixed = value.toFixed(decimals);
    if (!token.includes(',')) return fixed;
    const [whole, fraction] = fixed.split('.');
    const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return fraction === undefined ? grouped : `${grouped}.${fraction}`;
  });
}

/**
 * The text as the feed shows it `delay` seconds after mount, over `duration`
 * seconds. When `play` is false it is the final text from the start.
 */
export function useTelemetry(text: string, format: (text: string, progress: number) => string, delay: number, duration: number, play: boolean): string {
  const [progress, setProgress] = useState(play ? 0 : 1);
  useEffect(() => {
    if (!play) return;
    let frame = 0;
    const start = performance.now() + delay * 1000;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / (duration * 1000)));
      setProgress(p);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [delay, duration, play]);
  return format(text, play ? progress : 1);
}

/**
 * Re-measures now and then: every `period` seconds, starting `offset` seconds
 * into the cycle, the text runs through `format` for `duration` seconds and
 * settles on the final text again. Only while `running`; otherwise the final
 * text. It re-renders only when the text shown changes.
 */
export function useRemeasure(text: string, format: (text: string, progress: number) => string, period: number, offset: number, duration: number, running: boolean): string {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last = '';
    const start = performance.now();
    const tick = (now: number) => {
      const t = ((now - start) / 1000 + offset) % period;
      const next = t < duration ? format(text, t / duration) : text;
      if (next !== last) {
        last = next;
        setShown(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, format, period, offset, duration, running]);
  return running ? shown : text;
}

/** Steps through `items` every `seconds` while `running`; holds the current one otherwise. */
export function useCycle<T>(items: readonly T[], seconds: number, running: boolean): T {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!running || items.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % items.length), seconds * 1000);
    return () => clearInterval(timer);
  }, [items.length, seconds, running]);
  return items[index % items.length]!;
}
