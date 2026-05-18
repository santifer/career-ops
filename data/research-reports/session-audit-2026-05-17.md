---
title: Session Audit — Typst CV Pipeline Overhaul
date: 2026-05-17
branch: claude/hardcore-jemison-e36f8c
adjudicator: dealbreaker
input: researcher-report-20260517-203500.md
input_mode: researcher-impasse-breaking
verification_layer: dealbreaker-independent
confidence: high
status: final
---

# Session Audit — Typst CV Pipeline Overhaul (Final, Adjudicated)

## Executive summary — read this first

1. **The master CV did ship and it is good.** `/Users/mitchellwilliams/Documents/career-ops/output/cv-mitchell-williams-master-2026-05-17.pdf` is a clean 2-page Typst 0.14.2 render (created 21:16 PT today, 65.7 KB, all ATS keywords present, zero bug strings). Sonnet's "never rendered" assertion is wrong and is rejected from this report. Item O (pdftotext validation) is independently re-verified and **closed**.
2. **But the apply-pack pipeline is fully orphaned from the new Typst renderer.** Of 32 apply-pack directories: 27 hold stale symlinks to pre-overhaul PDFs (Apr 27 – May 14), 5 have no `tailored-cv.pdf` at all (the LlamaIndex / 2× OpenAI / 2× Anthropic packs Mitchell named verbatim — all confirmed missing), and 30 of 32 lack a `tailored-cv.md` source. The two routing scripts (`scripts/build-apply-pack.mjs:156,197` hardwired to `generate-pdf.mjs --in=cv-mitchell-williams.html`; `scripts/build-apply-packs.mjs` only symlinks from `/output/`) cannot produce a Typst CV today. **Submitting any application from the current queue tonight would deliver a bug-ridden CV or no CV at all.** This is the BLOCKING quartet: A + B + K + H.
3. **D is HIGH not BLOCKING — and Q is closed.** Three role headers in the master PDF (xGE / Corporate Engineering / Line Producer) wrap to a second line while the date stays right-aligned on line 1 — confirmed by `pdftotext -layout`. Visually ugly but the PDF is still production-shippable for direct submission. The humanize-check gate the researcher flagged (Item Q) IS already wired into the canonical `scripts/build-apply-packs.mjs:1887-1888` for cover letters. Closed by inspection.

---

## Adjudication summary (what changed vs. researcher's submission)

| Researcher claim | Dealbreaker verdict | Action |
|---|---|---|
| Sonnet: "branch tip has never been rendered" | **REJECTED** — master PDF exists at `output/cv-mitchell-williams-master-2026-05-17.pdf` (Typst 0.14.2, 2 pages, 65.7 KB, 21:16 PT today) | Removed from punch list |
| Item O: pdftotext never run | **CLOSED** — dealbreaker re-ran `pdftotext` and `pdftotext -layout` on master PDF; FDE / Forward Deployed / Applied AI / Solutions Architect / MCP / RAG / agentic / orchestration / AI Program Manager all present in reading order; zero `\@`, `\#`, `(see cv.md)` bug strings | Removed from punch list |
| Item Q: humanize-check gap on per-role artifacts | **PARTIALLY REJECTED** — `build-apply-packs.mjs:1887-1888` already imports `humanize-check.mjs` and runs it on each cover letter. Gate exists for CL. Open question: form-field answers and per-pack `cv-tailored.md` are NOT humanize-checked, but spec says humanize-check is for cover letters specifically | Downgraded 🔴→🟢; renamed "Q' — form-field humanize-gate (optional extension)" |
| Item K: "0 cv-tailored.md across 32 packs" | **MOSTLY CONFIRMED** — actually 2/32 present (`048-anthropic-engineering-editorial-lead`, `1509-openai-ai-deployment-engineer-media-partnerships`); 30/32 missing. Severity 🔴 BLOCKING stands | Wording corrected, severity retained |
| Item D severity | **CONFIRMED downgrade to 🟠 HIGH** — wrap collision is real (xGE, Corporate Engineering, Line Producer role headers all wrap; dates stay right-aligned on line 1 creating awkward layout), but the master PDF is otherwise production-quality | Downgraded 🔴→🟠 |
| Item A (27 stale + 5 missing) | **CONFIRMED** — direct filesystem check verifies all 5 named packs missing `tailored-cv.pdf`; 27 symlinks to pre-overhaul PDFs (mostly May 7 / May 10) | Stands at 🔴 BLOCKING |
| Item B (HTML routing) | **CONFIRMED** — `build-apply-pack.mjs:156,197` hardwires `generate-pdf.mjs --in=cv-mitchell-williams.html`. Discovered nuance: `build-apply-packs.mjs` (canonical) doesn't render at all — line 25, 380-381, 444, 503 only **symlink** from `/output/`. So both paths fail differently | Stands at 🔴 BLOCKING; B-body updated with canonical-builder finding |
| Item H (HIGHLIGHTS commented out) | **CONFIRMED** — `templates/cv-template.typ:285` reads literally `// {{HIGHLIGHTS}}` (comment-prefixed). Macro `#highlights-box()` is defined at line 231 but never invoked | Stands at 🟠 HIGH |
| Item N (Carlito not installed) | **CONFIRMED** — `fc-list \| grep -i carlito` returns 0 matches. Inter is installed | Stands at 🟢 LOW |
| PROVIDERS routing gap | **CONFIRMED** — `lib/council.mjs:112` PROVIDERS map contains perplexity / xai / openai / google entries only. No `anthropic:*` despite header docs (line 22) claiming Anthropic support | Surfaced as operational sidebar — see end |

