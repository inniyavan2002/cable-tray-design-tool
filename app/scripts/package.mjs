// Builds the offline package: the single HTML file plus the manufacturer
// catalogue PDFs, zipped into release/CableTrayDesign-v<version>.zip.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';

const appDir = fileURLToPath(new URL('../', import.meta.url));
const pdfDir = join(appDir, '..', 'pdfs');
const htmlPath = join(appDir, 'dist-single', 'CableTrayDesign.html');
const { version } = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'));

if (!existsSync(htmlPath)) {
  console.error('dist-single/CableTrayDesign.html not found. Run "npm run build:single" first.');
  process.exit(1);
}

const readme = `Cable Tray Design v${version}

1. Keep this folder together: CableTrayDesign.html and the pdfs folder.
2. Open CableTrayDesign.html in Chrome, Edge or Firefox. No internet connection is needed.
3. The pdfs folder holds the manufacturer catalogues shown by the catalog viewer.

Your work is saved in the browser you open the file with.
`;

const folder = 'CableTrayDesign';
const files = {
  [`${folder}/CableTrayDesign.html`]: [readFileSync(htmlPath), { level: 9 }],
  [`${folder}/README.txt`]: [strToU8(readme), { level: 9 }],
};

const pdfs = existsSync(pdfDir) ? readdirSync(pdfDir).filter((name) => name.toLowerCase().endsWith('.pdf')) : [];
for (const name of pdfs) {
  // PDFs are already compressed; storing them keeps packaging fast.
  files[`${folder}/pdfs/${name}`] = [readFileSync(join(pdfDir, name)), { level: 0 }];
}

const releaseDir = join(appDir, 'release');
mkdirSync(releaseDir, { recursive: true });
const zipPath = join(releaseDir, `CableTrayDesign-v${version}.zip`);
const zip = zipSync(files);
writeFileSync(zipPath, zip);

console.log(`Package: release/CableTrayDesign-v${version}.zip (${(zip.length / 1048576).toFixed(1)} MB, ${pdfs.length} PDFs)`);
