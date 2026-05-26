# Career-Ops — Master TODO

> Updated 2026-05-25. Owned by Patrick + Claude.

---

## 🔴 IMMEDIATE — Apply to open roles

### Abridge (2 roles, both 4.7/4.6, remote, founding security team)
- [ ] Submit Abridge AppSec (#2, score 4.7) via apply-auto.mjs on CT 203
- [ ] Submit Abridge InfraSec (#3, score 4.6) via apply-auto.mjs on CT 203
- [ ] Verify both Ashby forms still active (liveness check)
- [ ] Tailor custom Ashby question answers using evaluation Block H + voice profile

### Stale candidates from last session
- [ ] Evaluate: Turo — Staff Security Engineer, Infrastructure (Denver) — `https://wellfound.com/jobs/3104118-staff-security-engineer-infrastructure`
- [ ] Evaluate: Diligente Technologies — Sr. Cloud Security Engineer/Architect (Remote) — `https://www.dice.com/job-detail/0f3c58fc-7fc0-4879-b38c-91a2fdd22cb2`

---

## 🟡 PIPELINE IMPROVEMENTS — Make the automation smarter

### Follow-up automation (wire existing followup-cadence.mjs into Telegram)
- [ ] Create `followup-tracker.mjs` — monitors `data/applications.md` for "Applied" rows older than 5 business days with no status change
- [ ] Telegram notification: "Stripe hasn't responded in 5 days. Reply 'follow up' to send email, or 'wait' to extend."
- [ ] Draft follow-up email templates (short, Patrick's voice, not desperate)
- [ ] Wire into `telegram-listener.mjs` — add "follow up #N" command
- [ ] Track follow-up history in `data/follow-ups.md`

### Interview prep auto-generation
- [ ] Trigger on status change: "Responded" or "Interview" → auto-generate company-specific prep doc
- [ ] STAR stories mapped to their specific JD requirements (pull from story-bank.md)
- [ ] Likely interview panel (scrape company LinkedIn for hiring manager + team)
- [ ] Company culture signals (Glassdoor, recent news, tech blog)
- [ ] Salary negotiation anchors (comp range from JD + market data)
- [ ] Save to `interview-prep/{company}-{role}.md`
- [ ] Telegram: "Interview prep ready for [Company]. Key: [3 bullet summary]"

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
- [ ] Fix: same-company different-title treated as UPDATE not ADD
- [ ] Root cause: company-name matching is too fuzzy (substring match)
- [ ] Fix approach: require company + role title match (not just company)
- [ ] Add test case: two Anthropic roles should both exist in tracker
- [ ] Verify with existing data (Anthropic has 3 rows that previously collided)

### scan.mjs Spanish headers
- [ ] `## Pendientes` / `## Procesadas` in pipeline.md — should be English
- [ ] Cosmetic fix in scan.mjs output section
- [ ] Won't survive upstream update, but keeps local consistent

### Playwright version sync
- [ ] CT 203 and local now both on 1.60.0 ✅
- [ ] Add to `npm run doctor` check: warn if CT 203 version differs from local

### Built In Colorado scanner
- [ ] Agent-mode scan with Playwright on Built In Colorado category pages
- [ ] Extract individual job URLs (WebSearch only returned BIC category landing pages last session)
- [ ] Add to portals.yml as a new source

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
| Applied | 2 (Stripe, WorkOS) |
| Ready to apply | 2 (Abridge ×2) |
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
