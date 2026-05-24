# yash-resume-pipeline sub-5-minute design

**Date:** 2026-05-13
**Status:** Approved by user (brainstorming phase). Ready for writing-plans handoff.
**Goal:** Bring the per-URL `/yash-resume-pipeline` wall-clock from a typical 7-10 min down to under 5 min, without touching the locked V2.0 resume prompt, the locked cover-letter prompt, or `cv.md`.

## Background

Today's instrumented run (Scribd, 2026-05-13):
- `total_ms` = 399,061 (≈6m 39s) — wall clock reported by the CC-CLI session was 7m 31s.
- Phase split: jd_fetch 17.7s · resume_gen 43.4s · resume_compile 10.3s · cl_gen 17.2s · cl_compile 9.7s.
- Untracked overhead (LLM thinking between tool calls, pre-flight, summary formatting) ≈ 50s.

Past 10-run log (`data/yash-resume-runs.log`):
- `total_ms` ranges 399s – 1,140s (Accenture had a 460s tectonic hang; ignoring it the range is 399-626s).
- `resume_gen_ms` is the dominant cost (median 218s, range 43-305s).
- Today's 43s outlier happened because all 15 bullets validated on the first pass. Past 200-300s figures reflect 3-5 cycle char-band iteration.

## Out-of-scope

These files are **locked** and not touched by this design:

- `resume-optimization-system-based-on-job-description.md` (V2.0 prompt, ~1090 lines)
- `cover-letter-system-based-on-jd-and-resume.md` (CL prompt, ~200 lines)
- `cv.md` (Yash canonical CV)
- `scrapling_fetch.py` and `.venv/`
- `generate-pdf-latex.mjs`
- Other pipeline modes: `auto-pipeline`, `pipeline`, `shivani-resume-pipeline`

## Approach (chosen via brainstorming)

| Decision | Value |
|---|---|
| Orchestration runtime | **Claude Code CLI** (no external API, no headless subprocess) |
| Refactor scope | Minimal parallelization + bundled timestamps + plan-bullets table phase |
| Bullet-validation retry budget | **1 retry max**, then ship with deficiency log |
| E2E test approach | Fixture-based smoke test (no LLM, no network) |

Rejected alternatives (recorded for posterity):

| Alternative | Why rejected |
|---|---|
| Anthropic API direct calls | Adds API-key dependency and $0.05-0.10/run cost. User wants zero new deps. |
| Headless `claude -p` subprocess | Subprocess context-switch overhead negates much of the win. |
| Unlimited bullet retries | Current behavior — produces 200-300s `resume_gen_ms` on hard JDs. |
| Strict one-shot bullet gen (no retry) | Throws away salvageable runs. Too brittle. |
| Live integration test on every CI run | Slow (~5 min); depends on third-party job-board uptime. |
| Incorporating `ChristopherKahler/carl` | Designed for rule injection, not pipeline throughput. Would add per-turn context-loading overhead. |
| Incorporating `multica-ai/andrej-karpathy-skills` | Meta-`CLAUDE.md` with "Think Before Coding" principle that biases Claude toward asking more clarifying questions — opposite of what a deterministic pipeline wants. |
| Incorporating `safishamsi/graphify` | Knowledge-graph indexer for codebases. Our pipeline reads 3 locked files; there's nothing to graph. PreToolUse hook would conflict with the existing `claude-mem` hook we already work around. |

## Architecture

The pipeline stays a 13-step single-URL loop in `modes/yash-resume-pipeline.md`. Three changes:

1. **Bundle 6 separate `date +%s.%N` Bash calls** into two Node subcommands: `init-timer <url>` (writes a JSON state file with all start markers) and `mark-phase <phase>` (stamps end times). Cuts ~10-15s of shell round-trips.
2. **Reorder steps 9 and 9b** so `compile-resume` launches in the background while CL LLM gen + CL .tex write + CL compile run. A wait-barrier before step 10 ensures both have finished.
3. **Insert step 7a "plan-bullets"** between step 7 (apply V2.0 prompt internally) and step 8 (write .tex): Claude drafts the 15 bullets in a markdown table, runs `tools/validate_bullets.py` against the table once, fixes anything outside 220-230 in-context, runs validator a second time max, then writes .tex with whatever bullets are best at that point. **No more than two validator calls per URL.**

### Flow diagram

