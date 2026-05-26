# Career-Ops — Master TODO

> Updated 2026-05-25. Owned by Patrick + Claude.

---

## 🔴 IMMEDIATE — Apply to open roles

### Abridge (2 roles, both 4.7/4.6, remote, founding security team)
- [x] Submit Abridge AppSec (#2, score 4.7) via apply-auto.mjs on CT 203 ✅ 2026-05-25
- [x] Submit Abridge InfraSec (#3, score 4.6) via apply-auto.mjs on CT 203 ✅ 2026-05-25
- [x] Verify both Ashby forms still active (liveness check) ✅
- [ ] Tailor custom Ashby question answers using evaluation Block H + voice profile

### Stale candidates from last session
- [x] ~~Turo — Staff Security Engineer, Infrastructure (Denver)~~ — DEAD (HTTP 410) ✅
- [x] ~~Diligente Technologies — Sr. Cloud Security Engineer/Architect~~ — DEAD (page nav-only, no JD) ✅

---

## 🟡 PIPELINE IMPROVEMENTS — Make the automation smarter

### Follow-up automation ~~(wire existing followup-cadence.mjs into Telegram)~~
- [x] Create `followup-check.mjs` — monitors Applied rows >5 biz days, Telegram reminders ✅ 2026-05-25
- [x] Telegram notification with "follow up #N" / "wait #N" instructions ✅
- [x] Draft follow-up email templates in `templates/follow-up-emails.md` ✅ 2026-05-25
- [x] Wire into `telegram-listener.mjs` — "follow up #N", "wait #N", status commands ✅
- [x] Track follow-up history in `data/follow-ups.md` ✅
- [x] Daily cron: scan → notify → followup-check chain ✅

### Interview prep auto-generation
- [x] `generate-interview-prep.mjs` — auto-generates prep docs from eval reports ✅ 2026-05-25
- [x] Trigger: `--check` mode detects Interview/Responded without existing prep ✅
- [x] Trigger: Telegram "interview #N" auto-fires prep generation ✅
- [x] telegram-listener.mjs now updates tracker status AND triggers prep ✅
- [x] Daily pipeline chain includes `--check` step ✅
- [x] npm scripts: `npm run prep`, `npm run prep:check`, `npm run followup` ✅
- [ ] Story bank population (currently empty — needs first interview cycle)
- [ ] LinkedIn scrape for hiring manager (blocked on LinkedIn auth)
- [ ] Company culture signals (Glassdoor, tech blog) — inferred from JD for now

### LinkedIn Easy Apply automation
- [ ] Extend `apply-auto.mjs` with LinkedIn Easy Apply platform detection (`linkedin.com/jobs/view/`)
- [ ] Map LinkedIn form fields (resume upload, phone, address, work auth, cover letter toggle)
- [ ] Use existing `auth/linkedin-state.json` cookies
- [ ] Test on a throwaway application first
- [ ] Add `linkedin` to `auto_apply_platforms` in profile.yml

### Recruiter outreach engine
- [ ] After applying, auto-find hiring manager/recruiter on LinkedIn (from job posting or company page)
- [ ] Draft connection request note (1-2 sentences, Patrick's voice): "Applied to [Role] — [one proof point]."
- [ ] Telegram: "Found recruiter [Name] at [Company]. Reply 'connect' to send request."
- [ ] Wire into `telegram-listener.mjs` — add "connect #N" command
- [ ] Rate limit: max 5 connection requests/day to avoid LinkedIn jail

### Response tracking (email → status updates)
- [ ] Set up forwarding rule: recruiter replies → specific label/folder
- [ ] Parse inbound for signals: "schedule", "interview", "unfortunately", "move forward"
- [ ] Auto-update tracker status: reply detected → "Responded", interview invite → "Interview", rejection → "Rejected"
- [ ] Telegram notification on every status change
- [ ] Fallback: manual "responded #N" / "interview #N" / "rejected #N" commands in listener

---

## 🟢 DIFFERENTIATION — Stand out from other candidates

### Portfolio writeup (moorelab.cloud)
- [ ] Write a case study for moorelab.cloud: "I built a system that auto-evaluates jobs, generates tailored resumes, and submits applications via headless Playwright — all from a Proxmox container, triggered by Telegram"
- [ ] Include architecture diagram (scan → evaluate → apply flow)
- [ ] Metrics: X evaluations, Y auto-applies, Z platforms supported
- [ ] Frame as: "This is what I do at work — build AI agents that automate complex workflows in regulated environments. Here's one I built for myself."
- [ ] Link from cover letters: "moorelab.cloud has the details"

### Competitive intelligence layer
- [ ] For each applied company, auto-pull: recent funding, headcount growth, Glassdoor trends
- [ ] Add to interview-prep docs
- [ ] Feed into cover letter generation (reference company's recent moves)
- [ ] Check for recent security incidents (shows awareness, potential conversation starter)
- [ ] Sources: Crunchbase API (free tier), Glassdoor scrape, Google News

### Score recalibration from outcomes
- [ ] After 20+ applications, analyze: which scores correlate with callbacks?
- [ ] Track: score → response rate → interview rate → offer rate
- [ ] Auto-adjust thresholds based on actual outcomes
- [ ] Monthly Telegram report: "Your 4.3+ roles get callbacks 60% of the time. Consider lowering auto-apply to 4.3."

---

## 🔧 SYSTEM FIXES — Known bugs and tech debt

### merge-tracker.mjs dedup bug
- [x] Fix: switched roleFuzzyMatch from min-ratio to Jaccard similarity (0.75 threshold) ✅ 2026-05-25
- [x] Root cause: overlap/minLen gave false positives for shared generic words ✅
- [x] Test cases pass: Abridge AppSec vs InfraSec correctly treated as different ✅
- [x] test-all.mjs passes (72/72) ✅
- [ ] Add regression test to test-all.mjs (roleFuzzyMatch unit tests)

### scan.mjs Spanish headers
- [x] `## Pendientes` → `## Pending` in pipeline.md ✅ 2026-05-25
- [x] scan.mjs updated to write English headers (backward compat with legacy Spanish) ✅
- [ ] Won't survive upstream update — re-apply after `update-system.mjs apply`

### Playwright version sync
- [ ] CT 203 and local now both on 1.60.0 ✅
- [ ] Add to `npm run doctor` check: warn if CT 203 version differs from local

### Built In Colorado scanner
- [x] `scan-builtin.mjs` — Playwright scraper for Built In Colorado search pages ✅ 2026-05-25
- [x] 7 search categories: Security, Cloud Security, AI, DevSecOps/SRE, Platform, InfraSec, Cybersec ✅
- [x] Reuses portals.yml title filters and scan-history.tsv dedup ✅
- [x] Added to daily-pipeline.sh (step 2/5) ✅
- [ ] Test on CT 203 (needs Playwright chromium on the container)

---

## 📋 PATRICK'S INPUT NEEDED

These items are blocked on info only Patrick has:

- [ ] **References** — 2-3 names (Viecure Director of IT + Security, Envision peer, anyone else)
- [ ] **Notice period** — 2 weeks standard, or longer for 3-person team?
- [ ] **Verify cv.md dates/titles** — Viecure Jul 2025–Present, Envision Jul 2024–Jul 2025, etc.
- [ ] **Abridge connections** — any LinkedIn 1st/2nd at Abridge?
- [ ] **Fill `[TBD]` slots in article-digest.md** — PR-agent comment volume, Claude Code platform user count, plugin+skill count, App Insights week-1 wins
- [ ] **Open to contract-to-hire?** — Probably no, confirm
- [x] **Writing samples** — voice profile calibrated 2026-05-23 ✅
- [ ] **Portfolio writeup review** — once drafted, Patrick reviews tone on moorelab.cloud
- [ ] **Pronouns / EEO self-ID preferences** for form fields

---

## 📊 METRICS (updated 2026-05-25)

| Metric | Value |
|--------|-------|
| Total evaluated | 10 |
| Applied | 4 (Stripe, WorkOS, Abridge ×2) |
| Ready to apply | 0 |
| Auto-apply live | ✅ threshold ≥ 4.5 |
| Telegram listener | ✅ running on CT 203 |
| Platforms automated | 4 (Ashby, Greenhouse, Stripe, Lever) |
| Daily scanner | ✅ 07:00 MDT cron |
| Voice profile | ✅ calibrated |
| Cover letters generated | 4 (Abridge ×2, Stripe, WorkOS) |

---

## 🗓️ PRIORITY ORDER

1. **Now:** Submit Abridge applications (2 roles, highest scores in pipeline)
2. **Today:** Evaluate Turo + Diligente candidates
3. **This week:** Follow-up automation, interview prep auto-gen, portfolio writeup
4. **Next week:** LinkedIn Easy Apply, recruiter outreach, response tracking
5. **Ongoing:** Score recalibration, competitive intel, system fixes

---

## 🧠 Memory pointers (for next session's Claude)

- `MEMORY.md` — index (auto-loaded)
- `feedback_location_policy.md` — hard rule: remote-or-Denver only, no required travel
- `feedback_cv_output_format.md` — produce BOTH PDF (ATS) and DOCX (polished)
- `project_careerops_english_modes.md` — modes/ is translated, will revert on upstream update
- `feedback_merge_tracker_dedup_bug.md` — verify diff after every merge-tracker run
- `reference_job_sources.md` — 37 search queries + 99 tracked companies
- `voice_profile.md` — calibrated writing voice for CV/cover letter generation
