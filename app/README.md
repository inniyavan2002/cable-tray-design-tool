# Cable Tray Design app

The rebuilt cable tray sizing tool. It replaces `../tool.html` once the rebuild is complete; until then both exist side by side.

Requires Node.js 22.12 or later (CI uses the version in `.nvmrc`).

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies (first time only) |
| `npm run playwright:install` | Download the browser used by the browser tests (first time only) |
| `npm run dev` | Start a local development server with live reload |
| `npm run lint` / `npm run typecheck` | Check code style and types |
| `npm test` | Run unit tests |
| `npm run test:speed` | Run the sizing speed tests on their own (timing is unreliable alongside other tests) |
| `npm run compare` | Compare the sizing engine with the one in `../tool.html`; writes `reports/engine-comparison.md` |
| `npm run catalog:review` | Write the catalog review workbook `reports/catalog-review.xlsx` and summary `reports/catalog-checks.md` |
| `npm run catalog:import-review -- <file>` | Merge decisions from a filled-in review workbook into `src/data/catalog/review.json` |
| `npm run build` | Build the static site into `dist/` for GitHub Pages or an internal web server |
| `npm run build:single` | Build `dist-single/CableTrayDesign.html`, one file that works offline |
| `npm run verify` | Check `dist/` uses relative paths and the single file has no external resources |
| `npm run test:e2e` | Run browser tests against both builds (build them first) |
| `npm run package` | Zip the single file with `../pdfs/` into `release/` for offline distribution |
| `npm run build:site` | Build the product website with the app into `dist-site/` for GitHub Pages (after `npm run test:e2e`, which writes the sample reports) |
| `npm run verify:site` / `npm run test:site` | Check the website's links, outside requests and weight; run its browser tests |
| `npm run site:facts` / `npm run site:screenshots` | Refresh the website's figures and screenshots of the app |
| `node scripts/build-pdf-fonts.mjs` | Rebuild the fonts embedded in PDF reports (only needed to change their character set or version) |
| `node scripts/find-catalog-pages.mjs` | Find the catalogue pages of rows that have a product code but no page number (only needed if the PDFs or source rows change) |
| `npm run check` | Everything above, in the order CI runs it |

The npm scripts call each tool through `node` rather than npm's command shims, because the shims fail on Windows when the folder path contains `&` (as in `R&D_WIP`). Run tools through the npm scripts rather than `npx`.

## Hosting

- **Offline:** send `release/CableTrayDesign-v<version>.zip`. Users unzip it and open `CableTrayDesign.html`; the `pdfs` folder must stay next to it.
- **Product website:** `npm run build:site` assembles the website, the app (at `app/`), the catalogues and the sample reports in `dist-site/`, the folder GitHub Pages serves. The App CI workflow publishes it on every push to `main` that passes all its checks, and when run by hand from the Actions tab; the repository's Settings, Pages, Source must be set to "GitHub Actions". See `site/README.md`.
- **Web server or GitHub Pages, app only:** copy the contents of `dist/` to any folder. All paths are relative, so no server configuration is needed. The build copies the catalogue PDFs from `../pdfs` into `dist/pdfs`, where the catalog opens them.

## Layout

```
src/
  data/catalog/  cable catalog: original rows per brand, normalisation, checks, review decisions, search
  domain/    sizing engine: no screen code, fully unit tested
    testing/ seeded test trays and a verbatim copy of the legacy engine, for comparison only
  drawing/   section drawing geometry, shared by the screen and every export
  export/    PDF, Excel, PNG and SVG reports
    fonts/   IBM Plex subsets embedded in PDFs (SIL Open Font License, see OFL.txt)
  state/     project model, undo history, saving in the browser, project files, import from the previous tool, theme and UI state
  styles/    design tokens (light and dark), bundled fonts, base styles
  ui/        components: shell/ for the page frame, common/ for shared parts
  test/      unit-test setup
site/        the product website (see site/README.md)
tests/e2e/   browser tests for the offline file and the static site
tests/site/  browser tests for the product website
tests/fixtures/  the example project T1–T3, shared by tests and screenshots
scripts/     build finishing, verification and packaging
reports/     generated comparison and catalog reports; samples/ holds reports written by the browser tests
```

