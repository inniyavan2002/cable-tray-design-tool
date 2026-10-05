import { motion, type Transition } from 'framer-motion';
import { useId } from 'react';
import type { DrawingShape } from '../../src/drawing/sectionGeometry';
import { T3_DRAWING } from '../data';
import { useStill } from './loop';

/** When each stage starts, in seconds after it appears. The cables are laid one by one; all of it is over in about 3.5 s. */
export const TIMING = {
  rail: 0.2,
  cables: 0.45,
  cableStep: 0.14,
  get dimensions() {
    return this.cables + CABLE_COUNT * this.cableStep + 0.55;
  },
  get text() {
    return this.dimensions + 0.35;
  },
  /** When the drawing is complete, for anything that follows it. */
  get settled() {
    return this.text + 0.4;
  },
};

type Cable = Extract<DrawingShape, { kind: 'cable' }>;
/** The cables in the order they are laid: bottom layer first, left to right. */
const LAYING_ORDER = T3_DRAWING.shapes.filter((s): s is Cable => s.kind === 'cable').sort((a, b) => b.cy - a.cy || a.cx - b.cx);
const CABLE_COUNT = LAYING_ORDER.length;
/** Each cable's radius in the drawing and when it settles in the tray, for anything that follows the laying (the fill meter). */
export const LAID = LAYING_ORDER.map((c, i) => ({ r: c.r, at: TIMING.cables + i * TIMING.cableStep + 0.3 }));
const CABLE_SPRING: Transition = { type: 'spring', damping: 18, stiffness: 220 };

const LINE_STYLE: Record<string, { stroke: string; width: number; dash?: string }> = {
  boundary: { stroke: 'var(--line-2)', width: 1, dash: '3 3' },
  'required-height': { stroke: 'var(--req-line)', width: 1.3, dash: '7 4' },
  dimension: { stroke: 'var(--ink-2)', width: 1 },
  extension: { stroke: 'var(--ink-3)', width: 0.6, dash: '2 2' },
  leader: { stroke: 'var(--ink-3)', width: 0.7 },
};

/**
 * Tray T3's section exactly as the app draws it (the shapes come from the
 * app's own geometry), assembled in sequence: the tray, then the cables
 * dropping into their layers bottom first, then the dimensions drawing in.
 */
export function TrayDrawing() {
  const reduce = useStill();
  const hatch = `hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { viewBox, shapes } = T3_DRAWING;
  // Bottom layer first, left to right, as cables would be laid.
  const cableOrder = new Map(LAYING_ORDER.map((c, i) => [c, i]));
  const at = (delay: number, duration = 0.4): Transition => ({ delay, duration, ease: 'easeOut' });
  const initial = <T,>(value: T) => (reduce ? false : value);
  let drawn = 0;

  return (
    <svg viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`} className="block h-auto w-full" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={hatch} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--hatch)" strokeWidth="1.1" />
        </pattern>
      </defs>
      {shapes.map((shape, i) => {
        switch (shape.kind) {
          case 'zone':
            return (
              <motion.rect
                key={i}
                x={shape.x}
                y={shape.y}
                width={shape.width}
                height={shape.height}
                fill={shape.role === 'clearance' ? `url(#${hatch})` : 'var(--zone-spare)'}
                initial={initial({ opacity: 0 })}
                animate={{ opacity: 1 }}
                transition={at(TIMING.dimensions - 0.25, 0.5)}
              />
            );
          case 'rail':
            return (
              <motion.path
                key={i}
                d={shape.d}
                fill="none"
                stroke="var(--ink)"
                strokeWidth="3"
                initial={initial({ pathLength: 0 })}
                animate={{ pathLength: 1 }}
                transition={at(TIMING.rail, 0.6)}
              />
            );
          case 'cable': {
            const order = cableOrder.get(shape) ?? 0;
            const delay = TIMING.cables + order * TIMING.cableStep;
            return (
              <motion.g
                key={i}
                className="will-change-transform"
                initial={initial({ y: -viewBox.height * 0.8, opacity: 0 })}
                animate={{ y: 0, opacity: 1 }}
                transition={{ ...CABLE_SPRING, delay, opacity: at(delay, 0.2) }}
              >
                <circle cx={shape.cx} cy={shape.cy} r={shape.r} fill={`var(--cab-${shape.colourIndex + 1})`} stroke="var(--cab-stroke)" strokeWidth="1" />
                {shape.tagSize !== null && (
                  <text x={shape.cx} y={shape.cy + shape.tagSize * 0.35} fontSize={shape.tagSize} textAnchor="middle" fill="var(--cab-tag)" fontFamily="var(--mono)" fontWeight="600">
                    {shape.tag}
                  </text>
                )}
              </motion.g>
            );
          }
          case 'line': {
            const style = LINE_STYLE[shape.role]!;
            const common = { x1: shape.x1, y1: shape.y1, x2: shape.x2, y2: shape.y2, stroke: style.stroke, strokeWidth: style.width };
            // Solid dimension lines draw in; dashed ones fade in, since drawing would lose the dashes.
            if (!style.dash) {
              const delay = TIMING.dimensions + (drawn++ % 8) * 0.03;
              return <motion.line key={i} {...common} initial={initial({ pathLength: 0 })} animate={{ pathLength: 1 }} transition={at(delay, 0.5)} />;
            }
            return (
              <motion.line key={i} {...common} strokeDasharray={style.dash} initial={initial({ opacity: 0 })} animate={{ opacity: 1 }} transition={at(TIMING.dimensions, 0.5)} />
            );
          }
          case 'text':
            return (
              <motion.text
                key={i}
                x={shape.x}
                y={shape.y}
                fontSize={shape.size}
                textAnchor={shape.anchor}
                fill="var(--ink)"
                fontFamily="var(--mono)"
                fontWeight={shape.bold ? 600 : 400}
                initial={initial({ opacity: 0 })}
                animate={{ opacity: 1 }}
                transition={at(shape.role === 'layer' ? TIMING.cables : TIMING.text)}
              >
                {shape.text}
              </motion.text>
            );
        }
      })}
    </svg>
  );
}
