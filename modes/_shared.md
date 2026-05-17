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
| writing-samples/ | `writing-samples/` | When generating candidate-facing text — check `_profile.md` for cached `## Writing Style` first; only scan files if absent |

**RULE: NEVER hardcode metrics from proof points.** Read them from cv.md + article-digest.md at evaluation time.
**RULE: For article/project metrics, article-digest.md takes precedence over cv.md.**
**RULE: Read _profile.md AFTER this file. User customizations in _profile.md override defaults here.**

---

## Scoring System

**Calibration source:** `data/career-calibration-20260516-190152.md` (interview with Mitchell, 2026-05-16). All weights, thresholds, and exclusions below trace back to specific findings in that brief. Read the brief before changing any weight.

**Order of operations (CRITICAL — do NOT reorder):**

```
Step 1 → Defense-exclude filter      (hard zero, returns immediately)
Step 2 → Bloque H Hard-Skip Gates    (see modes/oferta.md; gate-capped scores)
Step 3 → Composite scoring formula   (this section)
Step 4 → Toxicity surface            (informational only — never auto-trash)
```

If Step 1 fires, return `score=0, decision=SKIP` and skip all downstream computation. If Step 2 fires a gate, the gate's cap on the composite from `modes/oferta.md` "Composite-Score Override Rules" supersedes the raw composite computed in Step 3.

---

### Step 1 — Defense-Exclude Hard Filter (runs FIRST)

**Hard-coded auto-no list (from calibration brief "Auto-no" section):**

```
defense_exclude = [
  'palantir',
  'anduril',
  'shield ai', 'shield-ai',
  // plus any other company whose primary mission is defense / military / federal weapons
]
```

If the JD company normalizes to any slug in `defense_exclude`, return immediately:

```
{ score: 0, decision: 'SKIP', reason: 'defense-exclude (calibration 2026-05-16)' }
```

Do NOT score. Do NOT proceed to gates. Do NOT generate Blocks A–G. Just log the skip and move on.

Mitchell's own employer (Google) is also excluded per `modes/_profile.md` §8 — apply the same immediate-return treatment.

---

### Step 2 — Bloque H Hard-Skip Gates (see `modes/oferta.md`)

`modes/oferta.md` Bloque H defines gates H1–H12. These run BEFORE the composite formula below and can cap the final composite per the "Composite-Score Override Rules" in that file (e.g., 2+ gates fired → cap at 3.0, 1 gate fired no warm intro → cap at 3.5). Do not re-implement those gates here — reference them.

The composite below is computed AS IF no gates fired; the gate caps from `modes/oferta.md` are applied at the very end.

---

### Step 3 — Composite Scoring Formula (post-calibration 2026-05-16)

Replaces the old 10-dimension matrix in `modes/_profile.md` §2. Each dimension is scored 1–5 and weighted as follows:

```
composite_score =
    0.20 × fit_score                  # CV-to-JD alignment
  + 0.20 × wealth_generation_score    # equity IPO probability + product trajectory + skill portability
  + 0.20 × tto_score                  # time-to-offer (from lib/tto-estimator.mjs)
  + 0.15 × bridge_to_ai_pm_score      # does this role build skills/credibility toward AI PM in 2-3 years
  + 0.10 × mission_alignment_score    # mission/money slider = 3/10 → mission is tiebreaker, not driver
  + 0.10 × comp_floor_score           # $175K floor / $250-320K target / equity-heavy preferred
  + 0.05 × geography_score            # Seattle / West Coast / Dallas / Chicago / remote
```

Weights total 1.00. The composite is bounded to [1.0, 5.0]; clamp anything outside that range.

**Score interpretation (unchanged from prior rubric):**
- 4.5+ → Strong match, recommend applying immediately
- 4.0–4.4 → Good match, worth applying
- 3.5–3.9 → Decent but not ideal, apply only if specific reason
- Below 3.5 → Recommend against applying (see Ethical Use in AGENTS.md)

---

### Step 3a — Dimension definitions