---

## Punch list (final, ranked by severity)

### 🔴 BLOCKING — must clear before next submission

#### A. Stale per-role tailored CVs in `apply-pack/`
- **Current state (verified):** 32 apply-pack subdirs. `find ... -name tailored-cv.pdf -type l` = 27 symlinks; `-type f` = 0 real files. The 5 packs Mitchell named (`2155-llamaindex-ai-content-engineer`, `581-openai-media-partnerships`, `584-openai-onboarding-enablement-pm-fde`, `839-anthropic-technical-enablement-lead-claude-code`, `anthropic-strategic-operations-manager-claude-marketplace`) all confirmed missing `tailored-cv.pdf`. The 27 symlinks point at `/output/*.pdf` rendered Apr 27 – May 14 — pre-overhaul, carrying `\@`/`\#` escapes, swapped company/role, 5-page Calibri layout.
- **Why blocking:** Every apply-pack currently in the queue would submit a broken artifact.
- **Recommended action:** (1) Tonight — if Mitchell is submitting ONE role, manually re-tailor that one cv.md to a `tailored-cv.md`, render via `node scripts/render-cv-typst.mjs --in <cv-tailored.md> --out apply-pack/<slug>/tailored-cv.pdf`, and re-symlink. (2) After B+K resolve — full 32-pack batch refresh.
- **Effort:** S for tonight's one-off; L for full batch.
- **Dependencies:** Standalone for one-off; blocked by B + K for batch.
- **Spend requirement:** None for one-off (uses already-trimmed cv.md). Batch refresh = LLM spend for `cv-tailor.mjs` × 32 packs.

