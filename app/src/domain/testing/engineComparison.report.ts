/**
 * Writes reports/engine-comparison.md: the new sizing engine against the
 * legacy engine from tool.html, with the effect of each approved change shown
 * separately. Run with `npm run compare`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { percent, size } from '../format';
import { DEFAULT_STANDARDS } from '../normalize';
import { SIZE_EPSILON_MM } from '../selection';
import { sizeTray } from '../sizing';
import type { CableRow, SizingResult, TraySettings } from '../types';
import {
  legacyArrangementWithNewRules,
  randomTrays,
  toLegacyStandards,
  toLegacyTray,
  totalCableArea,
  type CorpusTray,
} from './corpus';
import { createLegacyComputeTray, type LegacyResult } from './legacyEngine';

interface Tray {
  widthMm: number;
  heightMm: number;
}

interface Row {
  tray: CorpusTray;
  /** A: legacy engine as it is today. */
  legacy: Tray | null;
  legacyStatus: LegacyResult['status'];
  /** B: legacy layers, clearance on both sides, old selection (first fit, no upsizing). */
  withClearance: Tray | null;
  /** C: legacy layers with all approved rules. */
  withRules: Tray | null;
  /** D: new engine. */
  current: SizingResult;
  legacyMs: number;
  currentMs: number;
}

const standards = DEFAULT_STANDARDS;
const legacyComputeTray = createLegacyComputeTray(toLegacyStandards(standards));

function firstFit(widthMm: number, heightMm: number): Tray | null {
  const w = standards.widthsMm.find((x) => x >= widthMm - SIZE_EPSILON_MM);
  const h = standards.heightsMm.find((x) => x >= heightMm - SIZE_EPSILON_MM);
  return w !== undefined && h !== undefined ? { widthMm: w, heightMm: h } : null;
}

const area = (t: Tray | null) => (t ? t.widthMm * t.heightMm : Infinity);
const same = (a: Tray | null, b: Tray | null) => (a && b ? a.widthMm === b.widthMm && a.heightMm === b.heightMm : a === b);
const label = (t: Tray | null) => (t ? size(t.widthMm, t.heightMm) : 'exceeds');
const currentTray = (r: SizingResult): Tray | null =>
  r.status === 'pass' || r.status === 'pass-upsized' ? { widthMm: r.selected!.widthMm, heightMm: r.selected!.heightMm } : null;

function evaluate(tray: CorpusTray): Row {
  let start = performance.now();
  const legacy = legacyComputeTray(toLegacyTray(tray));
  const legacyMs = performance.now() - start;

  start = performance.now();
  const current = sizeTray(tray.rows, tray.settings, standards);
  const currentMs = performance.now() - start;

  const rules = legacyArrangementWithNewRules(legacy, tray, standards);
  const withRules =
    rules.selection.outcome === 'pass' || rules.selection.outcome === 'pass-upsized'
      ? { widthMm: rules.selection.selected!.widthMm, heightMm: rules.selection.selected!.heightMm }
      : null;
  return {
    tray,
    legacy: legacy.selWidth && legacy.selHeight ? { widthMm: legacy.selWidth, heightMm: legacy.selHeight } : null,
    legacyStatus: legacy.status,
    withClearance: firstFit(rules.requiredWidthMm, rules.requiredHeightMm),
    withRules,
    current,
    legacyMs,
    currentMs,
  };
}

