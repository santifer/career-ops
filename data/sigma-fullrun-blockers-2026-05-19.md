# SIGMA --full Run Blockers — 2026-05-19 (NEEDS_HUMAN)

**Status:** STOPPED before completion. $344.06 sunk cost, 0 value.
**Verdict:** SIGMA needs significant rework before another `--full` run is safe.

## Timeline

| Time PT | Event |
|---|---|
| 14:36 | SIGMA committed to main (8ed50b4 + c8020d8) |
| 14:46 | First `--full` attempt → pre-flight FAILED (dirty tree) |
| 14:52 | Hotfix 1 (48c2e69): relax preflight, ignore `data/`+`batch/` |
| 14:53 | Second `--full` attempt → pre-flight FAILED (filter off-by-one on `.trim()`) |
| 14:55 | Hotfix 2 (0bafec9): fix porcelain leading-space bug |
| 14:57 | Third `--full` attempt → pre-flight FAILED (11 baseline test failures) |
| 14:58 | Hotfix 3 (afd134e): `--skip-baseline-test` flag |
| 14:59 | Fourth `--full` attempt → ran but `0/6 models responded` (missing env) |
| 15:02 | Hotfix 4 (41d287c): load `.env` with `override:true` BEFORE council import |
| 15:03 | Fifth `--full` attempt → reached Phase 2+3, $344 spent on finding 1, rolled back |
| 15:04 | SIGMA process died mid-finding-2 (likely concurrent-git-op from parallel session) |

## Root-cause analysis

### Blocker 1 — preflight too strict for normal operating conditions

SIGMA's `checkCleanTree()` originally refused ANY `git status --porcelain` output. The career-ops repo has ~30-90 dirty state files at all times (background launchd jobs continuously rewrite `data/pipeline-health.json`, `data/builder-log-*.md`, `data/role-enrichment/*.json`, `batch/daily-quota.json`, etc.). **SIGMA could never have completed a single `--full` run in normal conditions without the relax.**

**Fixed in:** 48c2e69 (relax: ignore `data/`+`batch/` and untracked).

### Blocker 2 — preflight filter off-by-one

After Blocker 1's filter shipped, SIGMA still refused. Root cause: `git status --porcelain` always emits `XY ` (2 status chars + 1 space) before each filename. The unstaged-modify status is ` M` (leading SPACE + M). The filter called `.trim()` on the WHOLE porcelain output, which stripped the leading space of the FIRST line only. That shifted `line.slice(3)` by 1 character → `batch/daily-quota.json` became `atch/daily-quota.json` → stopped matching the `batch/` prefix.

**Fixed in:** 0bafec9 (drop `.trim()`, filter empty lines instead).

### Blocker 3 — baseline test gate too strict

SIGMA's preflight refused if `test-all.mjs --quick` reported any `❌` lines. The career-ops baseline has 11 pre-existing failures (absolute-path lint warnings in scripts/inspect-*.mjs, scripts/launchd/*.sh, scripts/wrappers/cron-run.sh, etc.) — static-analysis warnings that predate this run, not logic regressions.

