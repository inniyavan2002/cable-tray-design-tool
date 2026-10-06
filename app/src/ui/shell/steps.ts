import { percent, plain } from '../../domain/format';
import type { Tray } from '../../state/projectModel';
import type { TrayOutcome } from '../../state/trayResult';
import { traySizeText } from '../results/status';

/** Ids of the panels each design step scrolls to. */
export const STEP_TARGETS = {
  tray: 'step-tray',
  cables: 'step-cables',
  arrangement: 'step-arrangement',
  check: 'step-check',
  result: 'step-result',
} as const;

export type StepKey = keyof typeof STEP_TARGETS;
/** done: complete · current: where the work is now · attention: needs a change · todo: not reached. */
export type StepState = 'done' | 'current' | 'attention' | 'todo';

export interface DesignStep {
  key: StepKey;
  label: string;
  state: StepState;
  /** The step's value in a few words. */
  detail: string;
}

export interface DesignProgress {
  steps: DesignStep[];
  /** What to do next, in one sentence. */
  next: string;
}

const SPACING_TEXT: Record<number, string> = { 0: 'touching', 0.5: '0.5d', 1: '1d', 2: '2d' };

/**
 * Where a tray's design stands, read from the tray and its sizing result.
 * Nothing here sizes anything: it only describes the result the app already has.
 */
export function designProgress(tray: Tray, outcome: TrayOutcome): DesignProgress {
  const { result } = outcome;
  const total = tray.cables.reduce((sum, c) => sum + c.quantity, 0);
  const s = tray.settings;
  const layers = `${s.layers} layer${s.layers === 1 ? '' : 's'} · ${SPACING_TEXT[s.spacing] ?? `${plain(s.spacing)}d`}`;
  const tray1: DesignStep = { key: 'tray', label: 'Tray', state: 'done', detail: tray.service ? `${tray.name} · ${tray.service}` : tray.name };

  if (result.status === 'empty') {
    // Rows that cannot be sized (not in the catalog, excluded) leave the result empty too.
    const unusable = tray.cables.length > 0;
    return {
      steps: [
        tray1,
        { key: 'cables', label: 'Cables', state: unusable ? 'attention' : 'current', detail: unusable ? 'Rows need fixing' : 'None yet' },
        { key: 'arrangement', label: 'Arrangement', state: 'todo', detail: layers },
        { key: 'check', label: 'Check', state: 'todo', detail: `Fill ≤ ${plain(s.maxFillPct)}%` },
        { key: 'result', label: 'Result', state: 'todo', detail: 'No size yet' },
      ],
      next: unusable
        ? 'None of these cables can be sized. Fix or replace the rows marked in the cable list.'
        : 'Add the cables that run in this tray. The size follows from their diameters and quantities.',
    };
  }

  const fill = result.selected ? percent(result.selected.fill) : '–';
  const passed = result.status === 'pass' || result.status === 'pass-upsized';
  const cables: DesignStep = { key: 'cables', label: 'Cables', state: 'done', detail: `${total} cable${total === 1 ? '' : 's'}` };
  const arrangement: DesignStep = { key: 'arrangement', label: 'Arrangement', state: 'done', detail: layers };

  if (passed) {
    return {
      steps: [
        tray1,
        cables,
        arrangement,
        { key: 'check', label: 'Check', state: 'done', detail: `Fill ${fill} ≤ ${plain(s.maxFillPct)}%` },
        { key: 'result', label: 'Result', state: 'current', detail: traySizeText(result) },
      ],
      next: 'The tray passes. Check the drawing, then export the report.',
    };
  }

  const over = result.status === 'fill-not-met';
  return {
    steps: [
      tray1,
      cables,
      { ...arrangement, state: 'current' },
      { key: 'check', label: 'Check', state: 'attention', detail: over ? `Fill ${fill} > ${plain(s.maxFillPct)}%` : 'Beyond standard sizes' },
      { key: 'result', label: 'Result', state: 'todo', detail: over ? traySizeText(result) : 'No standard size' },
    ],
    next: over
      ? 'No standard size meets the fill limit. Try more layers, add larger standard sizes, or split the cables over two trays.'
      : 'The cables need more room than the largest standard size. Try more layers, add larger standard sizes, or split the tray.',
  };
}
