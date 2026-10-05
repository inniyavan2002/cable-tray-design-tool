# Product website

The website at the repository's address: one page that presents the app, shows where cable trays run in a building, explains how the app sizes trays, links the catalogues and sample reports, offers the offline package and takes messages. It replaces the old `index.html` at the release.

## How it is built

React, Tailwind CSS and Framer Motion, built by Vite into `dist-site/`. The site has its own dark navy theme, defined as tokens in `site.css` (the app keeps its own look); it uses the app's IBM Plex fonts and the app's colours for the section drawing. The page needs JavaScript; without it, a short fallback in `index.html` links to the app, the download and a sample report.

| File | What it is |
| --- | --- |
| `index.html` | The page shell: head tags and the no-script fallback. `{{name}}` placeholders there are filled at build time by `template.ts`; an unknown name stops the build. |
| `main.tsx`, `components/` | The page, one component per section: `Hero`, `Metrics`, `Features`, `Showcase`, `Workflow`, `Screens`, `Content` (method, catalogues, download, questions), `Contact`, `Footer`. |
| `components/building/` | The isometric building drawing used by the hero and the showcase. `geometry.ts` computes it once as SVG paths; `Building.tsx` draws it and lets a view bring one system forward. |
| `components/network/` | The live electrical network on the sheet behind the hero. `layout.ts` places it on the grid from measurements of the hero, leaving out whatever has no room; `Network.tsx` measures and draws it. |
| `components/loop.tsx` | The one pause control for every looping animation on the page. |
| `components/TrayDrawing.tsx` | Tray TR-03's section exactly as the app draws it, from `facts.json`. |
| `data.ts` | Where the page reads its figures (`facts.json`) and addresses (`site.config.json`). |
| `feedback.ts` | Sending feedback and saying truthfully whether it arrived. |
| `facts.json` | Every figure the page quotes, including trays T2's and T3's section geometry from the app. Written by `npm run site:facts`; a unit test fails when it no longer matches the app. |
| `site.config.json` | Addresses and optional details, below. |
| `images/`, `public/og-image.png` | Screenshots of the app in its dark theme, written by `npm run site:screenshots`. |

## Design rules

The site follows the installed Taste skill (`.agents/skills/design-taste-frontend`) with the direction chosen for it: dark navy, one electric-blue accent, cyan only for current flowing in the building drawing, and frosted glass only on the navigation and overlays. Controls have 8 px corners and cards 14 px. Every text colour meets WCAG AA on every background it sits on (the contrast is noted in `site.css`).

- The hero holds one label, a two-line headline, a subtext under 20 words and two buttons.
- Sections have no label above their heading, and each section uses a different layout.
- One label per action everywhere: "Open the app", "Download for offline use".
- No em or en dashes, at most one middle dot per line, and no version labels except in the download panel.
- Every figure comes from the app (`facts.json`). The building is an illustration and says so; its tray labels quote the sizes the app selects for the example project. There are no invented services, projects, customers or statistics.

## Motion

Motion explains the electrical design: how power moves through a building, how a tray is sized, how the catalogue is checked and how reports come out. Nothing moves for decoration. Transitions take 200 to 600 ms. Looping motion runs only while it is on screen, one **Pause animation** button (in the hero and the showcase) stops all of it (WCAG 2.2.2), and nothing moves when the device asks for reduced motion. Phones keep the current flowing and drop the rest.

