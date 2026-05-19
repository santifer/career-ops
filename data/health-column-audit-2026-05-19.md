# Health Column Audit — 2026-05-19

**Audit by:** autonomous Claude Opus 4.7 instance
**Branch:** hotfix/sigma-blockers-and-cost-calc
**Hypothesis under test:** Health pill on the apply-now-queue reads from `data/role-enrichment/{NN}-{slug}.json → sentiment.team_toxicity_grade`, and most rows render "—" because the file is missing.

## Rendering path — CONFIRMED

`scripts/build-dashboard.mjs:1036–1078` defines `renderBenefitsCell(company, role)`:

1. Calls `getRoleEnrichment(company, role)` (`scripts/build-dashboard.mjs:559`) which:
   - First-pass: keys the map by lowercased `company|role` derived from the JSON's `company` / `role` fields (NOT filename).
   - Tolerant fallback: matches by company prefix + role-prefix-20 chars.
2. If no enrichment found OR no `sentiment`/`benefits` blocks: renders the empty-state chip `<span class="benefits-chip benefits-chip-empty …">—</span>` with a tooltip "No team-health or benefits data for this role yet…".
3. If found AND `sentiment.team_toxicity_grade` parses to integer 1–5: renders a colored pill with the grade + emoji.

**Key implication:** filename naming (`{rank}-{slug}.json`) is irrelevant to the renderer; only the JSON content's `company`+`role` field match matters. This means stale ranks in filenames do NOT break the renderer — only missing files / missing rows in the JSON dataset do.

## Data inventory — CONFIRMED MISMATCH

```
data/role-enrichment/*.json count = 24 (01-openai-... through 24-openai-policy-...)
data/apply-now-queue.json ranked array = 21 entries, last regenerated 2026-05-10
data/applications.md rows with score≥4.0 AND status in (Evaluated|Responded) = 17
```

