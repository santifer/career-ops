---
description: Batch-evaluate multiple offers in parallel
---

# /career-ops-batch

Arguments: `$ARGUMENTS` (list of URLs or path to a file with one JD/URL per line — e.g. `jds/batch-2026-04.txt`)

Load context:
1. `modes/_shared.md`
2. `modes/_profile.md`
3. `config/profile.yml`
4. `cv.md`

Read `modes/batch.md` and execute it.

**Antigravity note:** The original Claude Code batch uses `claude -p` workers. In Antigravity, parallelize via the Agent Manager — spawn N sub-agents (one per JD) using the personas from `.agents/agents.md`, each running `modes/oferta.md` on its assigned JD. Aggregate results into a single ranked table once all return.

**Output:** a ranked table of all N offers (company, role, global score, recommendation, red flags). Do NOT auto-generate PDFs or tracker entries — batch is for triage. User decides which winners get the full `/career-ops <JD>` pipeline next.