Each dimension is 1–5. Anchor the score using the rubric below; do not invent intermediate definitions.

#### 1. `fit_score` (weight 0.20) — CV-to-JD alignment

**Signal source:** `cv.md`, `article-digest.md`, `interview-prep/story-bank.md`, JD content, archetype detection from `modes/_profile.md` §1.

**Anchors:**
- **5** — 90%+ of must-haves directly cited from cv.md, with quantified proof points; no gap requires hand-waving
- **4** — 70–89% match; 1–2 gaps mitigable via tangential experience already documented
- **3** — 50–69% match; meaningful gaps that need cover-letter framing to bridge
- **2** — 30–49% match; missing core requirement (e.g., named programming language as production primary, classical ML stack)
- **1** — <30%; CV-to-JD divergence too large to bridge in current cycle

**Notes:** This was previously the dominant weight (40% combined when North Star + CV Match both ran). Reduced to 0.20 because the calibration brief proved that perfect fit at the wrong company (slow TTO, weak equity, no PM bridge) is worse than acceptable fit at the right company. Gate-capped per H1 (Python production primary), H2 (classical ML), H8 (RAG label accuracy), H12 (SWE-bar primary screen).

#### 2. `wealth_generation_score` (weight 0.20) — Equity IPO probability + product trajectory + skill portability

**Signal source:** Council intel sections (when council-of-models has been run on company), funding stage public reporting, Levels.fyi equity history, Mitchell's verbatim decision criterion from calibration brief: *"ranked in order of likelihood of helping me generate the absolute most wealth via equity ipo'ing, salary increases, building a product that is growing and attractive to other companies in the same industry or from an industry being targeted by ai companies or helping me build a skill set i can use to do freelance work for companies outside of the tech industry, like finance and health"*.

**Anchors:**
- **5** — Pre-IPO frontier-AI lab with credible $50B+ exit path (Anthropic, OpenAI, xAI, Perplexity tier per calibration brief "Top cohort, roughly tied"), AND skill portability into finance/health/legal high-WTP industries is concrete (the role builds artifacts Mitchell can take freelance)
- **4** — Series C-D AI-native with strong growth signal AND skill-portability into adjacent high-WTP industries (Cohere, Sierra, Mistral, Substack/Beehiiv/editorial-×-AI per calibration brief "Also auto-yes")
- **3** — Mid-stage growth equity at AI-native company with reasonable upside but no clear adjacency to non-tech high-WTP industries
- **2** — Public company RSUs at a non-frontier AI org (e.g., Meta/Microsoft/Apple — acceptable per calibration "Notably NOT auto-no" but lacks pre-IPO upside)
- **1** — Pure-cash low-growth company or pre-Series-C startup (Series A/B excluded per calibration "Series C minimum")

**Notes:** This is the load-bearing new dimension. Mitchell's mission/money slider is 3/10 — money dominates. The "wealth generation" framing is verbatim from the calibration brief and must drive ranking, not brand loyalty.

#### 3. `tto_score` (weight 0.20) — Time-to-offer

**Signal source:** `lib/tto-estimator.mjs` — call `estimateTTO(company, {stage})` to get `{weeks_estimate, velocity_tier, basis, confidence}`, then call `scoreTTOBonus(weeks, 12)` to get an adjustment in `[-0.5, +0.5]`.

**Computation:**

```
const tto = estimateTTO(company, { stage: ttoStage });
const bonus = scoreTTOBonus(tto.weeks_estimate, 12);  // 12 weeks = Mitchell's runway constraint

// Map velocity_tier to a base 1-5 score, then apply the bonus
const baseFromTier = {
  'fast':    4.5,   // ≤5 weeks — comfortably inside runway
  'med':     3.5,   // 6–9 weeks
  'slow':    2.5,   // 10–13 weeks — close to runway edge
  'glacial': 1.5,   // 14+ weeks — exceeds runway
}[tto.velocity_tier] ?? 3.0;

const tto_score = Math.max(1, Math.min(5, baseFromTier + bonus));
```

