---
name: career-ops-pipeline
description: Process queued job URLs from the Career-Ops inbox. Use when the user wants to work through data/pipeline.md, evaluate pending links, or turn the inbox into reports, PDFs, and tracker additions using the existing pipeline flow.
---

# Career-Ops Pipeline

1. Read `AGENTS.md`, `modes/_shared.md`, and `modes/pipeline.md`.
2. Treat `data/pipeline.md` as the inbox source of truth.
3. Reuse the normal evaluation, PDF, and tracker-addition flow for each pending URL.
4. Preserve tracker integrity by merging additions through `node merge-tracker.mjs`.
