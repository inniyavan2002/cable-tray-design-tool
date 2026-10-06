import type { CSSProperties } from 'react';
import { int, num1, percent, plain, size } from '../../domain/format';
import type { Tray } from '../../state/projectModel';
import type { TrayOutcome } from '../../state/trayResult';
import { Chip } from '../common/controls';
import styles from './ResultSummary.module.css';
import { STATUS_TEXT, traySizeText } from './status';

const TRAY_TYPE: Record<Tray['settings']['trayType'], string> = { perforated: 'Perforated', ladder: 'Ladder' };

/** The live result: the tray size, its status and the fill against the limit, updated on every edit. */
export function LiveCalculation({ tray, outcome }: { tray: Tray; outcome: TrayOutcome }) {
  return (
    <div className={styles.console}>
      <div className={styles.consoleHead}>
        {/* Keyed on the size, so the signal blinks once when the result changes. */}
        <span key={traySizeText(outcome.result)} className={styles.live}>
          <i aria-hidden="true" />
          Live calculation
        </span>
        <span className={styles.consoleTray}>
          {tray.name}
          {tray.service ? ` · ${tray.service}` : ''}
        </span>
      </div>
      <ResultBanner tray={tray} outcome={outcome} />
      <FillMeter outcome={outcome} />
    </div>
  );
}

export function ResultBanner({ tray, outcome }: { tray: Tray; outcome: TrayOutcome }) {
  const { result } = outcome;
  const status = STATUS_TEXT[result.status];
  const layers = result.layers.length || tray.settings.layers;
  const details =
    result.status === 'empty'
      ? 'Add cables to size this tray'
      : `Required ${num1(result.requiredWidthMm)} × ${num1(result.requiredHeightMm)} mm · ${TRAY_TYPE[tray.settings.trayType]} · ${layers} layer${layers === 1 ? '' : 's'}`;
  return (
    <div className={styles.banner} role="status" aria-live="polite" aria-label={`${tray.name}: ${traySizeText(result)}, ${status.long}`}>
      <div>
        {/* Keyed on the size, so a new size eases in and the reader sees it change. */}
        <div key={traySizeText(result)} className={styles.size}>
          {result.status === 'empty' ? '– × – mm' : traySizeText(result)}
        </div>
        <div className={styles.sub}>{details}</div>
      </div>
      <Chip tone={status.tone}>{status.long}</Chip>
    </div>
  );
}

export function FillMeter({ outcome }: { outcome: TrayOutcome }) {
  const { result, rowsWithoutWeight } = outcome;
  const limit = result.settings.maxFillPct;
  const fill = result.selected?.fill ?? null;
  const firstFit = result.tried[0];
  const over = fill !== null && fill > limit / 100;
  return (
    <section className={styles.fill} aria-label="Fill and weight">
      <div className={styles.fillRow}>
        <span>
          Current fill <b data-over={over ? 'true' : undefined}>{fill === null ? '–' : percent(fill)}</b>
        </span>
        <span>
          Max fill <b>{plain(limit)}%</b>
        </span>
      </div>
      <div className={styles.bar} aria-hidden="true">
        {[25, 50, 75].map((tick) => (
          <s key={tick} className={styles.tick} style={{ left: `${tick}%` }} />
        ))}
        <i className={styles.barFill} data-over={over ? 'true' : undefined} style={{ '--fill': fill === null ? 0 : Math.min(1, fill) } as CSSProperties} />
        <u className={styles.barLimit} style={{ left: `${Math.min(100, limit)}%` }} />
      </div>
      {result.status === 'empty' && <p className={styles.note}>Fill is the cables' cross-section area against the tray's. It shows once the tray holds a cable.</p>}
      {result.status === 'pass-upsized' && firstFit && (
        <p className={styles.note}>
          {size(firstFit.widthMm, firstFit.heightMm)} gave {percent(firstFit.fill)}, so the next standard size up by area was used.
        </p>
      )}
      {result.status === 'fill-not-met' && (
        <p className={styles.warn}>No standard size meets the {plain(limit)}% fill limit. This is the largest size that fits; add larger standard sizes or split the tray.</p>
      )}
      {result.status === 'exceeds-standards' && (
        <p className={styles.warn}>
          The required {num1(result.requiredWidthMm)} × {num1(result.requiredHeightMm)} mm is larger than every standard size. Add larger standard sizes or split the tray. The drawing shows the required size.
        </p>
      )}
      {result.status !== 'empty' && (
        <p className={styles.note}>
          Cable weight {num1(result.weightKgPerM)} kg/m
          {rowsWithoutWeight > 0 && ` (weight unknown for ${rowsWithoutWeight} cable row${rowsWithoutWeight === 1 ? '' : 's'})`} · cable area {int(result.cableAreaMm2)} mm²
        </p>
      )}
    </section>
  );
}
