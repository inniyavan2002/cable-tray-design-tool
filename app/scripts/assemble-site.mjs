// Completes dist-site/, the folder GitHub Pages serves, after the website and
// the app are built into it: adds the catalogues (one copy for both), the
// sample reports, and the old addresses. The old tool.html forwards to the new
// app, and the old tool itself stays at previous/tool.html for three months.
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = new URL('../', import.meta.url);
const repoDir = new URL('../', appDir);
const out = new URL('dist-site/', appDir);
const problems = [];

const need = (url, hint) => {
  if (!existsSync(url)) problems.push(`${fileURLToPath(url)} is missing. ${hint}`);
  return existsSync(url);
};

need(new URL('index.html', out), 'Run "npm run build:site".');
need(new URL('app/index.html', out), 'Run "npm run build:site".');

// Catalogues, used by the website's library and the app's catalogue pages.
const pdfs = new URL('pdfs/', repoDir);
if (need(pdfs, 'The catalogue PDFs belong in the repository.')) cpSync(pdfs, new URL('pdfs/', out), { recursive: true });

// Sample reports, written by the browser tests (npm run test:e2e).
const SAMPLES = {
  'Example-Project_cable-tray-report.pdf': 'example-report.pdf',
  'Example-Project_cable-tray-report.xlsx': 'example-workbook.xlsx',
  'Example-Project_TR-01_section.svg': 'example-section-TR-01.svg',
};
mkdirSync(new URL('samples/', out), { recursive: true });
for (const [from, to] of Object.entries(SAMPLES)) {
  const source = new URL(`reports/samples/${from}`, appDir);
  if (need(source, 'Run "npm run test:e2e", which writes the sample reports.')) copyFileSync(source, new URL(`samples/${to}`, out));
}

// The old tool, kept for comparison. It opens catalogues from pdfs/ next to
// itself; one folder down, that becomes ../pdfs/.
const oldTool = new URL('tool.html', repoDir);
if (need(oldTool, 'The previous tool belongs in the repository.')) {
  const html = readFileSync(oldTool, 'utf8');
  const pdfPath = "const pdfPath='pdfs/'+";
  const count = html.split(pdfPath).length - 1;
  if (count !== 1) problems.push(`tool.html: expected one "${pdfPath}", found ${count}; update scripts/assemble-site.mjs`);
  mkdirSync(new URL('previous/', out), { recursive: true });
  writeFileSync(new URL('previous/tool.html', out), html.replace(pdfPath, "const pdfPath='../pdfs/'+"));
}

// Bookmarks to the old tool open the new app, which imports the old tool's trays.
writeFileSync(
  new URL('tool.html', out),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cable Tray Design has moved</title>
<meta http-equiv="refresh" content="0; url=app/">
<link rel="canonical" href="app/">
<style>body{margin:0;padding:40px 16px;font:16px/1.6 system-ui,sans-serif;background:#F6F4EE;color:#1B2A38}main{max-width:40rem;margin:auto}a{color:#8F4E14}</style>
</head>
<body>
<main>
<h1>Cable Tray Design has a new version</h1>
<p>Opening it now. If nothing happens, <a href="app/">open the new app</a>. Trays saved in this browser by the old tool are brought across the first time.</p>
<p>The old tool stays available for comparison as the <a href="previous/tool.html">previous version</a>.</p>
</main>
</body>
</html>
`,
);

// The old user guide, kept for one release until the new guide page replaces it.
const guide = new URL('Cable_Tray_Design_Software_User_Readme.docx', repoDir);
if (need(guide, 'The user guide belongs in the repository.')) copyFileSync(guide, new URL('Cable_Tray_Design_Software_User_Readme.docx', out));

// GitHub Pages: serve files as they are.
writeFileSync(new URL('.nojekyll', out), '');

if (problems.length) {
  console.error('Site assembly failed:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}

function size(path) {
  const stats = statSync(path);
  return stats.isDirectory() ? readdirSync(path).reduce((sum, name) => sum + size(join(path, name)), 0) : stats.size;
}
const mb = (url) => (size(fileURLToPath(url)) / 1048576).toFixed(1);
console.log(`Site assembled in dist-site/ (${mb(out)} MB, of which catalogues ${mb(new URL('pdfs/', out))} MB)`);
