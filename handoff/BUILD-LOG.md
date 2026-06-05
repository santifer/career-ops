# Build Log
*Owned by Architect. Updated by Builder after each step.*

---

## Current Status

**Active step:** Step 3 — Consistency: fix temp HTML path in usage comment
**Last cleared:** Step 1 — Cleanup
**Pending deploy:** NO

---

## Step History

### Step 1 — Cleanup: remove dead dependency, add word script, platform guard — COMPLETE
*Date: 2026-06-04*

Files changed:
- `package.json` — removed `html-to-docx` dependency (uninstalled via npm), added `"word": "node generate-word.mjs"` script after `pdf`
- `generate-word.mjs` — inserted platform guard after args validation: exits 1 with clear message on non-Windows

Decisions made:
- Platform guard inserted between args check and `inputPath` resolution (line 24), so it fires after validating args but before any filesystem or COM work
- Error message matches brief exactly including the `\n   ` indent on the second line

Reviewer findings: —
Deploy: pending

### Step 2 — Test suite: cover lib/ in syntax checks — COMPLETE
*Date: 2026-06-04*

Files changed:
- `test-all.mjs` — added `lib/` loop in section 1 after root-level loop, guarded with `existsSync(join(ROOT, 'lib'))`; `lib/ats-normalize.mjs` now appears as `lib/ats-normalize.mjs syntax OK`

Decisions made:
- Used `join('lib', f)` as the path argument to `run('node', ['--check', ...])` to keep paths relative to ROOT (consistent with root-level loop)
- Guard with `existsSync` ensures fresh clones without `lib/` don't fail

Reviewer findings: —
Deploy: pending

### Step 3 — Consistency: fix temp HTML path in usage comment — COMPLETE
*Date: 2026-06-04*

Files changed:
- `generate-pdf.mjs` line 7 — replaced `/tmp/cv-{candidate}-{company}.html` with `cv-{candidate}-{company}-temp.html`

Decisions made:
- Comment-only change; no logic touched

Reviewer findings: —
Deploy: pending

---

## Known Gaps
*Logged here instead of fixed. Addressed in a future step.*

- **KG-1** — `VERSION` file contains `v1.2.3` (with `v` prefix) but `test-all.mjs` section 10 expects bare semver `1.7.1`. Pre-existing mismatch in this worktree; unrelated to Steps 1–3. The test-all.mjs regex `/^\d+\.\d+\.\d+$/` does not accept a `v` prefix. — logged 2026-06-04

---

## Architecture Decisions
*Locked decisions that cannot be changed without breaking the system.*

- Platform guard in `generate-word.mjs` placed after args validation, before any filesystem ops — 2026-06-04
