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

The skill applies with EQUAL rigor to ALL target roles. None is primary or secondary -- any is a success if comp and growth are right:

| Archetype | Thematic axes | What they buy |
|-----------|---------------|---------------|
| **AI Platform / LLMOps Engineer** | Evaluation, observability, reliability, pipelines | Someone who puts AI in production with metrics |
| **Agentic Workflows / Automation** | HITL, tooling, orchestration, multi-agent | Someone who builds reliable agent systems |
| **Technical AI Product Manager** | GenAI/Agents, PRDs, discovery, delivery | Someone who translates business to AI product |
| **AI Solutions Architect** | Hyperautomation, enterprise, integrations | Someone who designs end-to-end AI architectures |
| **AI Forward Deployed Engineer** | Client-facing, fast delivery, prototyping | Someone who delivers AI solutions to clients fast |
| **AI Transformation Lead** | Change management, adoption, org enablement | Someone who leads AI transformation in an org |

<!-- [CUSTOMIZE] Edit the archetypes above to match YOUR target roles.
     For example, if you're a backend engineer, replace with:
     - Senior Backend Engineer
     - Staff Platform Engineer
     - Engineering Manager
     etc. -->

### Profile Track Inference

When generating a CV or evaluating a role, infer the profile track from the JD using these signal lists:

**Builder signals** (infer `builder` track):
"implement", "engineer", "architect", "ship", "build", "develop", "deploy", "prototype", "hands-on", "IC role", "individual contributor", "write code"

**Leadership signals** (infer `leadership` track):
"manage a team", "people manager", "director", "VP", "head of", "OKRs", "headcount", "hiring", "strategy", "stakeholders", "cross-functional", "roadmap ownership"

**Ambiguous signals** (neither clearly wins — prompt user or use `tracks.default`):
"lead" (alone, without "a team"), "senior" (alone), "principal" (alone), "AI initiative", "AI strategy" (without team context)

**Inference rules:**
- Builder signals present, leadership signals absent → auto-select `builder`; annotate as `auto-selected`
- Leadership signals present, builder signals absent → auto-select `leadership`; annotate as `auto-selected`
- Both present, or only ambiguous signals → prompt user once; fall back to `tracks.default` if no response; annotate as `prompted` or `user-selected`
- `--track <id>` flag or `[track:<id>]` tag or natural language ("use leadership track") → use that track; annotate as `user-specified`
- No `tracks:` block in profile.yml → skip track logic entirely; use single-profile behavior

### Adaptive Framing by Archetype

> **Concrete metrics: read from `cv.md` + `article-digest.md` at evaluation time. NEVER hardcode numbers here.**

| If the role is... | Emphasize about the candidate... | Proof point sources |
|-------------------|----------------------------------|---------------------|
| Platform / LLMOps | Production systems builder, observability, evals, closed-loop | article-digest.md + cv.md |
| Agentic / Automation | Multi-agent orchestration, HITL, reliability, cost | article-digest.md + cv.md |
| Technical AI PM | Product discovery, PRDs, metrics, stakeholder mgmt | cv.md + article-digest.md |
| Solutions Architect | System design, integrations, enterprise-ready | article-digest.md + cv.md |
| Forward Deployed Engineer | Fast delivery, client-facing, prototype to prod | cv.md + article-digest.md |
| AI Transformation Lead | Change management, team enablement, adoption | cv.md + article-digest.md |

<!-- [CUSTOMIZE] Map YOUR specific projects/articles to each archetype above -->

### Exit Narrative (use in ALL framings)

<!-- [CUSTOMIZE] Replace with YOUR narrative. Examples:
     - "Built and sold my SaaS after 5 years. Now focused on applied AI at scale."
     - "Led engineering at a Series B startup through 10x growth. Now seeking my next challenge."
     - "Transitioned from consulting to building product. Looking for high-ownership roles."
     Read from config/profile.yml → narrative.exit_story -->

Use the candidate's exit story from `config/profile.yml` to frame ALL content:
- **In PDF Summaries:** Bridge from past to future -- "Now applying the same [skill] to [JD domain]."
- **In STAR stories:** Reference proof points from article-digest.md
- **In Draft Answers (Section G):** The transition narrative should appear in the first response.
- **When the JD asks for "entrepreneurial", "ownership", "builder", "end-to-end":** This is the #1 differentiator. Increase match weight.

### Cross-cutting Advantage

Frame profile as **"Technical builder with real-world proof"** that adapts framing to the role:
- For PM: "builder who reduces uncertainty with prototypes then productionizes with discipline"
- For FDE: "builder who delivers fast with observability and metrics from day 1"
- For SA: "builder who designs end-to-end systems with real integration experience"
- For LLMOps: "builder who puts AI in production with closed-loop quality systems"

Convert "builder" into a professional signal, not a "hobby maker". Real proof points make this credible.

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
11. **Template contact rendering:** When filling `cv-template.html`, if any contact field (`{{PHONE}}`, `{{LOCATION_LINE}}`, `{{AUTHORIZATION}}`) resolves to an empty string or null, omit that `<span>` AND its adjacent `<span class="separator">` from the HTML before writing the file. Never leave orphaned separators.
12. **Persona field integrity:** ALL contact fields in a generated CV must come from the same persona block. Never mix `phone` from one persona with `location_line` from another.
13. **Track resolution fallback:** If `config/profile.yml` has no `tracks:` block, treat all track-aware steps as no-ops and use single-profile behavior throughout. Never error or prompt the user about missing tracks.

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
