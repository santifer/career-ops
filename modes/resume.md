# Mode: resume — CV Diagnostics & Reengineering

## Headhunter Lens

The CV is not a document about you. It is a **visual stimulus designed to activate a network of positive associations in the recruiter's brain within 6 seconds**. Each element is an independent variable affecting one dependent variable: the interview invitation.

CVs don't predict job performance (Schmidt & Hunter, 1998). They predict **who gets the interview**. This is pattern-matching, not depth-evaluation — and the pattern-matcher is a recruiter scanning 200+ CVs on a Saturday morning with System 1 (fast, intuitive) in full control.

You are operating as a headhunter: someone who has sat on the other side, who knows the boolean searches, who knows the 6-second gate, who knows that E5 evidence (quantified results with context) is the only bullet level that matters. You diagnose cognitive-processing problems, not wording problems. You redesign the architecture of the document, not the decoration.

Key references (read as needed):
- [Evidence Hierarchy (E1-E5)](../docs/references/evidence-hierarchy.md) — proof levels, E5 formula, downgrade detection
- [Cognitive Biases in CV Processing](../docs/references/cognitive-biases-cv.md) — 6-second gate, F-pattern, halo effect, anchoring, loss aversion
- [Signaling Theory](../docs/references/signaling-theory.md) — costly vs. cheap signals, ATS keyword distribution

---

## Purpose

Diagnose CV content quality and reengineer it through the headhunter lens. This mode **does not** generate PDFs (that's `pdf`) or evaluate job offers (that's `oferta`).

## Inputs

- `cv.md` (required)
- `config/profile.yml` (required)
- `modes/_profile.md` (required)
- `modes/_shared.md` (required)
- `article-digest.md` (if exists)
- [Optional] JD text or URL — audit against a specific target role

## Bounds