- **Hero on load:** the headline rises and is uncovered, then the building builds itself from the main board's level up. Power, then lighting, then fire alarm connect in turn, their routes drawing themselves, and the legend under the drawing names each as it comes on. The labels' leader lines draw out, titles type on and figures count up to the app's values; the status badge comes in last.
- **The live system:** power arrives at the main board and particles, each a pulse with a short fading tail, travel every power route from it, up the riser, into each level's board and out along the trays and branches. Each level runs at its own pace, and lighting (amber, longer dashes) and fire alarm (red, a double blip) circuits run on their own, slower. A light runs up the riser and each level's joint lights as it passes; every nine seconds a scan runs along TR-01, TR-02 and TR-03 in turn, lighting each tray and its label. Just before the scan reaches a tray, the tray's circuit lights from the main board, up the riser and through its level's board, and as the scan passes, the fill meter in the tray's label empties and measures up to the app's figure against the 40% limit. Connection points pulse now and then; the main board's indicator lights blink and its label steps through its status (the animation's state, not a real installation's). Measurement callouts re-measure every ten seconds, counting up to the app's figure. The model sways on two slow, unrelated periods (about 1.5 degrees of turn and a few pixels of rise), and tilts at most about 2.5 degrees towards the mouse, with its layers at different depths.
- **The network behind the hero:** on screens 1024 px wide and up, a faint electrical network runs on the drawing sheet's grid in the space the text and drawing leave: power, lighting and fire alarm along the top, a feeder beside the text, the supply under it, which turns up into the drawing's supply cable, and a power line that drops into the top of the riser. It draws itself once the drawing has built, so the eye goes from the text to the drawing to the network. Pulses travel each circuit slowly, connection points ring now and then, and tags and tray TR-02's readout quote the app's figures (the readout's fill and cable count measure afresh every twelve seconds). It moves with the grid when the mouse moves, its data a little more. Its circuits fade towards the sheet's edges by their strokes' gradient, and what moves on them is HTML moved by transform and opacity only, so the network repaints nothing as it runs.
- **Hover in the drawing:** hovering a label or the tray or board it names lights that part, runs its outline like a selection in a model viewer, sets the rest of the drawing back, and lists the part's figures: fill, cables and cable weight per metre for a tray, as the app works them out for the example project (tray load is not something the app calculates).
- **Scrolling out of the hero:** the model sinks back and dims, the grid moves at its own speed, and the text lifts away.
- **Features:** the features are the app's workflow for one tray, TR-02 (T2), wired in the order the app works: catalogue validation, cable input, cable calculation, sizing and fill check, drawing, and the PDF and Excel report. While on screen, each stage runs in turn and passes its result along a wire to the next, a spark running ahead and the wire staying lit; after the last, the run holds, then starts again, each stage keeping its last result until it runs afresh. The catalogue's manufacturers send their rows into the verified catalogue, whose ring closes as the counts climb; TR-02's 20 cables come in; the calculation counts up line by line; the fill of 300 × 50 climbs past the 40% limit, the tray grows to 300 × 75 and the fill settles at 34.3%; the section is laid as the app draws it; and the report, workbook and drawing are produced and checked off. Each stage says what it is doing (INPUT, CALCULATING, CHECKING, VERIFIED, REPORT READY). Hovering a stage lifts it and shows its figure and a little more of its working, such as the tray's dimensions and required size, or the drawing's zone widths. The sheet behind drifts slowly the way the work flows. With reduced motion every stage shows its result at once.
- **Showcase:** each view brings one system forward (cable trays, power, lighting, fire alarm, architecture), and its routes draw themselves when the showcase scrolls into view and again on each change. The cable tray view lays TR-03's cables one by one as the app draws the section, while its fill climbs by each cable's own share of the area and stops at the app's 20.8%. The power view adds the main board as a single-line diagram: its feeders and breakers draw themselves, then current runs along each.
- **Workflow:** the line fills as the section scrolls through the screen, each step lights as the line reaches it, and light runs along the lit part.
- **Method:** tray T2's calculation runs step by step: cable selection, size check (the required size counts up), tray fill (300 × 50 fills past the 40% limit, then 300 × 75 fills to 34.3%), standard tray (300 × 50 struck through for 300 × 75) and the result. The formulas then write themselves line by line and the worked example's rows follow.
- **Catalogues:** the rows come in under a scan, and each manufacturer's checks go from queued to checking to validated as it passes.
- **Download:** each sample report is produced in turn: a bar fills under its icon, the icon comes up, and a check marks it done.
- **Buttons, navigation, headings, screens:** buttons lift and glow a little on hover with a light passing across the primary one; navigation links underline and the section being read is marked; section headings rise out of their line; screenshots are revealed as they scroll in.

The browser tests check that the pause stops everything (including the SVG particles), that loops stop off screen, that everything is complete and still at once with reduced motion, that hovering a label lights its tray, that T2's steps end on its result, that TR-03's fill stops at the app's figure, that every manufacturer is validated, and that the counters land on the right values.

## Icons

Icons are from Lucide (`lucide-react`, ISC licence).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev:site` | Work on the page with live reload (the app and PDFs are only there after `build:site`) |
| `npm run site:facts` | Rewrite `facts.json` after the catalog, the defaults or the report layout change |
| `npm run site:screenshots` | Retake the screenshots after the app's screens change (run `npm run build:single` first). They are taken with reduced motion, so every view is captured settled. |
| `npm run build:site` | Build the page and the app, and assemble everything GitHub Pages serves in `dist-site/`. Needs the sample reports from `npm run test:e2e`. |
| `npm run verify:site` | Check that every link opens with its exact file name, nothing loads from other sites, and the page stays within its weight budget |
| `npm run test:site` | Browser tests of the assembled site, including an accessibility scan in both themes |

`dist-site/` holds the page, the app in `app/`, one copy of the catalogues in `pdfs/` (the app opens them from `../pdfs/`), the sample reports in `samples/`, the old tool at `previous/tool.html`, and a `tool.html` that forwards old bookmarks to the app.

## site.config.json

| Setting | Use |
| --- | --- |
| `siteUrl` | The public address, used for link previews. Confirm it before launch. |
| `repository` | Links to the source and release notes. |
| `downloadUrl` | Where the offline package is downloaded from: the latest GitHub Release. |
| `feedbackEndpoint` | The Google Apps Script that receives feedback. |
| `publisher` | Shown in the footer when set. |
| `contactEmail` | Shown beside the contact form when set. |

## Feedback script

The contact form sends to the same script as the old page's feedback form. It says "Sent" only when the script confirms it. Until the script replies with a result, the page tells people it could not confirm that their message arrived. Whoever owns the script can add the reply at the end of `doPost`:

```js
function doPost(e) {
  const message = JSON.parse(e.postData.contents);
  // … the existing code that saves the message …
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
```

If saving fails, reply with `{ "ok": false }` instead. Besides `name`, `organisation` (the form's Company field) and `feedback`, messages now carry `email` (optional, for a reply), `version` (the app version) and `source` (`"website"`). The script must save `email` too, or replies cannot be sent.
