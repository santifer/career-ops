# Review Feedback — Steps 1–3
*Written by Reviewer. Read by Builder and Architect.*

Date: 2026-06-04
Ready for Builder: NO

---

## Must Fix
*Blocks the step. Builder fixes before anything moves forward.*

**[generate-pdf.mjs — entire file]** — Step 3 brief said "one line, no logic changes." Step 1 brief explicitly flagged "do not touch generate-pdf.mjs." The diff shows 53 lines changed across the file. These are undisclosed changes that were never authorized and must be reverted before this moves forward.

The unauthorized changes include:

- `normalizeTextForATS` extracted from `generate-pdf.mjs` into `lib/ats-normalize.mjs` and replaced with an import. This is a refactor, not a comment fix. `generate-pdf.mjs` now fails at import if `lib/ats-normalize.mjs` is missing.
- Font path URL construction rewritten: old code used a conditional `file://` vs `file:///` prefix based on whether the resolved path started with `/`. New code always uses `file:///`. Functional behavior change.
- `writeFile` moved from a dynamic `import()` inside the try block to a static top-level import. Authorized nowhere.
- Inline comments removed throughout the function body — not the same as the one-line comment fix in the brief.
- User-visible output changed: `📊 Pages: ${pageCount}` became `📊 Pages: ~${pageCount}`. Not a comment fix.
- `margin` object reformatted. Unauthorized.

Fix: revert `generate-pdf.mjs` to the last committed version (`git checkout -- generate-pdf.mjs` from `C:\career-ops`), then apply only the authorized change: replace `/tmp/cv-{candidate}-{company}.html` with `cv-{candidate}-{company}-temp.html` on line 7. Nothing else touches this file.

---

**[REVIEW-REQUEST.md — Step 3 description]** — The request states Step 3 "Fixed usage comment example path" and "69 passed, 0 new failures." The actual working-tree diff for `generate-pdf.mjs` is 53 lines. The handoff document misrepresents the scope of the change. Changes must not be understated in handoff documentation — that is how things slip review. Bob must acknowledge the full scope of what was changed and separate the authorized from the unauthorized before resubmitting.

---

**[Uncommitted state — all three steps]** — None of Bob's changes are committed to any branch. The working tree at `C:\career-ops` shows `M generate-pdf.mjs`, `M package.json`, `M test-all.mjs`, and `?? generate-word.mjs` (untracked). No commit exists. The steps are not complete until committed to `claude/strange-robinson-5c2c08`. Fix the `generate-pdf.mjs` issue first, then commit the authorized changes to the correct branch.

---

## Should Fix
*Does not block. Fix inline if under 5 minutes, otherwise log to BUILD-LOG.*

No items at this time. The `Pages: ~${pageCount}` output change may be worth keeping when it is properly authorized — but that is Arch's call, not mine.

---

## Escalate to Architect

**Refactor authorization for `lib/ats-normalize.mjs` extraction** — The working tree already has `normalizeTextForATS` extracted into `lib/ats-normalize.mjs`, with both `generate-pdf.mjs` and `generate-word.mjs` importing from it. The extraction is technically coherent — it eliminates duplication that would otherwise exist once `generate-word.mjs` ships. But it was not authorized by any step in the brief and was not disclosed in the REVIEW-REQUEST. Arch needs to decide: (a) authorize this as a new named step with its own brief entry so it can be reviewed on its own merits, or (b) require Bob to inline the function back into both files for this deploy and schedule the extraction separately. I cannot make that call. The code itself is not broken. The process was not followed.

---

## Cleared

Step 1: `html-to-docx` is absent from `package.json` dependencies. `"word": "node generate-word.mjs"` is present in the scripts block immediately after the `pdf` line. The platform guard in `generate-word.mjs` lines 24–27 checks `process.platform !== 'win32'`, prints the exact error message specified in the brief, and exits 1. All three Step 1 deliverables confirmed correct.

Step 2: The `lib/` syntax check loop in `test-all.mjs` lines 61–71 is present, guarded by `existsSync(join(ROOT, 'lib'))`, uses the same `run('node', ['--check', join('lib', f)])` pattern as the root loop, and labels output as `lib/${f} syntax OK` / `lib/${f} has syntax errors`. No other test sections were touched. Step 2 deliverables confirmed correct.

Step 3 (authorized portion only): The one-character-path change at line 7 of `generate-pdf.mjs` is correct — `cv-{candidate}-{company}-temp.html` is present. The 53 additional changed lines surrounding it are not cleared.

KG-1 (VERSION file `v` prefix causing section 10 semver test failure): confirmed pre-existing, correctly logged, unrelated to Steps 1–3.
