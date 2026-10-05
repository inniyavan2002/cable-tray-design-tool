/**
 * Fills the placeholders in site/index.html at build time. `{{name}}` inserts
 * a value as text; `{{{name}}}` inserts ready-made HTML. An unknown name stops
 * the build, so a typo cannot reach the published page.
 */
import type { SiteFacts } from '../src/site/siteFacts';

/** Settings in site/site.config.json. Empty strings leave that item out. */
export interface SiteConfig {
  /** Public address of the website, for link previews. */
  siteUrl: string;
  repository: string;
  /** Where the offline package is downloaded from. */
  downloadUrl: string;
  /** The Google Apps Script that receives feedback. */
  feedbackEndpoint: string;
  publisher: string;
  contactEmail: string;
}

/** site/facts.json, written by `npm run site:facts`. */
export interface FactsFile {
  app: SiteFacts;
  files: {
    /** Size of each catalogue PDF in MB, by file name. */
    pdfMb: Record<string, string>;
    reportPages: string;
    offlineMb: string;
  };
}

export interface SiteValues {
  text: Record<string, string>;
  html: Record<string, string>;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}


/** Values for the page's head and its no-script fallback; the page itself reads facts.json directly. */
export function siteValues(facts: FactsFile, config: SiteConfig): SiteValues {
  return {
    text: {
      rows: facts.app.catalog.rows,
      manufacturers: facts.app.catalog.manufacturers,
      siteUrl: config.siteUrl,
      downloadUrl: config.downloadUrl,
    },
    html: {},
  };
}

export function fillTemplate(page: string, values: SiteValues): string {
  return page.replace(/\{\{\{\s*(\w+)\s*\}\}\}|\{\{\s*(\w+)\s*\}\}/g, (_match, block: string | undefined, name: string | undefined) => {
    if (block !== undefined) {
      if (!(block in values.html)) throw new Error(`site/index.html uses an unknown block {{{${block}}}}`);
      return values.html[block]!;
    }
    if (!(name! in values.text)) throw new Error(`site/index.html uses an unknown value {{${name}}}`);
    return escapeHtml(values.text[name!]!);
  });
}
