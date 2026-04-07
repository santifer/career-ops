# System Context -- career-ops

<!-- ============================================================
     THIS FILE IS AUTO-UPDATABLE. Don't put personal data here.
     
     Your customizations go in modes/_profile.md (never auto-updated).
     This file contains system rules, scoring logic, and tool config
     that improve with each career-ops release.
     ============================================================ -->

## Sources of Truth

| File | Path | When |
|------|------|------|
| cv.md | `cv.md` (project root) | ALWAYS |
| article-digest.md | `article-digest.md` (if exists) | ALWAYS (detailed proof points) |
| profile.yml | `config/profile.yml` | ALWAYS (candidate identity and targets) |
| _profile.md | `modes/_profile.md` | ALWAYS (user archetypes, narrative, negotiation) |

**RULE: NEVER hardcode metrics from proof points.** Read them from cv.md + article-digest.md at evaluation time.
**RULE: For article/project metrics, article-digest.md takes precedence over cv.md.**
**RULE: Read _profile.md AFTER this file. User customizations in _profile.md override defaults here.**

---

## Scoring System

The skill applies with EQUAL rigor to ALL target roles. None is primary or secondary -- any is a success if comp and remote alignment are right:

| Archetype | Thematic axes | What they buy |
|-----------|---------------|---------------|
| **HR Generalist / HR Operations** | Full-cycle HR, compliance, HRIS, onboarding, employee relations | Someone who owns the employee lifecycle end-to-end with systems rigor |
| **HRIS Analyst / Systems Specialist** | HRIS implementation, data integrity, reporting, optimization | Someone who makes HRIS work and generates actionable workforce data |
| **People Operations** | Scalable processes, employee experience, cross-functional alignment | Someone who builds HR infrastructure that supports company growth |
| **Talent Acquisition Specialist** | Full-cycle recruiting, sourcing, onboarding design, ATS management | Someone who fills roles efficiently and creates a great candidate experience |
| **HR Business Partner** | Strategic partnership, employee relations, org development, coaching | Someone who aligns HR to business objectives at the manager/leader level |

## Archetype Detection

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

0. **Cover letter:** If the form allows it, ALWAYS include one. Same visual design as CV. JD quotes mapped to proof points. 1 page max.
1. Read cv.md, _profile.md, and article-digest.md (if exists) before evaluating
1b. **First evaluation of each session:** Run `node cv-sync-check.mjs`. If warnings, notify user.
2. Detect the role archetype and adapt framing per _profile.md
3. Cite exact lines from CV when matching
4. Use WebSearch for comp and company data
5. Register in tracker after evaluating
6. Generate content in the language of the JD (EN default)
7. Be direct and actionable -- no fluff
8. Native tech English for generated text. Short sentences, action verbs, no passive voice.
8b. Case study URLs in PDF Professional Summary (recruiter may only read this).
9. **Tracker additions as TSV** -- NEVER edit applications.md directly. Write TSV in `batch/tracker-additions/`.
10. **Include `**URL:**` in every report header.**

### Tools

| Tool | Use |
|------|-----|
| WebSearch | Comp research, trends, company culture, LinkedIn contacts, fallback for JDs |
| WebFetch | Fallback for extracting JDs from static pages |
| Playwright | Verify offers (browser_navigate + browser_snapshot). **NEVER 2+ agents with Playwright in parallel.** |
| Read | cv.md, _profile.md, article-digest.md, cv-template.html |
| Write | Temporary HTML for PDF, applications.md, reports .md |
| Edit | Update tracker |
| Canva MCP | Optional visual CV generation. Duplicate base design, edit text, export PDF. Requires `canva_resume_design_id` in profile.yml. |
| Bash | `node generate-pdf.mjs` |

### Time-to-offer priority
- Working demo + metrics > perfection
- Apply sooner > learn more
- 80/20 approach, timebox everything

---

## Professional Writing & ATS Compatibility

These rules apply to ALL generated text that ends up in candidate-facing documents: PDF summaries, bullets, cover letters, form answers, LinkedIn messages. They do NOT apply to internal evaluation reports.

### Avoid cliché phrases
- "passionate about" / "results-oriented" / "proven track record"
- "leveraged" (use "used" or name the tool)
- "spearheaded" (use "led" or "ran")
- "facilitated" (use "ran" or "set up")
- "synergies" / "robust" / "seamless" / "cutting-edge" / "innovative"
- "in today's fast-paced world"
- "demonstrated ability to" / "best practices" (name the practice)

### Unicode normalization for ATS
`generate-pdf.mjs` automatically normalizes em-dashes, smart quotes, and zero-width characters to ASCII equivalents for maximum ATS compatibility. But avoid generating them in the first place.

### Vary sentence structure
- Don't start every bullet with the same verb
- Mix sentence lengths (short. Then longer with context. Short again.)
- Don't always use "X, Y, and Z" — sometimes two items, sometimes four

### Prefer specifics over abstractions
- "Cut p95 latency from 2.1s to 380ms" beats "improved performance"
- "Postgres + pgvector for retrieval over 12k docs" beats "designed scalable RAG architecture"
- Name tools, projects, and customers when allowed
