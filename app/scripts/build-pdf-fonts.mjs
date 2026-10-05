// Builds the fonts embedded in PDF reports: IBM Plex, cut down to the
// characters reports use, as TrueType (the format jsPDF needs). The output is
// committed; rerun only to change the character set or font version.
//
// The fonts are fetched with `npm pack`, which does not run install scripts
// (the @ibm/plex packages have a telemetry postinstall), so they are not
// project dependencies.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import subsetFont from 'subset-font';

const PACKAGES = { sans: '@ibm/plex-sans@1.1.0', mono: '@ibm/plex-mono@2.5.0' };
const FONTS = [
  { pkg: 'sans', file: 'IBMPlexSans-Regular' },
  { pkg: 'sans', file: 'IBMPlexSans-SemiBold' },
  { pkg: 'mono', file: 'IBMPlexMono-Regular' },
];

// Basic Latin, Latin-1 and Latin Extended-A, plus the symbols reports use.
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i)).join('');
const CHARACTERS = range(0x20, 0x7e) + range(0xa0, 0x17f) + '–—‘’“”•…−≤≥→←✓Σπ≈±÷×€²³µ°Ø·Δ';

const outDir = new URL('../src/export/fonts/', import.meta.url);
const work = mkdtempSync(join(tmpdir(), 'plex-'));
try {
  for (const [name, spec] of Object.entries(PACKAGES)) {
    // A shell is needed to run npm.cmd on Windows; the command is a fixed string.
    const packed = spawnSync(`npm pack ${spec} --silent`, { cwd: work, shell: true, encoding: 'utf8' });
    if (packed.status !== 0) throw new Error(`npm pack ${spec} failed: ${packed.stderr}`);
    const tarball = packed.stdout.trim().split(/\r?\n/).at(-1);
    mkdirSync(join(work, name));
    const untar = spawnSync('tar', ['-xzf', tarball, '-C', name], { cwd: work, encoding: 'utf8' });
    if (untar.status !== 0) throw new Error(`Extracting ${tarball} failed: ${untar.stderr}`);
  }

  mkdirSync(outDir, { recursive: true });
  for (const { pkg, file } of FONTS) {
    const source = readFileSync(join(work, pkg, 'package', 'fonts', 'complete', 'woff2', `${file}.woff2`));
    const ttf = await subsetFont(source, CHARACTERS, { targetFormat: 'sfnt' });
    writeFileSync(new URL(`${file}.ttf`, outDir), ttf);
    console.log(`${file}.ttf: ${Math.round(ttf.length / 1024)} KB`);
  }
  copyFileSync(join(work, 'sans', 'package', 'fonts', 'complete', 'woff2', 'license.txt'), new URL('OFL.txt', outDir));
} finally {
  rmSync(work, { recursive: true, force: true });
}
