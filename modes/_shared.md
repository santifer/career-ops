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

The evaluation uses 6 blocks (A-F) with a global score of 1-5:

| Dimension | What it measures |
|-----------|-----------------|
| Match con CV | Skills, experience, proof points alignment |
| North Star alignment | How well the role fits the user's target archetypes (from _profile.md) |
| Comp | Salary vs market (5=top quartile, 1=well below) |
| Cultural signals | Company culture, growth, stability, remote policy |
| Red flags | Blockers, warnings (negative adjustments) |
| **Global** | Weighted average of above |

**Score interpretation:**
- 4.5+ → Strong match, recommend applying immediately
- 4.0-4.4 → Good match, worth applying
- 3.5-3.9 → Decent but not ideal, apply only if specific reason
- Below 3.5 → Recommend against applying (see Ethical Use in CLAUDE.md)

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

## Archetype Detection

Classify every offer into one of these types (or hybrid of 2):

| Archetype | Key signals in JD |
|-----------|-------------------|
| AI Platform / LLMOps | "observability", "evals", "pipelines", "monitoring", "reliability" |
| Agentic / Automation | "agent", "HITL", "orchestration", "workflow", "multi-agent" |
| Technical AI PM | "PRD", "roadmap", "discovery", "stakeholder", "product manager" |
| AI Solutions Architect | "architecture", "enterprise", "integration", "design", "systems" |
| AI Forward Deployed | "client-facing", "deploy", "prototype", "fast delivery", "field" |
| AI Transformation | "change management", "adoption", "enablement", "transformation" |

After detecting archetype, read `modes/_profile.md` for the user's specific framing and proof points for that archetype.

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
| Playwright | Verify offers (browser_navigate + browser_snapshot). **NEVER 2+ agents with Playwright in parallel.** |
| Read | cv.md, _profile.md, article-digest.md, cv-template.html |
| Write | Temporary HTML for PDF, applications.md, reports .md |
| Edit | Update tracker |
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