```
preflight (cat x3, init-timer)  ──┐
   │                              │
   ▼                              │
JD fetch (scrapling)              │
   │                              │
   ▼                              │
slugify + dup check               │
   │                              │
   ▼                              │
JD .md write                      │
   │                              │
   ▼                              │
[7]  apply V2.0 → 15 bullets      │
   │                              │
   ▼                              │
[7a] plan-bullets table           │  ← NEW: validate ≤2 passes, ship
   │                              │
   ▼                              │
[8]  write resume .tex            │
   │                              │
   ├──→ [9] compile-resume  ──┐   │  ← runs in BG
   │                          │   │
   ▼                          │   │
[9b] CL LLM gen               │   │
   │                          │   │
   ▼                          │   │
[10b] write CL .tex           │   │
   │                          │   │
   ▼                          │   │
[11b] compile CL              │   │
   │                          │   │
   ▼                          │   │
[10] resume sidecar log ◄─────┘   │  ← wait barrier
   │                              │
   ▼                              │
[12b] CL sidecar log              │
   │                              │
   ▼                              │
[11] mark-processed + log ◄───────┘
```

## Components

### Modified files

| File | Change | Approx delta |
|---|---|---|
| `modes/yash-resume-pipeline.md` | Add step 7a (plan-bullets), reorder 9 to BG, replace `date +%s.%N` with `init-timer` / `mark-phase`. | ~80 lines |
| `yash-resume-pipeline.mjs` | Add three subcommands: `init-timer --url <url>`, `mark-phase --phase <name>`, `read-timer`. Timer state in `/tmp/yash-pipeline-timer-<pid>.json`. | ~70 LOC added |
| `AGENTS.md` | Update the "Yash Resume Pipeline" section to mention the plan-bullets phase and `tests/e2e-smoke.mjs` entry point. | ~5 lines |

### New files

| File | Purpose | Approx size |
|---|---|---|
| `tools/validate_bullets.py` | Reads JSON `{M1:"...",...,V4:"..."}` (plain visible-text strings) from stdin. Prints `{pass:bool, fails:[{id,len,direction:"low"\|"high"}]}` to stdout. Extracts the LaTeX-strip + 220-230 band check from today's `/tmp/validate_*_bullets.py` ad-hoc scripts. | ~50 LOC |
| `tools/validate_skills.py` | Reads `{cat:{text,cap},...}` JSON, returns pass/fails. | ~30 LOC |
| `tests/e2e-smoke.mjs` | Fixture-based end-to-end smoke runner. ~30s total runtime. | ~120 LOC |
| `tests/fixtures/scribd-jd.json` | Cached scrapling-shaped response from today's real run. | ~12 KB |
| `tests/fixtures/scribd-bullets.json` | 15 plain-text bullets from today's run, in-band. | ~5 KB |
| `tests/fixtures/scribd-skills.json` | 6 skill categories with caps + text. | ~1 KB |
| `tests/fixtures/scribd-resume.tex` | Verbatim from today's `/tmp/.../Resume_2026-05-13.tex`. | ~5 KB |
| `tests/fixtures/scribd-cover-letter.tex` | Verbatim from today's `/tmp/.../Cover_Letter_2026-05-13.tex`. | ~3 KB |

### Public CLI surface added

```bash
node yash-resume-pipeline.mjs init-timer --url <url>
node yash-resume-pipeline.mjs mark-phase --phase <name>
node yash-resume-pipeline.mjs read-timer
python3 tools/validate_bullets.py < bullets.json
python3 tools/validate_skills.py < skills.json
node tests/e2e-smoke.mjs
```

Backwards-compatible: every existing subcommand (`next-pending`, `slugify`, `check-duplicate`, `compile-resume`, `compile-cover-letter`, `mark-processed`, `log`, `mark-failed`, `mark-skipped`) keeps the same signature.

## Timing budget

