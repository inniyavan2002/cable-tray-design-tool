// Writes site/facts.json: the figures the product website quotes, plus the
// sizes of files it links to. Run with `npm run site:facts` after the catalog,
// the defaults or the report layout change; siteFacts.test.ts says when.
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { loadCatalog } from '../data/catalog';
import { buildPdf } from '../export/pdf';
import { buildProjectReport } from '../export/reportModel';
import { sampleProject } from '../export/testing/sampleProject';
import { siteFacts } from './siteFacts';

const MB = 1024 * 1024;
const pdfDir = new URL('../../../pdfs/', import.meta.url);
const singleFile = new URL('../../dist-single/CableTrayDesign.html', import.meta.url);
const out = new URL('../../site/facts.json', import.meta.url);

it('writes site/facts.json', () => {
  const catalog = loadCatalog();
  const pdfMb = Object.fromEntries(catalog.brands.map((b) => [b.pdfFile, (statSync(new URL(encodeURIComponent(b.pdfFile), pdfDir)).size / MB).toFixed(1)]));

  const project = sampleProject();
  const { pages } = buildPdf(buildProjectReport(project, project.trays.map((t) => t.id), new Date(2026, 8, 28)));

  // The offline package stores the PDFs as they are and compresses the HTML file to about a quarter.
  const pdfBytes = readdirSync(pdfDir)
    .filter((name) => name.toLowerCase().endsWith('.pdf'))
    .reduce((sum, name) => sum + statSync(new URL(encodeURIComponent(name), pdfDir)).size, 0);
  const htmlBytes = existsSync(singleFile) ? statSync(singleFile).size : 3.5 * MB;
  const offlineMb = String(Math.round((pdfBytes + htmlBytes / 4) / MB));

  const facts = { app: siteFacts(catalog), files: { pdfMb, reportPages: String(pages.length), offlineMb } };
  writeFileSync(out, `${JSON.stringify(facts, null, 2)}\n`);
});
