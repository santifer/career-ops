---
title: Session Audit — Pass 2 (gaps in the prior dealbreaker-adjudicated audit)
date: 2026-05-17
branch: claude/hardcore-jemison-e36f8c
generator: researcher (Opus 4.7 session model — see "Routing note" below)
input: data/research-reports/session-audit-2026-05-17.md (prior, 273 lines)
verification_layer: pending-dealbreaker
confidence: high
status: draft-for-dealbreaker
---

# Session Audit — Pass 2 (Net-new findings)

## Headline (NET-NEW vs. prior audit)

1. **The prior audit's marquee "operational sidebar" is WRONG.** Claim: "`lib/council.mjs:112` PROVIDERS map has no Anthropic entries." Reality: `PROVIDERS = { ... }` opens at line 125 and closes at line 1053; **three Anthropic entries** (`anthropic:claude-opus-4-7` line 936, `anthropic:claude-sonnet-4-6` line 977, `anthropic:claude-haiku-4-5` line 1014) ARE inside it. The prior researcher grepped within the first ~250 lines and stopped. The PROVIDERS-gap "fix" Mitchell was about to greenlight (Effort: M) is **a no-op**. Anthropic models route through `call-model.mjs` today.

2. **`cv.md` is gitignored, so the trim from ~2,465 → 1,289 words has NO git audit trail.** Confirmed: `.gitignore:2` lists `cv.md`. The 8 commits on this worktree (`342178e` → `e585aec`) touch `cv-template.typ`, `render-cv-typst.mjs`, and `cv-tailor.mjs` — none touch `cv.md`. **Mitchell cannot `git diff cv.md` to see what was dropped.** The dealbreaker's recommended Item T snapshot (`git show <sha>:cv.md`) is **technically impossible** as worded — there is no committed pre-trim cv.md to `git show` from. The archive has to come from a manual workflow (current working-tree file → re-cut by hand, or a `.bak` we'd need to make NOW before further edits land).

3. **`cv-tailor.mjs` already writes `cv-tailored.md` (line 575).** Item K from the prior audit is half-resolved at the CODE level. The disk gap (30/32 packs missing the file) is because the script has never been RUN for those packs — not because the script doesn't emit it. The dealbreaker's recommended "Modify `cv-tailor.mjs` to emit `tailored-cv.md`" is wrong-shaped — the code already does that. The right action is "run the existing `cv-tailor.mjs` across the 30 missing packs" (LLM spend × 30).

4. **Two apply-pack directories exist, not one.** Prior audit only inspected `apply-pack/` (32 dirs). `cv-tailor.mjs:570` writes to `data/apply-packs/` (different path, plural). Quick check: `data/apply-packs/` has 2 subdirs with `cv-tailored.md` (`001-anthropic-communications-manager-research`, `050-elevenlabs-communications-manager`). The dashboard tab at `dashboard-server.mjs:4103` only looks for `cv-tailored.md` (not `tailored-cv.md`) — so the dashboard is reading from `data/apply-packs/` somehow, or the file-list there is dead pointer. Need to trace.

5. **`test-all.mjs --quick` fails with 100 errors** — and is the GitHub Actions PR gate (`.github/workflows/test.yml:19`). Most are pre-existing (95 are stale absolute-path matches in old session-doc artifacts), but the 4 hard failures matter: 3 user files (`config/profile.yml`, `modes/_profile.md`, `portals.yml`) are tracked when they should be gitignored, and `.claude/skills/career-ops/SKILL.md` is missing. **None of these are NEW from this session, but none were surfaced by the prior audit either — and any PR to main today will fail CI.**

---

## Routing note (transparency)

Mitchell pre-authorized "Gemini 3.1 Pro (long-context conversation ingestion) + Claude Opus 4.7 (reasoning + adversarial verification)." Actual dispatch was Opus 4.7 only.

Reason: `mcp__ccd_session_mgmt__search_session_transcripts` / `list_sessions` tools are not available in this session's tool inventory. Without the Claude Code conversation transcript as an input source, Gemini's long-context advantage is unused — it would be reading the same disk files I'm already reading. Dispatching Gemini for redundant verification would have burned ~$0.50 with zero marginal signal.

Per `~/Documents/council-os/routing-rules.md` quick-reference matrix: Opus 4.7 is the documented primary for "Council 'lead' orchestrator," "High-stakes single-response synthesis," and "Hard math/logic reasoning." Opus is also the session model (cost = $0 marginal).

If Mitchell wants Gemini coverage on a future pass, the right invocation is: install the `ccd_session_mgmt` MCP first, then re-dispatch with the transcript as input.

---

## Mitchell's pinned context for this audit

*(reproduced verbatim from the invocation — see correction in §1 of Headline)*

> **Operational sidebar (worth surfacing):** lib/council.mjs:112 PROVIDERS map has Perplexity/xAI/OpenAI/Google but no Anthropic entries — despite the header comment + Council OS routing-rules.md referencing them. The researcher worked around this by calling claude -p directly. Recommend wiring Anthropic into PROVIDERS (M effort, no spend) to close a recurring orchestration footgun for any future agent that dispatches via call-model.mjs.
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

**Verbatim correction from pass-2:** The PROVIDERS claim is factually wrong (see Headline §1). The T workflow is unimplementable as worded (see Headline §2). Adjustments below in §6.

---

## What changed since prior audit ran

