import { useId, useMemo, useState, type CSSProperties } from 'react';
import { sectionDrawing, type DrawingOptions, type DrawingShape, type SectionDrawing } from '../../drawing/sectionGeometry';
import { num1, percent, plain } from '../../domain/format';
import type { TrayOutcome } from '../../state/trayResult';
import { useUiStore } from '../../state/uiStore';
import { CableTag } from '../cables/CableList';
import { Panel } from '../common/Panel';
import { STEP_TARGETS } from '../shell/steps';
import styles from './SectionView.module.css';

/** Screen-reader description of a tray's section drawing. */
export function sectionLabel(outcome: TrayOutcome): string {
  const { result } = outcome;
  return `Section of a ${plain(result.drawingSize.widthMm)} by ${plain(result.drawingSize.heightMm)} mm tray with ${result.cableCount} cables in ${result.layers.length} layer${result.layers.length === 1 ? '' : 's'}`;
}

/**
 * The drawing itself, to scale, coloured from the theme. `live` lets newly
 * drawn cables drop into place (the workspace's drawing, not the compare view).
 */
export function SectionSvg({ drawing, label, className, live }: { drawing: SectionDrawing; label: string; className?: string; live?: boolean }) {
  const hatchId = `hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  let cableIndex = 0;
  return (
    <svg
      className={`${styles.svg} ${live ? styles.live : ''} ${className ?? ''}`}
      viewBox={`${drawing.viewBox.x} ${drawing.viewBox.y} ${drawing.viewBox.width} ${drawing.viewBox.height}`}
      role="img"
      aria-label={label}
    >
      <defs>
        <pattern id={hatchId} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" className={styles.hatch} />
        </pattern>
      </defs>
      {drawing.shapes.map((shape, i) => (
        <Shape key={i} shape={shape} hatchId={hatchId} order={shape.kind === 'cable' ? cableIndex++ : 0} />
      ))}
    </svg>
  );
}

export function SectionView({ outcome, trayName }: { outcome: TrayOutcome; trayName?: string }) {
  const [options, setOptions] = useState<DrawingOptions>({ dimensions: true, zones: true });
  const styleByRow = useMemo(() => new Map(outcome.resolved.map((r) => [r.cable.id, { tag: r.tag, colourIndex: r.colourIndex }])), [outcome.resolved]);
  const drawing = useMemo(
    () => sectionDrawing(outcome.result, (rowId) => styleByRow.get(rowId) ?? { tag: 0, colourIndex: 0 }, options),
    [outcome.result, styleByRow, options],
  );
  const toggle = (key: keyof DrawingOptions) => setOptions((o) => ({ ...o, [key]: !o[key] }));
  const counts = new Map<string, number>();
  for (const layer of outcome.result.layers) for (const c of layer.cables) counts.set(c.rowId, (counts.get(c.rowId) ?? 0) + 1);

  const tools = (
    <span className={styles.tools}>
      {(['dimensions', 'zones'] as const).map((key) => (
        <button key={key} type="button" className={styles.tool} aria-pressed={options[key]} onClick={() => toggle(key)}>
          {key === 'dimensions' ? 'Dimensions' : 'Zones'}
        </button>
      ))}
    </span>
  );

  return (
    <Panel id={STEP_TARGETS.result} title="Section view" meta={drawing ? tools : undefined}>
      {!drawing ? (
        <EmptySection unusable={outcome.resolved.length > 0} />
      ) : (
        <>
          <SheetHead outcome={outcome} trayName={trayName} />
          <div className={styles.sheet}>
            <SectionSvg drawing={drawing} label={sectionLabel(outcome)} live />
          </div>
          <div className={styles.legend}>
            {options.zones && (
              <>
                <span>
                  <i className={styles.swatchHatch} />
                  Clearance, each rail {num1(drawing.zonesMm.clearancePerSide)}
                </span>
                {drawing.zonesMm.spare > 0.05 && (
                  <span>
                    <i className={styles.swatchSpare} />
                    Spare {num1(drawing.zonesMm.spare)}
                  </span>
                )}
                {drawing.zonesMm.unused > 0.05 && (
                  <span>
                    <i className={styles.swatchUnused} />
                    Unused {num1(drawing.zonesMm.unused)}
                  </span>
                )}
              </>
            )}
            {outcome.result.requiredHeightMm < drawing.trayHeightMm - 0.05 && (
              <span>
                <i className={styles.swatchRequired} />
                Required height {num1(outcome.result.requiredHeightMm)}
              </span>
            )}
            <span className={styles.units}>All dimensions in mm</span>
          </div>
          <ul className={styles.cables} aria-label="Cables in the drawing">
            {outcome.resolved
              .filter((r) => counts.has(r.cable.id))
              .map((r) => (
                <li key={r.cable.id}>
                  <CableTag tag={r.tag} colourIndex={r.colourIndex} small />
                  {r.title} · Ø{num1(r.odMm ?? 0)} × {counts.get(r.cable.id)}
                </li>
              ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

/** The drawing's title strip: what is drawn, how it is arranged, and the fill against the limit. */
function SheetHead({ outcome, trayName }: { outcome: TrayOutcome; trayName?: string }) {
  const { result } = outcome;
  const s = result.settings;
  const layers = result.layers.length;
  const fill = result.selected?.fill ?? null;
  const over = fill !== null && fill > s.maxFillPct / 100;
  const spacing = s.spacing === 0 ? 'touching' : `${plain(s.spacing)}d spacing`;
  return (
    <div className={styles.sheetHead}>
      <span className={styles.sheetTitle}>Section{trayName ? ` · ${trayName}` : ''}</span>
      <span className={styles.sheetFacts}>
        {layers} layer{layers === 1 ? '' : 's'} · {spacing} · side clearance {plain(s.clearanceFactor)}× OD
      </span>
      <span className={styles.fillBadge} data-over={over ? 'true' : undefined}>
        Fill {fill === null ? '–' : percent(fill)}
        <small> / {plain(s.maxFillPct)}%</small>
      </span>
    </div>
  );
}

/**
 * No drawing yet. Says what is missing (cables), why it matters (the size comes
 * from their diameters) and what to do, with the actions to do it.
 */
function EmptySection({ unusable }: { unusable: boolean }) {
  const requestCablePicker = useUiStore((s) => s.requestCablePicker);
  return (
    <div className={styles.empty}>
      <EmptyTray />
      {unusable ? (
        <>
          <p className={styles.emptyTitle}>No cable can be sized yet</p>
          <p className={styles.emptyText}>
            The rows in the cable list are not in the catalogue or are excluded from it, so there is no diameter to size from. Remove them and add
            cables that can be sized.
          </p>
          <div className={styles.emptyActions}>
            <button type="button" className={styles.emptyPrimary} onClick={() => requestCablePicker()}>
              Add a replacement cable
            </button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.emptyTitle}>Start by adding cables</p>
          <p className={styles.emptyText}>Add your cable sizes and quantities to calculate tray capacity.</p>
          <div className={styles.emptyActions}>
            <button type="button" className={styles.emptyPrimary} onClick={() => requestCablePicker('catalog')}>
              Add your first cable
            </button>
            <button type="button" className={styles.emptySecondary} onClick={() => requestCablePicker('manual')}>
              Enter a cable by its OD
            </button>
          </div>
          <p className={styles.emptyNote}>The cross-section is drawn here, to scale, as soon as the tray holds a cable.</p>
        </>
      )}
    </div>
  );
}

/** An empty tray in section, with dashed cables still to be placed and the unknown width and height. */
function EmptyTray() {
  const placeholders: Array<[number, number]> = [
    [62, 18],
    [94, 14],
    [126, 18],
    [155, 11],
    [180, 14],
  ];
  const arrowId = `arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg className={styles.emptyTray} viewBox="0 0 330 160" aria-hidden="true" focusable="false">
      <defs>
        <marker id={arrowId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0.5 8 4 0 7.5z" className={styles.emptyArrowHead} />
        </marker>
      </defs>
      <path d="M26 22 H40 V110 H280 V22 H294" className={styles.emptyRail} />
      {placeholders.map(([cx, r], i) => (
        <circle key={cx} cx={cx} cy={108 - r} r={r} className={styles.emptyCable} style={{ '--i': i } as CSSProperties} />
      ))}
      <path d="M126 72 L150 48 H176" className={styles.emptyLeader} />
      <text x="180" y="52" className={styles.emptyLabel}>
        {'Ø ?'}
      </text>
      <path d="M40 116 V140 M280 116 V140 M300 22 H318 M300 110 H318" className={styles.emptyExtension} />
      <path d="M44 134 H276" className={styles.emptyDim} markerStart={`url(#${arrowId})`} markerEnd={`url(#${arrowId})`} />
      <path d="M312 26 V106" className={styles.emptyDim} markerStart={`url(#${arrowId})`} markerEnd={`url(#${arrowId})`} />
      <rect x="146" y="125" width="28" height="18" className={styles.emptyLabelBack} />
      <text x="160" y="138" textAnchor="middle" className={styles.emptyLabel}>
        W
      </text>
      <rect x="303" y="57" width="18" height="18" className={styles.emptyLabelBack} />
      <text x="312" y="70" textAnchor="middle" className={styles.emptyLabel}>
        H
      </text>
    </svg>
  );
}

function Shape({ shape, hatchId, order }: { shape: DrawingShape; hatchId: string; order: number }) {
  switch (shape.kind) {
    case 'zone':
      return (
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          className={shape.role === 'spare' ? styles.spare : undefined}
          fill={shape.role === 'clearance' ? `url(#${hatchId})` : undefined}
        />
      );
    case 'line':
      return <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} className={styles[shape.role]} />;
    case 'rail':
      return <path d={shape.d} className={styles.rail} />;
    case 'cable':
      return (
        <g className={styles.drop} style={{ '--i': Math.min(order, 40) } as CSSProperties}>
          <circle cx={shape.cx} cy={shape.cy} r={shape.r} className={styles.cable} style={{ fill: `var(--cab-${shape.colourIndex + 1})` }} />
          {shape.tagSize !== null && (
            <text x={shape.cx} y={shape.cy + shape.tagSize * 0.35} fontSize={shape.tagSize} className={styles.tag}>
              {shape.tag}
            </text>
          )}
        </g>
      );
    case 'text':
      return (
        <text x={shape.x} y={shape.y} fontSize={shape.size} textAnchor={shape.anchor} className={shape.bold ? styles.textBold : styles.text}>
          {shape.text}
        </text>
      );
  }
}