#### B. Apply-pack pipeline still routes through HTML (Typst overhaul orphaned)
- **Current state (verified):** `scripts/build-apply-pack.mjs:156,197` hardcodes `node ../../generate-pdf.mjs --in=cv-mitchell-williams.html`. **Newly discovered**: `scripts/build-apply-packs.mjs` (the canonical full pack builder per AGENTS.md) does NOT call any renderer — it only symlinks from `output/` at line 380-381 (`path: 'apply-pack/<slug>/cv.pdf', format: 'pdf'`) and treats the artifact as "Symlink to the JD-tailored CV in /output/ (if it exists)" per line 503. So the canonical builder never invokes Typst OR Playwright; it depends on something else having produced the PDF first.
- **Why blocking:** Net-new apply-packs from either script path produce either a 5-page Calibri HTML CV (build-apply-pack.mjs) or a broken symlink (build-apply-packs.mjs).
- **Recommended action:** Add a `render` step to `build-apply-packs.mjs` that calls `scripts/render-cv-typst.mjs --in apply-pack/<slug>/tailored-cv.md --out apply-pack/<slug>/tailored-cv.pdf`. Update `build-apply-pack.mjs` stub strings (lines 156, 168, 197) to reference the Typst path. Decide: deprecate `cv-template.html` + `cv-template.tex` or keep them as legacy paths.
- **Effort:** M (1–4 hr — wiring + decision on HTML/LaTeX deprecation).
- **Dependencies:** Resolves cleanly only with H (HIGHLIGHTS token) and K (cv-tailored.md source).
- **Spend requirement:** None for the rewire.

#### K. Apply-packs have no per-role `cv-tailored.md` source
- **Current state (verified):** `find apply-pack -name tailored-cv.md` returns 2 files (048-anthropic-engineering-editorial-lead, 1509-openai-ai-deployment-engineer-media-partnerships). 30 of 32 packs missing. The two that exist appear hand-edited, not auto-emitted.
- **Why blocking:** Re-rendering a pack via Typst requires the tailored MD. Without it, every refresh re-runs `cv-tailor.mjs` from cv.md (LLM spend × N) instead of re-rendering existing tailored sources.
- **Recommended action:** Modify `cv-tailor.mjs` (or wherever the JSON-to-markdown step lives) to write `tailored-cv.md` into `apply-pack/<slug>/` before/alongside the PDF render. Back-fill decision: (a) re-run cv-tailor across all 32 packs (LLM spend) or (b) accept ground-zero from cv.md going forward.
- **Effort:** M for wiring; L for back-fill.
- **Dependencies:** Blocks A's batch refresh and B's end-to-end value.
- **Spend requirement:** None for wiring. LLM spend if back-filling.

#### H. HIGHLIGHTS token commented out in Typst
- **Current state (verified):** `templates/cv-template.typ:285` is literally `// {{HIGHLIGHTS}}`. The supporting macro `#highlights-box()` is defined at line 231 (and the colors at line 63-64) but never called. Comparison: `templates/cv-template.html` has working `{{HIGHLIGHTS}}` populated by `cv-tailor.mjs` (commit `1b73a14`).
- **Why blocking (combined with A+B):** With HIGHLIGHTS dead in Typst, migrating apply-packs to the Typst renderer drops per-role highlights silently — every pack loses its top-of-CV pull-quote. That's a regression Mitchell would notice on first eyeball.
- **Recommended action:** (1) Uncomment line 285. (2) Add `HIGHLIGHTS` to the tokens object in `scripts/render-cv-typst.mjs:parseCvMarkdown`. (3) Pass highlights via CLI flag or per-role JSON. (4) Render conditionally — empty highlights → suppress the box entirely.
- **Effort:** S–M.
- **Dependencies:** B (end-to-end value only realized once routing flips to Typst).
- **Spend requirement:** None.

### 🟠 HIGH — notable gap, costs engagement

#### D. Role-header wrap collision in master PDF
- **Current state (verified by `pdftotext -layout`):** Three role lines wrap with awkward date placement:
  - "Internal Communications Lead, Program Manager — Google — Office of / Cross-Google Engineering (xGE)" — date `June 2024 – present (~2 years)` right-aligned on line 1; `Cross-Google Engineering (xGE)` stranded on line 2.
  - "Senior Communications & Content Manager — Google — Corporate / Engineering (Director-level support + TechStop)" — same pattern.
  - "Line Producer, 'America With Jorge Ramos' — Fusion (ABC News / Univision / Joint Venture)" — `August 2013 – October 2015` collides with `Univision` on line 1; `Joint Venture)` strands on line 2.
  - "Earlier Career — Broadcast & Live Production — CCTV America · Al Jazeera English / Al / Jazeera America..." — also wraps, date `2010 – 2012` right-aligned on line 1.
