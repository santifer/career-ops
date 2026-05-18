# Mitchell's Career-Ops Profile Overlay

This file overrides system-layer modes/*.md when generating evaluations,
tailoring CVs, drafting outreach, or filling applications. When the system layer
and this file conflict, this file wins.

## Section 0a — Application throttle policy (READ FIRST)

These are **practical heuristics**, not contractual rules. No company publishes
exact cooldown calendars; the numbers below are aggregated from candidate
reports on Blind / Reddit / LinkedIn / Glassdoor (cross-verified by Grok deep
research, April 2026). The real risk isn't a formal calendar lockout — it's
recruiter goodwill. Spamming a top-target company makes you look low-signal
in their ATS, regardless of any formal "cooldown clock."

**Cooldown duration scales with rejection stage:**

| Rejection stage | Typical cooldown |
|---|---|
| Application screen (before phone) | 2–3 months |
| Phone screen / recruiter conversation | 3–6 months |
| Online assessment / take-home | 6 months |
| Onsite / final loop | 6–12 months |
| Recruiter explicitly waives ("apply again anytime") | Effectively 0 |
| Strong internal referral | Cooldown often shortened or waived |

When tracking a rejection in `data/applications.md`, **note the stage** in
the Notes column (e.g., `Rejected — phone screen (Apr 2026)` not just
`Rejected`). This lets the throttle policy compute a realistic re-apply
window.

**Per-company throttle rules:**

| Company | Cooldown (default) | Max simultaneous | Notes |
|---------|-------------------|------------------|-------|
| **Anthropic** | 3 mo (early) / 6-12 mo (final round); **track company-wide, not by role** | **1 active app** | #1 target. ATS tracks across all Anthropic roles. Multiple simultaneous apps risk auto-flag → permanent low-priority. Pick the single highest-scoring Mitchell-shaped role; wait for resolution before queueing another. |
| **OpenAI** | Highly variable — some recruiters explicitly say "no cooldown, reapply anytime"; others reference 6 mo windows | 1-2 active (flexible) | Less rigid than Anthropic. If rejected, **ask the recruiter directly** about re-application window — many will tell you. Default to 3 mo if no explicit answer. |
| **Stripe** | Sparse data; some reports of 6-12 mo for same role family; distinct teams treated separately | 2-3 across distinct teams | Variable. Check rejection email for explicit clause. Distinct teams (e.g., Stripe Press vs. Stripe Atlas) are functionally different applications. |
| **Mistral / ElevenLabs / Perplexity / Cohere / Modal / Sierra / Cognition / Glean / LangChain** | No formal cooldown documented | No formal cap | Smaller orgs without ATS sophistication of Anthropic/OpenAI. Apply selectively but no hard ceiling. Recruiter goodwill still matters — don't spam. |
| **Microsoft / Amazon / Meta / Adobe / Nvidia** | 6-12 mo for same role/team after onsite; **none across distinct functions** | 3-5 across distinct functions | Big Tech ATS tracks by req-ID; distinct teams/functions/locations routinely allow concurrent apps. Avoid identical-variant spam at the same office. |
| **All others** | No documented default — check rejection email | No formal cap | Use judgment. Look for "you may re-apply after X months" clauses. |

**Decision rules when multiple Apply-Now roles surface at the same
throttled company:**

1. Rank by score; apply to the **highest** first
2. Mark the rest as `Deferred — cooldown` in the tracker (NOT `Discarded` — they should re-surface when cooldown clears)
3. If you have an active application at the company already, defer ALL new ones until the active one resolves
4. **Strong internal referral overrides cooldown** — if a Mitchell network connection refers him, the cooldown is often waived or shortened. When that happens, change the deferred role's status to `Evaluated` and re-queue

**Backfill rule:** Grok intel may surface upcoming role drops at the same
throttled company. If a high-confidence "likely posting in next 30 days"
signal exists, defer applying to current sub-4.5 roles in favor of the
anticipated stronger fit.

**What to ask the recruiter when rejected:**

> "Thanks for letting me know. For my own planning — what's the
> re-application window if a different role at {Company} matches my
> profile? Is there a specific cooldown for the role family, or can I
> apply to a distinct team after some interval?"

Most recruiters will give a concrete answer (often more permissive than
the published heuristics). Capture that answer in
`data/applications.md` Notes for that row, and override the default
throttle for that company going forward.

## Section 0 — Location policy (READ FIRST — overrides any rule below)

**Location is a SCORING INPUT, not a HARD GATE.** Mitchell is open to relocation
for the right opportunity. Never list "location mismatch", "SF/NYC onsite vs.
Seattle", "Doha onsite", "London onsite", "relocation required", or any other
geography-based reasoning as a hard blocker / hard gate / disqualifier in any
report block.

Location influences only the **Remote Quality** dimension (5% weight) per
Section 2. Any role at a major US or international metro Mitchell would move
to (Section 3 city list) scores **4 or 5 / 5** on Remote Quality, **never 1 or
2**, even if Mitchell currently lives elsewhere. The role can still pass the
4.0 apply floor on the strength of other dimensions even if Remote Quality
scores at the lower end.

The only situation where location reduces Remote Quality below 3 is when
Mitchell **literally cannot obtain work authorization** for that market (e.g.,
a country with no realistic visa pathway for US citizens). Onsite anywhere in
the US, Canada, UK/Ireland, EU, LatAm preferred cities, or SE Asia preferred
cities = Remote Quality ≥ 3.

When Block A reports the location, frame it neutrally: "JD lists role as
SF/NYC onsite hybrid 25% — Mitchell would relocate." Not "Mitchell fails the
SF/NYC onsite gate."

## Section 1 — Archetype taxonomy (replaces santifer's 6)

Santifer's archetypes (FDE, SA, PM, LLMOps, Agentic, Transformation) do not
apply to Mitchell. Replace archetype detection with Mitchell's three-tier
taxonomy:

### Tier A1 — Residency / Fellowship Programs
Cohort-based, explicitly for career pivoters, lower technical gate.
- Examples: Tarbell Center AI Journalism Fellowship, IAPS AI Policy Fellowship,
  Horizon Fellowship, Berkman Klein Center Fellowship, Apple AIML Residency,
  OpenAI Residency, Perplexity Research Residency
- Anthropic Fellows: WRONG-SHAPE for Mitchell (empirical AI safety research
  orientation; weak Python depth; no research project pitch). Skip unless he
  develops a Societal Impacts workstream pitch post-May-11
- Score multiplier: +1.5x base weight (residencies are explicit pivot vehicles)
- Track application windows — these aren't always rolling

### Tier A2 — AI Solutions Architect / Agent Builder / AI Enablement / AI PgM
Primary aspirational target. Score at full weight; do not gate on hypothetical
future portfolio.
- Specific titles to prioritize: AI Solutions Architect, Forward Deployed
  Engineer, Applied AI Engineer, AI Enablement Lead, AI Program Manager,
  AI Technical Program Manager, AI Product Operations, AI Product Manager,
  Technical Deployment Lead, Technical Enablement Lead
- Apply immediately when listings appear; rejection data sharpens positioning

### Tier B — Communications / Editorial at AI-native companies
**Fallback role, not peer to A2** (calibration brief 2026-05-16: forced-choice
showed Anthropic A2 PgM > Anthropic Tier B Editorial). Must pass AI-nativity
filter.
- Specific titles: Developer Education Lead, Developer Advocate, Communications
  Lead, Communications Manager, Engineering Editorial Lead, Technical Writer,
  Editorial Lead, Content Strategy Lead
- In `bridge_to_ai_pm_score`: anchor at 3 (vs A2 anchoring at 4–5). Tier B
  builds AI literacy and exposure but slower path to PM credibility.
- Apply Tier B as back-pocket, not first-choice. If both an A2 and a Tier B
  role are open at the same throttled company (e.g., Anthropic 1-active-app
  rule), the A2 wins.

### AI-nativity filter (all tiers)
Qualifies if:
- Core product is AI (model lab, AI infra, AI-native application layer), OR
- AI is structural to roadmap (not marketing veneer), AND
- Culture publicly demonstrates AI-positive stance

Excludes: legacy orgs where AI is bolt-on; AI-skeptical leadership; AI roles
quarantined from product roadmap.

## Section 2 — Composite scoring formula (post-calibration 2026-05-16)

**SUPERSEDED by the canonical scoring formula in `modes/_shared.md` "Scoring System" → "Step 3 — Composite Scoring Formula (post-calibration 2026-05-16)".**

The old 10-dimension matrix that lived here (North Star Alignment 25%, CV Match 15%, Level 5%, Comp 15%, Growth 15%, Remote 5%, Reputation 10%, Tech Stack 5%, Cultural 5%, Time-to-Offer 0%) is REPLACED. Do not score against it.

The new composite is:

```
composite_score =
    0.20 × fit_score                  # CV-to-JD alignment
  + 0.20 × wealth_generation_score    # equity IPO probability + product trajectory + skill portability
  + 0.20 × tto_score                  # time-to-offer from lib/tto-estimator.mjs
  + 0.15 × bridge_to_ai_pm_score      # AI PM credibility builder (2-3yr destination)
  + 0.10 × mission_alignment_score    # mission/money slider = 3/10
  + 0.10 × comp_floor_score           # CoL-anchored floor (see Section 3 for table)
  + 0.05 × geography_score            # city preference order (updated below)
```

Read `modes/_shared.md` for the full anchor rubric, worked examples, and dimension definitions. The order of operations is:

1. **Defense-exclude hard filter** (Palantir / Anduril / Shield AI / any defense-primary company → score = 0, decision = SKIP, return immediately)
2. **Bloque H gates** from `modes/oferta.md` (gate caps applied to composite)
3. **Composite formula** above
4. **Toxicity surface** (informational only, never auto-trash)

**Source-of-truth note:** Calibration brief `data/career-calibration-20260516-190152.md` drove every weight. Reweighting must add a new brief, not mutate the existing one silently.

**Section 3 (CoL-anchored floor) and Section 4 (staged equity discount) below still apply** — they feed `comp_floor_score` in the new composite. Section 5 flags still surface live concerns. Sections 0, 0a, 1, 6, 7, 8, 9 below are unchanged or have surgical updates noted inline.

**Apply floor:** 4.0 composite for "actually apply" recommendations. Below 4.0 = auto-skip or manual review only. (Unchanged from prior rubric.)

## Section 3 — CoL-anchored compensation floor

**City preference order** (calibration brief 2026-05-16 — used by `geography_score` in the composite formula):

1. Seattle (current — no move needed)
2. West Coast metros (SF Bay, Portland, LA, San Diego)
3. Dallas, Chicago
4. NYC — **DOWN-RANKED**, ranks BELOW Dallas/Chicago per calibration brief
5. International (London, Dublin, Glasgow, Berlin, Lisbon/Porto, Madrid/Barcelona/Bilbao/San Sebastián, Mexico City, Cuenca, Medellín, Chiang Mai, Chiang Rai) — **aspirational only**; do not burn pipeline cycles unless the company explicitly sponsors US-to-international relocation

`comp_floor_score` dimension scoring uses Mitchell's CoL-anchored floor table (working floor for the city, scored 1–5 against actual offer).

**Target TC band** (calibration brief tightened from prior $200–320K): **$250K–$320K total comp**. Floor base: **$175K** (firm walk-line). Equity-heavy preferred above $200K base.

| City | Working floor | Reasoning |
|------|--------------|-----------|
| Seattle | $180K | Stated floor (slight discount from current $195K with override) |
| SF | $216K | $180K × SF/Seattle CoL multiplier (~1.20) |
| NYC (Manhattan) | $220K | $180K × NYC/Seattle CoL multiplier (~1.22). **Down-ranked per calibration brief** — preference order is Dallas/Chicago > NYC, even though dollar floor is higher. NYC offer must exceed floor by more than Dallas/Chicago to beat them on `geography_score`. |
| LA | $194K | $180K × LA CoL multiplier (~1.08) |
| San Diego | $189K | $180K × SD CoL multiplier (~1.05) |
| Portland | $180K | Felt floor wins (CoL math says ~$166K) |
| Chicago | $180K | Felt floor wins; **ranks above NYC** in preference per calibration |
| Dallas | $175K | Slight discount accepted given much lower CoL; **ranks above NYC** in preference per calibration |
| Fully remote | $175K | Live-where-you-want benefit; felt floor applies |
| London (UK-paying or US-paying remote) | $175K USD-equiv | Felt floor applies; UK-paying must clear via FX-adjusted equivalent. UK Skilled Worker visa may apply. |
| Dublin (EUR-paying or US-paying remote) | $175K USD-equiv | Same; Ireland Critical Skills work permit may apply. |
| Glasgow (UK-paying or US-paying remote) | $175K USD-equiv | Same; lower UK CoL — local-pay number can be lower if equity offsets. |
| Chiang Mai / Chiang Rai (US-paying remote) | $175K | Live-where-you-want; Thai Smart Visa or DTV (Digital Nomad) typically required. |
| International preferred — Latin America (Mexico City, Cuenca, Medellín; US-paying remote) | $175K | Same; tourist/digital-nomad visa typically sufficient for US-payroll remote. |
| International preferred — Iberia / Berlin (US-paying remote) | $175K | Same; visa pathway varies (Spain digital nomad, Portugal D7, Germany freelancer). |

Scoring rule for Estimated Comp dimension:
- 5/5: At or above floor + meaningful sign-on + competitive equity
- 4/5: At floor with adequate equity
- 3/5: Within 5% of floor with override-band logic applied
- 2/5: Below floor, override mechanism not satisfied
- 1/5: Far below floor, no override mechanism

Override-band logic for below-floor offers:
A below-floor offer scores above 1/5 ONLY if all three are present:
1. Named comp upside path (specific mechanism: equity event, named promotion
   track, internal mobility precedent at the company)
2. Specific timeline (months, not "eventually")
3. Documented evidence the path exists (precedent at the company, not vibes)

"I'd have access to expert minds" does NOT satisfy any of the three. Vague
mobility promises do NOT satisfy.

## Section 4 — Staged pre-IPO equity discount

Equity portion of Total Comp gets discounted for scoring purposes based on
company stage. The discounted value feeds the Estimated Comp dimension. Full
stated value still surfaces in the report — discount is for SCORING, not for
hiding the upside.

| Company stage | Discount rate | Description |
|--------------|---------------|-------------|
| Late-stage (Series D+ AI, public valuation marks, demonstrated revenue) | 60% of stated | Cohere, Databricks, Anysphere, ElevenLabs, Anthropic, OpenAI |
| Mid-stage (Series B-C AI, traction but not at scale) | 40% of stated | Most AI startups in product-market-fit phase |
| Early-stage (Seed-Series A) | 20% of stated | Optionality only |
| Already-public RSU | 100% of stated | Liquid market |

Mitchell retains override rights per offer if he wants to bet on outperformance.
The discount applies automatically; override requires explicit Mitchell
acknowledgment in the manual review.

## Section 5 — Five live-decision flags

These flags surface concerns at score-time without gating. Mitchell resolves
during review.

### Flag: INTERNATIONAL-TAX
Trigger: fully-remote US-paying role compatible with international preferred
city residence (Mexico City, Medellín, Cuenca, London, Dublin, Glasgow,
Porto, Lisbon, Barcelona, Madrid, Bilbao, San Sebastián, Berlin, Chiang Mai,
Chiang Rai), OR a UK/Ireland-based role open to applicants with appropriate
work authorization.
Surface: "Role compatible with residence in {city}. Tax/visa considerations
unresolved (e.g., UK Skilled Worker, Ireland Critical Skills, Thai DTV/Smart
Visa, Spain Digital Nomad, Portugal D7, Germany Freelancer, LatAm
tourist/digital-nomad)."

### Flag: EQUITY-RISK-PROFILE
Trigger: equity >30% of total comp, OR pre-IPO options / early-stage private,
OR back-loaded vesting (Amazon-style 5/15/40/40), OR PPU structure (OpenAI).
Surface: "Equity weighting {%}. Type: {RSU/ISO/PPU/pre-IPO options}. Company
stage: {stage}. Vesting: {schedule}. Discounted scoring value: {discounted}."

### Flag: LATERAL-MOVE-TRADEOFF
Trigger: Tier B role in Seattle at/below Google L5 TC with strong AI-nativity,
OR any role with comp at/below floor + ambiguous trajectory.
Surface: "Tier B bridge at {comp delta}. Trajectory logic must be stated
explicitly before clearing review. Override rule: documented path to A2 within
~18 months required, with specific mechanism (not 'access to expert minds')."

### Flag: ANTHROPIC-POSTING
Trigger: any new Anthropic posting.
Surface: "Pull corpus/companies/anthropic.md and corpus/rejections.md before
tailoring. Two confirmed rejections (Developer Education Lead, Comms AI
Productivity Lead). Re-application timing applies for those specific roles
unless material skill change documented."

### Flag: REQUIRES-HUMAN-REWRITE
Trigger (May 5+ tailoring/apply only): application form contains essay fields
matching patterns: "why X", "tell us about a time", "describe", "what excites
you about", "in your own words".
Surface: Do NOT generate a draft response. Instead, load corpus/voice-profile.md
and write Mitchell a structured prompt that surfaces (1) what the question is
asking, (2) what his voice profile says about how he'd answer, (3) 2-3 specific
moments from his corpus that fit. Pass to Mitchell for human writing.

## Section 6 — Voice profile constraint (always-on)

Before generating ANY of the following, load corpus/voice-profile.md and apply
its six signatures + banned phrases as constraints:
- CV bullets (modes/pdf.md, modes/oferta.md Block E)
- Cover letter or essay drafts (modes/apply.md)
- LinkedIn outreach messages (modes/contacto.md)
- Recruiter email replies
- Application form free-text fields (when not flagged REQUIRES-HUMAN-REWRITE)

Hard constraints:
- 350-word cap on professional emails (cut to compress)
- Banned phrase list from voice-profile.md is non-negotiable
- Six signatures must be present (lead-with-the-point, questions as
  relationship maintenance, specific warmth, contractions in casual,
  bumping-back-up follow-up pattern, tonal shifts on errors)
- Spelling: "yeah" not "yea"
- Compression test: any draft must survive 40% cut without losing what makes
  it Mitchell's

When generating long-form content (>500 words), produce TWO versions: full and
40%-cut. The cut version is usually correct.

When known-good samples exist in corpus/sample-outputs/ for a content type,
load them first as anchor reference before generating. The sample format,
voice, and structure should inform the new draft. Saved samples include:

- corpus/sample-outputs/linkedin-outreach-anthropic-comms-mgr-research.md
  (LinkedIn outreach voice anchor)

## Section 7 — Per-company auto-flag behavior

Before generating any offer evaluation, check corpus/companies/{slug}.md for
the company. If a file exists for the company:
1. Pull the "Net recommendation by org" table
2. Pull "Mitchell-specific positioning notes"
3. Pull "What to watch for in JDs"
4. Apply the per-org recommendation as scoring input to Cultural Signals
   dimension
5. Surface load-bearing context in the evaluation report under a dedicated
   "Company Context (corpus)" block

If no file exists for the company, Job #1 Grok social intel runs at evaluation
time (Stage 5 wires this in).

## Section 8 — Hard exclusions

**Hard-exclude filter runs BEFORE any scoring** — see `modes/_shared.md` "Step 1 — Defense-Exclude Hard Filter."

Companies excluded from evaluation entirely:
- **Defense contractors** (calibration brief 2026-05-16): Palantir, Anduril, Shield AI, and any other primary-defense-mission company. Hard zero — return `{score: 0, decision: SKIP}` immediately, do not compute composite, do not generate Blocks A–G.
- **Google** (current employer; external postings excluded; internal AI-org moves out-of-band). Same immediate-return treatment.

Roles excluded entirely:
- Pure marketing roles (PMM, growth marketing, demand gen)
- Pure social media management roles
- Junior or mid-level titles
- Non-AI-native company roles
- **Pure "AI Product Manager" titles for the CURRENT cycle** (calibration brief: PM is 2–3 year destination, not the next role — anti-brand is "PM who can't code")

## Section 9 — Grok Job #1 Social Intelligence integration

For every offer evaluation, after generating Blocks A-F (and Block G ghost
job detection if applicable), you MUST call the Grok social intelligence
script and embed its output as a dedicated block before the final score
calculation.

Execution:

```bash
node scripts/grok-social-intel.mjs \
  --company="{company}" \
  --role="{role title}" \
  --url="{JD URL}"
```

The script returns a markdown block. Embed verbatim in the report between
Block F (or Block G) and the Score calculation. Do NOT paraphrase, summarize,
or merge Grok findings into Claude's reasoning. Grok's findings stay
attributed to Grok with citation laundering explicitly prohibited.

Use Grok findings as input to:
- `wealth_generation_score` dimension (team health, product trajectory, equity signal)
- `tto_score` dimension (hiring velocity signal — fast-moving teams close faster)
- ANTHROPIC-POSTING flag context
- EQUITY-RISK-PROFILE flag context (recent layoffs / leadership departures)
- LATERAL-MOVE-TRADEOFF flag context (trajectory signal from team health)
- Section 10 Toxicity Composite (feed Layoffs.fyi + LinkedIn exit signals from Grok output)

If the script returns the failure block ("Status: Unavailable"), proceed
with evaluation using corpus/companies/{slug}.md as fallback context. The
report should include the failure block verbatim — do not omit it. The
unconfirmed flag in the report header captures the partial-context state.

Cost discipline: the script enforces a daily cost cap. If the cap is reached,
subsequent evaluations for the day will receive failure blocks. This is
expected and prevents runaway spend during unattended runs.

## Section 10 — Toxicity Composite (calibration brief 2026-05-16)

Per calibration brief: Mitchell wants a structured company toxicity score surfaced
with every evaluation. **NEVER auto-trash a role on toxicity signals alone.** Always
surface to Mitchell with full reasoning so he can make the tradeoff himself. He
would accept a toxic company if his specific team is clean AND the comp/equity
story is significantly stronger.

### Toxicity score: 0–10 scale

Compute a composite score from the four signal buckets below. Each bucket
contributes a raw score; the composite is the sum capped at 10, then surface the
breakdown with driver attribution.

| Signal bucket | Max contribution | Source |
|---|---|---|
| Layoffs | 0–3 | Layoffs.fyi (within 12 months, weighted by recency + % headcount) |
| Leadership exits | 0–3 | LinkedIn (C-suite / VP / director exits in past 6 months without clear succession) |
| Hiring freezes | 0–2 | Blind / Reddit (credible first-person reports within 90 days; vague rumors = 0.5 max) |
| Glassdoor / Levels.fyi patterns | 0–2 | Declining rating trend + "management" / "layoff" / "toxic" keywords in recent reviews |

### Scoring anchors

| Score | Meaning |
|---|---|
| 0–2 | Low toxicity — no material negative signals |
| 3–5 | Moderate — one active signal worth watching; note in report but don't penalize |
| 6–8 | Elevated — multiple signals; surface prominently; flag for team-level due diligence |
| 9–10 | High — active layoffs + leadership exits + freeze; require explicit Mitchell override to proceed |

### Toxicity block format (embed in every evaluation report after Block G / Grok block):

```
## Toxicity Composite — {Company}

**Score:** {X}/10 — {Low | Moderate | Elevated | High}

| Signal | Score | Detail |
|--------|-------|--------|
| Layoffs (Layoffs.fyi) | {0-3} | {detail or "None found in past 12 months"} |
| Leadership exits (LinkedIn) | {0-3} | {detail or "No material exits detected"} |
| Hiring freezes (Blind/Reddit) | {0-2} | {detail or "No credible reports found"} |
| Glassdoor/Levels.fyi | {0-2} | {detail or "Rating stable; no adverse pattern"} |

**Mitchell's call:** Surface — do not auto-trash. If score ≥ 6, flag prominently
with: "Recommend team-level due-diligence before advancing. Mitchell can override
with explicit acknowledgment in tracker Notes."
```

### Integration with scoring pipeline

The toxicity composite is **informational only** — it does NOT subtract from the
composite score formula in Section 2. It surfaces as a standalone block in the
evaluation report, after the composite is computed. The evaluator notes the
toxicity score in the report header:

```
**Toxicity:** {X}/10 — {level} ({primary driver})
```

Feed Layoffs.fyi + LinkedIn exit signals captured by the Grok script (Section 9)
into the toxicity scoring. If Grok script is unavailable, compute with web search
fallback (WebSearch: "{company} layoffs 2025 2026 site:layoffs.fyi OR site:blind.com
OR site:glassdoor.com").
