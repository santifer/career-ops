# Mode: osint — Deep OSINT on Company / Role / Person

Run deep, multi-source intelligence gathering on a company, person, or role. Synthesizes findings into a dated entry in `data/intelligence.md` and suggests concrete next steps.

## Trigger

- `/career-ops osint [target]` — target is a company name, person name, role title, or a mix (e.g. "Stripe", "Jane Doe at Acme", "Staff ML Engineer at DeepMind")
- Natural language: "research [company/person] deeply", "deep dive on [target]", "OSINT [target]"

## Prerequisites — Read First

Before executing any step, read these files to anchor context:

1. `config/profile.yml` — user's target roles, location, comp targets, archetypes, deal-breakers
2. `modes/_profile.md` — user's narrative, proof points, and OSINT focus areas (if set)
3. `config/intel.yml` (if it exists) — API keys availability, watchlist, scheduled monitors
4. `config/strategy-ledger.md` (if it exists) — learned principles to weight signals correctly
5. `intel/router.mjs` — routing logic to know which APIs are available

---

## Step 0 — Determine Target Type

Classify the target before doing anything else. One of:

| Type | Signals | Sub-type examples |
|------|---------|-------------------|
| **Company OSINT** | Company name, domain, "funding", "tech stack", "culture", "layoffs" | Public co, startup, stealth, PE-backed |
| **Person OSINT** | Full name, name + company, "hiring manager", "head of X", "VP of Y" | HM, recruiter, exec, potential reference |
| **Role OSINT** | Job title alone or with company, pasted JD URL, "what does a X do at Y" | Active JD, generic role research, comp benchmarking |

If the target is ambiguous (e.g. "research Stripe"), default to **Company OSINT** and note it.

If multiple types apply (e.g. "research the Head of AI at Stripe"), run Company OSINT first, then Person OSINT for the individual.

---

## Step 1 — Route Queries

Use `intel/router.mjs` to build the routing chain before executing any search. This ensures graceful degradation when an API key is missing.

```javascript
// Classify the primary query
import { classifyQuery, getRoutingChain, formatRoutingInstructions } from './intel/router.mjs';

const query = "<describe the target in natural language>";
const instructions = formatRoutingInstructions(query);
console.log(instructions);
// Output: Query type: COMPANY_INTEL_DEEP
//         Routing chain (4 sources):
//           PRIMARY: valyu — Valyu deep research (MCP: valyu_deepsearch)
//           FALLBACK: exa — Exa semantic search (MCP: web_search_exa, web_fetch_exa)
//           TERTIARY: parallel — Parallel search across available APIs
//           QUATERNARY: builtin — Built-in WebSearch/WebFetch tools
```

For each sub-query in the OSINT plan, call `classifyQuery()` independently — a Company OSINT run will issue multiple query types (`COMPANY_INTEL_DEEP`, `FIND_PERSON`, `SCRAPE_URL`, etc.).

Use the routing chain to decide which MCP tool or skill to invoke. Skip any source whose `key_env` is not set. Always fall back to `builtin` (WebSearch/WebFetch) when all preferred sources are unavailable.

---

## Step 2 — Company OSINT

Execute sub-steps in parallel where possible (batches of 3–5). Collect raw results first, synthesize in Step 5.

### 2a — Funding, News, and Hiring Signals (Tavily)

Use the `tavily-search` skill or `mcp__exa__web_search_exa` (whichever is routed first):

- `"{company}" funding round 2024 2025 site:techcrunch.com OR site:crunchbase.com`
- `"{company}" layoffs OR hiring freeze OR headcount reduction`
- `"{company}" tech stack engineering blog`
- `"{company}" glassdoor reviews culture`

Extract: funding stage, last round amount + date, notable investors, any layoff events, hiring surge or freeze signals.

### 2b — Financial Health and Market Position (Valyu DeepResearch)

If `VALYU_API_KEY` is set, invoke `valyu_deepsearch` asynchronously (it may take 30–90 s):

- Query: `"financial health, competitive positioning, and growth trajectory of {company}. Include revenue estimates, market share, key competitors, and any public signals about runway or profitability."`

This is the highest-signal source for deep company intelligence. Wait for the result before Step 5 synthesis.

If Valyu is unavailable, run an Exa or Tavily deep query as fallback:
- `"{company}" revenue growth competitors market share analysis`

### 2c — Similar Companies and Team Culture (Exa)

Use `mcp__exa__web_search_exa` with `type: "neural"` for semantic matching:

- `findSimilar` on the company careers page URL: surfaces competitors hiring for the same roles
- Search: `blog posts about engineering culture team growth at {company}`
- Search: `"{company}" engineering posts site:medium.com OR site:substack.com OR site:dev.to`