The 21-row apply-now-queue.json is 9 days stale and contains roles whose status has since shifted to Discarded (e.g. queue rank 1 = #1509 OpenAI AI Deployment Engineer Media Partnerships → now Discarded). The dashboard's apply-now table is built directly from `applications.md` via `parseApplicationsFile()` → `apps.filter(r => r.score >= 4.0 && /^(evaluated|responded)$/i.test(r.status))` (`scripts/build-dashboard.mjs:3480`). It does NOT consult `apply-now-queue.json` for the rendered list — only for tiering decisions in refresh-master.

## Coverage map (live apply-now rows)

| # | Company | Role (truncated) | Enrichment? | tox |
|---|---|---|---|---|
| 44 | Anthropic | Communications Lead, Claude Code | ✓ 07-… | 2 |
| 48 | Anthropic | Engineering Editorial Lead | ✓ 05-… | 2 |
| 49 | Perplexity | Executive Communications Manager | ✓ 12-… | 2 |
| 1 | Anthropic | Communications Manager, Research | ✓ 14-… | 2 |
| 50 | ElevenLabs | Communications Manager | ✓ 13-… | 3 |
| 51 | OpenAI | Research Communications Manager | ✓ 22-… | 2 |
| **2059** | **Anthropic** | **Applied AI Architect, Industries** | **— MISSING** | — |
| **2110** | **Deepgram** | **Senior Developer Advocate** | **— MISSING** | — |
| **2198** | **OpenAI** | **AI Deployment Manager - Pilots** | **— MISSING** | — |
| **2104** | **Databricks** | **Sr Developer Advocate, Agentic Systems** | **— MISSING** | — |
| **2067** | **ElevenLabs** | **GTM Agentic Enablement Lead** | **— MISSING** | — |
| 851 | Mistral AI | Senior/Staff AI Developer Advocate | ✓ 11-… | 3 |
| 59 | Sierra | Developer Relations Engineer (SF) | ✓ 04-… | 2 |
| **2181** | **Mistral AI** | **Senior/Staff DevRel** | **— MISSING** | — |
| **2049** | **Ramp** | **AI Operations Specialist — Agentic Workflows** | **— MISSING** | — |
| 853 | Mistral AI | Developer Education Lead | ✓ 19-… | 3 |
| 854 | Pinecone | Staff Developer Advocate | ✓ 23-… | 2 |

**Coverage: 10/17 (58.8%) — 7 missing.**

## Refresh-master + launchd state — CONFIRMED

- `launchctl list | grep -iE 'refresh-master|enrich|role'` → returns 0 matches (the daemon plists exist but aren't loaded into the current GUI session).
- `ps aux | grep -E 'refresh-master|enrich-apply-now'` → 0 running processes.
- `scripts/launchd/com.mitchell.career-ops.refresh-master.plist` exists but is NOT currently loaded.
- No standalone launchd entry for `enrich-apply-now` exists — it shells out from refresh-master via `lib/refresh-cache-registry.mjs::role_enrichment.refreshHandler = 'node scripts/enrich-apply-now.mjs --ranks {rank}-{rank}'`.
- The `role_enrichment` cache entry pulls rows from `apply-now-queue.json`, so even when refresh-master fires it can only enrich rows that exist in that queue — meaning current rows like #2059 / #2110 / #2198 etc. will never get enriched by refresh-master in its current form.

## Script capabilities — VERIFIED + ONE PATCH NEEDED

`scripts/enrich-apply-now.mjs` accepts ONLY `--ranks=N-M`. It slices `data/apply-now-queue.json::ranked[N-1..M]`. There is no `--rows=NN,NN,NN` mode for sparse backfill from `applications.md`. The mission spec explicitly calls this gap out.

**Required patch:** add `--rows=2049,2059,2067,2104,2110,2181,2198` flag that pulls the row's `{num, company, role}` directly from `data/applications.md` and runs the same council enrichment.

## Root-cause classification

**`never_enriched`** — primary cause. The 7 missing rows have never had `scripts/enrich-apply-now.mjs` run against them. They were added (or promoted past the score floor) after the last manual `--ranks=1-25` run.

**Secondary issue (`pipeline_gap`):** even if refresh-master were running, its `role_enrichment` handler keys off `apply-now-queue.json` ranks. Since that file is stale + curated, new rows can never enter the refresh loop via this path. Must be fixed in Phase 3.

## Phase 2 action plan

1. Patch `scripts/enrich-apply-now.mjs` to accept `--rows=N,N,N` (read from `applications.md`).
2. Bump default budget cap from $5 to $15 (still well under the daily $80 cap).
3. Run: `node scripts/enrich-apply-now.mjs --rows=2049,2059,2067,2104,2110,2181,2198`.
4. Monitor verifier rejection rate. If > 30% blocked → STOP and refine prompt (NOT lower citation density threshold).
5. Estimated cost: 7 × $1.50 (registry estimate) = $10.50; actual token cost likely $1-2.

## Phase 3 action plan (durability)

1. Update `lib/refresh-cache-registry.mjs::role_enrichment.refreshHandler` to use `--rows={num}` (per-num) and `keyFromRow` that returns the live company-role slug, decoupling from stale queue ranks.
2. Add `scripts/health-column-liveness.mjs` that scans live apply-now rows and reports coverage to `data/health-column-coverage.json`.
3. Add `scripts/launchd/com.mitchell.career-ops.health-column-liveness.plist` firing at 04:30 PT.
4. Add `tests/health-column.test.mjs` regression test.

## Identity-lock checksums

| File | Status |
|---|---|
| `cv.md` | matched (8b2541a4d6c9a881ee922d2da9225229718ac053a604289b0f0d1da276b0bb89) |
| `modes/_profile.md` | not tracked |
| `config/profile.yml` | not tracked |
| `article-digest.md` | matched (6febc100bcc867c461b4eb3b083004b4656a07391604b1327e056f216ac99c6d) |

No drift. Safe to proceed.
