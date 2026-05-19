# EPSILON — ATS AI-Detection Landscape Watch — 2026-05-19

**Spend:** $0.15 (cap $8, 50× under budget)
**Models:** Perplexity Sonar Deep Research (50 citations); Grok-4-x-search returned 0 citations on both attempts and is **NOT load-bearing** for this report
**Time-window:** 2026-02-19 → 2026-05-19 (90 days)
**Verification:** 12 WebFetch + WebSearch calls against vendor first-party URLs (researcher orchestrator did NOT trust Perplexity synthesis without first-party corroboration)

---

## TL;DR (this is the load-bearing headline for DELTA cross-check)

**Zero of 7 ATS vendors have shipped AI-authorship detection on uploaded resume / cover-letter text in the last 90 days.**

The narrative HAS shifted: Workday + Lever + Greenhouse all shipped or announced identity-fraud / bot-fraud / impersonation features in this window. None of them screen the WRITING for AI authorship. Greenhouse's Ezra AI Labs acquisition (May 5, 2026) does ship AI-authorship detection — but it's scoped to **interview voice responses**, not resume uploads.

If Mitchell submits a Claude-assisted CV through any of the 7 ATSes today, **none of them runs AI-text-authorship detection on it.** This is consistent with DELTA's parallel audit of detection vendors (GPTZero, Originality, etc.) — no ATS has integrated those vendors at the application stage.

---

## Per-vendor findings (90-day window)

### Workday Recruiting + HiredScore

