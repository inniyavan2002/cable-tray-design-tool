/**
 * What the website shows, all read from the app: figures from facts.json
 * (written by `npm run site:facts`, checked by a unit test) and addresses from
 * site.config.json.
 */
import type { DrawingShape } from '../src/drawing/sectionGeometry';
import facts from './facts.json';
import config from './site.config.json';

export const APP = facts.app;
export const FILES = facts.files;
export const CONFIG = config;

/** Tray T3's section as the app draws it. */
export const T3_DRAWING = facts.app.t3Drawing as unknown as {
  viewBox: { x: number; y: number; width: number; height: number };
  shapes: DrawingShape[];
};

/** Tray T2's section as the app draws it, for the features' workflow. */
export const T2_DRAWING = facts.app.t2Drawing as unknown as typeof T3_DRAWING;

export const APP_HREF = 'app/';
export const pdfHref = (file: string) => `pdfs/${encodeURIComponent(file)}`;
