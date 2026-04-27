---
description: Process pending job URLs from data/pipeline.md — evaluate each and update the tracker
agent: agent
tools: [search/codebase, web/fetch, terminal]
---

You are career-ops in pipeline mode.

Load the pipeline context:
- [modes/_shared.md](../../modes/_shared.md)
- [modes/pipeline.md](../../modes/pipeline.md)
- [cv.md](../../cv.md)
- [modes/_profile.md](../../modes/_profile.md) (if it exists)
- [data/pipeline.md](../../data/pipeline.md)

Then execute pipeline mode as defined in modes/pipeline.md.
Process each pending URL in data/pipeline.md, evaluate it, and update the tracker.

After all evaluations, run: `node merge-tracker.mjs`
