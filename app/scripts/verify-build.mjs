// Checks that both build outputs can be hosted from any folder and opened offline.
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const problems = [];

function read(path) {
  const url = new URL(path, root);
  if (!existsSync(url)) {
    problems.push(`${path} is missing. Run "npm run build:all" first.`);
    return '';
  }
  return readFileSync(url, 'utf8');
}

// Root-absolute paths ("/assets/...") break when the site is served from a
// sub-folder, as on GitHub Pages or an internal web server.
const site = read('dist/index.html');
for (const match of site.matchAll(/\b(?:src|href)="(\/[^"]*)"/g)) {
  problems.push(`dist/index.html uses the root-absolute path ${match[1]}`);
}

// The catalog opens catalogue pages from pdfs/ next to index.html.
const pdfSource = new URL('../pdfs/', root);
if (existsSync(pdfSource)) {
  for (const name of readdirSync(pdfSource).filter((n) => n.toLowerCase().endsWith('.pdf'))) {
    if (!existsSync(new URL(`dist/pdfs/${encodeURIComponent(name)}`, root))) problems.push(`dist/pdfs/${name} is missing`);
  }
}

// The single file must not depend on anything outside itself.
const single = read('dist-single/CableTrayDesign.html');
if (/<script\b[^>]*\bsrc\s*=/i.test(single)) problems.push('the single file still loads a script by URL');
if (/<link\b[^>]*rel\s*=\s*["']?stylesheet/i.test(single)) problems.push('the single file still links a stylesheet');
const externalPatterns = [
  /<(?:img|source|iframe|link)\b[^>]*\b(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)/gi,
  /url\(\s*["']?(https?:\/\/[^"')\s]+)/gi,
  /@import\s+(?:url\()?\s*["']?(https?:\/\/[^"')\s;]+)/gi,
];
for (const pattern of externalPatterns) {
  for (const match of single.matchAll(pattern)) problems.push(`the single file references ${match[1]}`);
}

if (problems.length) {
  console.error('Build verification failed:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log('Build verification passed: relative paths and catalogue PDFs in dist/, no external resources in the single file.');
