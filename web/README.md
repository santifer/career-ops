# Career-Ops Dashboard (static HTML)

A single-file, zero-server dashboard for browsing reports, tracker, pipeline,
and scan history. Opens directly in your browser from `file://` — no build tool,
no runtime, no network dependency after the first load.

## Usage

```bash
npm run dashboard       # regenerate web/index.html from data files
open web/index.html     # macOS: open in default browser
```

Or double-click `web/index.html` in Finder.

## What it shows

| Tab           | Source                       | Features                                   |
|---------------|------------------------------|--------------------------------------------|
| Apply Next    | `data/applications.md` + `reports/*.md` | Priority shortlist, selective shortlist, local completion marks |
| Reports       | `reports/*.md`               | Filter, select, render Markdown in panel   |
| Tracker       | `data/applications.md`       | Filter, status dropdown, sortable columns  |
| Pipeline      | `data/pipeline.md`           | Filter, done/pending toggle                |
| Scan History  | `data/scan-history.tsv`      | Filter, portal dropdown, sortable columns  |

## How it works

1. `build-dashboard.mjs` reads all four data sources.
2. The parsed data is inlined as `window.DATA = {...}` inside `template.html`.
3. The filled template is written to `index.html`.

The `Apply Next` tab also stores a local completion marker in browser
`localStorage`. That marker is a dashboard convenience only; canonical tracker
state still lives in `data/applications.md`.

Because data is embedded inline, the page works under the `file://` protocol
without CORS issues — no local server required.

Report Markdown is rendered client-side with [marked](https://marked.js.org/)
and sanitised through [DOMPurify](https://github.com/cure53/DOMPurify).

## Regenerating

Run `npm run dashboard` after:

- new evaluation reports (reports/*.md)
- `node merge-tracker.mjs` runs (applications.md updates)
- scanner runs (scan-history.tsv updates)

To auto-regenerate, append the command to `merge-tracker.mjs` or to your
scan cadence.
