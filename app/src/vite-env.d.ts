/// <reference types="vite/client" />

/** Version from package.json, injected at build time. */
declare const __APP_VERSION__: string;
/** "site" for the multi-file build, "single-file" for the offline HTML. */
declare const __BUILD_KIND__: 'site' | 'single-file';
/** Where catalogue PDFs are, relative to the page: "pdfs/" next to it, or "../pdfs/" in the published website. */
declare const __PDF_BASE__: string;