- **Why high (not blocking):** Master PDF is still production-shippable; the wrap is "ugly visually" per Mitchell's own earlier flag but doesn't break ATS extraction or content fidelity. Dealbreaker spec D1 said "single-line role headers" and the current render does NOT hold that invariant.
- **Recommended action:** Two viable fixes — (a) Refactor `job-entry` macro in `cv-template.typ` to use a `grid(columns: (1fr, auto), ...)` that lays out role-text on one column and date on the other, with the date floating to the right of whichever line the role-text ends on, OR (b) Trim role-header text in `cv.md` (e.g., "Internal Comms Lead / PM" instead of "Internal Communications Lead, Program Manager — Google — Office of Cross-Google Engineering"). Option (a) is the structural fix; (b) is the quick win.
- **Effort:** S to iterate (<30 min for either approach).
- **Dependencies:** None.
- **Spend requirement:** None.

#### F. No cross-artifact claim consistency check (fabrication risk)
- **Current state (verified by inspection):** No script diffs CL / DM claims against CV bullets. With cv.md just trimmed from ~2,465 → ~1,289 words (verified: `wc -w cv.md` = 1,289), prior cover letters may reference bullets that no longer appear in the master CV — fabrication risk by omission.
- **Recommended action:** Build `scripts/claim-consistency.mjs` that extracts numeric claims (any `\d+%`, `\$\d+`, `\d+ years`, named org/tool tokens) from CL/DM text and verifies each substring (or fuzzy paraphrase) appears in `cv.md` OR `apply-pack/<slug>/tailored-cv.md`. Wire as a pre-flight gate alongside `humanize-check.mjs`.
- **Effort:** M.
- **Dependencies:** K (need per-role tailored-cv.md for accurate per-pack scope).
- **Spend requirement:** Optional LLM for paraphrase matching; deterministic fuzzy match first.

#### M. Dashboard CV tab retroactively shows trimmed cv.md across all 32 packs
- **Current state (verified):** `dashboard-server.mjs` `ARTIFACT_TABS` falls back to root `cv.md` for every pack without a per-role `cv-tailored.md`. The trim from ~2,465 → 1,289 words is now retroactively visible in every drawer.
- **Why high:** Long-form bullet repository is gone from working-tree filesystem (only recoverable from git history); apply-packs built before today look "stripped" in the dashboard now.
- **Recommended action:** (1) Snapshot the pre-trim cv.md via `git show <pre-trim-sha>:cv.md > cv-archive-2026-05-17.md`; commit via `scripts/agent-commit.mjs`. (2) Long-term — K resolution (per-role `tailored-cv.md`) eliminates the fallback dependency entirely.
- **Effort:** S (archive snapshot is a single git command).
- **Dependencies:** K for long-term fix.
- **Spend requirement:** None.

### 🟡 MEDIUM — optimization, can defer

#### C. 4-cycle council research on application-pack engagement signals
- **Current state:** Mitchell asked for a plan; no execution. No spend approval sought.
- **Recommended action:** Draft the prompt + model lineup + cost estimate; surface for spend approval. Scope: cover-letter engagement signals 2026, LinkedIn DM by channel, form-field engagement, cross-artifact consistency norms.
- **Effort:** L for execution.
- **Dependencies:** None.
- **Spend requirement:** Council ($).

#### E. Cross-artifact JD-keyword-alignment scoring
- **Current state:** `build-apply-packs.mjs` doesn't score keyword overlap between JD and tailored artifacts.
- **Recommended action:** Add deterministic keyword-overlap scorer to pre-flight. Extract JD top-20 keywords (TF-IDF or hand-rule list per archetype) and surface which artifacts hit which.
- **Effort:** M.
- **Dependencies:** K for per-role CV comparison.
- **Spend requirement:** None (deterministic).

