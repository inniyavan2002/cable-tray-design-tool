import { useId, useMemo, useState } from 'react';
import { sectionDrawing, type DrawingOptions, type DrawingShape, type SectionDrawing } from '../../drawing/sectionGeometry';
import { num1, plain } from '../../domain/format';
import type { TrayOutcome } from '../../state/trayResult';
import { CableTag } from '../cables/CableList';
import { Panel } from '../common/Panel';
import styles from './SectionView.module.css';

/** Screen-reader description of a tray's section drawing. */
export function sectionLabel(outcome: TrayOutcome): string {
  const { result } = outcome;
  return `Section of a ${plain(result.drawingSize.widthMm)} by ${plain(result.drawingSize.heightMm)} mm tray with ${result.cableCount} cables in ${result.layers.length} layer${result.layers.length === 1 ? '' : 's'}`;
}

/** The drawing itself, to scale, coloured from the theme. */
export function SectionSvg({ drawing, label, className }: { drawing: SectionDrawing; label: string; className?: string }) {
  const hatchId = `hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      className={`${styles.svg} ${className ?? ''}`}
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
        <Shape key={i} shape={shape} hatchId={hatchId} />
      ))}
    </svg>
  );
}

export function SectionView({ outcome }: { outcome: TrayOutcome }) {
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
    <Panel title="Section view" meta={drawing ? tools : undefined}>
      {!drawing ? (
        <div className={styles.empty}>
          <svg className={styles.emptyTray} viewBox="0 0 120 44" aria-hidden="true" focusable="false">
            <path d="M4 4v36h112V4" />
          </svg>
          <p>Add cables to see the tray cross-section, drawn to scale.</p>
        </div>
      ) : (
        <>
          <div className={styles.sheet}>
            <SectionSvg drawing={drawing} label={sectionLabel(outcome)} />
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

function Shape({ shape, hatchId }: { shape: DrawingShape; hatchId: string }) {
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
        <g>
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
