# Agent Queue — 2026-05-19

Snapshot of unpushed agent work on disk as of 19:35 PT, written by the
`elastic-yalow-91b94a` agent (P1-2 VC scanner) before opening
[mitwilli-create#58](https://github.com/mitwilli-create/career-ops/pull/58).

The user's instruction to me was: *"wait your turn — review the work of the
agent before you — make sure there's not another agent waiting behind you —
if there is converse and strategize with them — then provide your merge and
then allow the next agent to follow in your footsteps."*

This document is the "conversation" the next agent should read before deciding
how to land their own work.

## Status of `main` (local, /Users/mitchellwilliams/Documents/career-ops)

- HEAD: `718abd7` (3 commits ahead of `origin/main` at `cf63889`)
- **There is a parked `git merge` in progress** — `.git/MERGE_HEAD` exists
- Merging in: `56f50d8` "feat(scan): P0-5 — first_seen_at instrumentation" from `claude/romantic-diffie-f6cd91`
- 4 files unmerged:
  - `lib/scan-history-utils.mjs` (both added — main has placeholder, P0-5 has full 8-col schema)
  - `scan-email.mjs` (both modified — main got Gmail-alert ingestion in `cd6d8f6`, P0-5 modified for first_seen_at)
  - `scan-hn-hiring.mjs` (both added — main got it in `4cb714e`, P0-5 also added it independently)
  - `scripts/migrate-scan-history-firstseen.mjs` (both added)
- 2 files already staged-resolved: `scan-rss.mjs`, `scan.mjs`

**Resolving this merge is the prerequisite for ANY agent landing work on
main.** Until it's resolved, the main worktree is unsafe for landings — every
new branch will have to also resolve these conflicts, OR open a PR (the path
the VC scanner agent took).

### Recommended resolution path

For each "both added" file, the natural choice is to take the P0-5 version
(romantic-diffie's), because:

1. **scan-history-utils.mjs** — main has a 72-line placeholder with no
   callers (`git grep "scan-history-utils" main` returns only the file
   itself). P0-5 has the 169-line full helper + wires it up across all 4
   scrapers. Replacement is safe; no callers break.
2. **scan-hn-hiring.mjs** — main got the `4cb714e` version (every-4h cadence
   + HN ingest), P0-5 added their own version. They should be reconciled by
   hand — start with main's `4cb714e` version + sprinkle in P0-5's
   `first_seen_at` writes by reading from `lib/scan-history-utils.mjs`.
3. **migrate-scan-history-firstseen.mjs** — both versions are migration
   scripts for the same goal. Either should work, but the one that uses
   `lib/scan-history-utils.mjs::formatRow` (P0-5's) is preferable so the
   migration shares the canonical schema.
4. **scan-email.mjs** — semantic conflict. Main added Gmail polling
   (`cd6d8f6`); P0-5 added first_seen_at writes (`56f50d8`). Both
   integrations need to coexist. Probably: take main's Gmail-poll structure
   as the base, then re-apply P0-5's `appendRows()` call (via the new
   helper) instead of the inline `appendFileSync(...)` for each match.

This is a 30-60 minute human-attention task — too much context-dependent
judgment for an automation.

## Branches with unpushed commits (queue)

Listed by depth from `f2477fc` (the common ancestor for most of these):

| Branch / worktree | HEAD | Status |
|---|---|---|
| `claude/elastic-yalow-91b94a` (me) | `56c5624` | **PR open: #58** — VC portfolio scanner |
| `claude/elastic-brattain-81fd41` | `06ebc0b` | 1 commit: `fix(triage-pipeline): strip trailing region from title` — clean, ready to push |
| `worktree-agent-a0071e011448b90e1` | `5ceeac6` | 1 commit: `feat(P0-4): zombie composite scorer gates triage before LLM eval` — clean, ready to push |
| `claude/romantic-diffie-f6cd91` | `56f50d8` | 1 commit: `feat(scan): P0-5 — first_seen_at instrumentation` — **already in parked merge state on main, do not double-push** |
| `claude/goofy-lederberg-450021` | `b1b18f2` | unknown (didn't audit deeply) |
| `claude/optimistic-rubin-74471a` | `53687b1` | unknown |
| `claude/confident-lewin-f4be89` | `cd6d8f6` | corresponds to main's already-landed `cd6d8f6` — probably nothing to push |

Email-review phase worktrees (`agent-a2eadc...`, `agent-a64656...`,
`agent-ac2e73...`) are locked and untouched in the last 30 min — assume idle.

## Recommended landing order

If a human resolves the P0-5 merge:

1. **First**: resolve + commit the P0-5 merge on local `main`. That ships
   romantic-diffie's work and unblocks everyone else.
2. **Second**: push local `main` → `origin/main`. That syncs origin to the
   3 unpushed commits (`d4ed468`, `4cb714e`, `718abd7`) + the merge.
3. **Third**: my PR (#58) fast-forwards cleanly onto the resolved `main`
   (no conflicts — VC scanner doesn't touch any of the 4 conflicted files).
4. **Fourth/Fifth**: `elastic-brattain` (06ebc0b triage fix) and
   `agent-a0071e` (P0-4 zombie scorer) can land as PRs or direct merges in
   either order — neither touches the P0-5 conflict zone.

If no human is available and another agent is asked to land work: **open a
PR instead of attempting `git merge`**, exactly the way I did. PRs route
around the parked-merge blocker entirely. Cite this document and the parked
merge as the reason for taking the PR path.

## Gotcha for the next agent

`gh pr create` without `--repo <owner>/<repo>` will default to the upstream
remote — which on this checkout is `santifer/career-ops`. The user's
standing rule (`feedback_never_touch_upstream.md`) is **never push to or
open PRs against santifer upstream**. Always pass
`--repo mitwilli-create/career-ops` explicitly.

I tripped on this myself and had to close [santifer#702](https://github.com/santifer/career-ops/pull/702) before reopening as
[mitwilli-create#58](https://github.com/mitwilli-create/career-ops/pull/58). Don't repeat the mistake.

## Dashboard update path

The user asked to "push to the dashboard website." The dashboard at
https://dashboard.careers-ops.com/ is served by a launchd-managed
`dashboard-server.mjs` running on Mitchell's machine — it reads from the
local main worktree at request time. So:

- Pushing to `origin/main` does NOT update the dashboard directly.
- The dashboard reflects new VC offers when:
  1. PR #58 is merged into `origin/main`
  2. Local main pulls that merge (after the P0-5 merge is resolved)
  3. launchd fires the new plist daily at 09:45 PT (or runs manually)
  4. `data/pipeline.md` accumulates VC rows that the dashboard surfaces

No dashboard UI/HTML/CSS was changed by my PR, so no rebuild of
`dashboard/index.html` is needed.
