# Data Context

`data/` is user layer. It stores live job-search state.

`applications.md` is the tracker. Do not add new application rows directly. For new evaluations, write a TSV file to `batch/tracker-additions/` and run `node merge-tracker.mjs`. You may edit existing rows to update status, notes, or corrections.

`pipeline.md` is the inbox of pending job URLs or local JD references. Preserve user ordering and comments when possible.

`scan-history.tsv` is scanner dedup history. Do not clear it unless the user explicitly asks to rescan everything.

Statuses in `applications.md` must match `templates/states.yml`. Run `node verify-pipeline.mjs` after tracker changes.
