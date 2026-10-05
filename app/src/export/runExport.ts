import { loadCatalog } from '../data/catalog';
import type { Project } from '../state/projectModel';
import { blobToBase64, svgToPng, zipFiles } from './browserFiles';
import { drawingSvg } from './drawingSvg';
import { buildProjectReport, fileSafe, type ProjectReport } from './reportModel';

export type ExportFormat = 'pdf' | 'excel' | 'png' | 'svg';

export interface ExportRequest {
  format: ExportFormat;
  trayIds: readonly string[];
  /** Excel only: add a sheet with the whole catalog. */
  includeCatalog?: boolean;
}

export interface ExportFile {
  blob: Blob;
  fileName: string;
  /** PDF only. */
  pageCount?: number;
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function baseName(report: ProjectReport): string {
  const project = fileSafe(report.projectName);
  return report.trays.length === 1 ? `${project}_${fileSafe(report.trays[0]!.name)}` : project;
}

async function drawingFiles(report: ProjectReport, format: 'png' | 'svg') {
  const files: Array<{ trayId: string; name: string; blob: Blob; width: number; height: number }> = [];
  for (const tray of report.trays) {
    const doc = drawingSvg(tray, report.projectName);
    if (!doc) continue;
    const blob = format === 'svg' ? new Blob([doc.svg], { type: 'image/svg+xml' }) : await svgToPng(doc);
    files.push({ trayId: tray.id, name: `${fileSafe(tray.name)}_section.${format}`, blob, width: doc.width, height: doc.height });
  }
  return files;
}

/** Builds the requested export in the browser. The PDF and Excel code loads only when first used. */
export async function createExport(project: Project, request: ExportRequest): Promise<ExportFile> {
  if (!request.trayIds.length) throw new Error('Choose at least one tray to export.');
  const report = buildProjectReport(project, request.trayIds);
  const base = baseName(report);

  switch (request.format) {
    case 'pdf': {
      const { buildPdf } = await import('./pdf');
      const pdf = buildPdf(report);
      return { blob: pdf.blob, fileName: `${base}_cable-tray-report.pdf`, pageCount: pdf.pages.length };
    }
    case 'excel': {
      const [{ buildExcel }, pictures] = await Promise.all([import('./excel'), drawingFiles(report, 'png')]);
      const drawings = new Map<string, { base64: string; width: number; height: number }>();
      for (const p of pictures) drawings.set(p.trayId, { base64: await blobToBase64(p.blob), width: p.width, height: p.height });
      const buffer = await buildExcel(report, { drawings, catalog: request.includeCatalog ? loadCatalog().cables : undefined });
      return { blob: new Blob([buffer], { type: XLSX_TYPE }), fileName: `${base}_cable-tray-report.xlsx` };
    }
    case 'png':
    case 'svg': {
      const files = await drawingFiles(report, request.format);
      if (!files.length) throw new Error('None of the chosen trays has cables, so there is nothing to draw.');
      if (files.length === 1) return { blob: files[0]!.blob, fileName: `${base}_section.${request.format}` };
      return { blob: await zipFiles(files), fileName: `${base}_sections-${request.format}.zip` };
    }
  }
}