#### I. Skill-categorization rendering — evidence bullets vs. spec
- **Current state (verified):** Dealbreaker spec D5 said "compact 3-line Skills grid, not bullet lists." Commit `2705fcd` re-added evidence bullets. Current renderer collapses them into a muted paragraph (`render-cv-typst.mjs:316-330` — confirmed by extract: "Date-anchor prompt design — Shipped the DATE_ANCHOR_DEFAULT() pattern..." renders as one inline paragraph above the grid).
- **Recommended action:** Decide between (a) keep the muted-paragraph compromise (current state), (b) drop evidence bullets entirely per spec, (c) promote them to first-class bulleted items below the grid. Current compromise is workable — flag for Mitchell decision.
- **Effort:** S.
- **Dependencies:** None.

#### J. `cv-template.tex` (LaTeX path) did not get the overhaul
- **Current state:** Last commit `07912a0` "Calibri redesign" predates the council/dealbreaker work.
- **Recommended action:** Decide deprecate-vs-port. Deprecate (S) is simpler — Typst is faster and visually superior; LaTeX is redundant. Port (M) mirrors the Typst spec.
- **Effort:** S (deprecate) or M (port).
- **Dependencies:** None.
- **Spend requirement:** None.

#### T. Pre-trim cv.md not archived
- **Current state:** cv.md trimmed in-place from ~2,465 → 1,289 words (verified). Git history preserves prior versions via `git log -p cv.md`, but no first-class snapshot file exists in the working tree.
- **Recommended action:** Commit `cv-archive-2026-05-17.md` capturing the pre-trim version. Useful for LinkedIn long-form artifacts, recruiter packets, or restoring specific bullets if needed.
- **Effort:** S.
- **Dependencies:** None.
- **Spend requirement:** None.

#### V. Pre-flight checklist doesn't gate CV freshness
- **Current state:** `data/pre-flight-checklist.md` predates tonight's overhaul. No "tailored-cv.pdf mtime ≥ render-cv-typst.mjs last-touched" check.
- **Recommended action:** Add freshness item: "verify `tailored-cv.pdf` mtime ≥ commit `ea694a7` timestamp."
- **Effort:** S.
- **Dependencies:** None.
- **Spend requirement:** None.

#### R. `scripts/build-apply-packs.mjs` routing (resolved by dealbreaker inspection)
- **Status:** Researcher asked for verification; dealbreaker grepped the file directly. Findings folded into Item B body above. **No further action needed for this item specifically.**

### 🟢 LOW — nice-to-have

#### G. Recruiter / hiring-manager signal recency layer
- **Current state:** Research dated 2026-05-17. No refresh mechanism.
- **Recommended action:** Schedule a quarterly `/researcher` run via the `schedule` skill; diff against prior reports.
- **Effort:** S.
- **Spend requirement:** Recurring council ($ small per quarter).

#### L. Heartbeat email doesn't surface CV
- **Current state (verified):** `heartbeat.mjs` has no `cv.md` / `tailored-cv.md` / `cv.pdf` references.
- **Recommended action:** Add "Master CV (rendered $DATE, $PAGES pp, $WORDCOUNT words)" line with `file://` link.
- **Effort:** S.
- **Spend requirement:** None.

#### N. Carlito font not installed
- **Current state (verified):** `fc-list \| grep -i carlito` returns 0. Inter installed. Dealbreaker's recommended fallback stack `Inter, Carlito, Aptos, Arial, Liberation Sans` has a hole.
- **Recommended action:** `brew install --cask font-carlito` on dev machine. For CI/portability, vendor the font into the repo OR document the gap.
- **Effort:** S.
- **Spend requirement:** None (free).

#### O. pdftotext validation
- **Status:** CLOSED. Researcher ran it; dealbreaker re-ran it. Master PDF passes — all 9 target keywords (FDE, Forward Deployed, Applied AI, Solutions Architect, MCP, RAG, agentic, orchestration, AI Program Manager) present in reading order with `-layout`; zero bug strings (`\@`, `\#`, `(see cv.md)`). No action.

