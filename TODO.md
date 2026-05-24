# Career-Ops — Next Session TODO

> Last updated 2026-05-17 EOD. Owned by Patrick; Claude works through these next session.

---

## 🔴 Items from Patrick (gathering these meaningfully improves the Abridge applications)

### Critical
- [ ] **Writing samples** — drop 1-3 examples into `~/CareerOps/career-ops/writing-samples/`: past cover letter, LinkedIn About, substantive email, blog post, etc. The `_shared.md` calibration protocol auto-extracts voice patterns into `_profile.md` so future cover letters / form answers sound like Patrick.
- [ ] **References** — 2-3 names with title, relationship, and "pre-notified Y/N" — Director of IT and Security at Viecure plus an Envision peer at minimum.
- [ ] **Notice period + earliest start date** — standard 2 weeks at Viecure, or longer given the 3-person team?
- [ ] **Verify cv.md dates/titles**:
  - Viecure: *Security & Reliability Engineer · Jul 2025 – Present*
  - Envision Cloud Security Engineer II: *Jul 2024 – Jul 2025*
  - Envision Sysadmin → System Engineer I: *May 2018 – Jul 2024*
- [ ] **Abridge connections** — any LinkedIn 1st/2nd connections, ex-Envision colleagues now there, anyone met at conferences?

### Helpful (deepens specific stories)
- [ ] **Fill `[TBD]` slots in `article-digest.md`** — specifically: PR-agent comment volume / pattern types, Claude Code platform user count, plugin+skill count shipped org-wide, App Insights week-1 specific wins, anonymized security-review artifacts.
- [ ] **Bug bounty exposure** — any HackerOne/Bugcrowd submissions, internal tabletop pen-tests, CTF participation? Even tangential.
- [ ] **Cover letter framing review** — read the 3 cover letters at `~/Documents/career-ops-2026-05-17/cover-letters/`. Anything off, missing, or to remove?

### Nice to have
- [ ] **Pronouns / EEO self-ID preferences** for form fields
- [ ] **"How did you hear about Abridge?"** framing — career-ops scanner (honest) vs softer framing
- [ ] **Open to contract-to-hire?** Probably no — confirm

---

## 🟢 Tasks Claude will run next session

### Tier 1 — apply pipeline
- [ ] Walk the Abridge Ashby form (both AppSec + InfraSec) — extract custom questions, tailor answers using Block H prose and the refreshed cover letters
- [ ] Evaluate the 2 new candidates surfaced from agent-mode scan:
  - **Turo — Staff Security Engineer, Infrastructure (Denver)** — `https://wellfound.com/jobs/3104118-staff-security-engineer-infrastructure` — likely Denver-based Staff InfraSec, direct fit pattern
  - **Diligente Technologies — Sr. Cloud Security Engineer/Architect (Remote)** — `https://www.dice.com/job-detail/0f3c58fc-7fc0-4879-b38c-91a2fdd22cb2` — Azure-preferred, consultancy-flavored

### Tier 2 — funnel
- [ ] Once writing samples are dropped, re-run cover letter generation with calibrated voice
- [ ] Ask MongoDB recruiter (#5 in heuristic top) whether the SRE/InfraSec remote-US restriction (ET/CT only) flexes to Denver MT
- [ ] Agent-mode scan with Playwright follow-up on Built In Colorado category pages to extract individual job URLs (WebSearch only returned BIC category landing pages last session)

### Tier 3 — system improvements
- [ ] Patch `merge-tracker.mjs` dedup bug (added 2026-05-17) — currently treats same-company different-title as UPDATE not ADD. Workaround: hand-edit `data/applications.md` for same-company overlaps. See `feedback_merge_tracker_dedup_bug.md` in memory.
- [ ] Re-evaluate `scan.mjs` Spanish-headers issue — currently writes `## Pendientes` / `## Procesadas` into `data/pipeline.md` even though modes/ is translated. Cosmetic, not blocking.
- [ ] Confirm Telegram delivery from yesterday's test scan landed
- [ ] (Long-term) Set up LinkedIn email-alerts → forwarding to auto-parse into pipeline.md, if Patrick wants hands-off LinkedIn ingestion

---

## 📌 Open application status (after location-policy hardening EOD 2026-05-17)

| # | Company | Role | Score | Status |
|---|---|---|---|---|
| 2 | **Abridge** | Sr/Staff Application Security Engineer | **4.7** | 🟢 Ready to apply (remote ✓) |
| 3 | **Abridge** | Sr/Staff Infrastructure Security Engineer | **4.6** | 🟢 Ready to apply (remote ✓) |
| 1, 4, 5, 7 | Anthropic ×3, CoreWeave | various | 1.0 | 🔴 SKIP — required travel to non-Denver offices |
| 6 | Cohere Health | Lead SA | 3.5 | 🔴 SKIP — comp below $160K floor |

**Two viable, both fully remote, both at Abridge.** All packages on Mac at `~/Documents/career-ops-2026-05-17/`:
- ATS-PDF + polished DOCX per role
- Tailored cover letter per role
- Combined Abridge interview-prep brief

---

## 🧠 Memory pointers (for next session's Claude)

These are key memory files the next Claude should read up front:
- `MEMORY.md` — index (auto-loaded)
- `feedback_location_policy.md` — hard rule: remote-or-Denver only, no required travel to non-Denver hubs (hardened 2026-05-17 EOD)
- `feedback_cv_output_format.md` — produce BOTH PDF (ATS) and DOCX (polished) via `anthropic-skills:docx`
- `project_careerops_english_modes.md` — modes/ is translated, will revert on upstream update
- `feedback_merge_tracker_dedup_bug.md` — verify diff after every merge-tracker run
- `reference_job_sources.md` — 37 search queries + 99 tracked companies inventory