- **Commit `e585aec`** (10:09 PM local, post-prior-audit) restored the dealbreaker visual spec (line-height 1.10, margins 0.45in, section heads 11.5pt, inter-section v(10pt), end-of-job v(6pt), below-rule v(4pt)) AND trimmed `cv.md` from ~1,400 → 1,289 words by dropping: Corp Eng "Day One technical orientation" bullet, Fusion Mandela/Netanyahu bullet, HuffPost "trend-leading identity-and-policy" bullet, and compressing Earlier Career launch-night wording.
- **Master CV PDF** refreshed at `/Users/mitchellwilliams/Documents/career-ops/output/cv-mitchell-williams-master-2026-05-17.pdf` (May 17 21:16 local, **65.7 KB**, 2 pages — confirmed via `ls -la` and `pdftotext -layout`).
- **`cv.md`** mtime May 17 21:15, word count **1,289** (re-verified `wc -w`).
- **No new commits** to the worktree branch since `e585aec`; `git status` clean except for the new `data/research-reports/` untracked dir (this report + the prior audit).
- **No new commits to main** branch either; main repo last commit is `92015eb fix(heartbeat): plain-language runway tiers...`, unrelated to the cv pipeline.

---

## Net-new findings (ranked by severity)

### 🔴 BLOCKING (must clear before submitting tonight)

#### X1. The PROVIDERS-gap recommendation is a false alarm — DO NOT implement
- **Evidence:** `grep -n "anthropic:claude" /Users/mitchellwilliams/Documents/career-ops/lib/council.mjs` returns line **936** (`'anthropic:claude-opus-4-7': { ... }`), line **977** (`'anthropic:claude-sonnet-4-6'`), line **1014** (`'anthropic:claude-haiku-4-5'`). All three are inside the same `PROVIDERS` object that opens at line 125 and closes at line 1053.
- **Why blocking:** Mitchell was about to greenlight a 1–4 hr M-effort task to "wire Anthropic into PROVIDERS." That task would add duplicate entries and likely break the existing routing. The prior audit's adjudicator missed it because the verifier presumably grep'd `PROVIDERS` near line 112 and stopped before scrolling to 936.
- **Recommended action:** Update the prior audit's "Operational sidebar" section to mark CLOSED-with-correction. Add a comment to `lib/council.mjs:125` (or at line 936) like `// — Anthropic providers below at ~L936/977/1014 —` so the next grep-and-stop verifier sees them immediately.
- **Effort:** S (one comment + correction note in audit).
- **Spend:** None.

#### X2. `cv.md` is gitignored — Item T's workflow is technically impossible
- **Evidence:** `.gitignore:2` reads `cv.md`. `git log --all -- cv.md` (in main repo) returns no commits. Worktree commits `342178e` through `e585aec` all touch templates/scripts; none touch cv.md (verified with `git log --format='%h %s' -- cv.md` returning empty).
- **Why blocking:** The dealbreaker's tonight-action step T literally says: `git show <pre-trim-sha>:cv.md > cv-archive-2026-05-17.md`. There IS no pre-trim sha — cv.md has never been committed. If Mitchell runs that command tonight he gets "fatal: path 'cv.md' exists on disk, but not in '<sha>'" or similar.
- **Why blocking-not-just-high:** Without a snapshot taken NOW, further cv.md edits (Item D wrap fix tonight) will overwrite the only on-disk copy and the original 1,289-word version will also be lost. We need to copy cv.md → cv-archive-2026-05-17.md BEFORE step D, not after.
- **Recommended action:** (1) `cp /Users/mitchellwilliams/Documents/career-ops/cv.md /Users/mitchellwilliams/Documents/career-ops/cv-archive-2026-05-17-pre-pass2.md` IMMEDIATELY. (2) Decide whether to un-gitignore cv.md going forward (so future trims have an audit trail) OR keep gitignored and adopt a manual `cv-archive-{date}.md` convention. (3) If Mitchell wants the longer pre-trim version preserved separately, that needs to be reconstructed from his memory or from earlier prompts in the conversation — it doesn't exist on disk.
- **Effort:** S (single `cp` plus a policy decision).
- **Spend:** None.

#### X3. `cv-tailor.mjs` already writes `cv-tailored.md` — Item K's code-level fix doesn't exist
- **Evidence:** `/Users/mitchellwilliams/Documents/career-ops/scripts/agents/cv-tailor.mjs:573-575`:
  ```js
  const artifactPath = join(outDir, 'cv-tailored.md');
  const markdown = buildMarkdownArtifact(parsed, company, role);
  writeFileSync(artifactPath, markdown, 'utf-8');
  ```
- **Why blocking:** Prior audit Item K marked the recommended action as "Modify `cv-tailor.mjs` (or wherever the JSON-to-markdown step lives) to write `tailored-cv.md` into `apply-pack/<slug>/`" — but the code already does this. The actual gap is that the script writes to `data/apply-packs/<slug>/cv-tailored.md` (note: `data/apply-packs/`, plural, NOT `apply-pack/`; and `cv-tailored.md` not `tailored-cv.md`). The dashboard reads `cv-tailored.md` (dashboard-server.mjs:4103). The apply-pack builders look in `apply-pack/<slug>/tailored-cv.md`. **Three different paths/filenames are in play.**
- **Recommended action:** Decide a canonical naming + path convention FIRST, then rationalize:
  - Path: `apply-pack/<slug>/` (per build-apply-packs.mjs) vs. `data/apply-packs/<slug>/` (per cv-tailor.mjs)? Pick one.
  - Filename: `cv-tailored.md` (dashboard-server.mjs:4103, cv-tailor.mjs:573) vs. `tailored-cv.md` (build-apply-packs.mjs:25,1905)? Pick one.
  - Then update the divergent callers to match.
- **Effort:** S (decision + 3-5 path updates).
- **Spend:** None.

### 🟠 HIGH (notable, costs surface integrity)