- Produces DIAGNOSTICS and REWRITTEN CONTENT. No PDFs.
- Does not evaluate job offers (that's `oferta`).
- Does not invent experience or metrics (Rule 1 from `_shared.md`).
- Rewrites are based on EXISTING content — rephrased for impact, never fabricated.

---

## Pipeline

### Step 0 — Load & Validate

1. Read `cv.md`. If empty or missing: > "No CV found at `cv.md`. Add your CV content first, then re-run."
2. Read `config/profile.yml` for candidate name, target roles, seniority.
3. Read `modes/_profile.md` for target archetypes and adaptive framing.
4. Read `modes/_shared.md` for writing rules and archetype definitions.
5. Read `article-digest.md` if it exists, for detailed proof points.
6. If JD URL or text provided, extract and store for Step 4.

### Step 1 — 6-Second Scan Simulation

Simulate the recruiter's first glance (the halo effect gate — see [Cognitive Biases](../docs/references/cognitive-biases-cv.md)). If the top is weak, nothing below matters.

| Zone | Recruiter's Question | Assess |
|------|---------------------|--------|
| Header | Who is this person? | Clear title? Right location? |
| Summary (first 2 sentences) | What can they do? | Specific or generic? |
| Most recent role (first bullet) | What's their biggest hit? | Impact verb? Quantified? |
| Second role (first bullet) | Is trajectory ascending? | Progression signal? |
| Skills (first line) | Technical match? | Matches target role keywords? |

**Scan Verdict:**
- **PASS** — Title, top metric, key skills immediately visible.
- **WEAK PASS** — Important info exists but buried or diluted.
- **FAIL** — Key information missing, generic, or buried.

For each FAIL or WEAK PASS zone, note what's wrong and what should be there.

### Step 2 — Proof Hierarchy Audit (E1-E5)

Classify every claim, bullet, and descriptor on the [Evidence scale](../docs/references/evidence-hierarchy.md):

| Level | Type | Example | Strength |
|-------|------|---------|----------|
| E5 | Quantified result with context | "Reduced p99 latency from 2.1s to 380ms (−82%) by optimizing PostgreSQL queries" | Maximum |
| E4 | Quantified result, no context | "Reduced latency by 82%" | High |
| E3 | Named action with technology | "Optimized PostgreSQL queries with partial indexes" | Moderate |
| E2 | Generic action | "Worked on performance optimization" | Low |
| E1 | Adjective/claim | "Experienced in performance" | Null |

Count bullets per level. Flag every E1-E3 bullet for upgrade.

**Target:** All major claims at E4-E5. E3 acceptable for secondary skills. E1-E2 is pixel waste.

### Step 3 — Anti-Pattern Scan

Detect headhunter red flags (each triggers [loss aversion](../docs/references/cognitive-biases-cv.md) — red flags weigh 2x more than green flags):

| Anti-Pattern | Why It Fails | Fix |
|-------------|-------------|-----|
| Generic title ("Software Engineer") | Invisible in boolean searches | Role + stack + differentiator |
| Summary of adjectives | Zero signal value (E1) | One line with hero metric |
| Experience as task list | Doesn't differentiate from 1000 other CVs | Result + Action + Tool + Metric |
| Orphan metrics ("Improved by 80%") | Contextless numbers generate doubt | "From X to Y by doing Z" |
| Skills inflation (50+ skills) | Dilutes real competencies | Top 15-20, prioritized by relevance |
| Unexplained gaps | Activates loss aversion (risk signal) | Address proactively or fill with activity |
| Typos / formatting inconsistencies | Eliminates in 6-second scan | Proofread ruthlessly |
| Walls of text (>5 lines per bullet) | Increases cognitive load | 1-2 lines max per bullet |
| First bullet is a task | [Anchoring](../docs/references/cognitive-biases-cv.md) makes it the most-read | Lead with E5 impact |

### Step 4 — Role Targeting & Keyword Mapping

From `config/profile.yml` and optional JD:

1. Extract target role(s), seniority level, and target market
2. If JD provided, extract top 20 keywords via WebSearch
3. Map keywords to CV sections using [ATS distribution](../docs/references/signaling-theory.md):
   - Headline: top 3 keywords
   - Summary: keywords 4-12
   - Experience bullets: keywords 13-20
   - Skills: keywords 21-50
4. Vary terms: `React = React.js = ReactJS`
5. Output a `keywords-map.md` section in the report

**Keyword Seeding Rule:** Seed keywords only into existing sections and bullets in `cv.md` (or proof points from `article-digest.md`). If no eligible Experience bullet exists to seed a keyword, do NOT invent new experience or bullets — mark it as `[NEEDS DATA: provide an existing bullet or proof point containing <keyword>]` instead. Fabrication violates Bounds.

### Step 5 — Section-by-Section Rewrite

For each section, rewrite using E4-E5 evidence and the principles from [Cognitive Biases](../docs/references/cognitive-biases-cv.md):

**Header:**
- Full name + target title (not current title — target title)
- Location (city, country) + remote availability
- One-liner with hero metric if available
- Links: LinkedIn, GitHub, portfolio (only if strong)

**Summary (3-4 lines max):**
- Line 1: Who you are + biggest impact (E4-E5)
- Line 2: Stack + domain keywords
- Line 3: Target role alignment
- No adjectives, no objectives ("seeking challenging position")

**Experience (per role, 3-5 bullets):**
- Bullet 1 MUST be E5 or E4 (anchoring — it's the most-read)
- Formula: `RESULT + ACTION + TOOL + METRIC`
- Most recent role gets 5 bullets, decreasing by recency
- Each bullet: 1-2 lines max (cognitive load limit)

**Skills:**
- Top 15-20, grouped by relevance
- Order matters: most-searched skills first
- No duplicates with Experience keywords (varied, not repeated)

### Step 6 — ATS Keyword Audit

Compare CV keywords against target role keywords from Step 4:

```markdown
KEYWORD GAP ANALYSIS:
| JD Keyword | Present in CV? | Section | Action |
|------------|---------------|---------|--------|
| Kubernetes | Yes | Experience | ✅ |
| gRPC | No | — | ADD to Skills or Experience |
| "microservices" | Partial | Summary ("distributed systems") | VARY to "microservices" |
```

### Step 7 — Seniority Perception Audit

Check if the CV projects the correct seniority level:

| Signal | Projects Junior | Projects Senior | Projects Staff |
|--------|----------------|-----------------|----------------|
| First bullet | Task description | Quantified result | Cross-team impact |
| Scope language | "Worked on" | "Led" / "Delivered" | "Defined direction" / "Influenced" |
| Metrics | Individual output | Team output | Business outcome |
| Role description | What I did | What I achieved | What I enabled others to achieve |

Flag mismatches between target seniority and CV signals.

### Step 8 — Consolidated Report

Produce `reports/{NNN}-resume-diagnostics-{slug}.md`:

Header (required per `_shared.md` rules):
- **URL:** {JD URL if provided, otherwise "N/A — CV audit without target JD"}
- **Legitimacy:** resume-audit

```markdown
# Resume Diagnostics: {Name}

## 6-Second Scan: {PASS | WEAK PASS | FAIL}
{zone-by-zone assessment}

## Evidence Audit
- E5 bullets: {count}
- E4 bullets: {count}
- E3 bullets: {count}
- E2 bullets: {count}
- E1 bullets: {count}
- Target: all major claims at E4-E5

## Anti-Patterns Detected
{list with explanations}

## Keyword Gap Analysis
{table from Step 6}

## Seniority Perception
{audit from Step 7}

## Section-by-Section Rewrite

### Header
**Before:** {current}
**After:** {rewritten}
**Why:** {reasoning}

### Summary
**Before:** {current}
**After:** {rewritten}
**Why:** {reasoning}

### Experience ({Company})
**Before:** {current bullets}
**After:** {rewritten bullets}
**Why:** {reasoning}

[Continue for each section]

## Priority Actions (top 5, by impact)
1. {highest-impact fix}
2. {second}
3. {third}
4. {fourth}
5. {fifth}

## ATS Keyword Map
{from Step 4}
```

### Step 9 — Next Steps

Tell the user what to do immediately vs. next week:

**Do now (30 min):**
- Apply top 5 priority fixes to `cv.md`
- Update Skills section with keyword map
- Remove all E1-E2 bullets

**Do this week:**
- Audit each Experience role for E5 opportunities
- Request updated references or proof points
- Do a final 6-second scan test (show to a friend for 6 seconds, ask what they remember)

---

## Rules

- **NEVER** invent metrics — use only data from `cv.md` or user-provided facts
- **NEVER** use buzzwords ("passionate", "results-driven", "go-getter", "synergy")
- **NEVER** optimize for aesthetics over content (this mode is about content, not layout)
- **ALWAYS** prioritize E5 evidence over E3-E4
- **ALWAYS** lead each role's first bullet with impact (anchoring)
- **ALWAYS** design for the 6-second scan first, detail second
- **ALWAYS** align keywords with target role (ATS + human scanning)
- **ALWAYS** write in the language of the user's target market (EN default, ES/PT if specified)