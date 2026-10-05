import { cpSync, createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin, type UserConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fillTemplate, siteValues, type FactsFile, type SiteConfig } from './site/template.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
/** Stand-in for jsPDF's optional libraries, which the app never uses. */
const unusedPdfFeature = fileURLToPath(new URL('./src/export/unusedPdfFeature.ts', import.meta.url));
/** The manufacturer catalogues, kept once for the whole repository. */
const pdfDir = fileURLToPath(new URL('../pdfs/', import.meta.url));

/**
 * The catalog opens catalogue pages from pdfs/ next to the page, as the
 * previous tool did. The development server serves them from ../pdfs, and the
 * site build copies them into dist/pdfs. The offline package adds them itself
 * (scripts/package.mjs).
 */
function cataloguePdfs(): Plugin {
  let outDir = '';
  return {
    name: 'catalogue-pdfs',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use('/pdfs', (req, res, next) => {
        const file = join(pdfDir, decodeURIComponent((req.url ?? '').split(/[?#]/)[0]!));
        if (!file.startsWith(pdfDir) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', 'application/pdf');
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      if (existsSync(pdfDir)) cpSync(pdfDir, join(outDir, 'pdfs'), { recursive: true });
    },
  };
}

/** The product website's source, and where the whole published site is assembled. */
const siteRoot = fileURLToPath(new URL('./site/', import.meta.url));

/** Fills the {{placeholders}} in the website's head and no-script fallback from site/facts.json and site/site.config.json. */
function siteTemplate(): Plugin {
  return {
    name: 'site-template',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const read = (file: string) => JSON.parse(readFileSync(join(siteRoot, file), 'utf8'));
        return fillTemplate(html, siteValues(read('facts.json') as FactsFile, read('site.config.json') as SiteConfig));
      },
    },
  };
}

/**
 * `vite build` produces a static site in dist/ that works from any folder
 * (GitHub Pages, an internal web server). `vite build --mode single` inlines
 * everything into one HTML file in dist-single/ for offline use.
 *
 * The product website (`npm run build:site`) uses two more modes: `website`
 * builds the React page in site/ into dist-site/, and `site-app` builds the app
 * into dist-site/app/, where it opens catalogue pages from the shared ../pdfs/.
 */
export function createViteConfig(mode: string): UserConfig {
  const define = {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_KIND__: JSON.stringify(mode === 'single' ? 'single-file' : 'site'),
    __PDF_BASE__: JSON.stringify(mode === 'site-app' ? '../pdfs/' : 'pdfs/'),
  };
  if (mode === 'website') {
    return {
      root: siteRoot,
      base: './',
      plugins: [react(), tailwindcss(), siteTemplate()],
      define,
      build: { outDir: '../dist-site', emptyOutDir: true, target: 'es2022' },
      preview: { port: 4174 },
    };
  }
  const single = mode === 'single';
  const siteApp = mode === 'site-app';
  return {
    // Relative asset paths so the site works when served from a sub-folder.
    base: './',
    // The website assembly copies the catalogues once for the site and the app.
    plugins: [react(), ...(single ? [viteSingleFile()] : siteApp ? [] : [cataloguePdfs()])],
    resolve: {
      alias: Object.fromEntries(['html2canvas', 'dompurify', 'canvg'].map((name) => [name, unusedPdfFeature])),
    },
    define,
    build: {
      outDir: single ? 'dist-single' : siteApp ? 'dist-site/app' : 'dist',
      emptyOutDir: true,
      target: 'es2022',
    },
  };
}

export default defineConfig(({ mode }) => createViteConfig(mode));
