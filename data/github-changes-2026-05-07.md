# GitHub Changes — 2026-05-07
*Auth: OK. Push policy: WRITE-ONLY. Mitchell reviews and pushes manually.*
*All sections below are ready-to-paste or ready-to-apply. No changes have been pushed.*

---

## 7B — Profile README — READY TO PASTE

**Repo:** mitwilli-create/mitwilli-create
**File:** README.md
**Action:** Replace full file with version below (targeted additions, not a structural rewrite).
**Changes made:**
1. Mission paragraph inserted above Google xGE table
2. "Personal projects" table reframed with org-scale descriptions
3. "Currently building" section added
4. "Personal projects" section header renamed to "Open-source projects"
5. No broken images to fix (profile README has no image references — confirmed via API)

---

### FULL README — PASTE THIS INTO mitwilli-create/mitwilli-create/README.md

```markdown
### Mitchell Williams — AI systems + editorial craft

I build AI systems that scale editorial and communications work at team level — shipped in production for 1,000+ senior engineers at Google, calibrated in live-broadcast environments where every segment carried legal, political, or safety exposure. Background: The Stream · HuffPost Live · AJ+ · Google xGE. Now targeting frontier AI roles where shipping is as important as storytelling.

---

#### Google xGE — production systems

| System | Stack | Impact |
|---|---|---|
| **[comms-triage-agent](https://github.com/mitwilli-create/comms-triage-agent)** | Apps Script + Gemini | ~160 ops hrs/year recaptured across a 1,000-engineer organization at >90% classification accuracy |
| **Voice DNA / Executive RAG pipeline** | Claude | 90% reduction in VP drafting time; 99% stylistic fidelity |
| **Senior IC Mentorship Platform** | LLM matching + automation | 300%+ deployment scaling; 90% admin-time reduction |

---

#### Open-source projects

| Project | Stack | What it does |
|---|---|---|
| **[voice-os](https://github.com/mitwilli-create/voice-os)** | Claude | Six-axis voice scoring and dual-persona routing; 99% stylistic fidelity at VP-scale deployment — calibrated on 6.9M+ words |
| **[tax-verification-agent](https://github.com/mitwilli-create/tax-verification-agent)** | Claude | Citation-gated tax verification with four-layer knowledge base — caught a $19,000 state income error that commercial software defended as correct |
| **[career-ops](https://github.com/mitwilli-create/career-ops)** | Node.js + Claude | AI job-search pipeline enabling team-scale evaluation: 740+ offers screened, 100+ tailored CVs generated, unattended nightly batch eval |

---

#### Currently building

- **comms-triage-agent** — extending the three-prompt architecture (triage → revise → escalate) with adaptive KB loading and VP-signal detection. [Read the architecture →](https://github.com/mitwilli-create/comms-triage-agent/blob/main/ARCHITECTURE.md)
- **voice-os** — six-axis scoring system for LLM output quality gates; Kill List methodology for eliminating AI slop patterns at the team level. [See how it works →](https://github.com/mitwilli-create/voice-os)
- **tax-verification-agent** — expanding citation-gated reasoning to multi-state filers; knowledge-base architecture that makes complex regulatory verification usable for non-experts. [See the catch →](https://github.com/mitwilli-create/tax-verification-agent)

---

#### Background

Ten years in newsrooms on tight deadlines and regulatory exposure — CNN breaking news, AJ+ digital, HuffPost Live, Fusion. At Google since 2018. Editorial rigor and broadcast discipline applied to engineering audiences and VP-level communications at organization scale.

---

#### Find me

- [LinkedIn](https://linkedin.com/in/mitwilli) · [thestorytellermitch.com](https://thestorytellermitch.com) · mitwilli@gmail.com
```

---

## 7C — comms-triage-agent README — Impact Hook — READY TO PASTE

**Repo:** mitwilli-create/comms-triage-agent
**File:** README.md
**Action:** Insert the following 3-line callout block at the very top of the file — ABOVE the `# Comms Triage Agent` title. Do not change anything else.

**INSERT THIS AT LINE 1 (above everything):**

```markdown
> **Impact:** ~160 ops hours/year recaptured across a 1,000-engineer organization at >90% classification accuracy. Three-prompt architecture (triage → revise → escalate) with dynamic knowledge-base loading. [Production deployment at Google xGE, 2024–present.]

---

```

**Resulting file top (after paste) should look like:**

```markdown
> **Impact:** ~160 ops hours/year recaptured across a 1,000-engineer organization at >90% classification accuracy. Three-prompt architecture (triage → revise → escalate) with dynamic knowledge-base loading. [Production deployment at Google xGE, 2024–present.]

---

# Comms Triage Agent

Autonomous triage, revision, and escalation for a high-volume internal communications intake queue...
```

---

## 7D — Per-Company Positioning Docs

**File:** data/github-company-positioning-2026-05-07.md
*Written separately — see that file.*

---

## 7D — Repo Description Updates — READY TO PASTE VIA gh CLI

The following `gh repo edit` commands update descriptions and topics. **DO NOT RUN until manually reviewed.** Copy-paste each command individually.

### voice-os — description update
```bash
gh repo edit mitwilli-create/voice-os \
  --description "Six-axis voice scoring, dual-persona routing, QA gates. 99% stylistic fidelity at VP-scale deployment. Calibrated on 6.9M+ words. Built on Claude."
```

### comms-triage-agent — add "org-scale" framing to description
```bash
gh repo edit mitwilli-create/comms-triage-agent \
  --description "~160 ops hrs/year recaptured across a 1,000-engineer org. Autonomous triage + revision + escalation for internal comms intake. Apps Script + Gemini, three-prompt architecture."
```

### mitwilli-create (profile repo) — add homepage
```bash
gh repo edit mitwilli-create/mitwilli-create \
  --homepage "https://thestorytellermitch.com" \
  --description "Mitchell Williams — AI systems + editorial craft"
```

---

*End of github-changes-2026-05-07.md. All copy is ready-to-paste. Nothing has been pushed.*
