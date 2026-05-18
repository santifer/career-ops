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
