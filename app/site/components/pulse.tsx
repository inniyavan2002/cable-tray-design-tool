import { useEffect, useRef } from 'react';

export type Tone = 'power' | 'lighting' | 'fire';

/** A route a pulse travels: straight runs between its points, in pixels of the layer it is drawn in. */
export interface PulseRoute {
  tone: Tone;
  points: ReadonlyArray<readonly [number, number]>;
  /** One trip and the pause after it. */
  seconds: number;
  /** Whether it comes in from, and goes out past, the edge of what is shown: it then fades in and out over a longer stretch. */
  edges?: readonly [boolean, boolean];
}

/** Share of each cycle spent travelling; for the rest the pulse is gone, then it sets off again. */
const TRAVEL = 0.92;
/** Pulses coming in from beyond an edge, or leaving past one, fade over this distance. */
const EDGE_FADE = 260;
const round = (v: number) => Math.round(v * 10) / 10;

/**
 * A pulse travelling its route again and again, starting `lead` of the way
 * through its cycle so no two set off together, and turning at each corner.
 * It is an HTML mark moved by transform and opacity alone (.net-pulse in
 * site.css), so the browser moves it without repainting anything. `origin`
 * is where the route's 0, 0 is in the layer.
 */
export function RoutePulse({ route, lead, running, origin = [0, 0] }: { route: PulseRoute; lead: number; running: boolean; origin?: readonly [number, number] }) {
  const mark = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = mark.current;
    if (!element) return;
    const { points } = route;
    const runs = points.slice(1).map((p, i) => ({ from: points[i]!, to: p, length: Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1]) }));
    const total = runs.reduce((sum, r) => sum + r.length, 0);
    if (!total) return;
    const place = ([x, y]: readonly [number, number], angle: number) => `translate(${round(x)}px, ${round(y)}px) rotate(${round(angle)}deg)`;
    const frames: Keyframe[] = [];
    let done = 0;
    for (const r of runs) {
      const angle = (Math.atan2(r.to[1] - r.from[1], r.to[0] - r.from[0]) * 180) / Math.PI;
      frames.push({ offset: (TRAVEL * done) / total, transform: place(r.from, angle) });
      done += r.length;
      frames.push({ offset: (TRAVEL * done) / total, transform: place(r.to, angle) });
    }
    frames.push({ offset: 1, transform: frames[frames.length - 1]!.transform });
    const share = (edge = false) => (edge ? Math.min(0.35, EDGE_FADE / total) : 0.05);
    const timing: KeyframeAnimationOptions = { duration: route.seconds * 1000, iterations: Infinity, delay: -lead * route.seconds * 1000, easing: 'linear' };
    const moves = [
      element.animate(frames, timing),
      element.animate(
        [
          { offset: 0, opacity: 0 },
          { offset: TRAVEL * share(route.edges?.[0]), opacity: 1 },
          { offset: TRAVEL * (1 - share(route.edges?.[1])), opacity: 1 },
          { offset: TRAVEL, opacity: 0 },
          { offset: 1, opacity: 0 },
        ],
        timing,
      ),
    ];
    if (!running) for (const m of moves) m.pause();
    return () => {
      for (const m of moves) m.cancel();
    };
  }, [route, lead, running]);
  return <span ref={mark} className="net-pulse" data-tone={route.tone} style={{ left: origin[0], top: origin[1] }} />;
}
