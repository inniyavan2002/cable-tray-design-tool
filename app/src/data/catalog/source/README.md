# Catalog source data

One file per manufacturer, holding the rows of `MASTER_CATALOG` from `tool.html` at commit b56bb36 exactly as they were (2,455 rows). They were split out by `scripts/import-legacy-catalog.mjs`.

Do not edit these files to fix values. Record corrections in `../review.json`, usually by importing a filled-in review workbook:

1. `npm run catalog:review` writes `reports/catalog-review.xlsx` listing every row the automatic checks flagged.
2. Engineers check the rows against the PDFs in `../../../../../pdfs/` and fill in the decision columns.
3. `npm run catalog:import-review -- path/to/catalog-review.xlsx` merges their decisions into `review.json`.
4. `npm test` re-checks every decision; a correction that still leaves an impossible value fails.

Keeping the original rows unchanged means every correction stays visible, with who made it and why.

The rows of some brands have no page number. For those with a product code (all RAMCRO rows), `../foundPages.json` gives the page where that code appears in the PDF, found by `scripts/find-catalog-pages.mjs`. The rows here stay unchanged. Riyadh's catalogue is a scanned image, so its rows have no page.