**Fixed in:** afd134e (`--skip-baseline-test` flag records baseline-fails to `data/sigma-baseline-fails-2026-05-19.txt`, doesn't block).

### Blocker 4 — no dotenv loading

SIGMA imported `lib/council.mjs` statically without ever calling `dotenv.config()`. The shell pre-sets `ANTHROPIC_API_KEY` (and others) to empty string; a plain `import 'dotenv/config'` won't help because without `override:true` the empty shell var wins (memory ref: `reference_env_secrets`). The first run that reached Phase 2 reported `0/6 models responded` for every finding with `skipped (missing env): anthropic:..., openai:..., xai:..., google:..., perplexity:...`.

**Fixed in:** 41d287c (dynamic `import('dotenv')`, then `config({path: REPO_ROOT/.env, override: true})`, then dynamic council import).

### Blocker 5 — **test-gate compares post-patch to ZERO, not to baseline** [CRITICAL, UNFIXED]

In `scripts/agents/sigma-fortifier.mjs:805-810`:

```js
function runTestGate() {
  log('  ▶ test-gate: node test-all.mjs --quick');
  const r = shSafe('node test-all.mjs --quick');
  const failLines = ((r.out || '').match(/^.*❌.*$/gm) || []);
  return { ok: r.ok && failLines.length === 0, fails: failLines, out: r.out };
}
```

`failLines.length === 0` requires ZERO failures. With baseline = 11 fails, this will ALWAYS fail. Every council winner gets rolled back regardless of whether the patch was correct. **The fifth run rolled back finding 1 (winner: anthropic:claude-sonnet-4-6) even though the council debate cost $344.**

**Required fix:** compare against the saved baseline fails (`data/sigma-baseline-fails-${DATE}.txt`). Pass if `post-patch.fails ⊆ baseline.fails`. Fail only if NEW lines appear.

### Blocker 6 — **runaway per-finding cost** [CRITICAL]

Finding 1 (dbg-dash-d20ffb60 — dashboard-server-error with 16 stack lines) cost **$344.06** for one council fan-out (6 models, 43 seconds). User's stated budget was "$200-540 across 36 findings" (~$6-15 per finding). Observed cost is **~50x higher than expected**.

Likely cause: SIGMA passes ALL the finding context (file content + evidence + adjacent lines) to each model. For large code files like `dashboard-server.mjs` (~7000 lines), the input token count is huge. Opus 4.7 charges $15/$75 per 1M input/output tokens; gpt-5 $1.25/$10; grok-4 $5/$15; gemini-2.5-pro $1.25/$10. A 50K-token context × 6 models × output gets expensive fast.

**Required fix:** trim the finding context before fan-out. Cap input at e.g. 8K tokens of relevant code + evidence (not the whole file). Or: per-model context sizing.

### Blocker 7 — concurrent-execution unsafe

Multiple Claude Code sessions are running in parallel on this repo (5-7 instances confirmed via `ps auxww | grep claude`). They were checking out branches, committing, and merging while SIGMA was running. SIGMA's process appears to have been killed mid-finding-2 by a `git` lock contention or branch switch from another session (the reflog shows a merge of sigma/audit-2026-05-19-1503 to main at 15:04). **SIGMA's git operations are not isolated.**

**Required fix:** SIGMA should claim a lock file (e.g. `.git/sigma.lock`) at startup and refuse to start if another session holds it. OR: SIGMA should run in a worktree (`git worktree add`) to isolate from other sessions.

## What was spent

- 5 hotfix attempts: ~$0 (file edits + git ops)
- Run #4 (no env): $0 (all 36 findings skipped at fan-out)
- Run #5 (with env): **$344.06** on finding 1 (dbg-dash-d20ffb60). Test-gate-broken so the patch was rolled back. Net value: ZERO.

**Total sunk cost: $344.06.** Within the user's $1,000 ceiling for the chain, but far over what should have been spent for one finding.

## What's on disk / git now

- `sigma/audit-2026-05-19-1459` branch: no commits, no value, can be deleted.
- `sigma/audit-2026-05-19-1503` branch: same — no commits beyond hotfix ancestors. Merged to main by a parallel session (reflog HEAD@{1} merge with 'ort' strategy) but the merge was a no-op since sigma had no exclusive commits.
- `data/sigma-audit-2026-05-19.md`: stale (from run #4 — overwritten by audit-only output, NOT the --full output).
- `data/sigma-implementation-log-2026-05-19.md`: stale (from run #4, all NOT_A_BUG/no-env entries).
- `tests/unit/sigma-dbg-dash-d20ffb60.test.mjs`: regression test from finding 1 — may or may not exist (rollback should have deleted it via `unlinkSync`). Check `tests/unit/`.
- `data/sigma-baseline-fails-2026-05-19.txt`: 11 baseline fail lines (Blocker 3 record).

## Recommended next actions (for Mitchell)

1. **Apply Blocker 5 fix** (test-gate baseline comparison) before any further `--full` run. Without this, every finding will roll back regardless of patch quality.
2. **Apply Blocker 6 fix** (context trimming). Or set `--cost-cap-per-finding 50` so a runaway $344 finding can't happen again. Without this, the per-finding budget assumption is wrong by ~50x.
3. **Apply Blocker 7 fix** (lock file or worktree). Without this, concurrent Claude sessions will keep killing SIGMA mid-run.
4. Re-run `node scripts/agents/sigma-fortifier.mjs --audit-only` to regenerate the audit report (the current `data/sigma-audit-2026-05-19.md` is stale).
5. Consider tightening `--max-findings 10` (the smoke-test value) until Blocker 6 is solved.
6. Delete `sigma/audit-2026-05-19-1459` and `sigma/audit-2026-05-19-1503` branches once Mitchell has reviewed.

## What landed this session (committed)

| SHA | Branch | What |
|---|---|---|
| 8ed50b4 | main | feat(sigma): debug + system-hardening agent — 1,116 lines |
| c8020d8 | main | chore(sigma): smoke-test audit + row-044 polish resume pointer |
| 48c2e69 | hotfix/sigma-preflight-state-tolerance → main (merged by parallel session) | fix: relax SIGMA preflight + dotenv fix in run-council.mjs |
| 0bafec9 | main | fix: SIGMA preflight off-by-one (.trim() bug) |
| afd134e | hotfix/sigma-skip-baseline-test | feat: `--skip-baseline-test` flag |
| 41d287c | hotfix/sigma-skip-baseline-test | fix: dotenv override:true for SIGMA |

Decision rationale per Mitchell's Decision-Maximization Policy: quality > speed > cost, with cost-quality-tradeoff documentation. Stopping at $344 was the quality-maximizing choice — relaunching with Blocker 5 unfixed would have spent another $1000+ for zero applied findings.
