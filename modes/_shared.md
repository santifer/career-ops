# Shared Context -- career-ops

<!-- ============================================================
     HOW TO CUSTOMIZE THIS FILE
     ============================================================
     This file contains the shared context for all career-ops modes.
     Before using career-ops, you MUST:
     1. Fill in config/profile.yml with your personal data
     2. Create your cv.md in the project root
     3. (Optional) Create article-digest.md with your proof points
     4. Customize the sections below marked with [CUSTOMIZE]
     ============================================================ -->

## Sources of Truth (ALWAYS read before evaluating)

| File | Path | When |
|------|------|------|
| cv.md | `cv.md` (project root) | ALWAYS |
| article-digest.md | `article-digest.md` (if exists) | ALWAYS (detailed proof points) |
| profile.yml | `config/profile.yml` | ALWAYS (candidate identity and targets) |

**RULE: NEVER hardcode metrics from proof points.** Read them from cv.md + article-digest.md at evaluation time.
**RULE: For article/project metrics, article-digest.md takes precedence over cv.md** (cv.md may have older numbers).

---

## North Star -- Target Roles

The skill applies with EQUAL rigor to ALL target roles. None is primary or secondary -- any is a success if comp and remote alignment are right:

| Archetype | Thematic axes | What they buy |
|-----------|---------------|---------------|
| **HR Generalist / HR Operations** | Full-cycle HR, compliance, HRIS, onboarding, employee relations | Someone who owns the employee lifecycle end-to-end with systems rigor |
| **HRIS Analyst / Systems Specialist** | HRIS implementation, data integrity, reporting, optimization | Someone who makes HRIS work and generates actionable workforce data |
| **People Operations** | Scalable processes, employee experience, cross-functional alignment | Someone who builds HR infrastructure that supports company growth |
| **Talent Acquisition Specialist** | Full-cycle recruiting, sourcing, onboarding design, ATS management | Someone who fills roles efficiently and creates a great candidate experience |
| **HR Business Partner** | Strategic partnership, employee relations, org development, coaching | Someone who aligns HR to business objectives at the manager/leader level |

### Adaptive Framing by Archetype

> **Concrete metrics: read from `cv.md` + `config/profile.yml` at evaluation time. NEVER hardcode numbers here.**

| If the role is... | Emphasize about the candidate... | Key proof points |
|-------------------|----------------------------------|-----------------|
| HR Generalist / Operations | HRIS implementation lead, compliance owner, onboarding architect | NeoGov implementation, 150+ hires/yr, EEO/ACA/FMLA reporting |
| HRIS Analyst / Systems | Enterprise HRIS implementation, data integrity at scale, system optimization | NeoGov OHC across 35+ depts, 2,900+ employee data integrity, 20% error reduction |
| People Operations | Scalable processes, cross-functional partnership, compliance infrastructure | Onboarding program design, manager training delivery, regulatory audit readiness |
| Talent Acquisition | ATS management, requisition workflows, manager enablement | NeoGov recruitment module, manager training on hiring, 150+ annual hires |
| HR Business Partner | Employee relations, policy interpretation, multi-stakeholder partnership | Cross-dept employee relations work, leadership training, SHRM-CP credential |

### Exit Narrative (use in ALL framings)

Use the candidate's exit story from `config/profile.yml → narrative.exit_story` to frame ALL content:
- **In PDF Summaries:** Bridge from implementation leadership to new opportunity — "Built HR infrastructure from the ground up at a 2,900-person org. Now seeking a fully remote role to apply the same rigor at scale."
- **In STAR stories:** Lead with the scope (35+ departments, 2,900+ employees) and tie to compliance outcomes.
- **In Draft Answers:** Emphasize SHRM-CP, HRIS implementation ownership, and cross-functional partnership as differentiators.
- **When the JD asks for "systems thinker", "process builder", "compliance-minded", "self-starter":** This is the #1 differentiator. Increase match weight.

### Cross-cutting Advantage

Frame profile as **"HR systems owner with real compliance outcomes"** that adapts framing to the role:
- For HR Generalist: "practitioner who owns compliance AND builds the systems that enforce it"
- For HRIS: "implementation leader with data integrity ownership at enterprise scale"
- For People Ops: "process builder who reduces errors and improves employee experience simultaneously"
- For TA: "recruiter-turned-systems-owner who redesigned the full talent acquisition workflow"
- For HRBP: "generalist with deep compliance depth and cross-functional credibility"