function table(headers: string[], rows: Array<Array<string | number>>): string {
  const line = (cells: Array<string | number>) => `| ${cells.join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

const row = (id: string, odMm: number, quantity: number): CableRow => ({ id, odMm, quantity, weightKgPerKm: 0 });
const base: TraySettings = {
  layers: 1,
  spacing: 1,
  layerGap: true,
  clearanceFactor: 0.5,
  topClearancePct: 0,
  sparePct: 20,
  maxFillPct: 40,
  trayType: 'perforated',
  fillMethod: 'standard-area',
};
const REFERENCE: CorpusTray[] = [
  { name: 'T1 feeders', rows: [row('240', 60.3, 2), row('95', 41.2, 3), row('35', 28.9, 4)], settings: base },
  { name: 'T2 small power', rows: [row('16', 23.5, 12), row('6', 20, 8)], settings: { ...base, layers: 2, spacing: 0, layerGap: false } },
  {
    name: 'T3 mixed',
    rows: [row('240', 60.3, 2), row('70', 37.5, 4), row('35', 28.9, 6)],
    settings: { ...base, layers: 2, spacing: 0.5, layerGap: true },
  },
];

function describeLayers(r: SizingResult): string {
  return r.layers
    .map((layer, i) => {
      const counts = new Map<number, number>();
      for (const c of layer.cables) counts.set(c.odMm, (counts.get(c.odMm) ?? 0) + 1);
      return `L${i + 1}: ${[...counts].map(([od, n]) => `${n}×${od}`).join(' ')}`;
    })
    .join(' / ');
}

function statusText(r: SizingResult): string {
  return { empty: 'no cables', pass: 'PASS', 'pass-upsized': 'PASS · upsized', 'fill-not-met': 'fill not met', 'exceeds-standards': 'exceeds' }[
    r.status
  ];
}

it('writes the engine comparison report', () => {
  const corpus = [
    ...randomTrays(400, 501, { layers: 1, maxRows: 8, maxQuantity: 8 }),
    ...randomTrays(350, 502, { layers: 2, maxRows: 4, maxQuantity: 3 }),
    ...randomTrays(250, 503, { layers: 3, maxRows: 3, maxQuantity: 3 }),
  ];
  const rows = corpus.map(evaluate);
  const multi = rows.filter((r) => r.tray.settings.layers > 1);

  const count = (predicate: (r: Row) => boolean, list = rows) => list.filter(predicate).length;
  const clearanceChanged = count((r) => !same(r.legacy, r.withClearance));
  const legacyFailed = count((r) => r.legacyStatus === 'fail');
  const fillUpsized = count((r) => !same(r.withClearance, r.withRules));
  const arrangementSmaller = count((r) => area(currentTray(r.current)) < area(r.withRules), multi);
  const arrangementLarger = count((r) => area(currentTray(r.current)) > area(r.withRules), multi);
  const overallSame = count((r) => same(r.legacy, currentTray(r.current)));
  const overallSmaller = count((r) => area(currentTray(r.current)) < area(r.legacy));
  const overallLarger = count((r) => area(currentTray(r.current)) > area(r.legacy));
  const overallReshaped = count(
    (r) => !same(r.legacy, currentTray(r.current)) && area(currentTray(r.current)) === area(r.legacy),
  );
  const fillNotMet = count((r) => r.current.status === 'fill-not-met');
  const width = (t: Tray | null) => t?.widthMm ?? Infinity;
  const smallerButWider = multi.filter(
    (r) => area(currentTray(r.current)) < area(r.withRules) && width(currentTray(r.current)) > width(r.withRules),
  );
  const smallerAndNotWider = multi.filter(
    (r) => area(currentTray(r.current)) < area(r.withRules) && width(currentTray(r.current)) <= width(r.withRules),
  );
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const max = (xs: number[]) => Math.max(...xs);

  const reference = REFERENCE.map((tray) => {
    const r = evaluate(tray);
    return [
      tray.name,
      `${label(r.legacy)} (${r.legacyStatus.toUpperCase()})`,
      label(r.withClearance),
      label(r.withRules),
      `${label(currentTray(r.current))} (${statusText(r.current)}, fill ${percent(r.current.selected?.fill ?? 0)})`,
    ];
  });

  const improvedExamples = multi
    .filter((r) => area(currentTray(r.current)) < area(r.withRules))
    .slice(0, 6)
    .map((r) => [
      r.tray.name,
      `${r.tray.settings.layers} layers, ${r.tray.settings.spacing}d, gap ${r.tray.settings.layerGap ? 'on' : 'off'}`,
      r.tray.rows.map((c) => `${c.quantity}×${c.odMm}`).join(' '),
      label(r.withRules),
      label(currentTray(r.current)),
      describeLayers(r.current),
    ]);

  const speedRows = [1, 2, 3].map((layers) => {
    const list = rows.filter((r) => r.tray.settings.layers === layers);
    return [
      `${layers} layer${layers > 1 ? 's' : ''}`,
      list.length,
      `${avg(list.map((r) => r.legacyMs)).toFixed(2)} / ${max(list.map((r) => r.legacyMs)).toFixed(1)}`,
      `${avg(list.map((r) => r.currentMs)).toFixed(2)} / ${max(list.map((r) => r.currentMs)).toFixed(1)}`,
    ];
  });

  const report = `# Engine comparison: new sizing engine vs tool.html

Generated by \`npm run compare\` from ${rows.length} seeded random trays built from real catalog cable ODs
(${count((r) => r.tray.settings.layers === 1)} one-layer, ${count((r) => r.tray.settings.layers === 2)} two-layer, ${count((r) => r.tray.settings.layers === 3)} three-layer).
Settings vary per tray: spacing 0/0.5/1/2d, layer gap on/off, clearance factor 0.3/0.5/1, top clearance 0/10/20%,
spare 0/20/25%, max fill 40/50%. Standard sizes are the defaults (widths 50–1000 mm, heights 25–200 mm).
"Legacy" is a verbatim copy of \`computeTray()\` from \`tool.html\` at commit b56bb36.

Multi-layer trays are kept small (up to 12 cables) because the legacy engine takes seconds on larger ones.

## Summary

${table(
  ['Comparison', 'Trays', 'Meaning'],
  [
    ['Same tray as today', overallSame, 'Legacy and new engine select the same standard size'],
    ['Larger cross-section than today', overallLarger, 'Caused by clearance on both sides or by fill upsizing (see below)'],
    ['Smaller cross-section than today', overallSmaller, 'Caused by the new layer arrangement'],
    ['Same cross-section, different shape', overallReshaped, 'For example 300 × 150 instead of 450 × 100'],
    ['Legacy showed FAIL (fill over limit)', legacyFailed, 'The new engine never keeps an undersized tray; it moves up a size'],
    ['No standard size meets the fill limit (new)', fillNotMet, 'Shown as "fill limit not met" with the largest fitting size'],
  ],
)}

## Effect of each change

Each step changes one thing, so every difference has one cause.

${table(
  ['Step', 'Change', 'Trays whose size changed'],
  [
    ['A → B', 'Side clearance on both rails', `${clearanceChanged} of ${rows.length} (always wider or equal)`],
    ['B → C', 'Next standard size until fill passes', `${fillUpsized} of ${rows.length} (always larger or equal)`],
    [
      'C → D',
      'New layer arrangement (multi-layer trays only)',
      `${arrangementSmaller} of ${multi.length} smaller, ${arrangementLarger} larger`,
    ],
  ],
)}

A = legacy engine as today. B = legacy layer arrangement with clearance on both sides and the old selection
(first fit, no upsizing). C = legacy arrangement with all approved rules. D = new engine.

## Reference trays (frontend plan, section 3.5)

${table(['Tray', 'A: legacy today', 'B: + clearance', 'C: + fill upsizing', 'D: new engine'], reference)}

T3 improves because the new arrangement keeps both 240 mm² cables on the bottom layer, so the upper layer
and its gap are only 37.5 mm high.

## Examples where the new layer arrangement gives a smaller tray

${improvedExamples.length ? table(['Tray', 'Settings', 'Cables (qty×OD mm)', 'C: legacy layers', 'D: new engine', 'New layers'], improvedExamples) : 'None in this corpus.'}

## Smaller cross-section, but wider

The new engine aims for the smallest cross-section (decision D3). Of the ${arrangementSmaller} multi-layer
trays where it found a smaller tray, ${smallerAndNotWider.length} are also the same width or narrower, and
${smallerButWider.length} are wider but shallower (for example 900 × 75 instead of 600 × 150). If width
matters more than cross-section on your projects, the arrangement goal can put width first instead.

${
  smallerButWider.length
    ? table(
        ['Tray', 'C: legacy layers', 'D: new engine'],
        smallerButWider.slice(0, 8).map((r) => [r.tray.name, label(r.withRules), label(currentTray(r.current))]),
      )
    : ''
}

## Speed

${table(['Trays', 'Count', 'Legacy avg / max (ms)', 'New avg / max (ms)'], speedRows)}

Larger trays are covered by the speed tests: 100 cables in 3 layers take under 20 ms, and the 96-cable tray
that took the legacy engine 79 s takes under 20 ms.
`;

  mkdirSync(new URL('../../../reports/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../../../reports/engine-comparison.md', import.meta.url), report);
  console.log(report);
  // Sanity: the cable area used here matches the engine's.
  if (Math.abs(totalCableArea(REFERENCE[0]!.rows) - sizeTray(REFERENCE[0]!.rows, base, standards).cableAreaMm2) > 1e-6) {
    throw new Error('Cable area mismatch');
  }
});