**Anchors:**
- **5** — Cycle ≤4 weeks (xAI, Perplexity tier). Mitchell can land offer-in-hand with weeks to spare
- **4** — Cycle 5–7 weeks (Anthropic, Cohere, Mistral). Comfortable margin
- **3** — Cycle 8–10 weeks (OpenAI, Amazon). Runway pressure but doable
- **2** — Cycle 11–13 weeks (Google, Microsoft, Meta). Squeezed against the under-3-month runway
- **1** — Cycle 14+ weeks (Apple). Exceeds runway window

**Notes:** Was 0% weight prior; restored to 20% because calibration brief made runway-under-3-months the load-bearing operational constraint. The TTO library auto-pulls from `data/tto-overrides.json` if the user has captured fresher per-company intel (e.g., recruiter said "we move in 3 weeks").

#### 4. `bridge_to_ai_pm_score` (weight 0.15) — AI PM credibility builder

**Signal source:** JD content (does the role expose Mitchell to product decisions, technical artifacts, public-facing AI work?), `modes/_profile.md` §1 archetype mapping.

**Anchors:**
- **5** — A2 PgM / SA / FDE at a frontier lab where Mitchell will (a) ship public AI artifacts, (b) sit in product decisions, (c) build equity at a top lab, AND the role has obvious 2–3 year pathway to internal AI PM transition (Anthropic Strategic Operations Manager Claude Marketplace = canonical 5)
- **4** — A2 role with technical adjacency to product (Solutions Architect, Forward Deployed Engineer, AI Enablement Lead) but pathway to PM less obvious
- **3** — Tier B Communications / Editorial role at an AI-native company — builds AI literacy and exposure but slower path to PM credibility (fallback per calibration brief, not peer)
- **2** — Pure-management role disconnected from product (no technical artifacts, no AI decisions)
- **1** — Low-velocity org or role that actively reinforces "PM who can't code" anti-brand (pure marketing, demand gen, growth roles)

**Notes:** New dimension per calibration brief — Mitchell's eventual destination is AI Product Management in 2–3 years, but the NEXT role must build PM credibility without being a pure PM title (his "never be known as the PM who can't code" anti-brand). Lead positioning with builder credentials.

#### 5. `mission_alignment_score` (weight 0.10) — Mission/money slider = 3/10

**Signal source:** JD content (mission framing, public company values), `corpus/companies/{slug}.md` if present.

**Anchors:**
- **5** — Frontier safety / alignment mission AND Mitchell's stated values align (e.g., Anthropic's safety mission)
- **4** — AI-positive mission with clear public stance
- **3** — Neutral / unstated mission (default — most companies)
- **2** — Mission misaligned but not toxic
- **1** — Mission actively conflicts (defense already handled by Step 1 hard filter)

**Notes:** REDUCED from prior higher weight. Calibration brief explicitly: mission/money slider is 3/10, money dominates. **Do not lead Anthropic / OpenAI positioning with mission narrative** — it's a tiebreaker, not authentic primary driver. Internal scoring should reflect that.

#### 6. `comp_floor_score` (weight 0.10) — Floor / target / equity preference

**Signal source:** JD comp disclosure, `config/profile.yml` compensation block, `modes/_profile.md` §3 CoL-anchored floor table (city-adjusted), `modes/_profile.md` §4 staged equity discount.

**Anchors:**
- **5** — At or above $250K base, equity-heavy structure, pre-IPO upside discounted per Section 4 still exceeds target TC
- **4** — At target ($250–320K TC), reasonable equity weighting
- **3** — Between floor ($175K base) and target ($250K base); equity may compensate if structure is strong
- **2** — Below floor with override-band logic (named upside path + specific timeline + documented evidence per `modes/_profile.md` §3)
- **1** — Below floor, no override mechanism; walk-line

**Notes:** Calibration brief tightened target to $250–320K (was $200–320K). Floor remains $175K (firm). Equity-heavy preferred above $200K base; will trade base for equity above the floor. Gate-capped per H6 (undisclosed comp at non-named-target).