### 2d — Website Scrape (Firecrawl)

If `FIRECRAWL_API_KEY` is set, scrape these paths in parallel:

- `{company_domain}/about` — mission, history, team size, investors
- `{company_domain}/team` or `/people` — leadership names and titles
- `{company_domain}/blog` — engineering posts, product announcements
- `{company_domain}/careers` or `/jobs` — open roles, team structure, hiring volume

If Firecrawl is unavailable, use `browser_navigate` + `browser_snapshot` with Playwright.

### 2e — LinkedIn Headcount and Growth (BrightData)

If `BRIGHTDATA_API_KEY` is set:

- LinkedIn company page: headcount, headcount growth % (6-month, 12-month), department distribution
- Recent hires in AI/ML, product, engineering (signals active build-out vs. freeze)
- Recent departures in leadership (red flag signal)

If BrightData is unavailable, use WebSearch:
- `site:linkedin.com/company/{slug}` and read the headcount from the snapshot

### 2f — Structured Extraction (Parallel Task)

After raw data is collected, run a parallel extraction to normalize results into structured fields:

```
Extract from the gathered content:
- Company name (canonical)
- Founded year
- Headcount (current estimate, source)
- Headcount growth (%, period)
- Funding stage (Seed / Series A–E / Growth / Public / PE-backed / Bootstrapped)
- Total funding raised (USD, if known)
- Last round: amount, date, lead investor
- Tech stack: languages, frameworks, infra, AI/ML tools
- Key competitors (up to 5)
- Hiring signal: surge / stable / freeze / layoffs (with evidence)
- Remote policy: remote / hybrid / onsite
- Culture signals: positive and negative (from reviews, blog posts, news)
```

---

## Step 3 — Person OSINT

Run when target type is Person, or when Company OSINT surfaces a specific hiring manager or exec to research.

### 3a — People Search (Exa)

`mcp__exa__web_search_exa`:
- `"{full name}" "{company}" site:linkedin.com`
- `"{full name}" site:twitter.com OR site:x.com` — public posts, opinions
- `"{full name}" "{company}" interview OR podcast OR conference talk`

### 3b — LinkedIn Profile (BrightData)

If `BRIGHTDATA_API_KEY` is set, use `brightdata_scrape` on the LinkedIn profile URL:
- Current title, tenure, career trajectory
- Previous companies and roles (signals: founder background, big-tech pedigree, domain specialist)
- Education, publications, certifications

If BrightData unavailable, use Playwright on the public LinkedIn profile page.

### 3c — Public Writing and Talks (Tavily + Exa)

- Tavily: `"{name}" talks talks conference presentation keynote 2023 2024 2025`
- Exa semantic: `articles written by {name} about {their domain}`
- Firecrawl personal blog or company profile page if URL is known

Extract: areas of interest, technical opinions, management philosophy, communication style cues.

### 3d — Infer Contact Info (router: FIND_EMAIL)

If outreach is the goal:

```javascript
classifyQuery("find email for {name} at {company}");
// → FIND_EMAIL → ['exa', 'parallel', 'tavily', 'builtin']
```

Use the routed chain to attempt email discovery. Do NOT include inferred email in the saved report without a confidence flag. Mark as `(unverified)` if not confirmed via deliverability check.

---

## Step 4 — Role OSINT

Run when target type is Role, or after Company OSINT to understand the specific open position.

### 4a — Full JD Extraction (Firecrawl)

If a URL is provided:
- Firecrawl `firecrawl_scrape` the JD page → extract full description, requirements, team info, reporting line
- If Firecrawl unavailable: Playwright `browser_navigate` + `browser_snapshot`

Then classify the offer: pass the extracted JD text through `modes/oferta.md` for archetype detection and gap analysis.

### 4b — Similar Roles (Exa findSimilar)

Use `mcp__exa__web_search_exa` with the JD URL or role title:
- `findSimilar` → surfaces similar open roles at peer companies
- Useful for: benchmarking comp, understanding market demand, identifying backup targets

### 4c — Salary and Team Structure (Tavily)

- `"{role title}" salary 2024 2025 site:levels.fyi OR site:glassdoor.com OR site:blind.com`
- `"{company}" "{team/department}" team structure OR org chart`
- `"{company}" "{role title}" interview process OR interview questions`

### 4d — Previous Holders (Parallel FindAll)

Run in parallel:
- Exa: `previous "{role title}" at "{company}" LinkedIn`
- Tavily: `who was the "{role title}" at "{company}" before`
- BrightData (if available): search LinkedIn for alumni with that title at that company

Signals: was the role newly created or backfill? How long did the previous person stay? Where did they go after? (Red flag: multiple short tenures.)

---

## Step 5 — Synthesize Report

