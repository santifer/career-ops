# Autonomous Build Day Plan — 2026-05-17 (evening continuation)

**Session start:** 12:25 PT Sunday 2026-05-17
**Orchestrator:** Claude Opus 4.7
**Budget remaining at start:** ~$44 of $50 MONTHLY_BUDGET_USD (morning session spent ~$5.77; ~$0.01 spent on council probe just now)
**Today is Sunday** — the Tier B #9 launchd plist would fire tonight at 21:00 PT if shipped today. That's the forcing function for ordering.

---

## Pre-flight (all 6 green at 12:30 PT)

| Test | Result |
|---|---|
| `node scripts/build-dashboard.mjs` | ✅ 137 evals, 16 apply-now, 38 pipeline pending |
| `node scripts/heartbeat.mjs --preview` | ✅ 68,438 bytes (under 102KB Gmail clip) |
| `npm run skill-ingest:dry-run` | ✅ 18,310-byte prompt, all 9 required fields present |
| `npm run apply-orchestrator:test` | ✅ Row 50 ElevenLabs, 6 gates, ai_policy_slug=elevenlabs |
| `node scripts/tpgm-tracker.mjs --json` | ✅ JSON clean, evidence array empty (expected pre-first-ingest) |
| `lib/council.mjs` probe `openai:gpt-5` | ✅ Returns "2026" in 1024ms, passes date-anchor |

No blockers. Proceed.

---

## Today's priority order

### Wave 1 (NOW — 3-way parallel subagent fan-out, worktree-isolated)

| # | Tier | Item | Subagent | Files |
|---|---|---|---|---|
| A | Tier A #1 | TanStack Table v8 headless on All Evaluations table | sonnet | `scripts/build-dashboard.mjs`, `package.json`, inline JS |
| B | Tier A #2 | SSE migration via Cloudflare Workers Durable Object + EventSource client + polling fallback | sonnet | `dashboard-server.mjs`, dashboard inline JS, optional worker stub |
| C | Tier A #3+#4 | MJML email rebuild + RFC 6068 mailto: deeplinks in Outreach Cadence | sonnet | `scripts/heartbeat.mjs`, `templates/heartbeat.mjml`, `package.json` |

**Rationale for fan-out:** All three are independent file scopes. #3 and #4 are merged into one subagent because both touch `scripts/heartbeat.mjs` and the MJML rebuild is where the mailto: links naturally land. Within 5-concurrent cap. All worktree-isolated → no merge conflicts.

### Wave 2 (after Wave 1 returns)

**FIRST:** Tier B #9 — Sunday 21:00 PT launchd plist for `scripts/skill-ingest.mjs --apply --week current`. Forcing function: tonight is Sunday. If we don't ship the plist today, the first auto-fire slips a week. Pattern: copy heartbeat plist from `data/launchctl-commands.md`. Trivial scope — ~30 minutes.

**THEN — parallel Wave 2 subagent fan-out:**

| # | Tier | Item | Subagent | Files |
|---|---|---|---|---|
| D | Tier B #5 | Wire TPgM widgets into `build-dashboard.mjs` (overview) + `heartbeat.mjs` (Monday section) | sonnet | `scripts/build-dashboard.mjs`, `scripts/heartbeat.mjs` |
| E | Tier B #6 | Extract 5 sub-agent stubs to `scripts/agents/{cv-tailor,cover-letter,why-statement,linkedin-dm,form-fields}.mjs` with uniform contract | sonnet | `scripts/agents/*.mjs` (new), `scripts/build-apply-orchestrator.mjs` |
| F | Tier B #7 | HM-intel deterministic weighting layer (`Score = α·SIM + β·HM_bias − γ·AI_risk` BEFORE LLM) | sonnet | `lib/hm-weighting.mjs` (new), `data/hm-intel/_weights.json` |

### Wave 3 (after Wave 2 returns — live-mode flip)

- **Tier B #8: cv-tailor live-mode wiring.** Load `cv.md` + `article-digest.md` → GPT-5.5 reasoning_effort: medium → Zod-validate → write `data/apply-packs/{N}-{slug}/cv-tailored.md` → run `humanize-check` → mark gate. Target row: **50 (ElevenLabs Comms Manager)** since the orchestrator scaffold already validates against it. Cost target: ~$0.05–0.10/run.

### Deferred to next build day (Tier C polish)

Items 10–15 from the master prompt (Mission Control consolidation, CSP hardening, token adoption refactor, dark-mode email CSS, voice-fidelity calibration, @google/genai SDK migration) — none are blockers. Token + dark-mode are best done after MJML lands. CSP needs explicit Mitchell sign-off (touches Cloudflare config).

---

## Quality gates (BEFORE every commit, no exceptions)

1. `node --check` on every changed `.mjs`
2. Re-run the relevant subset of the 6 pre-flight tests
3. `node scripts/humanize-check.mjs` on any AI-drafted prose touching corpus (cv.md, story-bank.md, article-digest.md, cover letters)
4. `node scripts/verify-pipeline.mjs` if pipeline files changed
5. **Commit only via `node scripts/agent-commit.mjs --agent {name} --files "..." --message "..."`** — never raw `git commit`
6. Append SHA + summary to `data/build-day-log-2026-05-17.md` immediately after each commit

---

## Budget envelope for the rest of today

| Bucket | Estimate | Running total |
|---|---|---|
| Wave 1 subagents (3× ~$0.30 ea) | ~$0.90 | $0.90 |
| Wave 2 subagents (3× ~$0.30 ea) | ~$0.90 | $1.80 |
| Wave 3 cv-tailor live-mode probe (1 row) | ~$0.10 | $1.90 |
| Cushion / retries / Plan agents | ~$1.00 | $2.90 |
| **Total today (evening session)** | **~$2.90** | |
| **Cumulative today (morning + evening)** | **~$8.67 of $50** | |

Well within budget. No `MONTHLY_BUDGET_USD_BURST` needed.

---

## Hourly log discipline

Append one line per commit (or significant milestone) to `data/build-day-log-2026-05-17.md` using the format:

```
[HH:MM PT] [tier-X #N] [SHA prefix] {what shipped} — {next}
```

---

## Definition of done (for tonight's session)

**Minimum (Tier A complete):** Items #1 (TanStack scaffold), #2 (SSE + fallback), #3 (MJML), #4 (mailto: deeplinks) all merged + all 6 pre-flight tests pass at session end + build log entries written.

**Stretch (Tier B complete):** Items #5–#9 merged + Sunday 21:00 PT plist installed + first cv-tailor live-mode call (#8) ships against row 50.

**End-of-day deliverable:** `data/build-day-summary-2026-05-17-evening.md` mirroring the shape of the morning summary (headline, commit chain table, ship vs defer, budget audit, files added/modified, known issues, acknowledgments).

---

## Guardrails (immutable)

- **NO `git push` to any remote.** Never autonomous; Mitchell's call.
- **NO outbound (email / LinkedIn DM / GitHub PR / app submission).**
- **NO touching santifer upstream.**
- **NO budget raise** — `MONTHLY_BUDGET_USD` stays at $50; `MONTHLY_BUDGET_USD_BURST` stays unset.
- **NO edits to `writing-samples/voice-reference.md`** — calibration ground truth, read-only this session.
- **NO skipping `humanize-check`** on AI-drafted text into corpus.
- **NO raw `git commit`** — `scripts/agent-commit.mjs` only.
- **Edits to System-Layer files** (modes/_shared.md, AGENTS.md, CLAUDE.md, update-system.mjs targets) — only via the documented `update-system.mjs` path; otherwise out of scope tonight.

---

Beginning Wave 1 dispatch now.
