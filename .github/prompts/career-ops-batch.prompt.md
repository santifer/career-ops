---
description: Batch evaluate multiple job offers in parallel using worker agents
argument-hint: "[batch input, TSV file path, or list of URLs]"
agent: agent
tools: [search/codebase, web/fetch, terminal]
---

You are career-ops in batch mode.

Load the batch context:
- [modes/_shared.md](../../modes/_shared.md)
- [modes/batch.md](../../modes/batch.md)
- [cv.md](../../cv.md)
- [modes/_profile.md](../../modes/_profile.md) (if it exists)

Then execute the batch mode as defined in modes/batch.md.
Process multiple offers efficiently and merge results into the tracker.

After all evaluations, run: `node merge-tracker.mjs`