The SHRM-CP + HRIS implementation combo is unusual at the generalist level — lead with it.

### Comp Intelligence

**Target range:** $70K–$90K (read from `config/profile.yml → compensation`)

**Market benchmarks (verify with WebSearch at evaluation time):**
- HR Generalist (remote, 2-4 yrs exp): $55K–$80K nationally; $65K–$90K in major markets
- HRIS Analyst (remote): $65K–$95K
- People Operations Specialist (remote, tech companies): $70K–$100K
- Government/public sector HR pays below market — private sector remote roles typically pay more

**When asked about salary:**
> "Based on market data for remote HR roles with HRIS implementation experience, I'm targeting $70K–$90K. I'm flexible on structure depending on the full package."

**If offered below $70K:**
> "I appreciate the offer. I'm targeting $70K as a minimum based on market research for this scope of role. Is there flexibility to get there?"

**When asked about relocation:**
> "I'm relocating to Chicago and open to roles nationally — I'm targeting fully remote positions."

### Location Policy

**Non-negotiable:** Role must be fully remote. This is an automatic disqualifier if not met.

**In forms:**
- Binary "can you be on-site?" questions: answer No unless role is confirmed remote-friendly
- In free-text fields: "Fully remote preferred. Chicago-area relocation in progress. Available in EST/CST."

**In evaluations (scoring):**
- Hybrid = automatic disqualifier. Score **1.0** on remote dimension regardless of other factors.
- "Remote-friendly" with occasional travel = discuss with candidate before applying.
- Only score **5.0** if JD explicitly says "fully remote" or "100% remote".

### Time-to-offer priority
- Working demo + metrics > perfection
- Apply sooner > learn more
- 80/20 approach, timebox everything

---

## Global Rules

### NEVER

1. Invent experience or metrics
2. Modify cv.md or portfolio files
3. Submit applications on behalf of the candidate
4. Share phone number in generated messages
5. Recommend comp below market rate
6. Generate a PDF without reading the JD first
7. Use corporate-speak
8. Ignore the tracker (every evaluated offer gets registered)

### ALWAYS

0. **Cover letter:** If the form has an option to attach or write a cover letter, ALWAYS include one. Generate PDF with the same visual design as the CV. Content: JD quotes mapped to proof points, links to relevant case studies. 1 page max.
1. Read cv.md and article-digest.md (if exists) before evaluating any offer
1b. **First evaluation of each session:** Run `node cv-sync-check.mjs` with Bash. If it reports warnings, notify the candidate before continuing
2. Detect the role archetype and adapt framing
3. Cite exact lines from CV when matching
4. Use WebSearch for comp and company data
5. Register in tracker after evaluating
6. Generate content in the language of the JD (EN default)
7. Be direct and actionable -- no fluff
8. When generating English text (PDF summaries, bullets, LinkedIn messages, STAR stories): native tech English, not translated. Short sentences, action verbs, no unnecessary passive voice.
8b. **Case study URLs in PDF Professional Summary:** If the PDF mentions case studies or demos, URLs MUST appear in the first paragraph (Professional Summary). The recruiter may only read the summary. All URLs with `white-space: nowrap` in HTML.
9. **Tracker additions as TSV** -- NEVER edit applications.md to add new entries. Write TSV in `batch/tracker-additions/` and `merge-tracker.mjs` handles the merge.
10. **Include `**URL:**` in every report header** -- between Score and PDF.

### Tools

| Tool | Use |
|------|-----|
| WebSearch | Comp research, trends, company culture, LinkedIn contacts, fallback for JDs |
| WebFetch | Fallback for extracting JDs from static pages |
| Playwright | Verify if offers are still active (browser_navigate + browser_snapshot), extract JDs from SPAs. **CRITICAL: NEVER launch 2+ agents with Playwright in parallel -- they share a single browser instance.** |
| Read | cv.md, article-digest.md, cv-template.html |
| Write | Temporary HTML for PDF, applications.md, reports .md |
| Edit | Update tracker |
| Bash | `node generate-pdf.mjs` |
