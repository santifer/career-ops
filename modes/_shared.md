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
| _profile.md | `modes/_profile.md` (if exists) | ALWAYS — user overrides, wins over _shared.md |

**RULE: NEVER hardcode metrics from proof points.** Read them from cv.md + article-digest.md at evaluation time.
**RULE: For article/project metrics, article-digest.md takes precedence over cv.md** (cv.md may have older numbers).

---

## North Star -- Target Roles

The skill applies with EQUAL rigor to ALL target roles. None is primary or secondary -- any is a success if comp and growth are right:

| Archetype | Thematic axes | What they buy |
|-----------|---------------|---------------|
| **Head / VP of Product Design** | Design leadership, AI-integrated UX, design org scale | A design leader who ships AI products with revenue proof |
| **Head of AI Product** | AI product strategy, LLM-integrated flows, discovery to delivery | A founder who translates AI capabilities into measurable product outcomes |
| **Staff / Principal Design Engineer** | Design systems, React/TS, AI-augmented product engineering | A builder who straddles design and code at scale |
| **AI Transformation Lead** | Change management, AI adoption, org enablement, upskilling | Someone who led a team through AI transformation with hard metrics |
| **Applied AI / Founder-in-Residence** | Zero-to-one, prototyping, AI product launch, entrepreneurial | A founder who has proven PMF, acquisition, and cross-functional ownership |

### Adaptive Framing by Archetype

> **Concrete metrics: read from `cv.md` + `article-digest.md` at evaluation time. NEVER hardcode numbers here.**

| If the role is... | Emphasize about the candidate... | Proof point sources |
|-------------------|----------------------------------|---------------------|
| Head / VP of Product Design | Design org build (0→10), design system at scale, AI-literacy programs, retention, feature velocity | cv.md (Bark.com section) |
| Head of AI Product | CaseLab exit, Fetchd.ai launch, LLM product strategy, revenue impact from AI features | cv.md + article-digest.md |
| Staff / Principal Design Engineer | React/TS, design engineering, design systems at scale, shipped AI-integrated UX | cv.md (Bark + Workday + Intuit) |
| AI Transformation Lead | 25+ stakeholder alignment at Bark, AI literacy program, AI-first platform transformation, 63% YoY | cv.md (Bark.com leadership section) |
| Applied AI / Founder | CaseLab PMF + acquisition in 10 months, Fetchd.ai zero-to-one, cross-functional ownership | cv.md (Fetchd + CaseLab sections) |

### Exit Narrative (use in ALL framings)

Use the candidate's exit story from `config/profile.yml` to frame ALL content:
- **In PDF Summaries:** "Founded and exited an AI SaaS. Now applying the same founder + design + AI instincts to [JD domain]."
- **In STAR stories:** Lead with CaseLab/Fetchd as proof of end-to-end ownership — not just features, whole products.
- **In Draft Answers (Section G):** The founder-to-leader narrative should appear in the first response.
- **When the JD asks for "entrepreneurial", "ownership", "builder", "end-to-end", "zero-to-one":** This is the #1 differentiator. Increase match weight significantly — most design leaders lack founder credibility.
- **When the JD asks for "AI literacy", "AI transformation", "cross-functional AI":** Bark.com is the proof point — led org-wide AI transformation with hard revenue numbers.

### Cross-cutting Advantage

Frame profile as **"Design leader with founder credibility"** — rare combination that adapts by role:
- For Design Leadership: "scaled a design function from 2→10 while shipping AI features that drove 63% YoY growth"
- For AI Product: "founded and exited an AI SaaS — knows how to go from 0 to PMF to acquisition"
- For Design Engineering: "straddles design and code — React, TS, design systems — ships production AI products"
- For Transformation: "ran the AI transformation at Bark.com, trained non-technical stakeholders, built the measurement framework"

The differentiator is not "also has AI skills" — it's "built and sold an AI company while leading design at scale." Very few candidates have both sides of this.

### Portfolio as Proof Point (use in high-value applications)

<!-- [CUSTOMIZE] If you have a live demo, dashboard, or public project, configure it here.
     Example:
     dashboard:
       url: "https://yoursite.dev/demo"
       password: "demo-2026"
       when_to_share: "LLMOps, AI Platform, observability roles"
     Read from config/profile.yml → narrative.proof_points and narrative.dashboard -->

If the candidate has a live demo/dashboard (check profile.yml), offer access in applications for relevant roles.

### Comp Intelligence

<!-- [CUSTOMIZE] Research comp ranges for YOUR target roles and update these ranges -->

**General guidance:**
- Use WebSearch for current market data (Glassdoor, Levels.fyi, Blind)
- Frame by role title, not by skills -- titles determine comp bands
- Contractor rates are typically 30-50% higher than employee base to account for benefits
- Geographic arbitrage works for remote roles: lower CoL = better net

### Negotiation Scripts

<!-- [CUSTOMIZE] Adapt these to your situation -->

**Salary expectations (general framework):**
> "Based on market data for this role, I'm targeting [RANGE from profile.yml]. I'm flexible on structure -- what matters is the total package and the opportunity."

**Geographic discount pushback:**
> "The roles I'm competitive for are output-based, not location-based. My track record doesn't change based on postal code."

**When offered below target:**
> "I'm comparing with opportunities in the [higher range]. I'm drawn to [company] because of [reason]. Can we explore [target]?"

### Location Policy

<!-- [CUSTOMIZE] Adapt to your situation. Read from config/profile.yml → location -->

**In forms:**
- Binary "can you be on-site?" questions: follow your actual availability from profile.yml
- In free-text fields: specify your timezone overlap and availability

**In evaluations (scoring):**
- Remote dimension for hybrid outside your country: score **3.0** (not 1.0)
- Only score 1.0 if JD explicitly says "must be on-site 4-5 days/week, no exceptions"

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
