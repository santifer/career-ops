# 2026-04-16/17 Ops And Product Rollup

**Status:** completed
**Scope Covered:** completed operational, dashboard, pipeline, and governance plans from 2026-04-16 through 2026-04-17

## Background

After first-stage compaction, `summaries/` still held many one-off completed plans that were individually readable but collectively noisy. These files were ordinary completed execution records, not long-lived canonical summaries, so keeping them all expanded in `summaries/` was still too expensive for an industrial-grade compact repository surface.

## Scope Covered

This rollup replaces the following completed summary files:

- `2026-04-16-evaluate-scaling-plan.md`
- `2026-04-16-fix-dashboard-table-layout.md`
- `2026-04-17-company-blacklist-tiktok-bytedance.md`
- `2026-04-17-create-exec-plan-consolidator-skill.md`
- `2026-04-17-dashboard-apply-next.md`
- `2026-04-17-fix-extension-quick-value-score.md`
- `2026-04-17-group-current-changes-into-commits.md`
- `2026-04-17-review-extension-quick-value-score.md`

## Key Decisions

- Treat the newgrad evaluation funnel as a high-impact system concern: fix dedup, add explicit backpressure, introduce deterministic value-gating, and reduce unnecessary heavy evaluations.
- Treat the static dashboard as a product surface worth explicit workflow support: repair broken table rendering and add a dedicated `Apply Next` view.
- Encode user-specific blocking preferences in profile/config instead of overloading sponsorship or clearance memory.
- Separate quick-review correctness review from implementation, then land the surgical fixes once the contract issues were confirmed.
- Split git commits by functional category and keep runtime residue out of durable commits.
- Turn plan compaction into a real checked-in skill with packaging and then verify it against the repository on real data.

## Implemented Changes

- Newgrad evaluation scaling:
  - canonical URL dedup across pipeline/history/report surfaces
  - worker-pool intake with explicit concurrency/backpressure
  - stricter pending and detail value gating
  - quick-screen mode before deep evaluation
  - richer local JD cache and one-shot cache warming path
- Dashboard:
  - fixed table layout corruption in the static dashboard render path
  - added an `Apply Next` landing view with tracker-derived recommendation buckets
  - added browser-local completion marking for static `file://` usage
- Newgrad policy/config:
  - added `blocked_companies` support and blacklisted TikTok / ByteDance in the user profile
- Quick-value path:
  - reviewed the extension/bridge handoff end-to-end
  - fixed positive-value reason propagation, pending reload reason restoration, and matched-row sponsorship/clearance fallback alignment
- Repository operations/governance:
  - grouped a mixed working tree into category commits
  - created, packaged, and validated the `exec-plan-consolidator` skill
  - performed real repository compaction using the skill

## Verification Completed

- `npm --prefix bridge run test -- src/adapters/newgrad-pending.test.ts src/adapters/claude-pipeline.test.ts`
- `npm --prefix bridge run typecheck`
- `npm --prefix extension run typecheck`
- `npm run ext:build`
- `npm run dashboard`
- headless browser/DOM verification for the static dashboard layout and `Apply Next` view
- `git diff --cached --stat`, `git status --short`, and `git log --oneline` for commit grouping
- `python3 .claude/skills/exec-plan-consolidator/scripts/plan_inventory.py`
- `PYTHONPATH=/tmp/career-ops-pyyaml python3 /Users/hongxichen/.agents/skills/skill-creator/scripts/package_skill.py .claude/skills/exec-plan-consolidator /tmp/skill-dist`

## Open Issues

- Some remaining plan files still use inconsistent or missing `Status` formatting, which weakens inventory classification.
- Dashboard completion marks are browser-local and can drift from canonical tracker state.
- The `.claude/scheduled_tasks.lock` deletion and some batch runtime residue remain separate hygiene questions from plan compaction.

## Next Recommended Steps

- Standardize `Status` formatting for any future active or summary plans.
- Keep using rollup summaries rather than one file per completed operational task.
- When archive detail is already safely represented by summaries and durable artifacts, prefer a single stub manifest over many one-off archive files.
