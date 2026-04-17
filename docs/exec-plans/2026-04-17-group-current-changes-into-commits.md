# Group Current Changes Into Commits

**Date:** 2026-04-17
**Status:** completed
**Owner:** Codex

## Background

The working tree contains a mix of source changes, documentation artifacts, and generated runtime files. The user asked to commit the current work, grouped by category instead of as one large mixed commit.

## Goal

- Review the current working tree.
- Split meaningful changes into coherent commits by category.
- Avoid committing obvious runtime residue that does not belong in version control.

## Scope

- Inspect current git status and modified files.
- Create categorized commits for the current tracked and untracked source/doc changes.
- Leave explicit notes about any excluded runtime artifacts.

Out of scope:

- Pushing to remote
- Refactoring code unrelated to the current uncommitted work
- Reworking existing changes beyond what is needed to categorize and commit them

## Assumptions

- The safest path is to commit source, docs, and intentional generated artifacts, while excluding obvious transient runtime files.
- `batch/.bridge-prompt-*` and `batch/.report-number-reservations/*` are runtime artifacts from evaluation runs, not durable repository content.
- `.claude/scheduled_tasks.lock` is machine-local session state and should not be grouped into the source commits without a deliberate repo hygiene decision.

## Implementation Steps

1. Inspect repository instructions and current git status.
   Verify: current change surface and project constraints are clear.
2. Group the changes into coherent commit sets.
   Verify: every included file has a clear category and rationale.
3. Create commits one category at a time.
   Verify: each commit contains only its intended files and succeeds.
4. Confirm the remaining working tree state.
   Verify: only intentionally excluded runtime artifacts remain unstaged/uncommitted, or the tree is clean.

## Verification Approach

- Use `git status --short` before and after each commit.
- Use `git diff --cached --stat` before each commit to confirm grouping.
- Use `git log --oneline -n <count>` after commits to confirm commit creation order.

## Progress Log

- 2026-04-17: Read root instructions and Codex setup docs, then inspected current git status.
- 2026-04-17: Identified three durable categories: execution-plan/docs artifacts, bridge+extension newgrad pipeline work, and the static web dashboard.
- 2026-04-17: Identified likely runtime residue: `batch/.bridge-prompt-*`, `batch/.report-number-reservations/*`, and `.claude/scheduled_tasks.lock`.
- 2026-04-17: Committed execution-plan and evaluation artifacts as `docs(exec-plans): add evaluation and execution logs`.
- 2026-04-17: Committed bridge, extension, config, and supporting script changes as `feat(newgrad): harden bridge evaluation pipeline`.
- 2026-04-17: Committed static dashboard files as `feat(web): add static career dashboard`.
- 2026-04-17: Verified post-commit working tree; only excluded runtime residue remains.

## Key Decisions

- Commit by functional category instead of by directory glob alone when the category spans multiple folders.
- Treat runtime residue as excluded from this commit pass unless the repository already clearly treats it as durable state.

## Risks and Blockers

- Some files under `docs/exec-plans/` are numerous and untracked; they need to stay grouped without accidentally mixing in code changes.
- The tracked `.claude/scheduled_tasks.lock` deletion is ambiguous; committing or reverting it without an explicit repo hygiene decision would be risky.

## Final Outcome

Completed.

- Created 3 category commits for the durable repository changes.
- Left runtime residue uncommitted: `batch/.bridge-prompt-*`, `batch/.report-number-reservations/*`, and `.claude/scheduled_tasks.lock`.
- Verification: reviewed `git status --short` and recent commit history after each commit.
