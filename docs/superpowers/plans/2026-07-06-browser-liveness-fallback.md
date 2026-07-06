# Browser Liveness Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make scan-mode WebSearch liveness verification work without interactive browser tools by routing it through the existing repository-local checker.

**Architecture:** Keep `check-liveness.mjs` as the single liveness entrypoint. Align the agent instructions and doctor warning with its ATS API plus local Playwright ladder, and lock the behavior with text-contract assertions in the existing test harness.

**Tech Stack:** Node.js ESM, Playwright, Markdown agent instructions, `test-all.mjs`

---

### Task 1: Add instruction-contract regression coverage

**Files:**
- Modify: `test-all.mjs:1185-1198`
- Test: `test-all.mjs`

- [ ] **Step 1: Write the failing regression assertion**

Add this block after the existing pipeline liveness assertion:

```js
const agentsInstructions = readFile('AGENTS.md');
const scanMode = readFile('modes/scan.md');
const doctorInstructions = readFile('doctor.mjs');
if (
  agentsInstructions.includes('node check-liveness.mjs <url>') &&
  agentsInstructions.includes('NEVER decide liveness from a bare WebSearch/WebFetch snippet') &&
  scanMode.includes('node check-liveness.mjs <url>') &&
  scanMode.includes('skipped_unconfirmed') &&
  scanMode.includes('never reinterpret `uncertain` as expired') &&
  doctorInstructions.includes('check-liveness.mjs remains available')
) {
  pass('scan verification falls back to the repo-local liveness checker');
} else {
  fail('scan verification still depends exclusively on interactive browser tools');
}
```

- [ ] **Step 2: Run the suite and verify the new assertion fails**

Run:

```bash
node test-all.mjs
```

Expected: the suite reports
`FAIL: scan verification still depends exclusively on interactive browser tools`.

- [ ] **Step 3: Commit the failing regression test**

```bash
git add test-all.mjs
git commit -m "test(scan): require local liveness fallback"
```

### Task 2: Align offer-verification and scan instructions

**Files:**
- Modify: `AGENTS.md:308-315`
- Modify: `modes/scan.md:226-250`
- Test: `test-all.mjs`

- [ ] **Step 1: Replace the stale `AGENTS.md` verification block**

Use this content:

```markdown
## Offer Verification -- MANDATORY

Verify a posting is still live before applying, using the cheapest conclusive check:

1. **Standard liveness gate:** run `node check-liveness.mjs <url>`. The checker uses a public ATS API when supported and falls back to repository-local Playwright when needed.
2. **Interactive inspection:** when browser tools are available and JD content must be inspected, use `browser_navigate` and `browser_snapshot`. Only footer/navbar without JD means closed; title + description + Apply means active.

**NEVER decide liveness from a bare WebSearch/WebFetch snippet.** Accept only a conclusive checker or interactive-browser verdict. Keep `uncertain` results unconfirmed; never reinterpret them as expired.

**Exception for batch workers (headless mode):** The ATS API rung still works. If a non-ATS page cannot launch local Playwright, use WebFetch only to extract content and mark the report header with `**Verification:** unconfirmed (batch mode)`.
```

- [ ] **Step 2: Replace scan Level 3 verification**

Use this workflow:

```markdown
7.5. **Verify Liveness of WebSearch Results (Level 3)** — BEFORE adding to pipeline:

   WebSearch results can be outdated. Verify every new Level 3 URL with the repository-local liveness gate. Levels 1 and 2 are inherently real-time and do not require this verification.

   For each new Level 3 URL, sequentially run:

   ```bash
   node check-liveness.mjs <url>
   ```

   The checker tries a public ATS API first and launches local Playwright only when the API is unavailable or inconclusive.

   - **Active:** continue to step 8.
   - **Expired:** record `skipped_expired` in `scan-history.tsv` and discard.
   - **Uncertain or checker failure:** record `skipped_unconfirmed`, keep the URL out of `pipeline.md`, and report it for later confirmation. Never reinterpret `uncertain` as expired.

   Direct `browser_navigate` + `browser_snapshot` remains valid when interactive browser tools are available and the agent needs to inspect the JD. It is not required solely for liveness.

   If the managed sandbox blocks Chromium launch, request approval for the narrowly scoped `node check-liveness.mjs` command and retry. Do not interrupt the entire scan when one URL remains unconfirmed.
```

Update the summary status list with:

```markdown
11. **Expired offers (Level 3)**: record with status `skipped_expired`.
12. **Unconfirmed offers (Level 3)**: record with status `skipped_unconfirmed`.
```

- [ ] **Step 3: Run the regression suite**

Run:

```bash
node test-all.mjs
```

Expected: the new local-liveness fallback assertion passes and no existing assertion fails.

- [ ] **Step 4: Commit the aligned instructions**

```bash
git add AGENTS.md modes/scan.md
git commit -m "fix(scan): use local liveness fallback"
```

### Task 3: Clarify doctor guidance

**Files:**
- Modify: `doctor.mjs:85-123`
- Test: `test-all.mjs`

- [ ] **Step 1: Narrow the warning to interactive browser capabilities**

Keep MCP detection unchanged. Replace the warning guidance with:

```js
fix: [
  'Interactive browser tools for SPA career-page discovery and JD extraction need a',
  'Playwright MCP server. No project-level MCP config was detected in `.mcp.json`',
  'or `.claude/settings*.json`. Repository-local liveness verification through',
  '`node check-liveness.mjs <url>` remains available via ATS APIs and local Playwright.',
  'Tracking: https://github.com/santifer/career-ops/issues/506',
],
```

Update the preceding comment so it no longer says pipeline liveness checks require MCP.

- [ ] **Step 2: Run startup diagnostics**

Run:

```bash
node doctor.mjs --json
```

Expected: onboarding remains complete; the non-fatal MCP warning remains present because interactive browser tools are not configured.

- [ ] **Step 3: Run the full regression suite**

Run:

```bash
node test-all.mjs
```

Expected: all checks pass.

- [ ] **Step 4: Commit the doctor clarification**

```bash
git add doctor.mjs
git commit -m "fix(doctor): clarify Playwright fallback"
```

### Task 4: Verify both liveness rungs and final scope

**Files:**
- Verify: `check-liveness.mjs`
- Verify: `AGENTS.md`
- Verify: `modes/scan.md`
- Verify: `doctor.mjs`
- Verify: `test-all.mjs`

- [ ] **Step 1: Verify ATS API and browser fallback**

Run:

```bash
node check-liveness.mjs --no-fallback \
  https://jobs.lever.co/conversica/9749af99-df67-458a-8195-9749fe0b9ee0 \
  https://jobs.lever.co/agiloft/f6709ce0-427b-4d6f-bcad-e7db2172ac0b/apply
```

Expected: both URLs report `active`; Conversica is marked `(api)` and Agiloft is verified by local Chromium.

- [ ] **Step 2: Verify formatting and scope**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intended branch changes plus the user's pre-existing untracked data files are present.

- [ ] **Step 3: Run final pipeline health check**

Run:

```bash
node verify-pipeline.mjs
```

Expected: zero errors and zero warnings.
