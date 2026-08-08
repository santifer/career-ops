# Run log — career-ops (superflow fix run, 2026-08-08)

| check | result |
|---|---|
| stack | node · CLI skill agent (.mjs, Playwright) — no web app |
| audit | **0 high** (js-yaml fixed to 4.3.1 via `npm audit fix`; was CVE-2026-59870 quadratic CPU on `!!omap`) |
| tests | **2717/2717 pass** (`node test-all.mjs`, exit 0) |
| lint/typecheck | n/a (JS-only; `test-all.mjs` §1 runs `node --check` on every .mjs — the repo's lint gate) |
| verdict | green |

## The 8 failing "doctor" tests — root cause

The previous sweep's diagnosis ("checkout not onboarded + Playwright MCP absent") was **wrong**.
The failures were **not** about this checkout lacking `cv.md`/`config/profile.yml`/`portals.yml`
(those are WARN-only in `doctor.mjs`, never failures). Real cause:

1. `openrouter-runner.mjs` loaded the repo `.env` at **module import time**, mutating
   `process.env` of whatever imported it.
2. `scan.mjs` does the same (`config({ quiet: true })` at module scope, no path → loads
   `./.env`). `test-all.mjs` imports `scan.mjs` **in-process** (§7) before the doctor sections.
3. This repo's `.env` ships `CAREER_OPS_CLI=opencode`. So every `doctor.mjs` child process
   spawned later inherited `CAREER_OPS_CLI=opencode`, silently overriding the default-CLI
   (claude) scenarios that 8 tests assert: 6 in `tests/playwright-mcp-detection.test.mjs`
   (#1, #2, #6, #7, #12, #14) + 2 in `test-all.mjs` §12d.
4. CI is green on fresh clones because `.env` is gitignored/absent there — the leak only
   surfaces on a checkout with a real `.env`. This is why the sweep's T2 run went red while
   CI stays green.

## Fixes (no tests disabled; assertions unchanged)

- `openrouter-runner.mjs`: `.env` loader extracted to `loadEnvFile()`, now called only when
  the module is the CLI entry point (`invokedDirectly`) — module imports no longer mutate
  `process.env`. CLI behavior unchanged.
- `tests/playwright-mcp-detection.test.mjs` + `tests/doctor-cli-resolution.test.mjs`:
  `runDoctor()` deletes `CAREER_OPS_CLI` from the child env so default-CLI scenarios are
  hermetic regardless of host env / leaked `.env`; scenario-provided values still win.
- `test-all.mjs` §12d: same `CAREER_OPS_CLI` deletion on the three `doctor --json` runs.

## Audit

- `npm audit fix` → js-yaml `^4.1.1` → 4.3.1 (in-range, non-breaking; package-lock.json is
  gitignored, updated on disk).
- `npm audit` and `npm audit --omit=dev` both: **0 vulnerabilities**.