**Shipped in window:**
- **Workday Delivers Next Wave of Agentic AI** (Mar 17, 2026) — Sana Enterprise AI agents + **Fraudulent Application Detection** (IP geolocation + automation-likelihood scores to filter bots) — [source](https://blog.workday.com/en-us/workday-delivers-next-wave-agentic-ai-power-new-work-day.html) fetched 2026-05-19T06:50Z
- Workday Named a Leader in 2026 Gartner Magic Quadrant for TA Recruiting Suites (May 13, 2026) — recognition, not feature

**AI-content-detection?** **NO.** "Fraudulent Application Detection" targets submission method (IP + automation signals at submit time), not content origin. Perplexity Sonar Deep Research initially mis-classified this as AI-content-detection; corroboration against the vendor blog **disconfirmed** that reading.

**Implication for Mitchell:** Workday/HiredScore processes Claude-assisted CV through HiredScore AI matching (skills/experience scoring, bias-audited) + bot-filter on submission patterns. Submit via standard web form from residential IP with normal timing → no flag.

### Greenhouse

**Shipped in window:**
- **Greenhouse Real Talent with CLEAR** (May 6, 2026) — AI Talent Matching + spam protection + fraud detection + CLEAR identity verification (selfie inside MyGreenhouse) targeting "bots, fake job applicants, mass applications and patterns that suggest deception or impersonation" — [source](https://www.greenhouse.com/blog/introducing-greenhouse-real-talent) fetched 2026-05-19T06:48Z
- **Greenhouse acquires Ezra AI Labs** (May 5, 2026) — voice AI interviewer with cheat detection "flags scripted or AI-generated responses" — [blog](https://www.greenhouse.com/blog/why-were-acquiring-ezra-ai-labs) + [newsroom](https://www.greenhouse.com/newsroom/greenhouse-has-entered-into-a-definitive-agreement-to-acquire-ezra-ai-labs) fetched 2026-05-19T06:48Z

**AI-content-detection?** **PARTIAL — interview-stage only.** Ezra's cheat detection applies to interview voice/audio. Real Talent's "fraud detection" addresses identity fraud + deepfakes (impersonation, cloned voices, bots) — NOT AI-written text.

**Implication for Mitchell:** Resume/cover-letter upload → no AI-authorship gate. **BUT if a Greenhouse customer rolls out Ezra interviewer post-acquisition, Mitchell's voice responses WILL be scored for AI authorship.** Using Claude to script live interview answers via Ezra is the risk vector.

### Ashby

**Shipped in window:**
- Formula Fields + Field Comparison Filters (Mar 24)
- **Ashby Assistant** (May 7) — conversational AI agent with full Ashby context — [source](https://www.ashbyhq.com/product-updates/ashby-assistant)
- Ashby Assistant in Slack (May 7)
- **AI Talent Rediscovery** (May 7) — AI scans existing candidate DB against job criteria — [source](https://www.ashbyhq.com/product-updates/ai-talent-rediscovery)

**AI-content-detection?** **NO.** All five features are AI-assistive tools FOR the recruiter (matching, drafting, querying), not screens for AI-written candidate content.

**Implication for Mitchell:** Claude-assisted CV processed through Ashby's AI-Assisted Application Review against recruiter-defined criteria (Meets/Does not Meet with human final decision per Ashby's stated policy). No authorship detection.

### Lever

**Shipped in window:**
- **Lever Spring 2026 Release** (May 7, 2026) — four features:
  1. **AI Screening by VONQ** — structured conversational AI screening at apply stage with Candidate Dossier
  2. **Fraud Signals** — flags email-validity, phone-authenticity, bot-like patterns, work-history inconsistency
  3. UX improvements
  4. Talent Fit Custom Matching with weighted scoring
  — [source](https://www.lever.co/blog/from-chaos-to-clarity-to-connection-how-lever-s-spring-2026-release-puts-the-human-back-in-hiring) fetched 2026-05-19T06:55Z
- 2 thought-leadership posts on AI-powered candidate fraud (no products shipped)

**AI-content-detection?** **NO.** Fraud Signals enumerates exactly four signal types: email-validity, phone-authenticity, bot-like patterns, work-history consistency. NOT AI-text-authorship.

**Implication for Mitchell:** Claude-assisted CV → no AI-authorship gate. **WATCH-OUT:** if a Lever customer enables AI Screening by VONQ at apply-time (chat/voice prompts), Mitchell would be in a live AI interview surface — same Ezra-like caveat as Greenhouse.

### iCIMS

**Shipped in window:**
- **Coalesce AI brand launch** (Mar 3, 2026) — new umbrella name for iCIMS' enterprise AI — [source](https://www.icims.com/company/newsroom/brand/)
- **Spring 2026 Release with Frontline AI** (Mar 16) — Frontline AI for high-volume hourly hiring (24/7 conversational AI SMS/WhatsApp/web) + platform enhancements — [source](https://www.icims.com/company/newsroom/springrelease2026/)

**AI-content-detection?** **NO.** Neither announcement contains AI-content-detection. iCIMS' AI is matching/sourcing/engagement with stated human-oversight commitments — no authorship screening.

**Implication for Mitchell:** No AI-authorship gate. Frontline AI is targeted at hourly/non-corporate roles → unlikely to apply to Mitchell's role pool.

### Oracle Taleo / Oracle Recruiting

**Shipped in window:** **Nothing public** that meets the bar. Oracle's 26B Fusion Cloud Recruiting roadmap is on Oracle Cloud Customer Connect (login-gated). Public-facing Oracle Recruiting pages have generic GenAI/agent capability claims but no in-window press release or blog post about a shipped detection feature.

**AI-content-detection?** **NO.** Oracle Taleo on the public web is widely characterized as lacking modern built-in AI for advanced screening; Oracle Recruiting (Fusion successor) has GenAI for matching/recommendations but no public AI-authorship screening.

**Implication for Mitchell:** No AI-authorship gate. Claude-assisted CV gets standard 0–5 AI match scores across profile / education / experience / skills.

### SAP SuccessFactors

**Shipped in window:**
- **SmartRecruiters for SAP SuccessFactors: AI in Hiring** (Mar 4, 2026) — native integration; mentions "new protections such as fraud detection, enhanced consent management, and applicant data transferability" — scope NOT clarified
- **1H 2026 Release** (Apr 13, 2026) — connected suite-wide AI agents (recruiting + workforce admin + payroll + learning + performance + talent dev)
- **SAP SuccessFactors Innovations: New Era of Autonomous HCM** (May 14, 2026) — Joule Assistants

**AI-content-detection?** **NO confirmed.** Mar 4 SmartRecruiters mentions "fraud detection" generically with no distinction between identity fraud and AI-text detection — vendor language is non-specific. Perplexity surfaced a comparison-blog claim that SmartRecruiters' fraud detection "flags deepfake applications and AI-generated resumes" but **this specific quote could NOT be verified at the vendor's own pages and should be treated as unconfirmed / likely-hallucinated synthesis from secondary sources.**

**Implication for Mitchell:** No confirmed AI-authorship gate. Joule + SmartRecruiters AI matching/scoring runs. SAP's fraud detection scope is ambiguous from primary sources; safe read = "vendor mentions fraud detection without scope clarification."

---

## Synthesis (for DELTA cross-check)

| Status | Vendor(s) |
|---|---|
| Shipped explicit AI-text-authorship detection (resume/cover) | **None** |
| Shipped AI-authorship detection on interview responses | **Greenhouse via Ezra AI** (May 5, 2026 — voice/audio only) |
| Announced but not yet shipped AI-text-detection of content | None confirmed first-party. SAP/SmartRecruiters language is ambiguous |
| Shipped identity/bot/deepfake fraud detection (NOT AI-text) | Workday Fraudulent Application Detection + Greenhouse Real Talent CLEAR + Lever Fraud Signals |
| No public AI-detection feature at all | Ashby, iCIMS, Oracle Taleo, SAP SuccessFactors |

**Net change vs. 90 days ago:** Narrative shifted from "AI fraud" framing → "candidate authenticity" framing. Identity verification + bot detection + deepfake screens shipped at three vendors. ZERO vendors crossed into shipping AI-text-content-authorship detection at the application stage.

**Third-party detection-vendor integrations:** None of the 7 ATSes announced or shipped a direct integration with GPTZero, Originality, Turnitin, Copyleaks, Winston AI, Pangram Labs, or similar in the last 90 days. **Flagged for DELTA to corroborate from the detection-vendor side.**

**Routing observation (for the Council OS KB):**
- Perplexity Sonar Deep Research returned 50 citations and was load-bearing, but over-claimed in two places (Workday + SAP). First-party WebFetch verification was essential.
- Grok-4-x-search returned 0 citations on both attempts even with explicit search-forcing prompt in v2. Possible tool-firing regression as of 2026-05-19 — DELTA / Council OS KB curator should investigate before next run.
- For vendor-news + AI-detection tasks: route to Perplexity Sonar Deep Research + parallel agent-side WebFetch corroboration. Do NOT rely on Grok-x-search alone for this task family.

---

## Mitchell-facing implications

1. **At the application stage**, Claude-assisted CV upload is currently safe across all 7 ATSes audited tonight. No vendor screens uploaded text for AI authorship.
2. **At the live-interview stage**, **two risk vectors** open up:
   - **Greenhouse Ezra interviewer** (post-acquisition rollout) — voice-AI interviewer with cheat detection flagging "scripted or AI-generated responses." If Mitchell encounters Ezra in a Greenhouse-managed interview process, do NOT use AI to script live answers.
   - **Lever AI Screening by VONQ** — conversational AI screening at apply-time (chat or voice). Same caveat.
3. **Identity-fraud features** at Workday + Greenhouse + Lever target IP geolocation, automation signals at submit-time, deepfake selfies, cloned voices. Mitchell's normal-flow application (residential IP, real selfie via CLEAR, real voice) does not trip these.
4. **DELTA's parallel detection-vendor audit** corroborates: detection vendors market to recruiters / educators but no ATS has integrated them at the application stage. Until that changes, the EPSILON+DELTA shared finding is: **AI-assisted CV at apply-time is currently low-risk on the detection axis; live interview AI-assist is the risk vector to manage.**