| Step | Phase | Old (median) | New (target) | Saving |
|---|---|---|---|---|
| 0 | Pre-flight (`cat` x3) + `init-timer` | ~12s | ~8s | 4s |
| 3-4 | JD fetch (scrapling) | 17s | 17s | 0 |
| 5 | slugify + check-duplicate | 3s | 3s | 0 |
| 6 | JD .md write | 5s | 5s | 0 |
| 7 + 7a | Resume gen + 2-pass validation | ~218s | ~90s | ~128s |
| 8 | Write `.tex` | 3s | 3s | 0 |
| 9 + 9b parallel | `compile-resume` (BG) ‖ CL LLM gen | 56s | 46s | 10s |
| 10 + 10b | resume sidecar log + CL .tex write | 5s | 5s | 0 |
| 11b | compile CL | 10s | 10s | 0 |
| 12b | CL sidecar log | 2s | 2s | 0 |
| 11 | `mark-processed` + `log` + `read-timer` | 5s | 5s | 0 |
| **Total tracked** | | **~370s** | **~225s** | **−145s** |
| Untracked LLM overhead | | ~80-130s | ~50-80s | ~30-50s |
| **Wall-clock total (typical)** | | **~450-500s (7.5-8.3 min)** | **~275-305s (4.6-5.1 min)** | |
| **Wall-clock total (best)** | | **~399s** | **~240s (4.0 min)** | |
| **Wall-clock total (hard JD)** | | **~600s** | **~340s (5.7 min)** | Hard JD may exceed 5 min on first try. Acceptable. |

## Failure handling

| # | Failure | Behavior |
|---|---|---|
| 1 | Bullet validation pass 1 fails | Claude trims/expands named bullets in-context; runs validator pass 2. |
| 2 | Bullet validation pass 2 fails | Write `.tex` anyway. Sidecar log: `status: compiled-review-recommended` with `deficiencies:` listing each out-of-band bullet ID + length. `log` JSONL records a reduced `--score` (e.g. 92 if one bullet is over). Resume PDF still ships. URL marked processed. Does **not** count toward the 3-consecutive-failures stop condition. |
| 3 | Skills section overflow | V2.0 hard-fail (unchanged). `mark-failed --reason "skills overflow"`. Counts as a hard failure. |
| 4 | `compile-resume` background process fails | Wait-barrier captures non-zero exit. `mark-failed --reason "tectonic: <log tail>"`. If `compile-cover-letter` (running in parallel) already produced a PDF, delete it via `rm -f` to avoid orphan artifacts. URL stays unchecked in queue. |
| 5 | `compile-cover-letter` fails | Same as today — cover letter is best-effort. Resume PDF + sidecar ship. URL still marked processed. CL log: `status: failed`. Does **not** count toward backoff. |

### Edge cases introduced by parallelization