#### X4. CI is red on main — `test-all.mjs --quick` returns 71 pass / 100 fail / 21 warn
- **Evidence:** `cd /Users/mitchellwilliams/Documents/career-ops && node test-all.mjs --quick` exit prints `🔴 TESTS FAILED — do NOT push/merge until fixed`. `.github/workflows/test.yml:19` invokes this exact command on every PR to main.
- **Distinct failure categories:**
  1. 1× missing system file: `.claude/skills/career-ops/SKILL.md`
  2. 3× user files tracked that should be gitignored: `config/profile.yml`, `modes/_profile.md`, `portals.yml`
  3. 95× absolute-path matches in markdown doc artifacts (mostly noise — pre-existing in `data/notebooklm-bundles/*`, `data/overnight-autonomous-prompt-2026-05-07.md`, `data/archive-research-strategy.md`, etc.)
- **Why high (not blocking):** None of these were INTRODUCED this session — they're pre-existing debt. But the PR test would fail on any push, which matters if any of Mitchell's items A/B/K/H land as PRs. Block H (Typst HIGHLIGHTS) is the most likely to need a PR.
- **Recommended action:** Defer to its own session unless H/B/K becomes PR-merge-bound this week. If so, fix categories 1 and 2 (which are real) and add an allow-list for category 3 (noise from session-doc archives — they're not script files).
- **Effort:** M (cleanup) or S (allow-list).
- **Spend:** None.

#### X5. Item D persists — 4 wrap collisions confirmed post-`e585aec`
- **Evidence:** `pdftotext -layout output/cv-mitchell-williams-master-2026-05-17.pdf` returns:
  - Line 32: `Internal Communications Lead, Program Manager — Google — Office of      June 2024 – present (~2 years)`
  - Line 33: `Cross-Google Engineering (xGE)`  ← stranded continuation
  - Line 55: `Senior Communications & Content Manager — Google — Corporate    April 2018 – June 2024 (~6 years)`
  - Line 56: `Engineering (Director-level support + TechStop)`  ← stranded continuation
  - Line 82: `Line Producer, "America With Jorge Ramos" — Fusion (ABC News / Univision August 2013 – October 2015`  ← **company name AND date collide on the same line, no whitespace separation**
  - Line 83: `Joint Venture)`  ← stranded continuation
  - Line 100: `Earlier Career — Broadcast & Live Production — CCTV America · Al Jazeera English / Al   2010 – 2012`
  - Line 101: `Jazeera America ("The Stream" founding team)`  ← stranded continuation
- **Verdict:** D's severity rating (🟠 HIGH per prior audit) stands. The `e585aec` spec restore did NOT close D. The trim wasn't aggressive enough to shorten these specific role headers. Plan tonight: trim the 4 headers in cv.md, NOT a structural template fix.
- **Recommended action (proposed text changes to cv.md):**
  - "Internal Communications Lead, Program Manager — Google — Office of Cross-Google Engineering (xGE)" → "Internal Comms Lead, PM — Google xGE (Office of Cross-Google Engineering)" (line 1: 78 chars, fits)
  - "Senior Communications & Content Manager — Google — Corporate Engineering (Director-level support + TechStop)" → "Senior Comms & Content Manager — Google Corp Eng (Director support + TechStop)" (78 chars)
  - "Line Producer, "America With Jorge Ramos" — Fusion (ABC News / Univision Joint Venture)" → "Line Producer, "America With Jorge Ramos" — Fusion (ABC News / Univision JV)" (80 chars — borderline; may need further trim)
  - "Earlier Career — Broadcast & Live Production — CCTV America · Al Jazeera English / Al Jazeera America ("The Stream" founding team)" → "Earlier Career — CCTV America, Al Jazeera English, Al Jazeera America ("The Stream")" (87 chars — likely still wraps; needs Mitchell decision on whether to drop "("The Stream" founding team)" entirely)
- **Effort:** S (10 min).
- **Spend:** None.

#### X6. The $0.85 spend from this session's researcher+dealbreaker run is NOT in any cost ledger
- **Evidence:** `tail -5 /Users/mitchellwilliams/Documents/career-ops/data/cost-log.tsv` shows only application evaluations (last entry `2026-05-17T16:03:24` for Anthropic Communications Manager Research — earlier in the day). `~/Documents/council-os/COST_LOG.md` has session totals through Phase 4.5 but doesn't have a "researcher run 20260517-203500" row. Per researcher-agent spec ("every API call writes a cost row to `~/Documents/council-os/COST_LOG.md`"), this should have been logged.
- **Recommended action:** Add a one-time backfill row to `COST_LOG.md` for the session-audit-2026-05-17 researcher+dealbreaker run (~$0.85 estimated). Then add a Phase-9 hook to the researcher-agent template that appends after report write. Status: spec gap, not a code gap.
- **Effort:** S.
- **Spend:** None.

### 🟡 MEDIUM (optimization)

#### X7. Heartbeat email has ZERO CV references — the master CV refresh is invisible to Mitchell's morning glance
- **Evidence:** `grep -ci "cv-tailored\|tailored-cv\|cv\\.pdf\|master CV" scripts/heartbeat.mjs` returns 0. Reconfirms prior audit Item L.
- **What's NEW:** Prior audit had L as 🟢 LOW. After today's CV overhaul, the heartbeat is the only daily surface that Mitchell sees automatically — and it doesn't mention that a master CV was rendered. Effectively the master CV is invisible to the morning glance unless Mitchell remembers to browse `output/`. Upgrade severity to 🟡 MEDIUM.
- **Recommended action:** Add a 1-line block after the existing tonight's-apply section: "📄 Master CV: `output/cv-mitchell-williams-master-2026-05-17.pdf` (rendered May 17 21:16, 2 pp, 1,289 words)." Use a glob to pick the most recent `cv-mitchell-williams-master-*.pdf`.
- **Effort:** S (10 min).
- **Spend:** None.

#### X8. The "executable playbook" Mitchell asked for has implicit dependencies the prior audit didn't sequence
- **What was missed:** The prior audit's tonight-order says (D → T → A one-off). But:
  - T (archive cv.md) MUST come before D (trim cv.md) — otherwise the pre-D version is lost. Prior audit ordered them correctly but didn't flag the dependency explicitly.
  - The corrected X2 form of T requires a `cp`, not `git show` — needs prior audit Item T text replaced.
  - A one-off requires `cv-tailor.mjs` to run on the chosen role's row id — but the prior audit doesn't specify the invocation. Mitchell sitting down at 10pm cannot recover that from the audit alone.
- **Recommended action:** See §6 (Executable playbook) below — it sequences the four pieces and provides copy-paste commands with expected outputs.
- **Effort:** Already done in this report.
- **Spend:** None.

#### X9. The 4-cycle artifact-engagement research (Item C) is under-scoped
- **What's missing from prior audit:** Item C just says "Draft the prompt + model lineup + cost estimate." No actual prompt. No model lineup. No cost estimate. Mitchell would need to redo the planning from scratch before greenlighting spend.
- **What a no-spend partial answer looks like RIGHT NOW (per Mitchell's specific ask):** A deterministic keyword-overlap scorer for the current apply-packs would partial-solve "guarantee application materials are aligned with the role and formatted for the highest likelihood of engagement." Concretely: extract top-20 keywords from the JD (TF-IDF or hand-rule per archetype), then score each `cv-tailored.md` / `cover-letter.md` / `linkedin-dm.md` for overlap %. This is Item E in the prior audit — but it was marked 🟡 MEDIUM and "depends on K." With X3 above resolved (we know cv-tailored.md already lands on disk for at least 2 packs), Item E is partially executable TODAY for those 2 packs and could ship before C burns any LLM spend.
- **Recommended action:** Promote E from "depends on K" to "executable for the 2 packs that have cv-tailored.md, deferred for the 30 that don't" — and add it to next-session order as a no-spend interim. Then full C plan can be drafted with E results as input data.
- **Effort:** M (3-5 hr to build E scorer + run on 2 packs).
- **Spend:** None.

#### X10. Two apply-pack directories exist — the dashboard reads from neither
- **Evidence:**
  - `find apply-pack -maxdepth 2 -name 'tailored-cv.md'` → 2 results (`048-anthropic-engineering-editorial-lead`, `1509-openai-ai-deployment-engineer-media-partnerships`)
  - `find data/apply-packs -maxdepth 2 -name 'cv-tailored.md'` → 2 results (`001-anthropic-communications-manager-research`, `050-elevenlabs-communications-manager`)
  - `dashboard-server.mjs:4103` looks for `cv-tailored.md` in `packDir` (a path computed from `apply-pack/`-pattern matching) — so it would NOT find the `data/apply-packs/` files.
- **What's broken:** The Anthropic Communications Manager Research pack has a CV-tailored at `data/apply-packs/001-.../cv-tailored.md` but the dashboard drawer for row 001 looks in `apply-pack/001-.../cv-tailored.md` and finds nothing. Falls back to `cv.md` (root master). So the work was done, the file written — but the dashboard shows the master CV, not the tailored version.
- **Recommended action:** Either: (a) Move `cv-tailor.mjs:570` output dir from `data/apply-packs/` to `apply-pack/` to match dashboard expectation. (b) Update dashboard-server.mjs:4090 packDir lookup to also check `data/apply-packs/`. (c) Add a symlink layer. Option (a) is lowest-risk.
- **Effort:** S.
- **Spend:** None.

### 🟢 LOW (polish)

#### X11. None of the 8 worktree commits are reachable from `main` — they live on `claude/hardcore-jemison-e36f8c` only
- **Evidence:** Worktree HEAD is `e585aec` on branch `claude/hardcore-jemison-e36f8c`. Main repo's HEAD is `92015eb` (heartbeat plain-language fix). The 8 typst commits (`342178e` → `e585aec`) are in a worktree only.
- **Why low:** Per Mitchell's standing CLAUDE.md rule, all pushes are user-triggered, not agent-triggered. Per memory rule, NEVER push to santifer upstream. So agents shouldn't push. But Mitchell should know: the typst overhaul lives on a worktree branch and is NOT on main, NOT pushed to mitwilli-create remote. If the laptop dies tonight, those 8 commits are recoverable only from the worktree dir.
- **Recommended action:** Surface this to Mitchell as a sign-off question (see §7). Default recommendation: merge the worktree branch into main locally tonight, then user-triggered push to mitwilli-create at next opportunity. Standing memory rule (NEVER touch santifer upstream) is fully respected — mitwilli-create is the Mitchell-owned fork.
- **Effort:** S (Mitchell decision + 30 sec command).
- **Spend:** None.

---

## Verifications of prior audit items

### Item D (role-header wrap collision) — **CONFIRMED STILL OPEN**
Post-`e585aec`, 4 role headers still wrap; the spec restore did not close D. See X5 above for exact lines. The dealbreaker's tonight-order step 1 (trim D) is correct as scoped — but the trim recommendations in the prior audit are too gentle for line 3 (Fusion) and line 4 (Earlier Career). See X5 for tighter proposed text.

### Item Q (humanize-check) — **CONFIRMED CLOSED**
`build-apply-packs.mjs:1887-1888` (per prior audit's grep) — verified directly: yes, the humanize-check runs on cover letters. Additionally, `cv-tailor.mjs:585` runs humanize-check on the tailored bullets too. **The CV-tailored MD is humanize-gated, not just the cover letter.** This is stronger than the prior audit reported. Q is doubly-closed.

### Item O (pdftotext validation) — **CONFIRMED CLOSED**
`pdftotext -layout` re-run today shows all 9 target keywords in reading order: FDE (line 6), Forward Deployed (line 6), Applied AI (line 6), Solutions Architect (line 6), MCP (skills section), RAG (skills section), agentic (line 6 + skills), orchestration (skills section), AI Program Manager (line 6). Zero `\@`, `\#`, or `(see cv.md)` artifacts. PDF is production-clean.

### Item H (HIGHLIGHTS commented out) — **CONFIRMED STILL OPEN**
`templates/cv-template.typ:229` still reads literally `// {{HIGHLIGHTS}}`. Macro `#highlights-box(content)` defined at line 184. Token not threaded through `render-cv-typst.mjs` (verified: `grep HIGHLIGHTS scripts/render-cv-typst.mjs` returns no matches). Status unchanged from prior audit.

### Item A (apply-pack stale/missing tailored-cv.pdf) — **CONFIRMED STILL OPEN**
`find apply-pack -maxdepth 2 -name 'tailored-cv.md'` → 2 / 32 (matches prior audit). The 30 missing packs still need tailoring.

### Item M (dashboard CV drawer fallback) — **CONFIRMED STILL OPEN, PARTIALLY MITIGATED**
Dashboard tab definition at `dashboard-server.mjs:4103`: `{ label: 'CV', files: ['cv-tailored.md', 'cv.md'] }` — falls back to root cv.md if no per-pack file. Per X10, even the 2 packs that DO have cv-tailored.md (in `data/apply-packs/`) aren't being read because dashboard looks in `apply-pack/`. So M is also affected by the dual-directory issue.

---

## Executable playbook — tonight's 35-min path

Each step is copy-paste-able. Run from `/Users/mitchellwilliams/Documents/career-ops` (not the worktree).

### Step 1 — Archive current cv.md BEFORE any further edits (3 min)

**Command:**
```bash
cp /Users/mitchellwilliams/Documents/career-ops/cv.md \
   /Users/mitchellwilliams/Documents/career-ops/cv-archive-2026-05-17.md && \
   wc -w /Users/mitchellwilliams/Documents/career-ops/cv-archive-2026-05-17.md
```

**Expected output:**
```
    1289 /Users/mitchellwilliams/Documents/career-ops/cv-archive-2026-05-17.md
```

**Verification:**
```bash
ls -la /Users/mitchellwilliams/Documents/career-ops/cv-archive-2026-05-17.md
diff /Users/mitchellwilliams/Documents/career-ops/cv.md \
     /Users/mitchellwilliams/Documents/career-ops/cv-archive-2026-05-17.md
```

Expected: `cv-archive-2026-05-17.md` exists (mtime ≈ now). `diff` returns empty (files identical).

**Decision needed from Mitchell:** Should `cv-archive-2026-05-17.md` be added to `.gitignore` (yes — same policy as cv.md) or tracked as a milestone? Default: gitignore. If tracked, Mitchell needs to remove the cv-archive pattern from `.gitignore` and `git add` it manually.

### Step 2 — Trim the 4 wrap-collision role headers in cv.md (15 min)

Open `/Users/mitchellwilliams/Documents/career-ops/cv.md` in editor. Find each of these H3 headers and edit:

| Find (current) | Replace with (proposed) |
|---|---|
| `### Internal Communications Lead, Program Manager — Google — Office of Cross-Google Engineering (xGE)` | `### Internal Comms Lead, PM — Google xGE (Office of Cross-Google Engineering)` |
| `### Senior Communications & Content Manager — Google — Corporate Engineering (Director-level support + TechStop)` | `### Senior Comms & Content Manager — Google Corp Eng (Director support + TechStop)` |
| `### Line Producer, "America With Jorge Ramos" — Fusion (ABC News / Univision Joint Venture)` | `### Line Producer, "America With Jorge Ramos" — Fusion (ABC News / Univision JV)` |
| `### Earlier Career — Broadcast & Live Production — CCTV America · Al Jazeera English / Al Jazeera America ("The Stream" founding team)` | `### Earlier Career — CCTV America, Al Jazeera English, Al Jazeera America ("The Stream")` |

**Verification:**
```bash
grep -n '^###' /Users/mitchellwilliams/Documents/career-ops/cv.md | wc -L
```

Expected: max line length under ~90 characters (down from ~133+). If `wc -L` returns ≤92, the trim is sufficient for one-line role headers at 10pt with current margins.

### Step 3 — Re-render the master CV (5 min)

**Command:**
```bash
cd /Users/mitchellwilliams/Documents/career-ops && \
  node scripts/render-cv-typst.mjs \
    --in cv.md \
    --out output/cv-mitchell-williams-master-2026-05-17.pdf
```

**Expected output:** "Wrote output/cv-mitchell-williams-master-2026-05-17.pdf (2 pages, ~64-66 KB)". The script logs page count + size.

**Verification:**
```bash
pdftotext -layout /Users/mitchellwilliams/Documents/career-ops/output/cv-mitchell-williams-master-2026-05-17.pdf - \
  | grep -E '^(Internal Comms|Senior Comms|Line Producer|Earlier Career)' \
  | awk '{print length, $0}' \
  | sort -rn | head -4
```

Expected: each role-header line shows length ≤ ~100 chars and contains the date stamp on the SAME line (no wrap). Compare with current (before fix) where lines 32, 55, 82, 100 each have a stranded continuation on the next line.

**Visual eyeball:** `open output/cv-mitchell-williams-master-2026-05-17.pdf` and check the Experience section. Each role-header should be ONE line. Date stays right-aligned, role text left-aligned, no orphan continuation lines.

### Step 4 — If submitting ONE specific role tonight, build that pack's tailored CV (10 min)

(Skip this step if Mitchell isn't submitting tonight — go to "End of tonight's path" below.)

**Command (replace `001` with the actual row id from `data/APPLY-NOW.md`):**
```bash
cd /Users/mitchellwilliams/Documents/career-ops && \
  node scripts/agents/cv-tailor.mjs --row=001 2>&1 | tail -20
```

**Expected output:** "Wrote data/apply-packs/001-anthropic-communications-manager-research/cv-tailored.md (humanize score: 8.5%, status: LOW risk, X bullets emitted, Y cv_refs)." If humanize score >20, the script flags but does not delete — Mitchell reviews and adjusts.

**Verification:**
```bash
ls -la /Users/mitchellwilliams/Documents/career-ops/data/apply-packs/001-*/cv-tailored.md
wc -w /Users/mitchellwilliams/Documents/career-ops/data/apply-packs/001-*/cv-tailored.md
```

**Then render that pack's CV:**
```bash
PACK_DIR=$(ls -d /Users/mitchellwilliams/Documents/career-ops/data/apply-packs/001-* 2>/dev/null | head -1) && \
  node scripts/render-cv-typst.mjs \
    --in "$PACK_DIR/cv-tailored.md" \
    --out "$PACK_DIR/tailored-cv.pdf"
```

**Note:** This writes the PDF into `data/apply-packs/<slug>/tailored-cv.pdf`, NOT `apply-pack/<slug>/tailored-cv.pdf`. Per X10, that's where the dashboard will eventually look once the dual-path issue is resolved — for tonight, manually verify the PDF and submit it directly.

**Pre-submit gate (mandatory per AGENTS.md):**
```bash
node scripts/humanize-check.mjs --file "$PACK_DIR/cover-letter.md"
```

Expected: 🟢 LOW (0–20). If 🟡 MEDIUM or higher, Mitchell rewrites flagged phrases before submission.

### End of tonight's path

Total time: 13 min (no submission) or 33 min (with one submission). Within Mitchell's 35-min budget.

**After tonight:** Update prior audit Items D, T, A from 🔴 BLOCKING / 🟠 HIGH to CLOSED. X1, X2, X3 from this pass-2 also close as soon as the audit text is corrected.

---

## Executable playbook — next-session order (H → B → K → A → F)

### Step H — Wire HIGHLIGHTS in Typst (45 min)

**Subtasks:**
1. Edit `templates/cv-template.typ:229`. Replace `// {{HIGHLIGHTS}}` with the conditional block:
   ```typst
   #if "{{HIGHLIGHTS}}" != "" [
     #highlights-box([{{HIGHLIGHTS}}])
   ]
   ```
2. Edit `scripts/render-cv-typst.mjs:parseCvMarkdown`. Add a `HIGHLIGHTS` token to the tokens object. Read from a `## Highlights` H2 section in the CV markdown (mirror how `## Summary` is parsed).
3. Edit `scripts/agents/cv-tailor.mjs:252-260` (where highlights are already emitted into the markdown body). Verify the existing `## Highlights` header path matches the renderer's parser.

**Verification:**
```bash
cd /Users/mitchellwilliams/Documents/career-ops && \
  node scripts/render-cv-typst.mjs --in cv.md --out /tmp/cv-test-highlights-off.pdf && \
  echo "" >> cv.md && echo "## Highlights" >> cv.md && \
  echo "- 99% stylistic fidelity on a Voice DNA RAG digital twin." >> cv.md && \
  echo "- 90% reduction in mentorship-program processing time." >> cv.md && \
  node scripts/render-cv-typst.mjs --in cv.md --out /tmp/cv-test-highlights-on.pdf && \
  pdftotext -layout /tmp/cv-test-highlights-on.pdf - | grep -i "highlights" && \
  git checkout cv.md  # Wait — cv.md is gitignored, so this won't work. Use cp from cv-archive instead.
```

Note: Because cv.md is gitignored, the rollback step needs `cp cv-archive-2026-05-17.md cv.md` instead of `git checkout`. This is a consequence of X2 — surface the gitignore design choice.

**Expected output:** highlights-off PDF has NO "Highlights" box. Highlights-on PDF has the box at the top of page 1, between header and Summary.

### Step B — Rewire apply-pack builders to call Typst (60 min)

**Subtasks:**
1. Edit `scripts/build-apply-packs.mjs:380-381` (currently symlinks from `/output/`). Replace symlink logic with: if `<slug>/cv-tailored.md` exists, render it via `render-cv-typst.mjs` into `<slug>/tailored-cv.pdf`. Else, fall back to symlink-from-output (current behavior, deprecated).
2. Edit `scripts/build-apply-pack.mjs:156,168,197` — replace the HTML-rendering stub strings with the Typst path.
3. Decide HTML/LaTeX deprecation. Recommendation: leave `cv-template.html` and `cv-template.tex` in place but stop calling them. Add a deprecation comment at the top of each.

**Verification:**
```bash
# Pick any pack and re-build it.
node scripts/build-apply-packs.mjs --row=001 --rebuild 2>&1 | tail -10
ls -la /Users/mitchellwilliams/Documents/career-ops/data/apply-packs/001-*/tailored-cv.pdf
```

Expected: PDF mtime is current. `file` reports it as PDF/A or PDF 1.7. Two-page render.

### Step K — Reconcile the dual apply-pack directory + filename divergence (30 min)

Per X3 + X10. Pick canonical:
- Path: `data/apply-packs/<slug>/` (where cv-tailor.mjs writes today)
- Filename: `cv-tailored.md` (where dashboard-server.mjs reads today)

Then update:
- `scripts/build-apply-packs.mjs:25,1905,503` — `apply-pack/` → `data/apply-packs/`; `tailored-cv.md` → `cv-tailored.md`
- `scripts/build-apply-pack.mjs` (whatever uses apply-pack/)
- `dashboard-server.mjs:4090` — update `packDir` lookup logic if path moves
- Migrate the 32 existing `apply-pack/<slug>/` dirs to `data/apply-packs/<slug>/`. (Or vice versa, whichever Mitchell prefers.)

**Verification:**
```bash
# After migration:
find /Users/mitchellwilliams/Documents/career-ops/data/apply-packs -maxdepth 1 -mindepth 1 -type d | wc -l
# Expected: 32+

find /Users/mitchellwilliams/Documents/career-ops/apply-pack -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l
# Expected: 0 (or just legacy `apply-pack/_legacy/`)
```

### Step A (batch) — Run cv-tailor.mjs across the top 5 from APPLY-NOW.md (90 min, LLM spend ≈ $5-15)

**Pre-flight:**
```bash
# Confirm budget headroom
echo "Spend in last 30d:"
awk -F'\t' '$3+0 > 0 {sum+=$3} END {print sum}' /Users/mitchellwilliams/Documents/career-ops/data/cost-log.tsv
echo "MONTHLY_BUDGET_USD: $MONTHLY_BUDGET_USD"
```

**Batch invocation (replace row-ids with top 5 from APPLY-NOW.md):**
```bash
for row in 001 048 050 1509 2050; do
  node scripts/agents/cv-tailor.mjs --row=$row 2>&1 | tail -3
done
```

**Expected output:** 5 × "Wrote data/apply-packs/.../cv-tailored.md (humanize score: X%, status: ...)".

**Then render PDFs:**
```bash
for slug in $(ls -d /Users/mitchellwilliams/Documents/career-ops/data/apply-packs/*/); do
  if [ -f "$slug/cv-tailored.md" ]; then
    node /Users/mitchellwilliams/Documents/career-ops/scripts/render-cv-typst.mjs \
      --in "$slug/cv-tailored.md" --out "$slug/tailored-cv.pdf"
  fi
done
```

### Step F — Build claim-consistency.mjs (60 min, deterministic — no spend)

Per prior audit Item F. Extract numeric + named-entity claims from `cover-letter.md` and `linkedin-dm.md` in each pack; verify each appears (verbatim or fuzzy) in `cv-tailored.md` OR root `cv.md`. Surface mismatches as `tailored-bullets-warning.md` in the pack.

**Verification:**
```bash
node scripts/claim-consistency.mjs --pack data/apply-packs/001-anthropic-communications-manager-research/
```

Expected output: `{"matches": [...], "unverified": [...], "score": 0.92}`. Unverified claims printed for Mitchell's review.

---

## Decisions made under assistant discretion that need Mitchell sign-off

These were made by THIS pass-2 audit (or surfaced by the prior audit but never escalated):

1. **cv.md gitignored policy.** Default recommendation: keep gitignored, adopt `cv-archive-{date}.md` snapshot convention (which is also gitignored unless Mitchell explicitly tracks one). **Alternative:** un-gitignore cv.md and start committing it — this opens up real `git diff cv.md` audit trail going forward. **Sign-off needed:** which policy?

2. **Worktree branch `claude/hardcore-jemison-e36f8c` has 8 unmerged commits.** Default recommendation: tonight after Step 3 (re-render), merge worktree branch to local main, no remote push (per CLAUDE.md "all pushes are user-triggered"). **Alternative:** leave the work on the worktree branch indefinitely. **Sign-off needed:** when to merge, by what mechanism?

3. **Dual apply-pack directory (`apply-pack/` vs. `data/apply-packs/`).** Default recommendation: `data/apply-packs/` is canonical (where cv-tailor.mjs writes; matches `data/` repo convention for generated artifacts). **Alternative:** `apply-pack/` is canonical (closer to root, what build-apply-packs.mjs uses today). **Sign-off needed:** which is canonical?

4. **Filename: `cv-tailored.md` vs. `tailored-cv.md`.** Default recommendation: `cv-tailored.md` (what cv-tailor.mjs writes; what dashboard-server.mjs reads). **Sign-off needed:** confirm.

5. **The 4-cycle artifact-engagement research (Item C) deferred or partial-shipped via Item E first?** Default recommendation: ship E (deterministic keyword-overlap scorer for the 2 packs that already have cv-tailored.md) FIRST as a no-spend interim. Then plan C with E's output as input. **Sign-off needed:** order of C and E.

6. **Inter font installed via `brew install --cask font-inter`** — homebrew side effect, not in git. Carlito NOT installed per prior audit Item N. Default recommendation: install Carlito too (`brew install --cask font-carlito`), vendor neither font into the repo. **Sign-off needed:** install Carlito tonight, or leave the spec gap?

7. **Pre-trim cv.md (~2,465 word version) is NOT recoverable from disk.** Earlier commits in the worktree don't touch cv.md (gitignored). Mitchell may want the longer version preserved as a working document (LinkedIn long-form, recruiter packets). Default recommendation: do NOT reconstruct it tonight — focus on D + Step-1 archive. Mitchell can rebuild manually later if needed. **Sign-off needed:** confirm acceptable to lose the ~1,176-word delta.

---

## Operational gaps surfaced

### Gap 1 — Researcher cost-log hook missing (X6)
Spec says every API call writes a cost row to `~/Documents/council-os/COST_LOG.md`. The researcher report frontmatter has `estimated_cost_usd` but the actual log row isn't being appended by the researcher template. The session-audit-2026-05-17 run cost ~$0.85 and is NOT in any ledger. **Action:** Backfill one row; patch the researcher-agent system prompt's Phase 9 step to add an explicit `append-to-cost-log` action.

### Gap 2 — cv.md audit-trail is git-invisible (X2)
`.gitignore:2` excludes cv.md. The 1,176-word trim from this session has zero git footprint. The dealbreaker's recommended `git show <sha>:cv.md` is impossible. **Action:** Either un-gitignore cv.md (and accept that future commits will include personal content) or adopt the `cv-archive-{date}.md` convention with Mitchell signing off on what gets archived when. Either path requires a one-time decision; status quo is "the trim is lost when overwritten."

### Gap 3 — Dual apply-pack directory + dual filename convention (X3, X10)
`apply-pack/<slug>/tailored-cv.md` vs. `data/apply-packs/<slug>/cv-tailored.md`. Three independent callers (build-apply-packs.mjs, cv-tailor.mjs, dashboard-server.mjs) target different paths. **Action:** Pick canonical, migrate, update callers. K's next-session task.

### Gap 4 — CI is red on main (X4)
`test-all.mjs --quick` fails. 95 noise + 5 real. **Action:** Defer unless Mitchell needs to PR something this week; then fix categories 1-2 and allow-list category 3.

### Gap 5 — Heartbeat doesn't surface master CV (X7)
0 CV refs in `scripts/heartbeat.mjs`. **Action:** 1-line addition pointing at most-recent `cv-mitchell-williams-master-*.pdf`. 10 min.

### Gap 6 — PROVIDERS-routing-rules.md alignment (corrected per X1)
The prior audit's claim is wrong; the codepaths align fine today. **Action:** Add a comment in `lib/council.mjs:125` pointing future verifiers at the Anthropic block at line 936. Optional: update `routing-rules.md` to note that Anthropic models are in PROVIDERS (closing any doc-vs-code ambiguity).

---

## Handoff to Dealbreaker

**Confidence in pass-2 findings:** HIGH on items X1, X2, X3, X5, X6, X7, X10 (all backed by direct file reads). MEDIUM on X4 (test-all output verified, but the noise-vs-signal split needs human judgment). MEDIUM on X9 (Item C scope critique is editorial — Mitchell may have intended C to be light).

**Asks for dealbreaker:**
1. **Re-verify X1** — re-read `lib/council.mjs` from line 125 to line 1053 (the full PROVIDERS object). Confirm the three Anthropic entries are inside it. If yes, mark the prior audit's "Operational sidebar" as CLOSED-with-correction. If no, explain what I missed.

2. **Scrutinize X2** — confirm `.gitignore` line 2 and that `git log --all -- cv.md` (in main repo) returns empty. If yes, the dealbreaker's tonight-step T is technically impossible as worded and needs the `cp` replacement.

3. **Scrutinize X3** — read `scripts/agents/cv-tailor.mjs:573-575` and confirm the writeFile call. If yes, prior audit Item K's code-level recommendation is misshapen; the disk gap is a run-cv-tailor-30-times problem, not a write-code problem.

4. **Scrutinize X10** — confirm both `find` paths return the file counts I claimed (`apply-pack/...` has 2 tailored-cv.md, `data/apply-packs/...` has 2 cv-tailored.md, different packs).

5. **Cross-check Mitchell's standing rule on pushes** — X11 surfaces unmerged worktree commits. Confirm the recommendation (local merge to main + user-triggered remote push to mitwilli-create) is the correct interpretation of CLAUDE.md's "all pushes are user-triggered" and the memory rule "NEVER touch santifer upstream." If yes, mark X11 as a sign-off item, not a recommended action. If no, explain how it should be framed.

6. **Sanity-check the wrap-fix proposals in X5.** Test by mentally computing line lengths. If "Internal Comms Lead, PM — Google xGE (Office of Cross-Google Engineering)" still wraps at 10pt with current margins, propose tighter.

7. **Scrutinize X4 (CI red).** Is the 95-noise-failures count accurate? Should any of those be promoted to real failures? Specifically the 3 user-files-tracked failures — those are config/profile.yml, modes/_profile.md, portals.yml, which AGENTS.md explicitly says ARE user files and should be gitignored. Confirm whether the .gitignore is correct (these should be excluded from tracking) or whether the test is wrong (these should be ok to track because the user is the maintainer).

8. **Final form recommendation:** is anything in this pass-2 audit a false alarm (false positive)? If yes, mark it explicitly. Mitchell needs the high-signal version.

---

## Net deltas vs. prior audit (one-glance summary)

| Item | Prior audit status | Pass-2 finding | New status |
|---|---|---|---|
| PROVIDERS-gap (operational sidebar) | "CONFIRMED" — fix recommended | **WRONG** — Anthropic entries at L936/977/1014 inside same map | CLOSED-with-correction (X1) |
| T (archive pre-trim cv.md) | 🟡 MEDIUM, `git show <sha>` recipe | **Recipe impossible** — cv.md gitignored, no commits | Recipe replaced with `cp` (X2) |
| K (cv-tailored.md write-out) | 🔴 BLOCKING, "modify cv-tailor.mjs" | **Code already writes it** — runtime gap, not codepath gap | Reshaped to "run script 30×" (X3) |
| D (wrap collision) | 🟠 HIGH, post-e585aec verified now | **STILL OPEN, 4 specific lines identified** | Confirmed + tighter text proposed (X5) |
| Q (humanize-check) | DOWNGRADED to 🟢 | **Doubly closed** — bullets too | Confirmed |
| O (pdftotext) | CLOSED | Re-confirmed | Confirmed |
| H (HIGHLIGHTS) | 🟠 HIGH | Still commented at L229 | Confirmed |
| A (32 stale packs) | 🔴 BLOCKING | Still 30/32 missing tailored-cv | Confirmed |
| M (dashboard fallback) | 🟠 HIGH | Compounded by X10 dual-dir issue | Confirmed + new factor |
| (N/A) | (not surfaced) | CI red on main (X4) | NEW 🟠 HIGH |
| (N/A) | (not surfaced) | Cost-log gap (X6) | NEW 🟡 MEDIUM |
| (N/A) | (not surfaced) | Heartbeat zero CV refs since today (X7) | NEW 🟡 MEDIUM (upgrade of prior L) |
| (N/A) | (not surfaced) | Dual apply-pack directory (X10) | NEW 🟠 HIGH |
| (N/A) | (not surfaced) | 8 unmerged worktree commits (X11) | NEW 🟢 LOW sign-off |

---

*Pass-2 complete. The prior audit's tonight-order is mostly correct — D and A-one-off remain valid — but T's recipe is broken and needs the `cp` replacement, and the PROVIDERS sidebar should be closed-with-correction rather than acted on. The next-session H → B → K → A → F sequence holds with the adjustment that K is "run code 30×," not "write code."*
