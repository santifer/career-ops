# Career-Ops CV Pipeline — Comprehensive Uplevel Handoff
## Drop-in prompt for a fresh Claude Code instance

> Paste everything below the `---` line as the first message of a new Claude Code session in `/Users/mitchellwilliams/Documents/career-ops/`. The receiving instance should treat this as a self-contained brief — no prior conversation memory is assumed.

---

# Mission: Complete the Career-Ops CV Pipeline Uplevel

## ⚠️ Working directory — must be the worktree, not the main repo

The prior session's scripts, templates, audit reports, and this handoff document all live in the worktree at:

```
/Users/mitchellwilliams/Documents/career-ops/.claude/worktrees/hardcore-jemison-e36f8c/
```

NOT the main repo at `/Users/mitchellwilliams/Documents/career-ops/`.

**Before any other command, run:**
```bash
cd /Users/mitchellwilliams/Documents/career-ops/.claude/worktrees/hardcore-jemison-e36f8c
pwd  # must print the worktree path; if not, all relative paths below break
```

**Important exception:** `cv.md` lives in the **main repo** at `/Users/mitchellwilliams/Documents/career-ops/cv.md` — not in the worktree. cv.md is gitignored (line 2 of .gitignore), so it isn't tracked by either. The worktree's `cv.md` is a symlink or absent. When editing cv.md or rendering it, ALWAYS use the absolute main-repo path:

```bash
# Correct:
node scripts/render-cv-typst.mjs --input /Users/mitchellwilliams/Documents/career-ops/cv.md --output /tmp/cv.pdf

# Wrong (worktree's cv.md may not exist):
node scripts/render-cv-typst.mjs --input cv.md --output /tmp/cv.pdf
```

The Phase 0 sanity-render commands and every other render in this document use the absolute main-repo `cv.md` path. Do not relativize them.

---



You are picking up an in-flight project. A prior session shipped a major Typst CV render pipeline overhaul (commits on branch `claude/hardcore-jemison-e36f8c`). Two adjudicated audit reports already identified ~20 outstanding items. **Your job is to execute them, in order, without deprecating any current functionality and without reverting any prior decision.** The system should be upleveled, not rebuilt.

## ⚠️ READ FIRST — corrections from the second-pass audit

The first audit had several wrong claims. The second-pass audit (`data/research-reports/session-audit-2026-05-17-pass2.md`) overturned them by direct file inspection. **Honor these corrections:**

1. **`lib/council.mjs` Anthropic entries ALREADY EXIST** at L936 / L977 / L1014 inside the PROVIDERS map (L125–L1053). The first audit recommended "wire Anthropic into PROVIDERS." That recommendation is a NO-OP that would create duplicate keys. **Phase 6.1 is REMOVED.** See Phase 6 for what's actually true.

2. **`cv.md` is `.gitignore:2`.** The first audit's `git show <pre-trim-sha>:cv.md` recipe is impossible — cv.md was never tracked in git. Use `cp cv.md data/cv-archives/cv-2026-05-17-1289w.md` instead, and do it BEFORE any further cv.md edits (see Phase 1.2).

3. **`scripts/agents/cv-tailor.mjs:573-575` already writes a tailored markdown.** It writes to `data/apply-packs/<rowPadded>-<slug>/cv-tailored.md`. The fragmentation gap is filename + directory divergence vs. what consumers (`build-apply-packs.mjs`, dashboard) read at `apply-pack/<slug>/tailored-cv.md`. **Phase 4.1 (Item K) is RESHAPED** — see Phase 4.

4. **CI gate on main is currently broken** (`test-all.mjs --quick`: 71 pass / 100 fail / 21 warn). Any PR would fail. New Phase 7.5.1 added.

5. **8 unmerged commits on `claude/hardcore-jemison-e36f8c`** — surface to Mitchell, do not auto-merge. New Phase 7.5.2 added.

6. **~$3 of council/researcher/dealbreaker spend across this session is NOT in any cost log.** New Phase 6.3 added.

7. **Heartbeat email has zero CV references** — Item L upgraded from 🟢 LOW to 🟡 MEDIUM (still in Phase 2.2 but priority elevated).

8. **Item D (role-header wrap) persists post-`e585aec`** — verified via `pdftotext -layout`. Stays in Phase 1.1.

If you find conflicts between this section and a downstream Phase, the downstream Phase has been updated to match this section. If still inconsistent, this section wins.