#### 7. `geography_score` (weight 0.05) — City preference order

**Signal source:** JD location, `modes/_profile.md` §3 city ranking (updated per calibration to put Dallas/Chicago above NYC).

**Anchors:**
- **5** — Seattle (current — no move) OR fully remote async OR Mitchell-approved metro he wants to move to
- **4** — West Coast metros (SF Bay, Portland, LA, San Diego), Dallas, Chicago
- **3** — NYC (down-ranked per calibration brief — below Dallas/Chicago), other major US metros
- **2** — International metro where realistic relocation from Seattle is uncertain (calibration: "international is aspirational, not aggressively pursued")
- **1** — No realistic work-authorization pathway

**Notes:** Calibration brief explicitly down-ranked NYC below Dallas/Chicago. International preferences are aspirational only — do not burn pipeline cycles unless the company explicitly sponsors US-to-international relocation. Geography is INPUT only, NEVER a hard gate (per `modes/_profile.md` Section 0).

---

### Step 4 — Toxicity Surface (informational only — NEVER auto-trash)

After composite is computed, run `scoreToxicity(company)` from `lib/toxicity-scorer.mjs` and `combinedRiskView(company, ttoEstimate)`. Surface the verdict in the report, but DO NOT subtract from the composite. Per calibration brief: Mitchell wants the tradeoff visible, not automated. "Mitchell would accept a toxic company if his specific team isn't toxic AND comp/equity story is significantly stronger."

Output the toxicity verdict as a separate line in the report header:

```
**Toxicity:** {verdict} ({score}/100) — {emoji} {one-line recommendation from scorer}
```

---

### Step 3b — Worked Examples (sanity-check anchors)

Three canonical roles, with composite math shown. Use these as calibration anchors when scoring new roles — if your composite is more than ±0.3 off from these anchors for a similar role, recheck.

#### Example 1 — Anthropic, Strategic Operations Manager (Claude Marketplace)

