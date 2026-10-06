import type { CSSProperties } from 'react';
import { fillMethod } from '../../domain/fillMethods';
import { num1, percent, plain, size } from '../../domain/format';
import { cleanSizeList, SIZE_EPSILON_MM } from '../../domain/selection';
import type { SizingResult, TrayCandidate, TrayStandards } from '../../domain/types';
import type { Tray } from '../../state/projectModel';
import type { TrayOutcome } from '../../state/trayResult';
import { Chip } from '../common/controls';
import { Panel } from '../common/Panel';
import { STEP_TARGETS } from '../shell/steps';
import styles from './Recommendation.module.css';
import { STATUS_TEXT, traySizeText } from './status';

/**
 * Larger standard sizes that would also fit, after the selected one, for
 * comparison. Display only: it lists sizes the same way the selection does
 * (every standard width and height at least the required size, by area,
 * the narrower first) and checks each with the tray's own fill method. The
 * selection itself is the engine's.
 */
export function largerSizes(result: SizingResult, standards: TrayStandards, count: number): TrayCandidate[] {
  const selected = result.selected;
  if (!selected) return [];
  const method = fillMethod(result.settings.fillMethod);
  const widths = cleanSizeList(standards.widthsMm).filter((w) => w >= result.requiredWidthMm - SIZE_EPSILON_MM);
  const heights = cleanSizeList(standards.heightsMm).filter((h) => h >= result.requiredHeightMm - SIZE_EPSILON_MM);
  const all = widths.flatMap((widthMm) =>
    heights.map((heightMm) => {
      const { fill, passes } = method.check(result.cableAreaMm2, widthMm, heightMm, result.settings.maxFillPct);
      return { widthMm, heightMm, areaMm2: widthMm * heightMm, fill, passesFill: passes };
    }),
  );
  all.sort((a, b) => a.areaMm2 - b.areaMm2 || a.widthMm - b.widthMm);
  const at = all.findIndex((c) => c.widthMm === selected.widthMm && c.heightMm === selected.heightMm);
  if (at < 0) return [];
  // Sizes of the same area come first (the engine checked those too), then `count` larger ones.
  const after = all.slice(at + 1);
  const same = after.filter((c) => c.areaMm2 === selected.areaMm2);
  return [...same, ...after.filter((c) => c.areaMm2 > selected.areaMm2).slice(0, count)];
}

const sizeKey = (c: TrayCandidate) => `${c.widthMm}x${c.heightMm}`;

const VERDICT: Record<Exclude<SizingResult['status'], 'empty'>, { mark: string; text: string }> = {
  pass: { mark: '✓', text: 'PASS — Tray size is sufficient' },
  'pass-upsized': { mark: '✓', text: 'PASS — Upsized to meet the fill limit' },
  'fill-not-met': { mark: '!', text: 'Fill limit not met' },
  'exceeds-standards': { mark: '!', text: 'No standard size is large enough' },
};

