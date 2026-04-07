---
name: career-ops-batch
description: Batch-evaluate multiple roles with Career-Ops. Use when the user wants to process many offers in parallel, run the batch inbox, resume batch state, or generate multiple reports and PDFs using the existing worker flow.
---

# Career-Ops Batch

1. Read `AGENTS.md`, `modes/_shared.md`, `modes/batch.md`, and `batch/batch-prompt.md`.
2. Reuse the existing batch runner and worker prompt; do not create a separate orchestration system.
3. Preserve the TSV addition flow for tracker writes.
4. After each batch of completed evaluations, run `node merge-tracker.mjs`.
5. Mark verification as unconfirmed when Playwright is unavailable in a batch-style path.