After all data collection is complete, write a dated entry to `data/intelligence.md`.

**If `data/intelligence.md` does not exist, create it with a header:**
```markdown
# Intelligence Log

OSINT research entries, ordered newest-first.
```

**Append the following entry at the top (newest first):**

```markdown
---

## [{target}] — {YYYY-MM-DD}

**Target:** {company / person / role}
**Type:** Company OSINT | Person OSINT | Role OSINT (or combination)
**Triggered by:** {manual query / evaluation #{num} / pipeline entry}

### Summary

2–4 sentence executive summary. Answer: is this target worth pursuing? What is the single most important signal?

### Findings

#### Funding & Financial Health
- {finding} — *Source: [name](url)*

#### Team & Headcount
- {finding} — *Source: [name](url)*

#### Tech Stack
- {finding} — *Source: [name](url)*

#### Culture & Sentiment
- {finding} — *Source: [name](url)*

#### Competitive Position
- {finding} — *Source: [name](url)*

#### Person Profile *(if Person OSINT)*
- **Current role:** {title} at {company}, since {year}
- **Career path:** {trajectory summary}
- **Communication style:** {inferred from writing/talks}
- **Contact:** {email if found, marked (unverified) if inferred}

#### Role Intelligence *(if Role OSINT)*
- **Archetype:** {archetype from oferta.md classification}
- **Comp range:** {range} — *Source: [name](url)*
- **Similar open roles:** {list with links}
- **Previous holders:** {summary — new role or backfill, avg tenure}
- **Interview signals:** {known process steps if found}

### Signals

**Positive (for job seeker):**
- {signal} — why it matters

**Negative / Watch:**
- {signal} — why it matters

### Recommended Actions

| Priority | Action | Mode / Command |
|----------|--------|----------------|
| High | {action} | `/career-ops {command}` |
| Medium | {action} | {manual step} |

### Sources

| Source | Tool Used | URL | Retrieved |
|--------|-----------|-----|-----------|
| {source name} | {Tavily / Exa / BrightData / Firecrawl / Valyu / builtin} | {url} | {YYYY-MM-DD} |
```

---

## Step 6 — Suggest Next Steps

After saving the report, output a concise summary to the user and suggest the most relevant follow-on actions based on findings.

**If Company OSINT — positive signals:**
> "Found strong signals at {company}: {1-line summary}. Suggested next steps:
> - `/career-ops scan` — check if they have open roles matching your profile
> - `/career-ops oferta [JD URL]` — evaluate any open role found
> - Add to `portals.yml` under `tracked_companies` to monitor future openings
> - `/career-ops outreach {company}` — draft a cold outreach to the hiring manager"

**If Company OSINT — negative signals (layoffs, freeze, declining headcount):**
> "Warning: {company} shows {signal}. Recommend deprioritizing. If you still want to apply, note these risks in your evaluation. Consider marking as `SKIP` in the tracker if already evaluated."

**If Person OSINT:**
> "Profile built for {name} at {company}. Suggested next steps:
> - `/career-ops contacto {name}` — draft personalized outreach using their communication style
> - Save to `data/intelligence.md` as a watchlist contact (already done)
> - Set a reminder to follow up in {N} days if no response"

**If Role OSINT:**
> "Role intelligence gathered for {role} at {company}. Suggested next steps:
> - `/career-ops oferta [URL]` — run full evaluation with match scoring
> - Cross-reference similar roles found: {list}
> - Use comp data in negotiation if you receive an offer"

**Offer to add to watchlist:**
> "Want me to add {company} to your `portals.yml` watchlist so I monitor for new openings automatically?"

---

## Output Format Summary

```
OSINT Report — {target} — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Target type: {Company / Person / Role}
Sources used: {list of APIs that returned data}
Sources unavailable: {list of APIs skipped due to missing keys}

[Summary paragraph]

Key signals:
  + {positive signal}
  + {positive signal}
  ⚠ {watch signal}

Saved to: data/intelligence.md
Next: [suggested command]
```

---

## Error Handling

- **All premium APIs unavailable:** Run entirely on `builtin` (WebSearch + WebFetch). Mark report header with `**Data quality:** builtin-only — results may be incomplete or cached`.
- **Target not found:** State clearly what was searched and what returned no results. Do not hallucinate facts. Suggest refining the target name or trying an alternative query.
- **Conflicting data between sources:** Surface both data points with their sources. Do not silently pick one. Let the user resolve.
- **LinkedIn blocked:** Note it in Sources as "LinkedIn — blocked (no BrightData key or rate-limited)". Use Exa semantic search as fallback for people and company data.
- **Valyu timeout:** If `valyu_deepsearch` exceeds 120 s, proceed with other sources and note "Valyu — timed out, excluded from synthesis".
