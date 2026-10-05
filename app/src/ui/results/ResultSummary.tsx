import type { CSSProperties } from 'react';
import { int, num1, percent, plain, size } from '../../domain/format';
import type { Tray } from '../../state/projectModel';
import type { TrayOutcome } from '../../state/trayResult';
import { Chip } from '../common/controls';
import styles from './ResultSummary.module.css';
import { STATUS_TEXT, traySizeText } from './status';

const TRAY_TYPE: Record<Tray['settings']['trayType'], string> = { perforated: 'Perforated', ladder: 'Ladder' };

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
  if (result.status === 'empty') return null;
  const limit = result.settings.maxFillPct;
  const fill = result.selected?.fill ?? null;
  const firstFit = result.tried[0];
  return (
    <section className={styles.fill} aria-label="Fill and weight">
      {fill !== null && (
        <>
          <div className={styles.fillRow}>
            <span>
              Fill <b>{percent(fill)}</b>
            </span>
            <span>limit {plain(limit)}%</span>
          </div>
          <div className={styles.bar} aria-hidden="true">
            <i className={styles.barFill} data-over={fill > limit / 100 ? 'true' : undefined} style={{ '--fill': Math.min(1, fill) } as CSSProperties} />
            <u className={styles.barLimit} style={{ left: `${Math.min(100, limit)}%` }} />
          </div>
        </>
      )}
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
      <p className={styles.note}>
        Cable weight {num1(result.weightKgPerM)} kg/m
        {rowsWithoutWeight > 0 && ` (weight unknown for ${rowsWithoutWeight} cable row${rowsWithoutWeight === 1 ? '' : 's'})`} · cable area {int(result.cableAreaMm2)} mm²
      </p>
    </section>
  );
}