#### Q. Humanize-check on per-role artifacts
- **Status:** DOWNGRADED FROM 🔴. `scripts/build-apply-packs.mjs:1887-1888` imports `humanize-check.mjs` and runs it on every cover letter (verified by direct inspection). AGENTS.md mandates humanize-check "before any cover letter submission" — the canonical builder satisfies this. The remaining gap is for form-field answers (>50w) and per-pack `tailored-cv.md` — those are NOT covered. Treat as optional extension.
- **Recommended action (optional):** Add humanize-check call for form-field answers in `build-apply-packs.mjs` between generation and write-out.
- **Effort:** S.

#### S. Tagline "Comms + Agentic Pipelines at Google" ties identity to current employer
- **Current state (verified in master PDF):** Tagline reads literally as quoted. For outbound applications, "at Google" is fine as credibility anchor but may read as comfort-zone signaling for FDE/startup pitches.
- **Recommended action:** Consider per-role tagline override (CLI flag in `render-cv-typst.mjs`) OR shortest-effort: drop "at Google" from cv.md and let the Experience section anchor the affiliation.
- **Effort:** S.

#### W. No regression test for `render-cv-typst.mjs` round-trip
- **Current state:** Given the bug volume surfaced this session (URL parsing, macro arg names, escape sequences, H3/Company swap, wrapped bullets, evidence bullets), the renderer is proven fragile.
- **Recommended action:** Add `test/render-cv-typst.test.mjs` with a fixture cv.md and snapshot the substituted .typ source.
- **Effort:** M.
- **Spend requirement:** None.

#### P. JD-keyword audit was master-level, not per-role
- **Status:** Subsumed by Item E. No standalone action.

#### U. Master CV PDF has no canonical dashboard/heartbeat link
- **Status:** Subsumed by Item L. No standalone action.

---

## Unaddressed inputs / deflected asks

- **"Per-role tailored CVs in `output/` are stale"** — acknowledged but no execution plan beyond Item A.
- **"4-cycle council research on application-pack engagement signals"** — Mitchell asked for a plan; no spend approval was sought (Item C).
- **"PDF is ugly visually"** — partially addressed by reverting compression (`e585aec`); specific wrap-collision complaints NOT re-verified post-fix until this dealbreaker pass (Item D).
- **"How does this affect the dashboard CV drawers?"** — never explicitly asked, but the cv.md trim retroactively changed every drawer's content (Item M).
- **HIGHLIGHTS in Typst** — Mitchell may have expected feature parity with the HTML path; Typst left the token commented out (Item H).

## Decisions made under assistant discretion

These defaults were picked without explicit Mitchell sign-off — revisit if any feel wrong:

1. **Line-height 1.05 → 1.10 (final)** — aggressive compression reverted in `e585aec`. If 2-pages doesn't hold after wrap fix, choice between dropping to 1.05 again vs. further cv.md trim was not surfaced.
2. **`#15803d` darkened green** — chose the lighter of dealbreaker's two offerings; either passes WCAG AA.
3. **Inter primary, no Carlito install** — used Inter only; Carlito as Calibri-metric fallback specced but never installed (Item N).
4. **Evidence bullets re-added** (commit `2705fcd`) — directly conflicts with dealbreaker D5 spec. Resolution: collapsed into muted paragraph in renderer. Compromise, not the spec (Item I).
5. **Skills BLOCK above Experience** — followed dealbreaker O3. Worth confirming Mitchell prefers vs. classic Experience-first.
6. **No TAGLINE per-role override** — left universal at "Comms + Agentic Pipelines at Google" (Item S).
7. **HTML / LaTeX paths untouched** — Items B and J not surfaced as "deprecate or maintain three paths?" choices.
8. **cv.md trimmed in-place, not archived** — no pre-trim snapshot file (Item T).

---

## Recommended next-session order

**Tonight (if submitting first thing tomorrow):**

