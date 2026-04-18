# Merge upstream/main

## Background

The local branch `jd-extension-work` tracks fork work and the upstream remote is `https://github.com/santifer/career-ops.git`. `git fetch upstream` moved `upstream/main` from `4b5093a` to `10c496c`.

## Goal

Merge the latest `upstream/main` into the current branch and summarize the upstream changes that were brought in.

## Scope

- Fetch and inspect upstream commits.
- Preserve existing local uncommitted work.
- Merge `upstream/main` into the current branch.
- Resolve conflicts only if they are caused by the upstream merge.
- Run the most relevant available verification after the merge.

## Assumptions

- The current branch is the intended target branch.
- Existing uncommitted changes are user or prior-session work and must be preserved.
- The upstream increment to merge is `4b5093a..10c496c`.

## Implementation Steps

1. Inspect status, remotes, project instructions, and active plans.
   Verify: `git status --short --branch`, `git remote -v`.
2. Fetch upstream and inspect incoming commits.
   Verify: `git log --oneline 4b5093a..upstream/main`, `git diff --stat 4b5093a..upstream/main`.
3. Merge `upstream/main` while protecting local uncommitted changes.
   Verify: merge exits successfully and `git status` has no unmerged paths.
4. Run targeted verification.
   Verify: use the repository's standard verification command if practical.
5. Record outcome and summarize upstream changes.
   Verify: update this plan's progress log and final outcome.

## Verification Approach

- Confirm the merge base and incoming commits before merging.
- Use `git merge --autostash upstream/main` because the worktree has many local modifications.
- Run `npm run verify` if dependencies are present and the command is available.

## Progress Log

- 2026-04-18: Checked worktree; it contains substantial uncommitted local work.
- 2026-04-18: Fetched upstream; `upstream/main` advanced from `4b5093a` to `10c496c`.
- 2026-04-18: Incoming upstream changes affect 9 files with 59 insertions and 25 deletions.
- 2026-04-18: Merged `upstream/main` with `git merge --autostash upstream/main`; Git created and applied autostash `14f188f` and reported no conflicts.
- 2026-04-18: Verified no unmerged paths and `git diff --check` passed.
- 2026-04-18: Ran `go test ./...` in `dashboard`; passed after rerunning outside the sandbox for Go build cache access.
- 2026-04-18: Ran `npm run verify`; failed on pre-existing tracker entry `#172` in `data/applications.md` with non-canonical status `USA` and invalid score format `Mimir`.

## Key Decisions

- Compare upstream changes from the merge base instead of using the misleading snapshot diff from `HEAD..upstream/main`.
- Use autostash during merge to avoid overwriting local modifications.

## Risks and Blockers

- Local uncommitted changes may overlap upstream edits when the autostash is reapplied.
- Standard verification may fail if the current dirty branch has unrelated in-progress changes.

## Final Outcome

Merged `upstream/main` into `jd-extension-work` at merge commit `ca70a3b`.

Incoming upstream commits:

- `e71595f` `feat: add {{PHONE}} placeholder to CV template (#287)`
- `ecd013c` `fix: remove wellfound, lever and remotefront from portals.example.yml (#286)`
- `e5e2a6c` `fix(dashboard): show dates in pipeline list (#298)`
- `5c90596` `chore(deps): bump actions/setup-node from 4 to 6 (#232)`
- `2051beb` `chore(main): release 1.5.0 (#282)`
- `10c496c` `Update README.md`

Verification:

- Passed: `git diff --check`
- Passed: `go test ./...` from `dashboard`
- Failed: `npm run verify`, due to unrelated tracker row `#172` in `data/applications.md`
