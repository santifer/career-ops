# Batch Context

`batch/` contains batch evaluation prompts, runner scripts, logs, state files, and tracker addition TSVs.

For a new evaluation row, write one TSV file under `batch/tracker-additions/` and then run:

```bash
node merge-tracker.mjs
```

TSV column order is:

```text
num date company role status score pdf report notes
```

The TSV uses status before score. `data/applications.md` displays score before status. The merge script handles this swap.

Do not manually duplicate existing company+role rows. If the application already exists, update the existing tracker row instead.

After a batch, run:

```bash
node merge-tracker.mjs
node verify-pipeline.mjs
```
