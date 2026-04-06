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

The system should evaluate with real rigor across two active lanes from `config/profile.yml`:

- `Product/frontend upside`
- `Commerce/Shopify probability`

Do not force a false choice too early. A role can be a success through either lane if comp, quality, and growth are strong enough.

| Archetype | Thematic axes | What they buy |
|-----------|---------------|---------------|
| **Senior Frontend / Product Engineer** | React, TypeScript, UI systems, product collaboration, web application delivery | Someone who ships polished user-facing product surfaces |
| **Frontend Software Engineer** | Component design, state tradeoffs, debugging, APIs, testing, system-design-lite | Someone credible in modern frontend product teams |
| **Commerce / Shopify Engineer** | Shopify, Liquid, storefront architecture, integrations, merchant UX | Someone who improves commercial web experiences that drive revenue |
| **Merchant Platform / Ecommerce Engineer** | Commerce systems, experimentation, analytics, platform tooling, conversion | Someone who connects frontend quality to business impact |
| **Senior Web Developer** | Responsive implementation, performance, accessibility, stakeholder delivery | Someone who can own broad customer-facing web execution |

### Adaptive Framing by Archetype

> **Concrete metrics: read from `cv.md` + `article-digest.md` at evaluation time. NEVER hardcode numbers here.**

| If the role is... | Emphasize about the candidate... | Proof point sources |
|-------------------|----------------------------------|---------------------|
| Senior Frontend / Product Engineer | Practical React and TypeScript fluency, shipped UI, debugging, product collaboration, strong execution | `cv.md` + `article-digest.md` |
| Frontend Software Engineer | Component boundaries, API and state tradeoffs, product-surface thinking, practical architecture language | `cv.md` + `article-digest.md` |
| Commerce / Shopify Engineer | Shopify depth, storefront implementation, accessibility, performance, analytics, conversion work | `article-digest.md` + `cv.md` |
| Merchant Platform / Ecommerce Engineer | Merchant tooling, experimentation, measurement, integrations, commercial reasoning | `article-digest.md` + `cv.md` |
| Senior Web Developer | Broad frontend delivery, design translation, responsiveness, frontend quality, stakeholder communication | `cv.md` + `article-digest.md` |

### Exit Narrative (use in ALL framings)

<!-- [CUSTOMIZE] Replace with YOUR narrative. Examples:
     - "Built and sold my SaaS after 5 years. Now focused on applied AI at scale."
     - "Led engineering at a Series B startup through 10x growth. Now seeking my next challenge."
     - "Transitioned from consulting to building product. Looking for high-ownership roles."
     Read from config/profile.yml → narrative.exit_story -->

Use the candidate's exit story from `config/profile.yml` to frame ALL content:
- **In PDF summaries:** bridge from six years of commerce/frontend delivery toward the target role's domain
- **In STAR stories:** reference proof points from `article-digest.md`
- **In draft answers:** treat the candidate as a pragmatic senior builder, not a framework ideologue
- **When the JD asks for "ownership", "builder", "end-to-end", "customer-facing", "performance", "accessibility", or "experimentation":** increase match weight

### Cross-cutting Advantage

Frame profile as **"Senior frontend builder with commercial and product judgment"**:
- For product/frontend roles: "builder who ships polished user-facing work and can explain tradeoffs clearly"
- For commerce roles: "builder who ties frontend quality to accessibility, performance, analytics, and revenue impact"
- For hybrid roles: "builder who can move between implementation detail and stakeholder-facing business context"

Convert "builder" into a professional signal, not a hobby signal. The profile is strongest when grounded in shipped work and sober execution language.

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

Read the search target from `config/profile.yml` first.

**General guidance:**
- Use current market data for senior frontend, product-web, and commerce-engineering titles
- Compare the role against the candidate's last known full-time comp context, which was about `$120k` before the March 27, 2026 layoff
- Treat the low-pay DYODE contractor fallback as an emergency floor, not as healthy market comp
- Contractor rates should still be materially above employee base to account for benefits and volatility

### Negotiation Scripts

<!-- [CUSTOMIZE] Adapt these to your situation -->

**Salary expectations (general framework):**
> "Based on the scope of this role and the current market for senior frontend and commerce-facing positions, I'm targeting [RANGE from profile.yml]. I'm flexible on structure, but I care about the overall package and the quality of the opportunity."

**Geographic discount pushback:**
> "The roles I'm competitive for are output-based, not location-based. My track record doesn't change based on postal code."

**When offered below target:**
> "I'm comparing with opportunities in the [higher range]. I'm drawn to [company] because of [reason]. Can we explore [target]?"

### Location Policy

Read from `config/profile.yml` first.

**In forms:**
- Binary "can you be on-site?" questions: follow the actual availability in `profile.yml`
- In free-text fields: specify Central time overlap and selective DFW hybrid availability when relevant

**In evaluations (scoring):**
- Remote-first is a real preference and should affect scoring
- Selective DFW hybrid for strong roles should score as viable, not as automatic rejection
- Only score 1.0 on remote fit when the JD is clearly on-site-heavy with no meaningful flexibility

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