**Provenance:** these corrections are dealbreaker-adjudicated in `data/research-reports/session-audit-2026-05-17-pass2-FINAL.md` (confidence: HIGH; 11/11 second-pass items adjudicated, 8 CONFIRMED, 2 CONFIRMED with refinement, 1 PARTIAL, 0 REJECTED). Item X12 (handoff-file-doesn't-exist) was a dealbreaker false positive due to subagent path resolution — the handoff file is present at 39 KB, 768 lines.

## Cost pre-approvals (Mitchell-signed-off; no re-asking)

Mitchell pre-approved the following cost caps for this handoff. **Do not re-ask within these caps; do ask if exceeding.**

1. **Phase 1.3 (Item A one-off + further one-offs tonight) — UP TO $50 TOTAL** for any `cv-tailor.mjs` invocations Mitchell directs tonight. At ~$0.50/pack, this covers ~100 one-off tailorings — i.e., Mitchell can apply to multiple roles tonight without further sign-off as long as the running total stays under $50.

2. **Phase 4.3 (Item A batch refresh — top 5 packs) — UP TO $15** in next-session batch tailoring. Apply to the top 5 rows of `data/APPLY-NOW.md` after H + B + K ship. Run `--dry-run` first to estimate; if estimate exceeds $15, surface; otherwise proceed.

3. **Anything beyond these caps requires fresh approval.** Phase 7 (4-cycle artifact engagement research, est. $5–8) and any other LLM-spend phase remains gated as before — surface cost + scope + lineup before launching.

4. **Always log to `data/cost-log.tsv`** per Phase 6.3 schema, even if running a single one-off. Mitchell needs visibility into the $50/$15 caps' running total.

**Source-of-truth decision (Mitchell-signed-off):** This handoff document is the primary input. `data/research-reports/session-audit-2026-05-17-pass2-FINAL.md` is the auditable evidence trail when a Phase decision needs justification, but operations should drive off this file. Phase order, dependency structure, and "what NOT to do" prohibitions live here.

This brief is long because the receiving instance has no memory of the prior session. Read it through once before touching anything.

## What "uplevel only — no reversions, no deprecation" means

- **Keep every prior decision.** The 2-page design, Inter font primary, accent `#15803d`, single-column with light 2-col header, ligatures off, single-line role headers, `SKILLS_BLOCK` / `PROJECTS_BLOCK` / `EDUCATION_CERT_BLOCK` tokens, trimmed cv.md (1,289 words), evidence bullets in Skills — all stay.
- **Don't deprecate HTML or LaTeX render paths.** They exist and are wired into other tooling. Extend the Typst path alongside them; don't tear the others out.
- **No `git reset --hard`, no force-push, no rebase of shipped commits.** All prior commits on `claude/hardcore-jemison-e36f8c` must remain.
- **No pushing anywhere.** Standing rule per CLAUDE.md: NEVER push to santifer upstream. Pushes to `mitwilli-create` are user-triggered only, not agent-triggered.
- **cv.md is gitignored.** Personal data stays out of git. Use `scripts/agent-commit.mjs` only for template/renderer/script changes, never raw `git add cv.md`.

## Standing rules you must honor

From `~/.claude/CLAUDE.md` + project `CLAUDE.md` + `AGENTS.md`:

1. **NEVER push to santifer upstream.** All PRs target `mitwilli-create:main`; upstream contributions require manual gate.
2. **Personal/sensitive career data stays in fork only.** Never expose portfolio strategy / comp targets / hiring intel via cross-fork PRs.
3. **Outbound actions need confirmation.** Email send, LinkedIn DMs, public posts — confirm before sending.
4. **Cost-ceiling raises need explicit approval.** Don't modify `MONTHLY_BUDGET_USD`, `PER_RUN_CAP_*`, `MONTHLY_BUDGET_USD_BURST` without Mitchell's go-ahead.
5. **Commit corpus edits via `scripts/agent-commit.mjs`.** Never `git commit` raw for corpus changes — the helper enforces agent-attribution trailers and skips empty diffs. Usage:
   ```
   node scripts/agent-commit.mjs --agent <name> --files "a.mjs,b.typ" --message "message"
   ```
6. **Hooks are mandatory.** Never use `--no-verify` or `--no-gpg-sign` unless Mitchell explicitly asks.
7. **Knowledge cutoff is Aug 2025.** Web-search before citing docs/versions/APIs/model specs that could have changed post-cutoff.
8. **Default to PDT (UTC−7).** Current date stamping should use absolute dates, not relative.
9. **For ATS-relevant changes:** validate with `pdftotext -layout output/cv-mitchell-williams-master-*.pdf` and confirm all target keywords (FDE, Forward Deployed, Applied AI, Solutions Architect, AI Program Manager, MCP, RAG, agentic, Claude, Python, evaluation) appear in reading order.

## Critical reference files (read these before acting)

| Path | What's in it |
|---|---|
| `data/research-reports/2page-cv-design-2026-05-17.md` | Council + dealbreaker spec for the CV design (typography, layout, color, ATS constraints) |
| `data/research-reports/session-audit-2026-05-17.md` | First dealbreaker session audit — 13 items A–W classified 🔴/🟠/🟡/🟢 |
| `data/research-reports/session-audit-2026-05-17-pass2.md` | Second-pass audit (may or may not exist yet — check; it was running in background at handoff time) |
| `templates/cv-template.typ` | Current Typst template — 2-page design, Inter font, accent `#15803d` |
| `scripts/render-cv-typst.mjs` | Renderer — emits SKILLS_BLOCK / PROJECTS_BLOCK / EDUCATION_CERT_BLOCK tokens |
| `cv.md` | Source markdown — 1,289 words, gitignored, lives in main repo at `/Users/mitchellwilliams/Documents/career-ops/cv.md` (NOT inside the worktree) |
| `output/cv-mitchell-williams-master-2026-05-17.pdf` | Current master CV PDF — 2 pages, 64.2 KB |
| `templates/cv-template.html` | Legacy HTML template — still in use; do not deprecate |
| `templates/cv-template.tex` | Legacy LaTeX template — still in use; do not deprecate |
| `generate-pdf.mjs` | HTML → PDF via Playwright (legacy path) |
| `generate-latex.mjs` | LaTeX validator + pdflatex compiler (legacy path) |
| `scripts/build-apply-pack.mjs` | Per-row scaffolder; currently hardcodes the HTML path at lines 156, 197 |
| `scripts/build-apply-packs.mjs` | Canonical full pack builder; only symlinks PDFs from `output/`, no render step today |
| `scripts/agents/cv-tailor.mjs` | Per-role tailoring agent; emits HIGHLIGHTS for HTML/LaTeX templates, not Typst |
| `scripts/humanize-check.mjs` | AI detection risk gate; already wired for cover letters at `build-apply-packs.mjs:1887-1888` |
| `scripts/agent-commit.mjs` | The git commit helper — always use this |
| `apply-pack/` | 32 per-role packs; 30/32 lack `tailored-cv.md` source; 27/32 have stale `tailored-cv.pdf` symlinks |
| `lib/council.mjs` | Council orchestrator — PROVIDERS map at ~line 112 has Perplexity/xAI/OpenAI/Google but NO Anthropic entries (recurring orchestration footgun) |

## Prior session commits on `claude/hardcore-jemison-e36f8c` (DO NOT revert)

```
e585aec  fix(typst): restore dealbreaker visual spec (line-height 1.10, margins 0.45in, section heads 11.5pt)
2705fcd  fix(typst): hold 2-page target after evidence bullets returned + role keywords added
01183a0  docs(typst): document TAGLINE + COMPETENCIES_BLOCK; drop legacy COMPETENCIES token
0394d2e  fix(typst): close gaps surfaced by actual PDF audit (escapes, context, tagline, comp section)
bcbdd07  fix(typst): match cv.md format — H3=role, **Company** line=company, merge wrapped bullets
85e3453  fix(typst): URL fallbacks, macro arg-name parity, and contact-token escaping
342178e  fix(typst): skip token substitution inside // comment lines
ea694a7  feat(typst): 2-page CV design overhaul per council+dealbreaker (Inter 10pt/1.10, #15803d, single-col w/ light 2-col header, ligatures off)
```

## Cost & spend guardrails

- Default `MONTHLY_BUDGET_USD` lives in `.env` or shell env; do not raise without explicit Mitchell approval.
- The prior session's council + dealbreaker cycles spent ~$2.05 total. Budget for this continuation: assume similar order of magnitude. If a planned action exceeds $5, pause and ask.
- Council research (Phase 7 below) is gated on spend approval per item. Don't fire without explicit go-ahead.
- LLM-spend phases (apply-pack batch refresh, per-role tailoring, council research) need a `--dry-run` or `--top=N` mode first to estimate before committing.

---

# Execution plan — phased, ordered by dependency

Each phase has: (a) prerequisites, (b) commands, (c) expected output, (d) verification, (e) commit message template. Mark phases complete by re-running the verify command before moving on.

## Phase 0: Orient (5 min, no spend)

**Prerequisites:** Fresh Claude Code session with cwd set to the worktree (per the working-directory section above).

```bash
# Confirm cwd is the worktree
pwd
# Must print: /Users/mitchellwilliams/Documents/career-ops/.claude/worktrees/hardcore-jemison-e36f8c

# Confirm branch
git branch --show-current
# Should show: claude/hardcore-jemison-e36f8c

# Confirm all 8 prior commits land
git log --oneline -8
# Top should be e585aec → 2705fcd → ea694a7 → 01183a0 → 0394d2e → bcbdd07 → 85e3453 → 342178e

# Confirm audit reports exist
ls -la data/research-reports/session-audit-2026-05-17*.md data/research-reports/2page-cv-design-2026-05-17.md
# Should show: 2page-cv-design-2026-05-17.md, session-audit-2026-05-17.md, session-audit-2026-05-17-pass2.md, session-audit-2026-05-17-pass2-FINAL.md

# READ session-audit-2026-05-17-pass2-FINAL.md (dealbreaker-adjudicated; supersedes the first audit)

# Confirm master PDF is current and ATS-clean
pdftotext -layout /Users/mitchellwilliams/Documents/career-ops/output/cv-mitchell-williams-master-2026-05-17.pdf - 2>&1 | head -5
# Should show "Mitchell Williams ... Comms + Agentic Pipelines at Google ..." in reading order

# Sanity-render check — note ABSOLUTE cv.md path
node scripts/render-cv-typst.mjs \
  --input /Users/mitchellwilliams/Documents/career-ops/cv.md \
  --output /tmp/cv-orient.pdf
file /tmp/cv-orient.pdf
# Must report: PDF document, version 1.7, 2 pages

# Renderer + template health spot-check
grep -c "function escapeTypstStr\|function stripMarkdown\|function substituteTokens\|SKILLS_BLOCK" scripts/render-cv-typst.mjs
# Expect: ≥ 4
grep -c "Inter.*Carlito\|#15803d\|ligatures: false\|skill-category\|highlights-box" templates/cv-template.typ
# Expect: ≥ 5
```

**Verification:** cwd is worktree; all 8 commits present; 4 reports exist; master PDF reads in expected order; sanity render produces 2 pages; renderer + template health checks pass. No errors anywhere.

**If Phase 0 fails:** stop and report which step. Do NOT proceed to Phase 1.

## Phase 1: Tonight's no-spend items (35 min total)

### 1.1 — Item D: Fix role-header wrap collision (10 min)

The current `job-entry` macro in `templates/cv-template.typ` uses `grid(columns: (1fr, auto), ...)` for the role header. When the role+company text is long (xGE, Corp Eng, Fusion, Earlier Career), it wraps to two lines while the date stays right-aligned on line 1, creating awkward visual splits.

**Two approaches — pick (a) for the structural fix, (b) for the quick win:**

**(a) Structural fix (recommended):** Refactor `job-entry` to wrap role text cleanly with the date floating right of whichever visual line the text ends on. Reference: Typst `grid` with `auto` row heights + `place` with `dy` offset, OR use a single paragraph with `linebreak` + `#h(1fr)` + dates inline.

**(b) Quick win:** Trim role-header strings in `cv.md` so they fit on one line at ~70–75 chars including the date. **Dealbreaker-refined exact replacement text per §X5 of `session-audit-2026-05-17-pass2-FINAL.md`:**

```
### Internal Communications Lead, Program Manager
**Google — Office of Cross-Google Engineering (xGE)**  |  June 2024 – present (~2 years)
```
→
```
### Internal Comms Lead, Program Manager
**Google — Cross-Google Engineering (xGE)**  |  June 2024 – present (~2 yrs)
```

```
### Senior Communications & Content Manager
**Google — Corporate Engineering (Director-level support + TechStop)**  |  April 2018 – June 2024 (~6 years)
```
→
```
### Senior Comms & Content Manager
**Google — Corporate Engineering (TechStop)**  |  April 2018 – June 2024 (~6 yrs)
```

```
### Line Producer, "America With Jorge Ramos"
**Fusion (ABC News / Univision Joint Venture)**  |  August 2013 – October 2015
```
→
```
### Line Producer, "America With Jorge Ramos"
**Fusion (ABC News / Univision JV)**  |  Aug 2013 – Oct 2015
```

```
### Earlier Career — Broadcast & Live Production
**CCTV America · Al Jazeera English / Al Jazeera America ("The Stream" founding team)**  |  2010 – 2012
```
→ **(dealbreaker tightening — researcher's 87-char proposal may still wrap; drop the `("The Stream")` parenthetical for safety)**
```
### Earlier Career — CCTV America, Al Jazeera English, Al Jazeera America
**Broadcast & live news production · "The Stream" founding team**  |  2010 – 2012
```

The information density stays — the visual wrap goes away.

**Commands:**
```bash
# Edit cv.md (option b — manual edits with Edit tool)
# OR edit templates/cv-template.typ job-entry macro (option a)

# Re-render
node scripts/render-cv-typst.mjs --input cv.md --output /tmp/cv-after-D.pdf
pdftoppm -r 150 -png /tmp/cv-after-D.pdf /tmp/cv-after-D
# Read both PNGs and verify no role-header lines wrap

# Confirm 2 pages held
file /tmp/cv-after-D.pdf
```

**Verification:** No role header wraps to a second line in `pdftotext -layout`. Master PDF still 2 pages.

**Commit:**
```bash
node scripts/agent-commit.mjs --agent typst-template-fix \
  --files "templates/cv-template.typ" \  # if option a
  --message "fix(typst): resolve role-header wrap collision per audit Item D (option a: grid refactor)"
# OR if option b (cv.md edit):
# cv.md is gitignored — no commit needed; the edit lives on disk
```

### 1.2 — Item T + audit-trail gap: archive cv.md (5 min)

**⚠️ CORRECTION from second-pass audit (X2):** The first audit recommended `git show <pre-trim-sha>:cv.md > cv-archive.md`. **This is impossible** — `cv.md` is `.gitignore:2`, was never tracked in git, so no SHA contains it. The pre-trim content lives ONLY in the prior session's tool-call history (cannot reconstruct from disk).

**Critical ordering — archive BEFORE any further cv.md edits:**

```bash
# Snapshot current state FIRST so future trims have a baseline
mkdir -p data/cv-archives
cp /Users/mitchellwilliams/Documents/career-ops/cv.md \
   data/cv-archives/cv-2026-05-17-1289w.md

# Note: data/cv-archives/ files are .gitignored too (verify by:
#   git check-ignore -v data/cv-archives/cv-2026-05-17-1289w.md
# ). If gitignored, the archive lives on disk only — same audit-trail
# limitation as cv.md itself. Add an explicit cv-archives/ entry to
# .gitignore exception (whitelist) if you want this committable, OR
# accept the on-disk-only archive.

# If the archive path IS committable:
node scripts/agent-commit.mjs --agent dealbreaker \
  --files "data/cv-archives/cv-2026-05-17-1289w.md" \
  --message "archive: snapshot cv.md @ 1289w post-2-page-overhaul (Item T + audit-trail gap, X2 verified)"
```

**Verification:** `ls data/cv-archives/cv-2026-05-17-1289w.md` exists. Word count matches: `wc -w data/cv-archives/cv-2026-05-17-1289w.md` ≈ 1,289.

**Note for Phase 1.1 ordering:** if you plan to do Item D (role-header trim) in Phase 1.1, do the cv.md archive in this step FIRST so the 1,289w version is preserved before the further trim lands.

### 1.3 — Item A one-off (only if applying to a role tonight, ~20 min)

**Skip this if not applying tonight.** If applying:

1. Identify the target apply-pack subdir: `apply-pack/<slug>/`
2. Read the role's JD intel: `apply-pack/<slug>/grok-intel.md`, `apply-pack/<slug>/README.md`
3. Tailor a per-role markdown by copying `cv.md` and adjusting bullets/keywords:
   ```bash
   cp cv.md apply-pack/<slug>/tailored-cv.md
   # Edit tailored-cv.md to weight bullets toward the role's keywords
   # Use scripts/humanize-check.mjs --file apply-pack/<slug>/tailored-cv.md to validate voice
   ```
4. Render:
   ```bash
   node scripts/render-cv-typst.mjs \
     --input apply-pack/<slug>/tailored-cv.md \
     --output apply-pack/<slug>/tailored-cv.pdf
   ```
5. Re-symlink if a stale symlink exists:
   ```bash
   ls -la apply-pack/<slug>/tailored-cv.pdf  # check if it's a symlink to a stale file
   # If symlink, the render above replaces it with a real file
   ```
6. Verify with `pdftotext -layout`:
   ```bash
   pdftotext -layout apply-pack/<slug>/tailored-cv.pdf - | head -30
   # Confirm: NAME, tagline, contact line, role-relevant keywords present in first ~10 lines
   ```

**No commit:** `apply-pack/` contents are gitignored.

---

## Phase 2: Audit-trail + visibility upgrades (30 min, no spend)

### 2.1 — Item M: Snapshot pre-trim cv.md formally

(Subsumed by Phase 1.2 if you did the archive there. If you only did Option B, also do this:)

Document the audit-trail gap in `CLAUDE.md` so future agents know cv.md trims must be archived explicitly:

```bash
# Add a section to CLAUDE.md (project file) titled "cv.md audit trail"
# Note: cv.md is gitignored; trims/edits must be archived to data/cv-archives/
# with a SESSION NOTES entry capturing word-count delta + rationale
```

**Commit:**
```bash
node scripts/agent-commit.mjs --agent dealbreaker \
  --files "CLAUDE.md" \
  --message "docs(CLAUDE.md): document cv.md audit-trail expectation (gitignored personal data)"
```

### 2.2 — Item L: Add CV link to heartbeat email

`scripts/heartbeat.mjs` currently doesn't surface the master CV. Add a one-liner block to the heartbeat output:

```js
// In heartbeat.mjs renderHtmlEmail or buildBody section
// Look for the existing system-banner / action-cut block and add:
const cvPath = `output/cv-mitchell-williams-master-${todayIso}.pdf`;
const cvExists = existsSync(join(ROOT, cvPath));
const cvLine = cvExists
  ? `📄 Master CV: <a href="file://${join(ROOT, cvPath)}">${basename(cvPath)}</a> (rendered today)`
  : `📄 Master CV: re-render via \`npm run pdf:typst\` or \`node scripts/render-cv-typst.mjs\``;
// Add cvLine to the rendered HTML body in a 'System status' or 'Today's anchors' section
```

**Verify:**
```bash
node scripts/heartbeat.mjs --preview 2>&1 | tail -5
# Open /tmp/heartbeat-preview.html — confirm CV line appears
```

**Commit:**
```bash
node scripts/agent-commit.mjs --agent heartbeat-cv-link \
  --files "scripts/heartbeat.mjs" \
  --message "feat(heartbeat): surface today's master CV path in daily email (audit Item L)"
```

### 2.3 — Item V: Pre-flight CV freshness check

Add a freshness check to `data/pre-flight-checklist.md`:

```markdown
## CV freshness (auto-check)

- [ ] `output/cv-mitchell-williams-master-<today>.pdf` exists
- [ ] `tailored-cv.pdf` mtime ≥ last template/renderer commit timestamp
- [ ] `pdftotext -layout tailored-cv.pdf | grep -E "FDE|Forward Deployed|Applied AI|Solutions Architect"` returns ≥3 matches
- [ ] No `\@` or `\#` or `(see cv.md)` strings in the PDF text stream
```

Edit `data/pre-flight-checklist.md` and add this block. cv.md / data/ tracking decision is per repo conventions (verify whether `data/pre-flight-checklist.md` is tracked or gitignored before committing).

---

## Phase 3: Renderer/template uplevels (60–90 min, no spend)

### 3.1 — Item H: Wire HIGHLIGHTS in Typst (highest priority of Phase 3)

The HTML template has working `{{HIGHLIGHTS}}` populated by `cv-tailor.mjs`. The Typst template at `templates/cv-template.typ:285` reads literally `// {{HIGHLIGHTS}}` (commented out). The supporting `#highlights-box()` macro is defined at line 231 but never called.

**Steps:**

1. **Add HIGHLIGHTS to the renderer's tokens map** in `scripts/render-cv-typst.mjs:parseCvMarkdown`:
   ```js
   const tokens = {
     NAME: '',
     TAGLINE: '',
     // ... existing tokens ...
     HIGHLIGHTS: '',  // NEW: per-role pull-quote block
     // ... rest ...
   };
   ```

2. **Wire token population.** Two source options:
   - (a) CLI flag: `--highlights "Built FDE workflows for X; led Y team to Z"` → populates `tokens.HIGHLIGHTS`
   - (b) Read from a `## Highlights` H2 section in the input cv.md (if present, extract bullets; if absent, empty)

   Recommended: support both. CLI flag overrides cv.md section.

3. **Uncomment the template line:**
   ```typst
   // Before:
   // {{HIGHLIGHTS}}

   // After: render conditionally
   #if "{{HIGHLIGHTS}}" != "" [
     #highlights-box[{{HIGHLIGHTS}}]
   ]
   ```

   Note the Typst substitution semantics from `substituteTokens()` — the function skips `//` comment lines, so the template token line must NOT be `//` prefixed. Pattern from `TAGLINE` is the right precedent.

4. **Verify with a tailored-cv.md test fixture:**
   ```bash
   # Create a minimal test cv.md with a ## Highlights section
   # Render with and without --highlights flag
   # Confirm: empty highlights → box absent; populated → box renders correctly
   ```

5. **Update `scripts/agents/cv-tailor.mjs`** to emit Typst-compatible highlights (it currently emits HTML span tags; needs Typst content syntax).

**Commit:**
```bash
node scripts/agent-commit.mjs --agent typst-highlights \
  --files "scripts/render-cv-typst.mjs,templates/cv-template.typ,scripts/agents/cv-tailor.mjs" \
  --message "feat(typst): wire HIGHLIGHTS token (audit Item H) — per-role pull-quote support"
```

### 3.2 — Item I: Mitchell decision on evidence bullets

The dealbreaker D5 spec said "compact 3-line Skills grid, not bullet lists." Mitchell re-added the evidence bullets after I dropped them. Current renderer collapses them into a muted paragraph above the categories. **Three options for the new instance to surface to Mitchell:**

1. **Keep current compromise** (muted paragraph; current state) — workable, less spec-pure
2. **Drop evidence bullets entirely per spec** — cleanest but loses the recency signal
3. **Promote to first-class bullet items below the grid** — middle ground

Surface this as an `AskUserQuestion` to Mitchell. Don't auto-decide.

### 3.3 — Item N: Install Carlito font

Per dealbreaker spec, the font stack is `Inter, Carlito, Aptos, Arial, Liberation Sans`. Inter is installed. Carlito is the metric-compatible Calibri fallback. Install it:

```bash
brew install --cask font-carlito
# Verify:
fc-list | grep -i carlito | head -3
```

Note: this is a system-level install, not in git. Document in CLAUDE.md or AGENTS.md SESSION NOTES.

### 3.4 — Item W: Renderer regression test

Add `tests/render-cv-typst.test.mjs`:

```js
import { test } from 'node:test';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert';

test('render-cv-typst produces 2-page PDF from cv.md', () => {
  const out = '/tmp/cv-regression.pdf';
  execSync(`node scripts/render-cv-typst.mjs --input cv.md --output ${out}`);
  assert(existsSync(out));
  const pageCount = execSync(`pdfinfo ${out} | grep Pages`).toString();
  assert.match(pageCount, /Pages:\s+2/);
});

test('no markdown escape leakage in rendered PDF', () => {
  const text = execSync('pdftotext -layout /tmp/cv-regression.pdf -').toString();
  assert(!text.includes('\\@'), 'found \\@ leak');
  assert(!text.includes('\\#'), 'found \\# leak');
  assert(!text.includes('(see cv.md)'), 'found placeholder leak');
});

test('critical role keywords present', () => {
  const text = execSync('pdftotext -layout /tmp/cv-regression.pdf -').toString();
  const required = ['FDE', 'Forward Deployed', 'Applied AI', 'Solutions Architect', 'MCP', 'RAG'];
  required.forEach(kw => assert(text.includes(kw), `missing keyword: ${kw}`));
});
```

Wire into `package.json` test scripts. Add fixture if cv.md isn't a stable input.

**Commit:**
```bash
node scripts/agent-commit.mjs --agent regression-tests \
  --files "tests/render-cv-typst.test.mjs,package.json" \
  --message "test(render-cv-typst): add regression suite (audit Item W) — 2-page invariant, escape leak detection, keyword presence"
```

---

## Phase 4: Apply-pack pipeline rewire (2–4 hr, mostly no spend; batch refresh = LLM spend)

### 4.1 — Item K: RESHAPED per second-pass audit (X3 + X10)

**⚠️ CORRECTION from second-pass audit:**

X3 verified: `scripts/agents/cv-tailor.mjs:573-575` ALREADY writes a tailored markdown via `writeFileSync(artifactPath, markdown, 'utf-8')`. The first audit's framing ("write code to emit tailored-cv.md") is wrong — the code exists.

X10 verified by dealbreaker as PARTIAL (correct in shape, off by one in count):
- `cv-tailor.mjs` writes to: `data/apply-packs/<rowPadded>-<companySlug>-<roleSlug>/cv-tailored.md`
- `build-apply-packs.mjs` and the dashboard read from: `apply-pack/<slug>/tailored-cv.md`
- **Two divergences:** filename (`cv-tailored.md` vs `tailored-cv.md`) AND directory (`data/apply-packs/` vs `apply-pack/`).
- **Corrected count (dealbreaker §X10):** ONLY 1 pack has `cv-tailored.md` under `data/apply-packs/` (`050-elevenlabs-communications-manager`), not 2 as the pass-2 researcher claimed. 31 packs lack any tailored markdown in either location.
- Item E (keyword-overlap scorer ship target — Phase 5.1) is therefore scoped to **1 pack** as the no-spend proof-of-concept, not 2.

**The real gap is NOT "write code" — it's "unify path/filename + migrate existing files + run cv-tailor for the remaining 30 packs (LLM spend × 30)."**

**Steps (Mitchell decision needed first):**

1. **Decide canonical path/filename.** Use `AskUserQuestion` to surface to Mitchell:
   - (a) Standardize on `apply-pack/<slug>/tailored-cv.md` (what consumers expect today) → patch `cv-tailor.mjs:573-575` to write here
   - (b) Standardize on `data/apply-packs/<slug>/cv-tailored.md` (what cv-tailor writes today) → patch consumers (dashboard `dashboard-server.mjs:3902`, `build-apply-packs.mjs`) to read here
   - (c) Hybrid: keep both; cv-tailor writes to canonical + symlinks the alternate

   Default recommendation: (a) — fewer callsites to change; consumer paths are higher-traffic.

2. **After decision, patch the divergence:**
   - If (a): edit `cv-tailor.mjs:573-575` to write to `apply-pack/<slug>/tailored-cv.md`; migrate existing 2 packs.
   - If (b): edit `dashboard-server.mjs:3902` and any other consumer to read from `data/apply-packs/<slug>/cv-tailored.md`.
   - If (c): symlink writeout in cv-tailor.

3. **Run cv-tailor for the 30 packs that lack tailored markdown.** This IS LLM-spend work. Surface cost estimate first:
   ```bash
   node scripts/agents/cv-tailor.mjs --row=<id> --dry-run
   # Get per-row cost; multiply × 30; surface to Mitchell for approval
   ```

4. **For each tailored-cv.md produced, render the Typst PDF (depends on Phase 4.2 wiring).**

### 4.2 — Item B: Add Typst render step to canonical apply-pack builder

`scripts/build-apply-packs.mjs` currently doesn't render — it only symlinks from `output/`. Add a render step:

```js
// In the per-pack builder section, after writing tailored-cv.md:
const tailoredMdPath = join(dir, 'tailored-cv.md');
const tailoredPdfPath = join(dir, 'tailored-cv.pdf');
if (existsSync(tailoredMdPath)) {
  execSync(`node scripts/render-cv-typst.mjs --input ${tailoredMdPath} --output ${tailoredPdfPath}`);
  // Optional: also run humanize-check on the markdown
  // Optional: pdftotext keyword presence check
}
```

**Do NOT** remove or change the existing HTML symlink fallback — keep it as alternate path. The new behavior: if `tailored-cv.md` exists, render Typst PDF. Otherwise fall back to existing symlink behavior. This is additive.

Also update `scripts/build-apply-pack.mjs:156,197` stub-instruction strings to mention Typst as an option alongside the HTML path. Don't replace — add.

**Commit:**
```bash
node scripts/agent-commit.mjs --agent applypack-typst \
  --files "scripts/build-apply-packs.mjs,scripts/build-apply-pack.mjs,scripts/agents/cv-tailor.mjs" \
  --message "feat(apply-packs): wire Typst render step alongside HTML path (audit Items B + K) — additive, no deprecation"
```

### 4.3 — Item A batch refresh

Once K + B + H ship, batch-refresh the apply-pack queue. **Critical:** start with `--top=3` to validate end-to-end before full refresh.

```bash
# Dry run first
node scripts/build-apply-packs.mjs --top=3 --dry-run

# If clean, do the top 3
node scripts/build-apply-packs.mjs --top=3

# Verify each refreshed pack
for slug in $(ls apply-pack/ | head -3); do
  pdftotext -layout apply-pack/$slug/tailored-cv.pdf - | head -5
  pdfinfo apply-pack/$slug/tailored-cv.pdf | grep Pages
done

# If verified, expand
node scripts/build-apply-packs.mjs --top=10
```

**LLM spend:** budget ~$2-5 per pack for cv-tailor calls. Hard cap: don't refresh more than the top 10 in one session without spend approval.

---

## Phase 5: Cross-artifact quality gates (3–5 hr, mostly no spend)

### 5.1 — Item E: JD-keyword-alignment scoring (deterministic, no LLM)

Build `scripts/jd-keyword-score.mjs`:

```js
// Reads:
//   - apply-pack/<slug>/grok-intel.md (or README.md) — extract JD text
//   - apply-pack/<slug>/tailored-cv.md (or cv.md fallback)
//   - apply-pack/<slug>/cover-letter.md
//   - apply-pack/<slug>/form-fields.md
//
// For each artifact, compute:
//   - JD top-20 keyword overlap (TF-IDF or hand-rule list per archetype)
//   - Missing-keyword list
//   - Recommended additions
//
// Output a markdown report at apply-pack/<slug>/keyword-alignment.md
// Wire into pre-flight checklist.
```

Use `node-tfidf` or `natural` npm packages (no LLM spend). Add to apply-pack pipeline as a post-build step.

### 5.2 — Item F: Cross-artifact claim consistency check

Build `scripts/claim-consistency.mjs`:

```js
// Extracts numeric claims from cover-letter.md / linkedin/*.md:
//   - \d+%  (percentages)
//   - \$\d+ ([K|M]?)  (dollar figures)
//   - \d+x  (multiples)
//   - \d+ (years|hours|weeks|months)
//   - Named tools/orgs (cross-reference against a known-set in cv.md)
//
// For each claim, verify it appears in cv.md or apply-pack/<slug>/tailored-cv.md.
// Report any unverified claims as 🟠 RISK (potential fabrication).
//
// Wire as pre-flight gate alongside humanize-check.
```

Run on every apply-pack before submission. Deterministic fuzzy match first; LLM paraphrase matching as optional later phase.

---

## Phase 6: Council OS infrastructure (~30 min, no spend)

### 6.1 — ⚠️ REMOVED: "Wire Anthropic into PROVIDERS" was a no-op (X1 verified)

**The first audit was wrong.** Direct file inspection on `lib/council.mjs` confirms:

- PROVIDERS object opens at L125, closes at L1053
- Anthropic entries ALREADY EXIST inside it:
  - L936: `'anthropic:claude-opus-4-7'`
  - L977: `'anthropic:claude-sonnet-4-6'`
  - L1014: `'anthropic:claude-haiku-4-5'`

**Do NOT add Anthropic entries.** Doing so creates duplicate keys and would break the PROVIDERS map.

**What's actually true:** the prior researcher subagent ran without the `Agent` tool in its inventory, so it had to call `claude -p` directly. That's an Agent-tool-inventory limitation in subagent configs, NOT a PROVIDERS gap. The first audit conflated the two.

### 6.2 — Actual operational gap: researcher subagent's Agent-tool inventory

The researcher and certain other subagents can't spawn dealbreaker because `Agent` isn't in their declared tool list. This forces a handback to the parent orchestrator (or to Mitchell directly via `/dealbreaker <path>`).

**Two options:**

1. **Add `Agent` to the researcher subagent's tool list** in its frontmatter — then it can spawn dealbreaker itself. Verify which file: search `~/.claude/agents/` or the project's agent definitions for "researcher".
2. **Leave as-is and document the handback pattern** — parent orchestrator always spawns dealbreaker after researcher returns. This is the current pattern and works fine.

Recommendation: option 2 (document the handback pattern). Adding `Agent` to the researcher's inventory invites recursive subagent storms and harder cost accounting.

### 6.3 — Cost-log gap (X6 verified)

The prior session's ~$0.85 council + dealbreaker spend was NOT written to `data/cost-log.tsv` or `~/Documents/council-os/COST_LOG.md`. The session-audit cycles + dealbreaker passes are also un-logged.

**Steps:**

1. Read the existing `data/cost-log.tsv` schema (if it exists; if not, infer from `scripts/cost-logger.mjs`).
2. Append entries for:
   - Council-of-models 2-page CV design research (~$1.20–1.80)
   - Dealbreaker on that report (~$0.20)
   - Session-audit researcher pass 1 (~$0.85)
   - Session-audit researcher pass 2 (~$0.40)
   - Dealbreaker on pass 2 (~$0.30 — current)
3. Total estimate: ~$3.00 spent this session across all council/researcher/dealbreaker work.

**Long-term fix:** add a Phase 9 cost-log append hook to the researcher subagent template so future runs auto-log.

---

## Phase 7: Research expansion (gated on spend approval)

### 7.1 — Item C: 4-cycle artifact engagement research

**Do not fire without explicit Mitchell approval.** Spend estimate: $5–8 total across 4 council cycles.

The four research cycles:

1. **Cover letter engagement 2026 for AI/tech roles** — optimal length, opening-line patterns, story selection from CV bullets, evidence vs claim ratio, signature/sign-off, what causes recruiter "skip"
2. **LinkedIn DM engagement 2026 by channel** — hiring manager DM vs recruiter DM vs peer-referral request vs cold-reach: length, opening hook, ask, follow-up cadence, InMail vs free-tier
3. **Form-field answer engagement 2026** — "Why this company" / "Why this role" / "Tell us about a project": length norms, structure (STAR-R vs free-form), keyword density
4. **Cross-artifact consistency norms** — what recruiters notice when CV ↔ cover ↔ DM diverge; how to keep claims aligned without sounding boilerplate

Output: research-backed engagement rubric implemented as quality gates in `build-apply-packs.mjs`.

**Surface to Mitchell first.** Use `AskUserQuestion` with the cost estimate before launching.

---

## Phase 7.5 — NEW FROM SECOND-PASS AUDIT (X4 + X11): CI gate + branch sign-off

These are NET-NEW findings the first audit missed. Surface to Mitchell, do not auto-execute either.

### 7.5.1 — X4: CI gate broken on main

**Verified by second-pass audit + dealbreaker refinement:** `test-all.mjs --quick` currently outputs 71 pass / 100 fail / 21 warn on main. `.github/workflows/test.yml:19` runs this as the PR gate, so any PR opened today would fail CI.

**Dealbreaker-refined breakdown (NOT the researcher's "5 real / 95 noise" framing):**

- **~90 noise** (md/doc artifacts, missing-file false positives that don't affect runtime)
- **~6 real script bugs** — user-path portability issues (hardcoded `/Users/santifer/...` or similar in scripts that anyone-not-the-original-author can't run). Predate this session, but they ARE bugs.
- **4 non-path real failures** — actual logic/test failures

**Total real failures: ~10, not 5.**

**Steps:**

1. Run `node test-all.mjs --quick` and capture full failure list
2. Triage real vs stale; address the 5 real failures
3. For stale failures, either fix the assertions or add them to a known-failures allowlist
4. Re-verify with `node test-all.mjs --quick` returns 0 fail

**Do NOT** silence or bypass `.github/workflows/test.yml`. The CI gate is intentional.

**Spend:** none.

**Commit:**
```bash
node scripts/agent-commit.mjs --agent ci-stability \
  --files "<the specific test files / source files fixed>" \
  --message "fix(tests): clear real failures in test-all.mjs --quick (audit X4)"
```

### 7.5.2 — X11: 8 unmerged commits on `claude/hardcore-jemison-e36f8c`

**Verified by second-pass audit:** the 8 commits from prior session (`342178e` → `e585aec`) live ONLY on the worktree branch. Main HEAD is at `92015eb`.

**Standing rules to respect:**
- Memory: NEVER push to santifer upstream
- CLAUDE.md: pushes are user-triggered, not agent-triggered
- Anything visible to public must be reviewed first

**Default recommendation (DO NOT auto-execute):**

1. Surface to Mitchell via `AskUserQuestion`: "Merge the 8 Typst-overhaul commits into local `main` and (optionally) push to `mitwilli-create:main`?"
2. If yes: `git checkout main && git merge --ff-only claude/hardcore-jemison-e36f8c` (fast-forward to preserve history; if non-FF, abort and surface).
3. If push approved: `git push mitwilli-create main` ONLY. Never `git push santifer` (or whatever the upstream remote is named).

**Spend:** none.

## Phase 8: Polish (2–4 hr, no spend)

### 8.1 — Item J: Port design to `cv-template.tex` (LaTeX path)

Bring the LaTeX template up to current spec — Inter font (via `\setmainfont{Inter}`), accent `#15803d`, 2-page layout, single-line role headers. Don't deprecate the LaTeX path — extend it.

### 8.2 — Item S: Per-role tagline override

Add CLI flag to `render-cv-typst.mjs`: `--tagline "alt tagline"` overrides the cv.md H2. For FDE/startup pitches, the universal "Comms + Agentic Pipelines at Google" may read as comfort-zone signaling — let per-role apply-pack tailoring override.

### 8.3 — Item G: Recruiter signal recency layer

Schedule a quarterly `/researcher` run via the `schedule` skill; diff against prior reports. Cost: recurring council ($ small per quarter). Surface to Mitchell before wiring the cron.

---

## Verification — run after each phase

```bash
# Render check
node scripts/render-cv-typst.mjs --input cv.md --output /tmp/cv-verify.pdf
file /tmp/cv-verify.pdf
# Expected: PDF document, version 1.7, 2 pages

# Keyword presence
pdftotext -layout /tmp/cv-verify.pdf - | grep -ciE "FDE|Forward Deployed|Applied AI|Solutions Architect|MCP|RAG|agentic|Claude" 
# Expected: ≥ 3 matches per keyword (use tr '\n' ' ' for single-line stream if word wraps interfere)

# No regressions
pdftotext -layout /tmp/cv-verify.pdf - | grep -E '\\#|\\@|\(see cv.md\)'
# Expected: no output

# Dashboard health
node scripts/build-dashboard.mjs 2>&1 | tail -3
# Expected: "Wrote ..." line, no errors

# Heartbeat health
node scripts/heartbeat.mjs --preview 2>&1 | tail -3
# Expected: "Wrote ..." line, no errors

# Visual review (optional, requires pdftoppm)
pdftoppm -r 150 -png /tmp/cv-verify.pdf /tmp/cv-verify
# Open /tmp/cv-verify-1.png and /tmp/cv-verify-2.png
```

## What NOT to do

- **Don't revert any prior commit.** All 8 commits on `claude/hardcore-jemison-e36f8c` from the prior session stay.
- **Don't deprecate** `templates/cv-template.html`, `templates/cv-template.tex`, `generate-pdf.mjs`, or `generate-latex.mjs`. They're still wired into existing pipelines.
- **Don't push anywhere.** No `git push` to any remote. Standing rule per CLAUDE.md.
- **Don't `git add cv.md`.** It's gitignored.
- **Don't `git add` anything under `apply-pack/`.** Also gitignored (per `.gitignore`).
- **Don't fire council/researcher cycles without explicit Mitchell approval for spend.**
- **Don't raise `MONTHLY_BUDGET_USD` or `PER_RUN_CAP_*` env vars.**
- **Don't use `--no-verify` or `--no-gpg-sign` on commits.**
- **Don't auto-symlink apply-packs to the master CV** — that masks the gap (stale tailored vs current master). Re-tailor or leave broken.
- **Don't change the dealbreaker spec values** (line-height 1.10, margins 0.45in, accent `#15803d`, Inter primary, etc.). They're the result of a 6-model council + dealbreaker adjudication.
- **Don't auto-decide Mitchell-discretion items** (Item I evidence bullets, Item S tagline, Item C council research). Surface via `AskUserQuestion`.

## Hand-off when done

When all phases complete (or when Mitchell ends the session):

1. Write a session SESSION NOTES entry in `CLAUDE.md` capturing: phases completed, items deferred, any new operational gaps surfaced.
2. Re-render the master CV → `output/cv-mitchell-williams-master-<today>.pdf`.
3. Run the verification block above and paste output into the SESSION NOTES.
4. List all new commits with `git log --oneline -N` where N = phases × ~2 commits.
5. If new research reports were produced, list paths.
6. Surface any items that need Mitchell approval before next session.

## Operational sidebar — pinned for the receiving instance

**Verbatim from Mitchell:**

> Operational sidebar (worth surfacing): lib/council.mjs:112 PROVIDERS map has Perplexity/xAI/OpenAI/Google but no Anthropic entries — despite the header comment + Council OS routing-rules.md referencing them. The researcher worked around this by calling claude -p directly. Recommend wiring Anthropic into PROVIDERS (M effort, no spend) to close a recurring orchestration footgun for any future agent that dispatches via call-model.mjs.
>
> Dealbreaker's recommended next-session order:
>
> Tonight (~35 min, no spend):
>
> D — trim 4 long role headers in cv.md, re-render (10 min)
> T — archive pre-trim cv.md via git show <sha>:cv.md > cv-archive-2026-05-17.md + agent-commit (5 min)
> A one-off if applying to ONE role tonight — manually tailor + render that one (20 min)
> Next full session (1–4 hr): H → B → K → A batch → F.
>
> Deferred: C (4-cycle council research on artifact engagement, needs spend approval), G (quarterly recency refresh), W (regression test for renderer), L/N/S/U (polish).

This order is honored in the phase structure above. The receiving instance should follow Phase 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 unless Mitchell redirects.

---

*End of handoff. Begin with Phase 0 orientation. Confirm prerequisites before touching anything.*
