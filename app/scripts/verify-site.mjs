// Checks the assembled website in dist-site/ before it is published:
// - every link and image opens, with the file name's exact letter case
//   (GitHub Pages is case-sensitive; the old page's Riyadh link was not);
// - every #anchor has a target;
// - nothing is loaded from another site;
// - every image has alt text, and no placeholder was left unfilled;
// - the page stays within its weight budget.
// Links the page adds when it runs are checked by the browser tests (tests/site).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const site = new URL('../dist-site/', import.meta.url);
const problems = [];
/**
 * What a first visit downloads for the page itself: text, styles and script as served compressed, plus fonts.
 * Raised from 300 KB when the live engineering drawing around the content (the hero's network, the drawing
 * sheet and the showcase's floor plan) brought the page to it; most of the page is React, Framer Motion and the fonts.
 */
const PAGE_BUDGET = 320 * 1024;
/** The page with its screenshots (the site has one theme, so every image counts). */
const TOTAL_BUDGET = 1024 * 1024;

function existsExactly(relative) {
  let dir = fileURLToPath(site);
  const parts = relative.split('/').filter(Boolean);
  for (const part of parts) {
    if (!existsSync(dir) || !statSync(dir).isDirectory() || !readdirSync(dir).includes(part)) return false;
    dir = `${dir}/${part}`;
  }
  return true;
}

function check(file) {
  const url = new URL(file, site);
  if (!existsSync(url)) {
    problems.push(`${file} is missing. Run "npm run build:site".`);
    return;
  }
  const html = readFileSync(url, 'utf8');
  const base = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
  if (/\{\{|\}\}/.test(html)) problems.push(`${file} still has a {{placeholder}}`);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

  for (const [tag] of html.matchAll(/<(?:a|link|img|source|script)\b[^>]*>/g)) {
    const element = tag.match(/^<(\w+)/)[1];
    const rel = tag.match(/\brel="([^"]+)"/)?.[1] ?? '';
    const refs = [...tag.matchAll(/\b(href|src|srcset)="([^"]*)"/g)].flatMap(([, attr, value]) =>
      attr === 'srcset' ? value.split(',').map((c) => [attr, c.trim().split(/\s+/)[0]]) : [[attr, value]],
    );
    if (element === 'img' && !/\balt="[^"]+"/.test(tag)) problems.push(`${file}: an image has no alt text: ${tag.slice(0, 80)}`);
    for (const [attr, ref] of refs) {
      if (/^(https?:)?\/\//.test(ref)) {
        // Links to other sites are fine; loading anything from them is not.
        if (!(element === 'a' || (element === 'link' && rel === 'canonical'))) problems.push(`${file}: <${element} ${attr}> loads ${ref} from another site`);
        continue;
      }
      if (/^(mailto|tel|data):/.test(ref)) continue;
      if (ref.startsWith('#')) {
        if (ref.length > 1 && !ids.has(ref.slice(1))) problems.push(`${file}: ${ref} has no matching id`);
        continue;
      }
      const path = decodeURIComponent(new URL(ref, new URL(base, 'https://site.invalid/')).pathname.slice(1).split('#')[0]);
      const target = path === '' || path.endsWith('/') ? `${path}index.html` : path;
      if (!existsExactly(target)) problems.push(`${file}: ${ref} does not open (no file ${target} with that exact name)`);
    }
  }
  return html;
}

const index = check('index.html');
check('tool.html');
check('app/index.html');

if (index) {
  // CSS can load fonts and images too.
  const assets = readdirSync(new URL('assets/', site));
  for (const css of assets.filter((n) => n.endsWith('.css'))) {
    for (const [, ref] of readFileSync(new URL(`assets/${css}`, site), 'utf8').matchAll(/url\(\s*["']?([^"')]+)/g)) {
      if (/^(https?:)?\/\//.test(ref)) problems.push(`assets/${css} loads ${ref} from another site`);
      else if (!ref.startsWith('data:') && !existsExactly(`assets/${ref.replace(/^\.\//, '')}`)) problems.push(`assets/${css}: ${ref} does not open`);
    }
  }
  const bytes = (name) => statSync(new URL(name, site)).size;
  // Text is served compressed; fonts and images already are.
  const served = (name) => (/\.(html|js|css|svg)$/.test(name) ? gzipSync(readFileSync(new URL(name, site))).length : bytes(name));
  const isImage = (n) => /\.(jpe?g|png|webp|avif|svg)$/i.test(n) && !n.startsWith('favicon');
  const page = served('index.html') + assets.filter((n) => !isImage(n)).reduce((sum, n) => sum + served(`assets/${n}`), 0);
  const images = assets.filter(isImage).reduce((sum, n) => sum + bytes(`assets/${n}`), 0);
  if (page > PAGE_BUDGET) problems.push(`the page's text, styles, script and fonts weigh ${Math.round(page / 1024)} KB as served, over the ${PAGE_BUDGET / 1024} KB budget`);
  if (page + images > TOTAL_BUDGET) problems.push(`the page with its screenshots weighs ${Math.round((page + images) / 1024)} KB, over the ${TOTAL_BUDGET / 1024} KB budget`);

  // The app published with the site opens catalogue pages from the site's one pdfs folder.
  const appScripts = readdirSync(new URL('app/assets/', site)).filter((n) => n.endsWith('.js'));
  if (!appScripts.some((n) => readFileSync(new URL(`app/assets/${n}`, site), 'utf8').includes('../pdfs/'))) {
    problems.push('the app in dist-site/app/ does not open catalogues from ../pdfs/; build it with --mode site-app');
  }

  if (!problems.length) console.log(`Site verification passed: links open with exact names, nothing loads from other sites, page ${Math.round(page / 1024)} KB as served + screenshots ${Math.round(images / 1024)} KB.`);
}

if (problems.length) {
  console.error('Site verification failed:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