1. **(10 min) Item D — wrap fix.** Quickest win: trim the 4 long role headers in `cv.md` (e.g., "Internal Comms Lead / PM — Google xGE"). Re-render. Eyeball master PDF.
2. **(5 min) Item T — archive pre-trim cv.md.** `git show <pre-trim-sha>:cv.md > cv-archive-2026-05-17.md && node scripts/agent-commit.mjs --agent dealbreaker --files cv-archive-2026-05-17.md --message "archive pre-trim cv.md (2,465w version)"`. Closes M's long-term fallback dependency partially.
3. **(20 min) Item A one-off.** If submitting ONE role tonight, manually tailor one `tailored-cv.md`, render via `node scripts/render-cv-typst.mjs --in apply-pack/<slug>/tailored-cv.md --out apply-pack/<slug>/tailored-cv.pdf`, re-symlink, run pdftotext sanity check, submit.

**Next full session (1–4 hr):**

4. **Item H — wire HIGHLIGHTS in Typst.** Uncomment line 285; thread token through `parseCvMarkdown`; conditional render via `#highlights-box()`.
5. **Item B — rewire apply-pack builders.** Add Typst render step to `build-apply-packs.mjs`; update `build-apply-pack.mjs` stub strings; decide HTML/LaTeX deprecation.
6. **Item K — wire `tailored-cv.md` write-out.** Modify `cv-tailor.mjs` to emit per-pack markdown alongside PDF render.
7. **Item A batch refresh.** Now that B+K+H ship, batch-refresh the top 5 from `data/APPLY-NOW.md` (not all 32 at once).
8. **Item F — claim-consistency script.** Deterministic fuzzy match first; LLM paraphrase optional later.

**Defer:** C (council research — needs spend approval), G (quarterly schedule), W (regression test), L/N/S/U (polish). Item Q is closed by inspection.

---

## Operational sidebar — Council OS routing-rules.md ↔ lib/council.mjs PROVIDERS mismatch

**Not part of the punch list, but Mitchell should know:**

Routing failure during the researcher dispatch surfaced a maintenance gap. `lib/council.mjs` line 112 defines `PROVIDERS = { ... }`. Contents (verified by grep):
- `perplexity:sonar-deep-research` ✅
- `perplexity:sonar-reasoning-pro` ✅
- `perplexity:sonar-pro` ✅
- `xai:grok-4` ✅
- `xai:grok-4-fast-reasoning` ✅
- `xai:grok-4-x-search` ✅
- `xai:grok-4-20-multi-agent` ✅
- `openai:gpt-5` ✅
- `openai:gpt-5-5-pro` ✅
- `openai:gpt-5-4` ✅
- `openai:gpt-5-3-chat-latest` ✅
- `google:gemini-2.5-pro` ✅
- `google:gemini-3-flash` ✅
- **`anthropic:*` — NONE.**

The same file's header comment at line 22 advertises `anthropic:claude-opus-4-7` as a routable slot ("usually skipped (session model)"), and `~/Documents/council-os/` routing-rules.md references `anthropic:*` slugs throughout. But the PROVIDERS map has no entries — so `scripts/call-model.mjs anthropic:claude-opus-4-7 ...` fails silently when invoked.

**Recovery used:** The researcher re-dispatched Anthropic models via `claude -p` (headless mode per AGENTS.md). Worked, but it's a workaround, not a fix.

**Two ways to close it:**
1. **Wire Anthropic into `lib/council.mjs` PROVIDERS** — define the request/response shape parallel to the `openai:gpt-5` block; use `ANTHROPIC_API_KEY`. Brings Anthropic models to first-class routable status.
2. **Update routing-rules.md** to note that Anthropic slugs route through `claude -p` not `call-model.mjs`. Documents the divergence without code changes.

Recommend (1) — the divergence is otherwise a recurring orchestration footgun for any agent that reads routing-rules.md and dispatches via `call-model.mjs`. Effort: M. Spend: none.

---

*Adjudication complete. Master CV is production-shippable for direct submission tonight. Apply-pack queue is NOT — A/B/K/H are the blocking quartet. Item D is fixable in 30 min. Items O and Q are closed by verification. Next-session order above is sequenced to unblock the queue without batch-burning LLM spend until B+K+H land.*
