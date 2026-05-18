@AGENTS.md
<!-- Add anything Claude Code specific that other agents don't need -->

## cv.md audit trail (audit Item M, 2026-05-18)

`cv.md` is `.gitignore:2` — it is personal data that lives on disk only, NEVER tracked in git. The same applies to `data/applications.md`, `data/hm-intel/*.json`, `apply-pack/*`, and everything else listed in `.gitignore` for personal-data reasons.

**Expectation when an agent edits or trims `cv.md`:**

1. **Archive the pre-edit state first.** Before any trim or rewrite, copy the current `cv.md` to `data/cv-archives/cv-<YYYY-MM-DD>-<wordcount>w.md`. The archive path is NOT gitignored, so the archive IS committable via `scripts/agent-commit.mjs`. The diff between the archive and the current `cv.md` is the audit trail.
2. **Commit the archive via `scripts/agent-commit.mjs`**, with a message that names the upcoming change (e.g., `"archive: snapshot cv.md @ 1289w pre-Item-D-role-header-trim"`).
3. **Edit `cv.md` directly** — do not try to commit it. The helper detects gitignored files and refuses (correct behavior).
4. **Add a SESSION NOTES entry** in this file capturing the word-count delta + rationale (e.g., `"trimmed 4 role headers to fit single-line at 10.5pt bold; was 1,289w, still 1,289w (header-only edits)"`).
5. **Verify the change** via the Typst renderer + `pdftotext -layout` invariants (2-page hold, ATS keyword presence, no `\@`/`\#`/`(see cv.md)` leaks).

**Why this matters:** `cv.md` is the canonical source for evaluations, tailored variants, and the master PDF. A silent trim can dilute ATS keyword density, break downstream scoring, or remove signal a future tailoring pass needs. The archive + diff trail makes every change reversible without git.

The same expectation applies to `data/applications.md` (the canonical tracker) — but applications.md edits go through `merge-tracker.mjs` for new rows and direct Edit-tool patches for status/notes updates. There is no archive expectation for tracker edits since the status flow is itself the audit trail.

## Session Notes — 2026-05-18 (CV pipeline uplevel session)

- Phase 1.2: Archived `cv.md` @ 1289w to `data/cv-archives/cv-2026-05-17-1289w.md` (committed `525cfcb`).
- Phase 1.1 Item D (role-header wrap): Resolved via Option (b) cv.md trims — dealbreaker-refined text didn't actually fit single-line at 10.5pt bold, so the trims went further: dropped "(~N years)" annotations from dates, abbreviated "Cross-Google Engineering" → "Cross-Google Eng" for row 1, simplified Role 7 to "Earlier Career" + "CCTV America · Al Jazeera English / Al Jazeera America". Verified: 7/7 role headers single-line, 2 pages held, all ATS keywords present, no escape leaks. Option (a) structural fix (two-line layout) attempted but reverted — added ~7 lines net which broke 2-page budget without offsetting space-savings; would require font-size or v-spacing changes that violate the dealbreaker spec.
- URL liveness pass: All 20 apply-now-queue rows checked via `check-liveness.mjs` (Playwright headless). 15 active, 4 expired (#840 Cursor, #1509 OpenAI ADE, #1511 OpenAI Onboarding FDE, #2050 Anthropic Strategic Ops), 1 uncertain (#1506 Perplexity board URL). Updated `data/applications.md` for #840 (Discarded, LINK EXPIRED 2026-05-18). Fixed `data/hm-intel/anthropic-engineering-editorial-lead.json` URL: `5153680008` (which serves #1 Comms Mgr Research) → `5138099008` (the actual Editorial Lead).
- cv-tailor batch: Built `scripts/cv-tailor-batch.mjs` (live LLM wrapper around `runCvTailor`) + fixed a Zod-retry-prompt bug in `scripts/agents/cv-tailor.mjs:482` (was dropping `highlights` from the schema template, causing recurring "Required shape" failures). Ran on 12 live rows + 1 smoke test → 13 bullet ledgers produced at `data/apply-packs/<slug>/cv-tailored.md`. Total spend: ~$0.92 across the full session (well within the $50 cap).
- Known gap: cv-tailor emits a bullet ledger (highlights + tailored bullets with cv.md citations), NOT a renderable full CV. Only row 048 has an existing `apply-pack/<slug>/tailored-cv.md` source for re-rendering; the other 12 packs lack it, so refreshed PDFs were not produced. Item K (Phase 4.1) — path unification + assembly step — is the long-term fix.

## Session Notes — 2026-05-18 (autonomous build session, ~05:00-07:00)

Continuing on top of the 7 commits from earlier tonight. Mitchell explicitly authorized autonomous work + push to mitwilli-create/main.

- Pushed `claude/hardcore-jemison-e36f8c` (7 prior commits) to origin.
- Merged worktree branch into main (merge commit `7937013`), pushed main to origin. Heartbeat + dashboard scheduled scripts on main now have today's code.
- Master CV re-rendered for today's date: `output/cv-mitchell-williams-master-2026-05-18.pdf` (2 pages, all ATS keywords present, 63.5 KB).
- Phase 4.1 Item K (long-term ledger→tailored-cv assembly): new `scripts/cv-assemble-tailored.mjs` splices cv-tailor's bullet ledger into a copy of master cv.md + injects `## Highlights` H2 + renders via Typst. Smoke-tested across all 13 ledger packs from tonight's batch — 13/13 OK. Each pack now has a 2-page tailored PDF with the JD-targeted Highlights box at top and the 8 ranked bullets replacing the master-cv lines they cite.
- Typst escape robustness (`escapeTypst()`): added `<`, `>`, `$` to the escape set. The first surfaced as 'unclosed delimiter' on `<20m`; the second as 'unclosed delimiter' on `$1M annual savings` (Typst was opening math mode). The fix is content-block-only — `escapeTypstStr()` keeps the existing minimal escape set since `$ < >` are literal inside string literals.
- Phase 8 Item J (LaTeX port): deferred. The current `templates/cv-template.tex` uses pdflatex (`\pdfgentounicode=1`), which doesn't support `\setmainfont{Inter}`. Bringing the LaTeX template to design parity would require switching the `generate-latex.mjs` pipeline to xelatex — significant pipeline change for a fallback path that nobody actively uses. The handoff said don't deprecate LaTeX, so the file stays as-is.
- Phase 8 Item N (Carlito font): installed via `brew install --cask font-carlito`. The font stack in `templates/cv-template.typ` (Inter → Carlito → Aptos → Arial → Liberation Sans) now has a real metric-compatible Calibri fallback when Inter is absent.
- Phase 5 quality gates wired: `scripts/build-apply-packs.mjs` now runs `scripts/jd-keyword-score.mjs` + `scripts/claim-consistency.mjs` as post-build steps per pack. The build log surfaces headline scores (CV keyword overlap % + cross-artifact claim verification ratio); failure is soft (warning, not build error) so a pack with a 35% keyword score still builds — the warning tells the human reviewer to drill into `keyword-alignment.md` and `claim-consistency.md`.
- Phase 3 Item I (evidence bullets decision): keeping the current compromise (muted paragraph above the Skills categories). Rationale: the dealbreaker spec called for a 3-line grid without bullet lists, you re-added evidence bullets, and the current renderer collapses them into a muted paragraph. Three options were on the table per the handoff (keep / drop / promote to first-class). Keeping the current state preserves your edits + isn't spec-violating in a load-bearing way (the spec was D-tier guidance, not a hard requirement). If you want to revisit, the toggle lives in `scripts/render-cv-typst.mjs:395-415` (skillsBody construction).
