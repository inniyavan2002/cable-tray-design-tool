/**
 * The section drawing as a standalone SVG file: title, drawing and legends,
 * in print colours, with the monospace font embedded so it looks the same in
 * any viewer. PNG export rasterises this SVG.
 */
import { num1 } from '../domain/format';
import type { DrawingShape } from '../drawing/sectionGeometry';
import monoFontUrl from './fonts/IBMPlexMono-Regular.ttf?inline';
import { cableColour, PRINT } from './palette';
import type { ReportTray } from './reportModel';

export interface SvgDocument {
  svg: string;
  width: number;
  height: number;
}

const MARGIN = 24;
const HEADER = 78;
const LINE = 22;
const FONT = "'Plex Mono', Consolas, 'Courier New', monospace";

export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shapeSvg(shape: DrawingShape): string {
  switch (shape.kind) {
    case 'zone':
      return shape.role === 'clearance'
        ? `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" fill="url(#hatch)"/>`
        : `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" fill="${PRINT.spare}"/>`;
    case 'line': {
      const style: Record<typeof shape.role, string> = {
        boundary: `stroke="${PRINT.line2}" stroke-width="1" stroke-dasharray="3 3"`,
        'required-height': `stroke="${PRINT.requiredLine}" stroke-width="1.3" stroke-dasharray="7 4"`,
        dimension: `stroke="${PRINT.ink2}" stroke-width="1"`,
        extension: `stroke="${PRINT.ink3}" stroke-width="0.6" stroke-dasharray="2 2"`,
        leader: `stroke="${PRINT.ink3}" stroke-width="0.7"`,
      };
      return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" ${style[shape.role]}/>`;
    }
    case 'rail':
      return `<path d="${shape.d}" fill="none" stroke="${PRINT.ink}" stroke-width="3" stroke-linejoin="miter"/>`;
    case 'cable': {
      const circle = `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" fill="${cableColour(shape.colourIndex)}" stroke="${PRINT.cableStroke}" stroke-width="1"/>`;
      const tag =
        shape.tagSize === null
          ? ''
          : `<text x="${shape.cx}" y="${shape.cy + shape.tagSize * 0.35}" font-size="${shape.tagSize}" font-weight="600" text-anchor="middle" fill="${PRINT.cableTag}">${shape.tag}</text>`;
      return circle + tag;
    }
    case 'text':
      return `<text x="${shape.x}" y="${shape.y}" font-size="${shape.size}" text-anchor="${shape.anchor}" fill="${PRINT.ink}"${shape.bold ? ' font-weight="600"' : ''}>${escapeXml(shape.text)}</text>`;
  }
}

/** Returns null when the tray has no cables to draw. */
export function drawingSvg(tray: ReportTray, projectName: string): SvgDocument | null {
  const drawing = tray.drawing;
  if (!drawing) return null;
  const vb = drawing.viewBox;
  const drawnCables = tray.cables.filter((c) => c.odMm !== null && !c.note.startsWith('Not used'));
  const width = Math.ceil(Math.max(vb.width, 640) + 2 * MARGIN);
  const zoneTop = HEADER + vb.height + 12;
  const cableTop = zoneTop + LINE + 6;
  const height = Math.ceil(cableTop + drawnCables.length * LINE + MARGIN);

  const title = `${tray.name}${tray.service ? ` · ${tray.service}` : ''}`;
  const subtitle = `${tray.sizeText} · ${tray.statusText}`;
  const zones = [
    `Side clearance, each rail ${num1(drawing.zonesMm.clearancePerSide)}`,
    drawing.zonesMm.spare > 0.05 ? `Spare ${num1(drawing.zonesMm.spare)}` : '',
    drawing.zonesMm.unused > 0.05 ? `Unused ${num1(drawing.zonesMm.unused)}` : '',
    tray.outcome.result.requiredHeightMm < drawing.trayHeightMm - 0.05 ? `Required height ${num1(tray.outcome.result.requiredHeightMm)} (dashed)` : '',
  ].filter(Boolean);

  const parts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">`,
    `<title>${escapeXml(`${projectName}: ${title}`)}</title>`,
    `<defs><style>@font-face{font-family:'Plex Mono';src:url(${monoFontUrl}) format('truetype');}</style>`,
    `<pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${PRINT.hatch}" stroke-width="1.1"/></pattern></defs>`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text x="${MARGIN}" y="${MARGIN + 16}" font-size="18" font-weight="600" fill="${PRINT.ink}">${escapeXml(title)}</text>`,
    `<text x="${MARGIN}" y="${MARGIN + 38}" font-size="13" fill="${PRINT.ink}">${escapeXml(subtitle)}</text>`,
    `<text x="${MARGIN}" y="${MARGIN + 56}" font-size="11" fill="${PRINT.ink3}">${escapeXml(tray.drawingCaption)}</text>`,
    `<svg x="${MARGIN}" y="${HEADER}" width="${vb.width}" height="${vb.height}" viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}" overflow="visible">`,
    ...drawing.shapes.map(shapeSvg),
    `</svg>`,
    `<text x="${MARGIN}" y="${zoneTop + 14}" font-size="11.5" fill="${PRINT.ink2}">${escapeXml(zones.join('   ·   '))}</text>`,
  ];
  drawnCables.forEach((c, i) => {
    const y = cableTop + i * LINE;
    parts.push(
      `<circle cx="${MARGIN + 8}" cy="${y + 6}" r="8" fill="${cableColour(c.colourIndex)}" stroke="${PRINT.cableStroke}" stroke-width="0.8"/>`,
      `<text x="${MARGIN + 8}" y="${y + 9.5}" font-size="9.5" font-weight="600" text-anchor="middle" fill="${PRINT.cableTag}">${c.tag}</text>`,
      `<text x="${MARGIN + 24}" y="${y + 10}" font-size="12" fill="${PRINT.ink}">${escapeXml(`${c.description} · Ø${num1(c.odMm!)} mm × ${c.quantity}${c.note ? `  (${c.note.split(':')[0]})` : ''}`)}</text>`,
    );
  });
  parts.push('</svg>');
  return { svg: parts.join('\n'), width, height };
}