### Sizing engine

`sizeTray(rows, settings, standards)` in `src/domain` returns the layer layout, required width and height, the selected standard tray and a status. `buildCalcReport(result)` turns that into the calculation-summary rows shown on screen and in the exports.

- Required width = widest layer + spare (width only) + side clearance at both rails.
- Required height = layer heights + a gap under each upper layer equal to its largest OD (when layer gaps are on) + top clearance.
- The selected tray is the standard size with the smallest cross-section that fits and meets the fill limit, the narrower one on a tie.
- The layer search aims for that same tray. Small trays are searched exhaustively; larger ones use a deterministic heuristic that the tests check against the exhaustive search.

### Cable catalog

`loadCatalog()` in `src/data/catalog` reads the original rows (`source/*.json`, unchanged from `tool.html`), normalises them, runs the automatic checks and applies the review decisions in `review.json`. Every row gets a status:

- **checked**: passed every automatic check (not the same as checked by a person against the PDF);
- **needs-review**: selectable, shown with a warning;
- **excluded**: has an impossible value such as an OD with a lost decimal point; hidden from cable selection.

The checks and their limits are in `checks.ts`; the OD limits were derived from the catalog's own plausible rows. Implausible weights are hidden rather than excluding the cable, because weight does not change the tray size. That includes a weight lighter than the conductors, one equal to the drum length, and one repeated across three or more sizes of the same product range (Oman lists 1,000 kg/km for all its small sizes). See `source/README.md` for the review workflow.

### Reports

**Export** in the top bar exports this tray, selected trays or the whole project. Every format is built from one report model (`reportModel.ts`), so the numbers match the screen.

- **PDF**: A4 landscape. A project page with the title block (project number, client, prepared/checked by, revision, date from **Details**), a summary of every tray and the points to check; then each tray from a new page with its result, settings, section drawing, cable schedule and calculation. Pages are numbered "Page n of N". Text and drawings are vector; the fonts are embedded, so it looks the same offline.
- **Excel**: a Project sheet, one sheet per tray with its drawing, a Cables used sheet, and optionally the whole catalog. ODs, quantities and weights are numbers, not text.
- **PNG / SVG**: the section drawing with its legend. Several trays are saved as one zip.

Cables that need review and manual cables are marked in every report and listed under points to check.

### Motion

Motion in the app marks a change of state and is short: dialogs and notices rise in, a new tray size eases in, the fill bar grows, new cable rows arrive, reordered trays glide to their new place, and exports show an indeterminate progress line. It is all off when the device asks for reduced motion (`src/styles/base.css`, `src/ui/common/motion.ts`).

### Projects

- **Saving:** the project is saved in the browser a moment after every change. **Save project** (Ctrl+S) also downloads it as a `.ctd.json` file to keep or share; **Open** reads one back. A project file records each catalog cable's OD and weight, so opening it with a newer catalog lists any cable whose values changed. If the browser cannot save, a banner says so and offers a project file.
- **Undo and redo:** Ctrl+Z and Ctrl+Y (or the arrows in the top bar) undo up to 100 steps, including opening a file or starting a new project. Typing in one field counts as one step. Inside a text field, Ctrl+Z undoes typing in that field.
- **Previous tool:** on first run, trays saved in this browser by `tool.html` are imported. Decision D9 removes its saved data afterwards (it held a 1.3 MB copy of the catalog); that is switched off by `REMOVE_PREVIOUS_TOOL_DATA` in `src/state/persistence.ts` until the release that replaces `tool.html`, so the old tool keeps its trays during the preview. Cables are matched by their old catalog row id; anything that cannot be brought across is listed. **Open** also accepts the previous tool's saved data as a file.
- **Trays:** reorder with Up and Down, Alt+arrow keys on a tray, or by dragging. **Compare trays** shows the chosen trays side by side with a small section of each.
- **Standards:** standard widths and heights, side clearance options and defaults for new trays belong to the project and travel in its file. **New** keeps them.
- **Catalog:** every row with all its values, checks and review decisions, filtered like the cable picker, including excluded rows. It shows the catalogue page the row came from, from the `pdfs` folder next to the app. Pages load only on request, because each catalogue is a large PDF, and browsers set to download PDFs get a link instead.