- Company: Anthropic (frontier lab, late-stage private, $300–355K disclosed comp)
- Archetype: A2 PgM (Mitchell's #1 target shape per calibration brief)
- Role status per calibration brief: "Currently rank #3 in apply-now queue at 4.5/5 ... YES-tomorrow role"

| Dimension | Score | Weighted | Rationale |
|---|---|---|---|
| fit_score | 4.0 | 0.80 | Strong A2 PgM fit, some H1 Python-production risk to watch |
| wealth_generation_score | 5.0 | 1.00 | Top-cohort frontier lab, pre-IPO, $300–355K disclosed, skill-portable to finance/health AI |
| tto_score | 4.0 | 0.80 | Anthropic ~6 weeks (lib/tto-estimator.mjs `anthropic` entry, `velocity_tier: fast`) |
| bridge_to_ai_pm_score | 5.0 | 0.75 | Canonical PM-bridge role — public AI artifacts, product decisions, top-lab equity |
| mission_alignment_score | 4.0 | 0.40 | Safety mission aligns; positioning tiebreaker not driver per calibration |
| comp_floor_score | 5.0 | 0.50 | $300–355K disclosed exceeds $250K target, equity-heavy |
| geography_score | 5.0 | 0.25 | Remote/SF/Seattle-compatible |

**Composite: 4.50** — lands in 4.5+ "strong match, apply immediately" band. Sanity-check: matches calibration brief's "4.5/5" current ranking.

**Defense filter:** N/A (Anthropic). **Bloque H gates:** none fired (assuming no H1 Python-production-primary in this specific JD; if H1 fires, composite caps at 3.4 per H1 rule).

#### Example 2 — Google, Senior PM (any AI-adjacent team)

- Company: Google (Mitchell's CURRENT employer — auto-excluded per `modes/_profile.md` §8)
- Archetype: PM (pure PM title — calibration brief: "Pure 'AI Product Manager' titles for the *next* role — too direct of a leap")

**Defense/employer filter (Step 1):** Google in hard-exclude list → return `{ score: 0, decision: SKIP, reason: 'current-employer-exclude' }` immediately. No composite computed.

**Composite: 0.00** — auto-skip.

#### Example 3 — Palantir, Forward Deployed Engineer

- Company: Palantir (defense contractor)
- Archetype: A2 FDE (would be high-priority shape at a non-defense company)
- Comp: typically $250K+ TC, equity-heavy at scale

**Defense filter (Step 1):** Palantir in `defense_exclude` list → return `{ score: 0, decision: SKIP, reason: 'defense-exclude (calibration 2026-05-16)' }` immediately. **Do NOT compute composite — even at $400K with perfect fit, this is a hard zero.** Calibration brief: "Defense contractors ... Hard exclusion."

**Composite: 0.00** — auto-skip with no further evaluation.

---

### Step 3c — Score Interpretation (recap)

| Composite | Action |
|---|---|
| 4.5+ | Strong match — apply immediately |
| 4.0–4.4 | Good match — apply |
| 3.5–3.9 | Decent — apply only with specific reason |
| <3.5 | Recommend against (see Ethical Use in AGENTS.md) |
| 0.00 | Defense-excluded or current-employer-excluded — never surface to apply queue |

---

### Implementation pointers (for future agents)

- **Where this composite is consumed:** triage prompt (`triage.mjs`), batch eval prompt (`batch/batch-prompt.md`), and any future scoring caller. Each consumer must call defense-exclude → Bloque H → composite in that order.
- **Where weights live:** This document is the source of truth. `modes/_profile.md` §2 references this section as canonical. If they ever drift, this section wins — update `_profile.md` to match, not the other way around.
- **Where TTO/toxicity logic lives:** `lib/tto-estimator.mjs` and `lib/toxicity-scorer.mjs`. Do not duplicate their logic in prompts — call the functions and consume the result.
- **Calibration provenance:** Every weight, threshold, and exclusion above is sourced from `data/career-calibration-20260516-190152.md`. When weights change in future, append a new calibration brief in `data/` rather than mutating this section silently — a fresh Claude instance should be able to trace every number back to a brief.

## Posting Legitimacy (Block G)

Block G assesses whether a posting is likely a real, active opening. It does NOT affect the 1-5 global score -- it is a separate qualitative assessment.

**Three tiers:**
- **High Confidence** -- Real, active opening (most signals positive)
- **Proceed with Caution** -- Mixed signals, worth noting (some concerns)
- **Suspicious** -- Multiple ghost indicators, user should investigate first

**Key signals (weighted by reliability):**

| Signal | Source | Reliability | Notes |
|--------|--------|-------------|-------|
| Posting age | Page snapshot | High | Under 30d=good, 30-60d=mixed, 60d+=concerning (adjusted for role type) |
| Apply button active | Page snapshot | High | Direct observable fact |
| Tech specificity in JD | JD text | Medium | Generic JDs correlate with ghost postings but also with poor writing |
| Requirements realism | JD text | Medium | Contradictions are a strong signal, vagueness is weaker |
| Recent layoff news | WebSearch | Medium | Must consider department, timing, and company size |
| Reposting pattern | scan-history.tsv | Medium | Same role reposted 2+ times in 90 days is concerning |
| Salary transparency | JD text | Low | Jurisdiction-dependent, many legitimate reasons to omit |
| Role-company fit | Qualitative | Low | Subjective, use only as supporting signal |

**Ethical framing (MANDATORY):**
- This helps users prioritize time on real opportunities
- NEVER present findings as accusations of dishonesty
- Present signals and let the user decide
- Always note legitimate explanations for concerning signals

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
| Canva MCP | Optional visual CV generation. Duplicate base design, edit text, export PDF. Requires `cv.canva_resume_design_id` in profile.yml. |
| Bash | `node generate-pdf.mjs` |

### Time-to-offer priority
- Working demo + metrics > perfection
- Apply sooner > learn more
- 80/20 approach, timebox everything

---

## Writing Style Calibration

**Check `_profile.md` first.** If a `## Writing Style` section exists there, use it directly — do not re-scan the writing-samples files. Re-scanning is only needed when new samples are added or the user explicitly asks to recalibrate.

**When to apply:** Before generating any text the user will send or publish — cover letters, LinkedIn outreach, application form answers, follow-up emails, executive summaries, profile blurbs. Does NOT apply to internal evaluation reports (A–F blocks, scores, analysis).

**If no cached style in `_profile.md`:** Read all files in `writing-samples/`, **skipping any file named `README.md`**. If no user-provided samples are found, skip style calibration and gently note — once, without pressure — that adding a writing sample (e.g. a past cover letter, a LinkedIn About section, any professional writing) would help tailor outputs to their voice. If samples exist, extract the markers below and write the result to `_profile.md` under `## Writing Style` so future sessions skip this step.

### What to extract

**Tone & register**
- Formal vs. conversational
- Confident vs. hedging (watch for qualifiers like "I think", "perhaps", "somewhat")
- Warm vs. transactional
- Degree of self-promotion — does the user undersell, match, or lead with achievements?

**Sentence structure**
- Average sentence length — short and punchy or long and layered?
- Use of fragments for emphasis
- Clause nesting and complexity
- How sentences open — subject-first, action-first, context-first?

**Punctuation habits**
- Em dashes, en dashes, or parentheses for asides?
- Oxford comma or not?
- Ellipses — used or avoided?
- Exclamation marks — never, sparingly, or freely?
- Semicolons vs. full stops to join related ideas

**Vocabulary**
- Technical density — how much jargon per paragraph?
- Preferred synonyms (e.g. "built" vs. "developed" vs. "engineered")
- Words or phrases the user reaches for repeatedly — keep them
- Words that never appear — don't introduce them

**Paragraph and structure patterns**
- Paragraph length — one-liners or developed blocks?
- Bullet-heavy or prose-heavy?
- How ideas are sequenced — problem → solution, result-first, chronological?
- Use of headers within longer pieces

**Voice signatures**
- First-person patterns — "I led", "we built", "our team"?
- Active vs. passive ratio
- Habitual openers and closers
- Rhetorical moves — does the user ask questions, use contrast, tell micro-stories?

### Rules

- **Only extract what is demonstrably present.** Do not infer style from a single data point.
- **Idiosyncratic choices are intentional.** Unconventional punctuation or phrasing is the user's voice — preserve it, do not correct it.
- **If samples conflict**, weight the most recent or most similar-context file.
- **If samples are sparse**, apply what can be reliably extracted and fall back to defaults for the rest.
- **Style calibration applies to tone and structure only.** Do not import content, claims, or metrics from samples into CVs, reports, or evaluations.
- **No verbatim copying or personal identifiers.** Store only abstract style descriptors (tone, structure, vocabulary preferences). Do not quote user sentences verbatim and do not retain personal identifiers (names, emails, phone numbers) from writing samples. "Preserve idiosyncratic choices" applies to stylistic traits only.

### Persisting the extracted style

After scanning (excluding any `README.md` files), write to `modes/_profile.md` only if at least one user-provided sample was found: find the existing `## Writing Style` section and replace the entire block up to the next `##` heading (or EOF) with the new content. If no `## Writing Style` section exists, append it. This ensures there is always exactly one canonical section. If no samples were found after filtering, do not write or modify the section.

```markdown
## Writing Style

_Extracted from writing-samples/ on {date}. Re-run if new samples are added._

**Tone:** {e.g. conversational, confident, no hedging qualifiers}
**Sentence length:** {e.g. short and punchy, avg 12 words}
**Openings:** {e.g. action-first, subject-first}
**Punctuation:** {e.g. em dashes for asides, Oxford comma, no ellipses}
**Vocabulary:** {e.g. prefers "built"/"ran"/"cut" over "developed"/"led"/"reduced"}
**Structure:** {e.g. prose-heavy, result-first sequencing}
**Voice:** {e.g. "I led", active voice dominant, no rhetorical questions}
**Avoid:** {words or patterns absent from samples}
```

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
