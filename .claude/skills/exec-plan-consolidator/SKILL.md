---
name: exec-plan-consolidator
description: Consolidate and compress repository execution plans so docs/exec-plans stays useful instead of growing without bound. Use when asked to summarize, archive, prune, or clean up exec plans; when several related completed plans exist for one workstream; when more than one active plan exists for the same workstream; or when adding another plan would make docs/exec-plans noisy.
---

# Exec Plan Consolidator

## Overview

Keep one active plan per workstream when possible. Compress completed detail into a canonical summary before plan sprawl starts wasting navigation and context.

## Workflow

1. Inventory the current plan set.
   Run:
   ```bash
   python3 .claude/skills/exec-plan-consolidator/scripts/plan_inventory.py
   ```
   If the repository uses `.agents/skills` as the local path instead, run that copy of the same script. If the repository uses a different root, pass `--plans-dir`.

2. Decide whether to update, summarize, or archive.
   Apply these rules:
   - Prefer updating an existing active plan over creating a new one when the work is a continuation of the same workstream.
   - Consolidate when 3 to 5 related completed plans exist for one workstream.
   - Consolidate when more than one active plan exists for the same workstream.
   - Consolidate when adding one more plan would make `docs/exec-plans` materially noisier.

3. Keep execution context small.
   - Preserve only one active plan per workstream when possible.
   - Keep detailed step-by-step history only for work that is still being actively executed.
   - Move old detail out of the active surface once it no longer helps the next correct action happen.

4. Write the canonical summary.
   Create or update:
   - `docs/exec-plans/summaries/summary-<workstream>.md`

   Use the template in `references/canonical-summary-template.md`.

5. Run second-stage summary compaction when `summaries/` starts to sprawl.
   Apply these rules:
   - If several summary files are ordinary completed plans rather than true canonical summaries, merge them into a smaller number of rollup summaries.
   - Prefer thematic or date-bounded rollups such as `summary-<date>-<workstream>.md`.
   - Keep only the highest-signal summaries expanded; merge routine completed summaries into rollups.

6. Replace low-value archive detail with one compact pointer manifest when safe.
   Use this only when:
   - a canonical summary already preserves the key decisions, verification, open issues, and next steps
   - the archived files are low-value one-off execution detail

   In that case:
   - create one stub manifest such as `docs/exec-plans/archive/stub-manifest.md`
   - list the former filenames, replacement summary, and durable artifacts still worth keeping
   - remove the individual low-value archive files

7. Preserve durable information.
   Never lose:
   - key decisions
   - verification results
   - open issues
   - blockers
   - references to still-relevant artifacts

8. Verify the new structure.
   Re-run the inventory script and confirm:
   - the target workstream has one active plan at most
   - completed detail is represented in one canonical summary or rollup summary
   - archive detail count is lower after stub compaction when that mode was used
   - summaries and stubs still point to real durable artifacts

## Output Rules

- Prefer `docs/exec-plans/active/`, `docs/exec-plans/archive/`, and `docs/exec-plans/summaries/` if the repository is ready for that split.
- If the repository still uses a flat `docs/exec-plans/`, introduce archive and summary directories only as part of a real consolidation pass.
- Do not create a new plan file just to restate already-completed work that fits into an existing summary.
- Do not compress unresolved execution detail out of the currently active plan.
- Do not keep many ordinary completed plans in `summaries/`; merge them into fewer rollups.
- Do not keep many low-value one-off files in `archive/` once a stub manifest can preserve traceability more cheaply.

## Decision Heuristics

- Use filename tokens and the inventory script only as a starting point; confirm relatedness by reading the plan contents before merging.
- Treat several company-specific evaluations with the same broader campaign or workstream as candidates for one summary if the detailed files no longer need active tracking.
- Keep evaluation summaries concise. The summary should restore context quickly, not reproduce every progress log line.
- Treat single-job execution plans as prime candidates for stub-manifest compaction once their durable report artifacts are verified.
- Treat one-off completed summary files as rollup candidates when they do not need to remain individually navigable.

## Reference

- Summary template: `references/canonical-summary-template.md`
- Inventory helper: `scripts/plan_inventory.py`