/** The chosen standard tray, why, and the sizes around it. */
export function RecommendedTray({ outcome, standards }: { outcome: TrayOutcome; standards: TrayStandards }) {
  const { result } = outcome;
  const limit = plain(result.settings.maxFillPct);

  if (result.status === 'empty') {
    return (
      <Panel id={STEP_TARGETS.check} title="Recommended tray">
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No recommendation yet</p>
          <p>
            The recommendation is the smallest standard tray that holds the cables within the {limit}% fill limit, so it needs at least one cable with a
            known diameter. Add cables and it appears here.
          </p>
        </div>
      </Panel>
    );
  }

  const verdict = VERDICT[result.status];
  const tone = result.status === 'pass' || result.status === 'pass-upsized' ? 'pass' : 'warn';
  const selected = result.selected;
  // The sizes the engine checked, then larger ones that also fit, once each, by area (the narrower first).
  const compared = [...result.tried, ...largerSizes(result, standards, 2)]
    .filter((c, i, list) => list.findIndex((o) => sizeKey(o) === sizeKey(c)) === i)
    .sort((a, b) => a.areaMm2 - b.areaMm2 || a.widthMm - b.widthMm);

  return (
    <Panel id={STEP_TARGETS.check} title="Recommended tray" meta={<Chip tone={tone}>{STATUS_TEXT[result.status].short}</Chip>}>
      <div className={styles.pick}>
        <TrayGlyph widthMm={result.drawingSize.widthMm} heightMm={result.drawingSize.heightMm} />
        <div>
          <p className={styles.pickSize}>{selected ? traySizeText(result) : `${num1(result.requiredWidthMm)} × ${num1(result.requiredHeightMm)} mm`}</p>
          <p className={styles.pickWhy}>
            {result.status === 'pass' && `The smallest standard size that holds the cables with fill within ${limit}%.`}
            {result.status === 'pass-upsized' && `The smallest size that fits was over the ${limit}% fill limit, so the next standard size by area that meets it is recommended.`}
            {result.status === 'fill-not-met' && `The largest standard size that fits; its fill is still over ${limit}%.`}
            {result.status === 'exceeds-standards' && 'The required size is larger than every standard size, so no tray can be recommended.'}
          </p>
        </div>
      </div>

      <p className={styles.verdict} data-tone={tone}>
        <span aria-hidden="true" className={styles.mark}>
          {verdict.mark}
        </span>
        {verdict.text}
      </p>
      {tone === 'warn' && (
        <p className={styles.todo}>
          To fix it: try more layers or less spacing, add larger sizes under Standards, or split the cables over two trays.
        </p>
      )}

      {compared.length > 0 && (
        <table className={styles.sizes}>
          <caption className={styles.caption}>Standard sizes compared · fill limit {limit}%</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Size (mm)</th>
              <th scope="col">Fill</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {compared.map((c) => (
              <SizeRow key={sizeKey(c)} candidate={c} selected={selected} limitPct={result.settings.maxFillPct} />
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function SizeRow({ candidate, selected, limitPct }: { candidate: TrayCandidate; selected: TrayCandidate | null; limitPct: number }) {
  const isSelected = selected !== null && sizeKey(candidate) === sizeKey(selected);
  const note = isSelected
    ? candidate.passesFill
      ? 'Recommended'
      : 'Largest that fits'
    : !candidate.passesFill
      ? 'Over the limit'
      : selected && candidate.areaMm2 === selected.areaMm2
        ? 'Same area, wider'
        : 'Also fits, more room';
  return (
    <tr data-state={isSelected ? 'selected' : 'other'} data-pass={candidate.passesFill ? 'true' : 'false'}>
      <th scope="row">{size(candidate.widthMm, candidate.heightMm)}</th>
      <td>
        <span className={styles.meter} aria-hidden="true">
          <i style={{ '--fill': Math.min(1, candidate.fill) } as CSSProperties} />
          <u style={{ left: `${Math.min(100, limitPct)}%` }} />
        </span>
        {percent(candidate.fill)}
      </td>
      <td>{note}</td>
    </tr>
  );
}

/** The tray's section in proportion, as a small mark. */
function TrayGlyph({ widthMm, heightMm }: { widthMm: number; heightMm: number }) {
  const w = 46;
  const h = Math.max(8, Math.min(30, (heightMm / widthMm) * w));
  return (
    <svg className={styles.glyph} viewBox="0 0 54 38" aria-hidden="true" focusable="false">
      <path d={`M${27 - w / 2} ${34 - h} V34 H${27 + w / 2} V${34 - h}`} />
    </svg>
  );
}

/** One table of the design as it stands, like a drawing's title block. */
export function DesignSummary({ tray, outcome }: { tray: Tray; outcome: TrayOutcome }) {
  const { result } = outcome;
  const status = STATUS_TEXT[result.status];
  const total = tray.cables.reduce((sum, c) => sum + c.quantity, 0);
  const empty = result.status === 'empty';
  const fill = result.selected ? percent(result.selected.fill) : '–';
  const rows: Array<[string, string]> = [
    ['Tray', tray.service ? `${tray.name} · ${tray.service}` : tray.name],
    ['Size', empty ? '–' : traySizeText(result)],
    ['Cables', `${total} in ${tray.cables.length} row${tray.cables.length === 1 ? '' : 's'}`],
    ['Layers', empty ? `– (up to ${tray.settings.layers})` : `${result.layers.length} of ${tray.settings.layers}`],
    ['Current fill', fill],
    ['Maximum fill', `${plain(tray.settings.maxFillPct)}%`],
  ];
  return (
    <Panel title="Design summary" meta={<span className={styles.live}>live</span>}>
      <dl className={styles.block}>
        {rows.map(([term, value]) => (
          <div key={term} className={styles.cell}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div className={`${styles.cell} ${styles.statusCell}`}>
          <dt>Status</dt>
          <dd>{empty ? <span className={styles.waiting}>Waiting for cables</span> : <Chip tone={status.tone}>{status.long}</Chip>}</dd>
        </div>
      </dl>
    </Panel>
  );
}
