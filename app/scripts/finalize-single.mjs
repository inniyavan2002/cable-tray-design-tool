// Renames the single-file build output to its distribution name.
import { existsSync, renameSync, statSync } from 'node:fs';

const outDir = new URL('../dist-single/', import.meta.url);
const built = new URL('index.html', outDir);
const target = new URL('CableTrayDesign.html', outDir);

if (!existsSync(built)) {
  console.error('dist-single/index.html not found. Run "vite build --mode single" first.');
  process.exit(1);
}

renameSync(built, target);
const sizeKb = Math.round(statSync(target).size / 1024);
console.log(`Single-file build: dist-single/CableTrayDesign.html (${sizeKb} KB)`);