**A — wait-barrier orphan cleanup.** If `compile-resume` is still running when CL pipeline finishes and resume then fails, the already-compiled CL PDF is orphaned. Behavior: `rm -f cover-letters/yash/<slug>_Cover_Letter_<date>.pdf` and the matching `.log`. Keeps the output dirs clean (same invariant as today's spec).

**B — timer state file contention.** `init-timer` writes `/tmp/yash-pipeline-timer-<pid>.json`. Concurrent sessions in different terminals get distinct PIDs. Stale files from crashed sessions are overwritten by the next `init-timer` call. No locking needed.

### Invariants preserved (unchanged from today)

- The 3-consecutive-failures stop condition. A bullet-band soft failure does **not** count.
- The Read-tool ban on locked prompts. Pre-flight `cat` only.
- The zero-claude-mem-MCP rule inside the URL cycle.
- The "no LaTeX = hard failure" rule for V2.0 prompt output (SENTENCE_COUNT_ERROR, SKILLS_OVERFLOW_ERROR).

## E2E test plan

**Entry point:** `node tests/e2e-smoke.mjs`. Target runtime under 90s. No LLM, no network.

### Steps and assertions (each step gates the next)

| # | Action | Pass condition |
|---|---|---|
| 1 | `init-timer --url <fixture-url>` | Returns `{status:"ok"}`; `/tmp/yash-pipeline-timer-<pid>.json` exists |
| 2 | `slugify --company "Scribd" --role "Software Engineer II Backend Data pipelines"` | Returns `{company_slug:"Scribd", role_slug:"SoftwareEngineerIiBackendDataPipelines", date:"<today>"}` |
| 3 | `check-duplicate --company-slug Scribd-Test --role-slug SmokeTest --date 2026-05-13` | Returns `exists:false` (test uses `-Test` slug suffix to avoid collision with real runs) |
| 4 | Write JD fixture to `jds/yash/JD_Scribd-Test_SmokeTest_Yash_Anghan_2026-05-13.md` from `tests/fixtures/scribd-jd.json` | File exists with frontmatter + body |
| 5 | `python3 tools/validate_bullets.py < tests/fixtures/scribd-bullets.json` | Returns `pass:true` |
| 6 | `python3 tools/validate_skills.py < tests/fixtures/scribd-skills.json` | Returns `pass:true` |
| 7 | Copy `tests/fixtures/scribd-resume.tex` to `/tmp/Scribd-Test_SmokeTest_Yash_Anghan_Resume_2026-05-13.tex`, then `compile-resume` | Returns `status:"ok"`; PDF exists; `pypdf` reports `pages == 1`; size > 20 KB |
| 8 | `mark-phase --phase resume_compile` | Returns `{status:"ok"}`; timer state updated |
| 9 | Copy + compile CL fixture | PDF exists, 1 page, size > 15 KB |
| 10 | Write resume + CL sidecar logs to `resume-logs/yash/` and `cover-letter-logs/yash/` | Both files exist with `status: compiled` |
| 11 | `read-timer` | Returns valid JSON with all 5 phase ms values populated |
| 12 | **Cleanup** (in `finally`): delete 4 test PDFs, 2 test logs, 1 test JD, and any `Scribd-Test_SmokeTest` entry that snuck into `data/yash-resume-runs.log` | All test artifacts removed; no residue in `resumes/yash/`, `cover-letters/yash/`, `resume-logs/yash/`, `cover-letter-logs/yash/`, `jds/yash/` |

### What the smoke test does NOT cover

- The LLM-side plan-bullets retry loop (model behavior; not testable without an LLM call).
- Live scrapling fetch (covered by manual real-URL validation post-deploy).
- The full mode-file flow (the .md is instructions to Claude, not executable code).

### Manual one-time validation after deploy

1. Run `node tests/e2e-smoke.mjs` → expect green; runtime under 90s.
2. Run `/yash-resume-pipeline` against one real URL → expect total under 5 min (target) or under 6 min (acceptable hard-JD upper bound).
3. Inspect the run-log JSONL entry — confirm all 5 phase_ms fields populated, plus `total_ms`.

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Plan-bullets retry loop doesn't trim "thinking time" the way we expect | Medium | High (no <5 min win) | Smoke test cannot prove this. Real-URL validation step 2 above is the gate. If it doesn't help, we still have the parallel-compile + bundled-timer savings (~30-40s). |
| Background `compile-resume` race with `compile-cover-letter` writes | Low | Medium (orphan PDFs) | Edge case A handler with `rm -f`. Wait-barrier checks exit code before logging. |
| Stale `/tmp/yash-pipeline-timer-*.json` from crashed sessions | Low | Low (one wrong phase ms) | `init-timer` overwrites; no locking needed. |
| Existing real runs break because `mark-processed` or `log` signatures changed | Low | High (broken pipeline) | These signatures are NOT changed. The new `init-timer` / `mark-phase` / `read-timer` are additive. |
| Smoke test PDFs accidentally checked into git | Low | Medium (repo bloat) | `tests/fixtures/` checked in (fixtures are stable). Output PDFs go to `resumes/yash/`, `cover-letters/yash/`, `resume-logs/yash/`, `cover-letter-logs/yash/`, `jds/yash/` — all gitignored (`.gitignore:19-54` already excludes everything in those dirs except `.gitkeep`). Cleanup `finally` block in smoke test catches anything that escapes. |
| `tools/validate_bullets.py` strip logic drifts from V2.0 LaTeX patterns | Low | Medium (false pass/fail) | Single shared regex set in `tools/validate_bullets.py`; replaces the per-run ad-hoc scripts in `/tmp/`. |

## Success criteria

Definition of done for the implementation phase:

1. `node tests/e2e-smoke.mjs` exits 0; runtime under 90s.
2. A real URL run through `/yash-resume-pipeline` completes in under 5 min on a typical JD (≤ 6 min on a hard JD).
3. The JSONL run log has all 5 phase_ms fields plus `total_ms` populated.
4. No regression: an existing URL (e.g. one of today's processed slugs) re-run with a `_v2` slug suffix produces a structurally identical resume + CL PDF (1 page, ≥ 5 keyword echoes, all bullets in 220-230 band).
5. Locked files (V2.0 prompt, CL prompt, `cv.md`) unchanged on disk (git diff confirms).
6. AGENTS.md updated with new entry points.

## Open questions

None at this stage. All forks were resolved in the brainstorming questions:

- Orchestration approach: CC-CLI tightening (no API, no subprocess)
- Refactor scope: Minimal + plan-bullets
- Retry budget: 1 retry max, then ship with deficiency log
- E2E test: Fixture-based smoke (no LLM, no network)
- The three proposed GitHub repos (CARL, andrej-karpathy-skills, graphify) are **not** incorporated. Justifications recorded in "Rejected alternatives" above.
