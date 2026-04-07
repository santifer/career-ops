# Career-Ops Intelligence Engine — Design Spec

**Date:** 2026-04-06
**Status:** Approved
**Approach:** C — Hybrid (plugin modules + thin integration layer)

---

## 1. Problem Statement

Career-ops today is reactive: the user pastes a URL, the system evaluates it. Discovery is limited to deterministic portal crawling. There is no hiring manager identification, no proactive prospecting, no self-improvement, and no intelligence gathering. The system leans European (Spanish modes, DACH market support) and lacks US market depth.

### Goals

1. **Hiring manager discovery** — For any role, find who posted it, who the user would report to, their LinkedIn, their inferred email. Draft personalized outreach as a job seeker.
2. **Proactive job discovery** — The system finds matching roles automatically, learns from feedback, and improves over time. Replaces manual URL-pasting as the primary input.
3. **Deep company/role intelligence** — Go beyond the current evaluation. Find internal discussions, hiring signals, team composition, financial health, and approach angles.
4. **Recursive self-improvement** — The system gets measurably better at scoring, discovering, and drafting with every interaction. Uses autoresearch/autoharness patterns with Gemma 4 for free overnight experimentation.
5. **Gmail integration** — Full bidirectional: draft outreach, monitor responses, handle reply pipeline, learn the user's voice from sent email history.
6. **US market first-class** — Compensation conventions, job boards, legal/cultural norms, outreach expectations.
7. **Upstream-friendly** — Zero modifications to existing files. All new code in `intel/`, new modes additive, new data files in `data/` and `config/`.

### Non-Goals

- Recruiting (we are the candidate, not a recruiter)
- Auto-sending any outreach (always human-in-the-loop)
- Replacing Claude as the production model (Gemma 4 is experimentation only)
- Modifying existing career-ops files or breaking the data contract

### Controlled Exceptions

Two existing files receive clearly-delimited appends during intel setup (wrapped in HTML comments for clean identification and removal):
- `CLAUDE.md` — new commands table appended
- `DATA_CONTRACT.md` — new file classifications appended

These are the ONLY modifications to existing files. They are necessary because Claude must know about intel commands, and the data contract must classify new files.

---

## 2. Architecture Overview

### Design Principle: Additive Only

Every new file lives in new directories or alongside existing files. The existing career-ops pipeline (`auto-pipeline.md`, `oferta.md`, `scan.md`, etc.) is untouched. The intelligence engine reads existing files as inputs and writes to its own files as outputs.

### System Diagram

```
                    ┌─────────────────────────────────────┐
                    │         EXISTING CAREER-OPS          │
                    │  (auto-pipeline, eval, scan, batch)  │
                    │         UNTOUCHED BY INTEL            │
                    └──────────┬──────────────┬────────────┘
                               │ reads        │ feeds into
                    ┌──────────▼──────────────▼────────────┐
                    │        INTELLIGENCE ENGINE            │
                    │              intel/                   │
                    │                                      │
                    │  ┌─────────┐  ┌──────────────────┐   │
                    │  │ Router  │  │ Self-Improvement  │   │
                    │  │         │  │  (3 nested loops) │   │
                    │  └────┬────┘  └────────┬─────────┘   │
                    │       │                │              │
                    │  ┌────▼────────────────▼─────────┐   │
                    │  │         OSINT Sources          │   │
                    │  │ Exa | BrightData | Parallel   │   │
                    │  │ Tavily | Firecrawl | Valyu    │   │
                    │  │ Browser | Gmail               │   │
                    │  └───────────────────────────────┘   │
                    │                                      │
                    │  ┌───────────────────────────────┐   │
                    │  │         Pipelines              │   │
                    │  │ HM Discovery | Prospector     │   │
                    │  │ Company Intel | Outreach      │   │
                    │  │ Email Inference | Gmail IO    │   │
                    │  └───────────────────────────────┘   │
                    │                                      │
                    │  ┌───────────────────────────────┐   │
                    │  │    Background Schedules        │   │
                    │  │ Every 6h: prospect scan       │   │
                    │  │ Every 12h: company watch      │   │
                    │  │ Every 24h: market trends      │   │
                    │  │ Every 24h: outreach research  │   │
                    │  │ Overnight: Gemma 4 eval loop  │   │
                    │  └───────────────────────────────┘   │
                    └──────────────────────────────────────┘
                               │ writes to
                    ┌──────────▼───────────────────────────┐
                    │          NEW USER DATA                │
                    │  data/outreach.md                    │
                    │  data/prospects.md                   │
                    │  data/intelligence.md                │
                    │  config/intel.yml                    │
                    │  config/strategy-ledger.md           │
                    │  config/voice-profile.md             │
                    │  config/exemplars/                   │
                    └──────────────────────────────────────┘
```

---

## 3. Directory Structure

```
intel/                                  # NEW — System layer (auto-updatable)
├── README.md                           # "Point your agent here" onboarding doc
├── SETUP.md                            # API keys, Gemma 4, first run
├── engine.mjs                          # Lightweight orchestrator / dispatcher
├── router.mjs                          # OSINT API router
├── sources/                            # One module per OSINT source
│   ├── exa.mjs                         # Semantic search, people discovery
│   ├── brightdata.mjs                  # LinkedIn scraping, datasets
│   ├── tavily.mjs                      # Factual search, news, company intel
│   ├── firecrawl.mjs                   # URL scraping, career page crawling
│   ├── valyu.mjs                       # Deep research, financial/regulatory
│   ├── parallel.mjs                    # Verified entity discovery
│   └── browser.mjs                     # Playwright/Chrome (existing capability)
├── pipelines/                          # Multi-step workflows
│   ├── hm-discovery.mjs               # Find hiring manager for a role
│   ├── email-inference.mjs            # Infer email format + find contact
│   ├── prospector.mjs                 # Proactive job discovery
│   ├── company-intel.mjs             # Deep company research
│   ├── outreach-drafter.mjs          # Draft personalized outreach
│   └── gmail-io.mjs                   # Gmail read/write/monitor
├── self-improve/                       # Recursive self-improvement engine
│   ├── eval-loop.mjs                  # Autoresearch-style tight eval loop
│   ├── harness-optimizer.mjs          # Meta-harness optimization
│   ├── strategy-engine.mjs           # Read/write strategy ledger
│   ├── exemplar-manager.mjs          # Manage best-evaluation exemplars
│   ├── gemma-runner.mjs              # Local Gemma 4 batch via Ollama
│   └── prompts/                       # Prompts used by self-improvement
│       ├── reflection.md              # Self-critique prompt
│       ├── principle-distill.md      # Extract principles from outcomes
│       └── harness-synthesize.md     # Generate evaluation harness
├── market/                             # Market-specific knowledge
│   ├── us.md                          # US job market conventions
│   ├── us-boards.yml                  # US-specific job boards
│   └── us-outreach-norms.md          # US communication conventions
├── schedules/                          # Background intelligence definitions
│   ├── market-scan.md                 # Every 6h: scan for new roles
│   ├── trend-analysis.md             # Every 24h: market trends
│   ├── company-watch.md              # Every 12h: watch target companies
│   ├── self-improve-cycle.md         # Overnight: Gemma 4 optimization
│   └── outreach-research.md          # Every 24h: enrich outreach queue
└── templates/                          # Output templates
    ├── hm-report.md                   # Hiring manager discovery report
    ├── outreach-draft.md             # Outreach message template
    └── intel-briefing.md             # Market intelligence briefing

modes/                                  # NEW modes (additive, alongside existing)
├── osint.md                           # Deep OSINT on company/role/person
├── prospect.md                        # Show/manage auto-discovered roles
├── outreach.md                        # Find HM + draft outreach + track
└── improve.md                         # Run self-improvement cycle

data/                                   # NEW user data files
├── outreach.md                        # HM tracking + outreach queue
├── prospects.md                       # Auto-discovered role candidates
└── intelligence.md                    # Market briefings + signals

config/                                 # NEW user config files
├── intel.yml                          # API keys, toggles, schedules
├── strategy-ledger.md                 # Self-improving knowledge base
├── voice-profile.md                   # Learned communication style
└── exemplars/                         # Best past evaluations
    ├── high-fit.md
    ├── low-fit.md
    └── calibration-miss.md
```

### Data Contract Additions

| File | Layer | Auto-updatable? |
|------|-------|-----------------|
| `intel/` (all code) | System | Yes |
| `modes/osint.md`, `prospect.md`, `outreach.md`, `improve.md` | System | Yes |
| `intel/market/` | System | Yes |
| `data/outreach.md` | User | Never |
| `data/prospects.md` | User | Never |
| `data/intelligence.md` | User | Never |
| `config/intel.yml` | User | Never |
| `config/strategy-ledger.md` | User | Never |
| `config/voice-profile.md` | User | Never |
| `config/exemplars/` | User | Never |
| `data/intel-usage.log` | User | Never |

---

## 4. OSINT Router — Intelligent API Dispatch

The router classifies each query and routes to the optimal API(s) based on query type, cost, and availability.

> **Note:** The `FINANCIAL_REGULATORY` query type was merged into `COMPANY_INTEL_DEEP` since both route to Valyu as the primary source. Keeping them separate created dead code (no regex mapped to the financial type). Deep company intel now covers financial, regulatory, and market position research.

### Routing Table

| Query Type | Primary | Secondary | Tertiary |
|-----------|---------|-----------|----------|
| Find person by role+company | Exa (people search) | Parallel (FindAll) | BrightData (LinkedIn) |
| Find person's email | Exa (enrichment) | Parallel (Task) | BrightData (profile) |
| Discover matching jobs | Exa (semantic) | Parallel (Search) | Tavily (web) |
| Scrape a job posting URL | Firecrawl (extract) | Browser (Playwright) | Tavily (extract) |
| Company intel (quick) | Tavily (search) | Exa (company) | — |
| Company intel (deep) | Valyu (DeepResearch) | Parallel (Task) | Tavily + Firecrawl | <!-- also handles financial/regulatory queries -->
| Find similar companies | Exa (findSimilar) | Parallel (FindAll) | — |
| LinkedIn profile data | BrightData | — | — |
| LinkedIn job search | BrightData | Exa | — |
| Market trends / tactics | Tavily (search) | Valyu (Answer) | Exa |
| Monitor for changes | Parallel (Monitor) | BrightData (scheduled) | — |
| Infer email format | Firecrawl (team pages) | Exa | — |

### Routing Logic

```javascript
// router.mjs pseudocode
async function route(query) {
  const type = classifyQuery(query);
  const available = getEnabledAPIs();
  const chain = ROUTING_TABLE[type];
  const partialResults = [];
  
  // Pre-debit budget reservation (not post-debit logging)
  for (const source of chain) {
    if (!available.includes(source)) continue;
    if (!reserveBudget(source, estimatedCost(type))) continue;
    
    const result = await sources[source].execute(query);
    commitBudget(source, result.actualCost);  // adjust reservation to actual
    
    if (result.confidence >= 0.7) return result;
    partialResults.push(result);  // keep low-confidence results for aggregation
  }
  
  // Attempt to merge partial results before falling back
  if (partialResults.length > 0) {
    const merged = mergeResults(partialResults);
    if (merged.confidence >= 0.5) return merged;
  }
  
  // All OSINT sources exhausted: fall back to WebSearch + Playwright
  return builtinFallback(query, partialResults);  // pass partials as context
}
```

### Graceful Degradation

If an API key is missing, the router skips it. The system always works with whatever subset of APIs is available — even zero (falls back to existing WebSearch + Playwright).

### Cost Awareness

Each source module tracks credits/cost per call. The router respects `monthly_budget` caps in `config/intel.yml` and logs usage to `data/intel-usage.log`. At 80% budget: warn user and shift to cheaper alternatives.

### Concurrency Safety

Background schedules can overlap (e.g., 6h + 12h + 24h all fire at the 24h mark). Two mechanisms prevent corruption:

**File locking:** All writes to shared data files (`data/outreach.md`, `data/prospects.md`, `data/intelligence.md`) use advisory lockfiles (`data/.outreach.lock`, etc.). A schedule acquires the lock before reading, writes atomically, then releases. Stale locks (>60s) are auto-cleared.

**Budget reservation:** API budget is pre-debited before the call (not post-logged). `reserveBudget(source, estimate)` atomically decrements the budget in `data/intel-usage.log`. If the call costs less, `commitBudget()` refunds the difference. If the call fails, `releaseBudget()` returns the full reservation. This prevents concurrent schedules from each reading "under budget" simultaneously.

**Staged writes:** As an alternative to in-place file locking, schedules can write to individual staging files (e.g., `data/.pending/prospects-{timestamp}.md`) and a merge step consolidates them. This mirrors the existing `batch/tracker-additions/` pattern.

### `config/intel.yml` Structure

```yaml
apis:
  exa:
    enabled: true
    key_env: EXA_API_KEY
    monthly_budget: 50
  brightdata:
    enabled: true
    key_env: BRIGHTDATA_API_KEY
    monthly_budget: 100
  tavily:
    enabled: true
    key_env: TAVILY_API_KEY
    monthly_budget: 30
  firecrawl:
    enabled: true
    key_env: FIRECRAWL_API_KEY
    monthly_budget: 30
  valyu:
    enabled: true
    key_env: VALYU_API_KEY
    monthly_budget: 20
  parallel:
    enabled: true
    key_env: PARALLEL_API_KEY
    monthly_budget: 50

fallback_to_builtin: true

schedules:
  prospect_scan:
    interval: 6h
    enabled: true
  company_watch:
    interval: 12h
    enabled: true
  market_trends:
    interval: 24h
    enabled: true
  self_improve_cycle:
    interval: overnight
    enabled: true
    use_gemma: true
  outreach_research:
    interval: 24h
    enabled: true
  gmail_monitor:
    interval: 4h
    enabled: true

brightdata:
  max_linkedin_lookups_per_session: 10

gemma:
  model: gemma4:26b
  max_iterations_per_cycle: 20
```

---

## 5. Hiring Manager Discovery Pipeline

Given a company + role, find WHO is hiring and how to reach them — from the perspective of a job seeker.

### Pipeline Stages

**Stage 1: Organizational Mapping**
- Exa people search: `"[company] [likely manager titles]"` (VP Eng, Head of AI, etc.)
- Parallel FindAll: `"people at [company] who manage [department]"`
- Firecrawl: scrape company's `/about`, `/team`, `/leadership` pages
- Output: candidate list (name, title, LinkedIn URL, confidence)

**Stage 2: Signal Enrichment**
- BrightData: pull LinkedIn profiles for top candidates (tenure, team size, recent activity)
- Tavily: `"[person name] [company] hiring"` — recent posts, interviews, talks
- Exa: semantic search for their writing, talks, podcasts
- Output: enriched profiles with hiring signals

**Stage 3: Hierarchy Inference**
- LLM analysis: given role level + department + enriched profiles, who is MOST LIKELY the direct hiring manager?
- Confidence scoring:
  - HIGH (80%+): title directly matches, recent hiring posts found
  - MEDIUM (50-80%): title fits but no hiring signal
  - LOW (<50%): inferred from org structure, no direct evidence
- Output: ranked list with reasoning

**Stage 4: Contact Discovery**
- Email format inference:
  1. Firecrawl: scrape company team/contact pages for patterns
  2. Exa: search `"[company] email format"` / `"[name]@[company].com"`
  3. Pattern detection: `first.last@` vs `flast@` vs `first@` etc.
  4. Validate against known patterns
- BrightData: check if LinkedIn profile has public contact info
- Output: email address with TWO separate confidence scores:
  - **Person confidence:** HIGH/MEDIUM/LOW — how sure we are this is the right hiring manager (from Stage 3)
  - **Email confidence:** HIGH/MEDIUM/LOW — how sure we are this email reaches them specifically
  - HIGH email = verified (found on public page or confirmed pattern + unique name)
  - MEDIUM email = pattern-inferred (common format, but name could be ambiguous — e.g., multiple John Smiths)
  - LOW email = best guess (unverified pattern or partial match)
  - Always display BOTH scores to the user so they can judge risk before sending

**Stage 5: Outreach Preparation**
- Read evaluation report (blocks A-F) for role context
- Read `cv.md` + `config/strategy-ledger.md` + `config/voice-profile.md`
- Draft outreach in the user's voice:
  - Reference something specific about the HM (talk, post, project)
  - Connect user's experience to the HM's team's problem
  - Short, genuine, clear ask
- Generate 2 variants: LinkedIn DM (short) + email (slightly longer)
- Email variant: `gmail_create_draft` with inferred email as recipient
- LinkedIn variant: saved to `data/outreach.md` for manual copy-paste

**Stage 6: Queue to Outreach Tracker**
- Append to `data/outreach.md` with all discovered info
- Status: `Drafted` (LinkedIn) or `Gmail Draft` (email, with draft ID)

### Ethical Guardrails (Job Seeker Edition)

- **NEVER auto-send outreach.** Creates drafts only — user reviews and sends.
- **Email confidence is clearly labeled** — HIGH/MEDIUM/LOW so user knows what they're working with.
- **Be honest in all outreach** — no fabricated connections, no fake mutual interests.
- **Respect the user's time** — don't surface low-quality prospects just to look busy.
- **Rate limit BrightData** — max 10 LinkedIn profile lookups per session (cost + account safety).

### PII Management

BrightData LinkedIn scraping produces personally identifiable information stored in user-layer files. To manage this responsibly:

- **`/career-ops purge-pii`** command: scans `data/outreach.md`, `data/intelligence.md`, and `reports/` for scraped PII (names, emails, LinkedIn URLs from HM discovery). Offers to redact or delete entries older than a configurable retention period (default: 90 days).
- **PII inventory:** Each HM report in `data/intelligence.md` is tagged with `<!-- PII: {name}, {source}, {date} -->` so the purge command can find all PII entries efficiently.
- **No PII in strategy-ledger:** Learned principles must be anonymized. "User prefers companies 50-500 employees" is fine. "User liked Jane Doe's team at Stripe" is not — use "User liked [HM with eval experience] at [Series C fintech]" instead.

---

## 6. Proactive Job Discovery (Prospector)

Replaces "paste a URL" with "the system finds URLs for you." Learns what the user wants and improves over time.

### Three Discovery Modes

**Mode 1: Semantic Match ("more like this")**
- Input: roles user scored highly (from `applications.md`, score >= 4.0)
- Exa `findSimilar`: for each high-scored job URL, find similar postings
- Parallel Search: natural language query built from archetype preferences
- Filter through `portals.yml` title_filter (positive/negative keywords)
- Dedup against `scan-history.tsv`, `applications.md`, `pipeline.md`, `prospects.md`
- Output: new candidates to `data/prospects.md`

**Mode 2: Signal-Based Discovery ("companies about to hire")**
- Scheduled every 12h
- For each tracked company:
  - Tavily: recent hiring announcements, funding rounds
  - Valyu: financial signals (funding, revenue, acquisitions)
  - Exa: blog posts about growth, team expansion
  - BrightData: LinkedIn headcount changes, new job posts
- Signal scoring (from job seeker perspective):
  - +3: Just raised a round
  - +2: Headcount growing >10% QoQ
  - +2: New leadership in target department
  - +2: HM recently posted about scaling the team (approach opportunity)
  - +1: Tech blog shows stack user has worked with
  - +1: Glassdoor engineering satisfaction > 4.0
  - -3: User previously dismissed this company
  - -2: Layoffs in last 6 months
  - -1: No remote policy when user requires remote
- High-signal companies: auto-search for matching roles
- Output: signals to `data/intelligence.md`, roles to `data/prospects.md`

**Mode 3: Market Sweep ("what's out there")**
- Scheduled every 24h
- Parallel FindAll: companies hiring target roles in US with target criteria, posted last 7 days
- Exa: semantic search using user's narrative as query
- BrightData: LinkedIn Jobs scraper for target titles + locations
- Cross-reference against existing `portals.yml` scan
- Surface net-new companies and roles
- Output: `data/prospects.md` with source attribution

### Prospects Tracker (`data/prospects.md`)

```markdown
# Prospects — Auto-Discovered Roles

## New (unreviewed)

| # | Found | Company | Role | Why It Fits You | Approach Angle | Source | URL |
|---|-------|---------|------|-----------------|----------------|--------|-----|

## Reviewed -> Pipeline
(moved to data/pipeline.md after user approves)

## Dismissed
(feeds back to learning — strategy ledger updated)
```

### The Learning Loop

Every user action on a prospect is a training signal:

- "Yes, evaluate this" → POSITIVE signal → move to `pipeline.md`
- "Not interested" → NEGATIVE signal → ask WHY (optional) → update strategy
- "Stop showing me [X]" → add to negative filters → record as RULE

Strategy engine analyzes patterns periodically:
- Which Exa queries produced the most positives?
- Which signal types correlate with user interest?
- Which companies/industries keep getting dismissed?
- What title keywords correlate with approval vs dismissal?

Updates `config/strategy-ledger.md` with new guiding/cautionary principles.

### Prospect Expiry & Archival

Prospects go stale. Unreviewed prospects older than 30 days are auto-archived:

1. Prospects in "New (unreviewed)" older than 30 days → moved to `## Expired` section
2. Expired prospects do NOT generate negative learning signals (absence of action ≠ rejection)
3. The prospect scan skips re-discovering expired URLs for 90 days
4. User can say "show expired" to review archived prospects
5. `data/prospects.md` is periodically compacted: expired entries older than 90 days are removed entirely

### Cross-Source Deduplication

Different OSINT sources return different URLs for the same role (Exa redirect URL vs LinkedIn URL vs company careers page). Dedup uses TWO strategies:

1. **URL match** (exact) — catches same-source duplicates
2. **Company + role title normalization** — catches cross-source duplicates:
   - Normalize company name: lowercase, strip Inc/Ltd/GmbH, collapse whitespace
   - Normalize role title: lowercase, strip seniority prefixes (Senior/Staff/Lead/Principal), strip location suffixes
   - If normalized company + title match an existing entry → merge as same role, keep multiple source URLs

---

## 7. Gmail Intelligence & Response Pipeline

Gmail is a full bidirectional intelligence source: outreach drafting, response monitoring, reply pipeline, and voice learning.

### Gmail as Data Source (Onboarding)

One-time analysis with user permission:

1. `gmail_search_messages`: user's sent professional emails (last 90 days)
2. Analyze: tone, vocabulary, sentence length, sign-off style, formality level, patterns
3. Distill into `config/voice-profile.md`:

```markdown
# Voice Profile

## Tone
Direct. Slightly informal. Technical but accessible.

## Structure
- Opens with specific reference (never generic)
- 3-5 sentences for cold outreach
- Exactly one question or ask per message
- Signs off: "Best, {first_name}"

## Vocabulary
- Uses: [observed patterns]
- Avoids: [observed anti-patterns]

## Patterns Learned from Draft Edits
| Date | Change Made | Rule Derived |
|------|-------------|-------------|
```

### Response Monitoring (every 4-6h)

1. `gmail_search_messages`: replies to outreach threads we created
2. Match against `data/outreach.md` entries by Gmail thread ID

**Resilient matching:** Thread IDs can break (user replies from different client, forwards to another device, or composes new email instead of replying to draft). Use a multi-signal matching strategy:
1. **Thread ID match** (primary, exact)
2. **Subject line + recipient match** (fallback: same subject line pattern + same HM email)
3. **Company + date proximity match** (last resort: email from/to same company domain within 14 days of outreach)

Before classifying as GHOSTED, run the fallback matchers to check for orphaned replies. Flag uncertain matches for user confirmation rather than auto-classifying.

3. Classify each response:
   - **POSITIVE**: interview invite, "let's chat", scheduling link
   - **NEUTRAL**: "we'll get back to you", acknowledgment
   - **NEGATIVE**: rejection, "position filled"
   - **QUESTION**: they asked for more info
   - **GHOSTED**: no reply after 7 days

4. Actions by classification:

| Classification | Action |
|---------------|--------|
| POSITIVE | Flag HIGH PRIORITY in briefing. Pull interview prep from existing report. |
| QUESTION | Draft reply using cv.md + report + voice-profile. `gmail_create_draft` in same thread. User reviews. |
| NEGATIVE | Record in strategy-ledger (learning signal). Close entry. |
| NEUTRAL | Mark "Waiting". Re-check in 3 days. |
| GHOSTED (7d) | Draft one gentle follow-up. `gmail_create_draft` in same thread. Status: "Follow-up Drafted". |
| GHOSTED (14d) | Close entry. Record in strategy-ledger. |

### Outreach Status Flow

```
Researching → Drafted → Gmail Draft → Sent →
  ├─ Replied (positive) → Interview Prep → Interviewing → ...
  ├─ Replied (question) → Reply Drafted → Sent → ...
  ├─ Replied (negative) → Closed (learned)
  ├─ No Reply (7d) → Follow-up Drafted → Sent →
  │   ├─ Replied → (loop back)
  │   └─ No Reply (14d) → Closed (ghosted)
  └─ Replied (neutral) → Waiting → (re-check 3d)
```

### Voice Learning (Continuous)

Every time the user manually edits a draft before sending:

1. `gmail_search_messages`: sent messages from last 7 days
2. Compare: what was drafted vs what user actually sent
3. Diff analysis: shortened? changed opener? removed proof point? added personal touch?
4. Update `config/voice-profile.md` with learned adjustments
5. Next draft incorporates changes

**Scoping:** Voice learning distinguishes three contexts:
- **Universal patterns** (sign-off, sentence length, vocabulary): applied to all drafts
- **Industry-specific patterns** (formality level for enterprise vs startup): tagged with industry and applied selectively
- **One-off edits** (specific to one person/company): noted but NOT promoted to rules unless seen 3+ times across different recipients

Monthly broader refresh (ONLY analyzes professional external communications, NOT internal team messages — different register):
1. Scan user's recent professional emails beyond job search
2. Has their style evolved?
3. Look for new proof points (project wins, metrics, launches)
4. Suggest adding to `article-digest.md` or `cv.md`

### Gmail-Sourced Intelligence (Daily)

Beyond outreach, mine Gmail for job search signals:

- LinkedIn job alert emails → extract roles → cross-reference `prospects.md`
- ATS status emails (Greenhouse, Lever, Ashby) → surface as suggestions in `data/intelligence.md`: "ATS email detected: [Company] status changed to [status]. Update applications.md?" (user confirms before any write to the user-layer tracker)
- Interview invitation emails → flag in briefing → trigger interview prep
- Industry newsletters → extract market signals → feed `intelligence.md`

---

## 8. Recursive Self-Improvement Engine

Three nested loops inspired by autoresearch (Karpathy), autoharness (DeepMind/NeoSigma), GEPA (DSPy), and Ouroboros. Gemma 4 (26B MoE via Ollama) handles experimentation to avoid Claude quota costs.

### Loop 1: Strategy Ledger (every evaluation)

Runs inline during normal use. No separate process.

**Trigger:** After every evaluation where user takes action (apply/skip/dismiss).

1. Record outcome in `config/strategy-ledger.md` calibration log
2. If 10+ entries since last analysis:
   a. Analyze: which scores led to applies vs skips
   b. Identify systematic biases
   c. Distill into guiding or cautionary principles
   d. Promote to active when 10+ supporting data points across at least 3 different companies/industries (prevents overfitting to one company type)
   e. Prune when contradicted by recent evidence
3. Principles are read at the start of every future evaluation

### Precedence Rule

**`config/profile.yml` deal-breakers ALWAYS override learned strategy-ledger principles.** If a principle contradicts a deal-breaker (e.g., principle says "hybrid roles score well" but profile says "deal-breaker: no on-site"), the principle is flagged as conflicting and presented to the user for resolution rather than silently applied. A conflict detection step runs before each evaluation.

### Bias Detection

To prevent reinforcement spirals where early noisy data becomes entrenched:
- Principles require data diversity: 10+ data points across 3+ different companies/industries
- Every 30 days, all principles are re-evaluated against the full calibration log (not just recent data)
- If a principle's accuracy drops below 60% on re-evaluation, it is automatically demoted to "Active Hypothesis"
- Loop 2 includes a "bias check" criterion: "Does the evaluation score differ by more than 0.5 when strategy-ledger principles are removed?" If yes for >30% of test cases, the principles are too influential and should be weakened

### Loop 2: Prompt Optimization (weekly, Gemma 4)

The autoresearch pattern applied to career-ops evaluation prompts.

**Trigger:** Weekly overnight run OR user says `/career-ops improve`.

1. **Collect test set:** All evaluations from last 30 days with known outcomes (minimum 10)
2. **Define binary eval criteria** (GEPA-inspired):
   - Score within 0.5 of user's retroactive preference?
   - All deal-breakers from `profile.yml` surfaced?
   - All relevant proof points from `cv.md` cited?
   - Recommendation matched user's actual decision?
   - HM discovery found a plausible contact? (if run)
   - Outreach draft referenced something specific about HM? (if run)
3. **Run eval loop** (Gemma 4 via Ollama):
   - For each iteration (max 20):
     a. Evaluate all test JDs using current prompt instructions
     b. Score against binary criteria → pass rate
     c. Reflect on failures (error-driven, not random search)
     d. Propose instruction edits to improve
     e. Re-run with proposed edits
     f. Keep if pass rate improved, discard if not
     g. Log iteration, pass rate, changes, outcome
4. **Output:** Proposed changes (staged, not applied) + summary
5. **Human gate:** User reviews and approves before any mode file changes

**Transfer validation:** Because Gemma 4 and Claude have different capabilities, proposed prompt changes are validated before adoption:
1. After Gemma 4 proposes changes (overnight, free), run 3-5 test evaluations using Claude with the proposed changes
2. Compare Claude's results to the expected outcomes
3. Only present changes to the user if they improve (or maintain) Claude's pass rate
4. If Gemma 4 improvements don't transfer to Claude, log the divergence and skip

This uses minimal Claude quota (3-5 evaluations, not the full 20-iteration loop) while ensuring optimizations actually work on the production model.

### Loop 3: Meta-Harness Optimization (monthly or when Loop 2 plateaus)

The Ouroboros/meta-harness pattern — optimize the optimizer itself.

**Trigger:** Monthly, or when Loop 2 shows <1% improvement for 3 consecutive runs.

1. Analyze Loop 2 history: which criteria always pass (too easy)? which always fail (wrong criteria)?
2. Gemma 4 meta-reflection: propose updated eval criteria, reflection prompts, distillation prompts
3. Output: proposed harness changes
4. Human gate: same as Loop 2

### Why Gemma 4 for Loops 2-3

- **Free:** runs locally via Ollama, zero API costs
- **Unlimited:** 100+ iterations overnight without quota concerns
- **128K context:** holds multiple full JDs + evaluations in one pass
- **26B MoE:** best quality/speed tradeoff — only active experts fire per token
- **Apache 2.0:** no usage restrictions
- **Claude stays production model** — Gemma 4 is experimentation backend only

### Strategy Ledger Format (`config/strategy-ledger.md`)

```markdown
# Strategy Ledger

## Guiding Principles (validated, n >= 5)
- {principle}. (n={count}, {accuracy}% accuracy)

## Cautionary Principles (validated, n >= 5)
- {principle}. (n={count})

## Active Hypotheses (testing, n < 5)
- [ ] H1: {hypothesis} (n={count}, trending {positive/negative})

## Calibration Log
| Date | Company | Role | Score | Action | Delta | Lesson |

## Optimization History
| Date | Loop | Pass Rate Before | After | Changes | Approved |
```

---

## 9. Background Intelligence Engine (Scheduled Agents)

Uses Claude Code's `/schedule` or cron to trigger background sessions that accumulate knowledge.

### Schedule Definitions

| Schedule | Interval | What It Does |
|----------|----------|-------------|
| Prospect Scan | Every 6h | Run all 3 discovery modes, dedup, append to `prospects.md` |
| Company Watch | Every 12h | Monitor tracked companies for hiring signals, update `intelligence.md` |
| Market Trends | Every 24h | Research market trends, tactics, salary movements, update `intelligence.md` |
| Outreach Research | Every 24h | Enrich prospects with HM discovery, draft outreach, create Gmail drafts |
| Gmail Monitor | Every 4-6h | Check for responses, classify, update `outreach.md`, draft replies |
| Self-Improve | Overnight (2am) | Gemma 4 eval loop, propose prompt improvements |

### Intelligence Briefing Format (`data/intelligence.md`)

```markdown
# Intelligence Briefing

## Latest ({date})

### New Prospects Found: {count}
- {company} — {role} ({source}, {match} match)

### Company Signals
- **{company}**: {signal description} ({score})

### Market Trends
- {trend with source}

### Tactics & Techniques
- {actionable insight with source}

### Outreach Activity
- {count} drafts ready for review
- {count} responses received
- {count} interviews pending

---

## Archive
### {previous date}
...
```

---

## 10. US Market Focus

All US-specific knowledge lives in `intel/market/` (system layer, auto-updatable).

### `intel/market/us.md` — Key Conventions

**Compensation:**
- TC = base + equity (RSUs/ISOs/NSOs) + bonus
- Research: levels.fyi, Glassdoor, Blind, Comparably
- Location bands: SF/NYC/Seattle premium vs remote-US vs hybrid

**Job Boards (in addition to existing portals.yml):**
- LinkedIn Jobs (via BrightData)
- Indeed, Wellfound, Built In, Otta
- USAJobs (federal)

**Legal/Cultural:**
- At-will employment
- Visa/sponsorship status (H-1B, green card, citizen)
- Benefits: 401k match, health insurance, PTO
- Non-competes: state-dependent (CA bans them)
- Background checks standard

**Outreach Norms:**
- LinkedIn DMs standard and expected
- Direct email to HMs common and accepted
- Shorter, more direct messages vs European formality
- "Networking coffee" — asking for 15 min is normal

### Market Loading

The router reads the user's `config/profile.yml` location and loads the appropriate market file. Future markets (`intel/market/uk.md`, `intel/market/de.md`) can be added without conflicts.

---

## 11. Integration Map

### How Intel Connects to Existing Pipeline

**User pastes a URL (enhanced):**
```
EXISTING: URL → auto-pipeline → eval A-F → report → PDF → tracker
NEW (after): If score >= 4.0 → suggest HM discovery → Gmail draft → outreach.md
ALWAYS: Record in strategy-ledger → feed to self-improvement
```

**Background prospect found:**
```
NEW: Scheduled scan → data/prospects.md → user reviews →
     "evaluate #1" → EXISTING auto-pipeline → NEW outreach pipeline
```

**Gmail response detected:**
```
NEW: Scheduled Gmail check → classify → update outreach.md →
     POSITIVE: pull EXISTING interview prep from report
     QUESTION: draft reply → gmail_create_draft
```

**Self-improvement overnight:**
```
NEW: Cron → Gemma 4 eval loop → proposed changes →
     Morning briefing → user approves → modes/ updated
```

### File Dependencies

```
EXISTING (read-only by intel, never modified):
  cv.md, config/profile.yml, modes/_shared.md, modes/_profile.md,
  modes/oferta.md, data/applications.md, data/pipeline.md,
  data/scan-history.tsv, article-digest.md

NEW (intel creates and owns):
  config/intel.yml, config/strategy-ledger.md, config/voice-profile.md,
  config/exemplars/, data/outreach.md, data/prospects.md,
  data/intelligence.md, intel/*, modes/osint.md, modes/prospect.md,
  modes/outreach.md, modes/improve.md
```

### Upstream Update Safety

Upstream updates touch existing files only. Intel lives in new directories and new files that don't exist upstream. Zero merge conflicts possible.

### Semantic Compatibility

Git merge conflicts are impossible (all new files), but semantic conflicts can occur if upstream changes file formats that intel reads. To detect this:

- `intel/engine.mjs` checks a `SCHEMA_VERSION` comment at the top of `data/applications.md` and `modes/_shared.md` at startup
- If the version doesn't match what intel expects, it warns: "Intel engine was built for applications.md schema v2. Current file is v3. Some features may not work correctly. Run /career-ops improve to recalibrate."
- This is advisory only — it never blocks functionality

### CLAUDE.md Addition (append-only)

A clearly marked section appended to CLAUDE.md during setup:

```markdown
<!-- INTEL ENGINE — added by intel setup -->
### Intelligence Engine Commands

| If the user... | Mode |
|----------------|------|
| Asks for OSINT on a company/person | osint |
| Wants to see auto-discovered roles | prospect |
| Wants to review outreach queue | outreach |
| Wants to run self-improvement | improve |
| Wants intelligence briefing | intel |

See intel/README.md for full documentation.
<!-- END INTEL ENGINE -->
```

---

## 12. Onboarding ("Point Your Agent Here")

### `intel/README.md` — The Entry Point

```markdown
# Career-Ops Intelligence Engine

## Quick Start (5 minutes)

### 1. Set your API keys
Add to ~/.zshrc or ~/.bashrc:

  export EXA_API_KEY=your_key
  export BRIGHTDATA_API_KEY=your_key
  export TAVILY_API_KEY=your_key
  export FIRECRAWL_API_KEY=your_key
  export VALYU_API_KEY=your_key
  export PARALLEL_API_KEY=your_key

Don't have all? System uses what's available, falls back gracefully.

### 2. Install Gemma 4 (optional)
  ollama pull gemma4:26b

For free overnight self-improvement. System works without it.

### 3. Tell Claude: "set up the intelligence engine"

### 4. Done
```

### Setup Flow

1. Check existing career-ops setup (`cv.md`, `profile.yml` exist?)
2. Check API keys in environment → report which found/missing
3. Generate `config/intel.yml` from `profile.yml`
4. Ask about Gmail mining → create `config/voice-profile.md`
5. Check for Gemma 4 (`ollama list | grep gemma4`)
6. Create empty data files (`outreach.md`, `prospects.md`, `intelligence.md`)
7. Set up background schedules
8. Run first discovery cycle immediately
9. Confirm: "Intelligence engine is live."

---

## 13. New Commands Summary

| Command | Mode File | What It Does |
|---------|-----------|-------------|
| `/career-ops osint [company]` | `modes/osint.md` | Deep OSINT on company/role/person |
| `/career-ops prospect` | `modes/prospect.md` | Show/manage auto-discovered roles |
| `/career-ops outreach` | `modes/outreach.md` | Review outreach queue, Gmail drafts, responses |
| `/career-ops intel` | (reads `data/intelligence.md`) | Show latest intelligence briefing |
| `/career-ops improve` | `modes/improve.md` | Run self-improvement cycle now |
| (paste URL, enhanced) | existing `auto-pipeline.md` | Existing eval + NEW HM discovery suggestion |

### Relationship to Existing Modes

`modes/outreach.md` is the OSINT-enhanced evolution of the existing `modes/contacto.md` (LinkedIn outreach). Key differences:

| Aspect | `contacto.md` (existing) | `outreach.md` (new) |
|--------|-------------------------|---------------------|
| HM discovery | WebSearch only | 6 OSINT APIs with intelligent routing |
| Email finding | Not supported | Pattern inference with dual confidence scoring |
| Outreach drafting | 3-sentence LinkedIn template | Voice-profile-aware, 2 variants (LinkedIn + email) |
| Gmail integration | None | Creates drafts, monitors responses |
| Google Docs | None | Creates personalized resume per role |
| Tracking | None | Full pipeline in `data/outreach.md` |
| Learning | None | Feeds strategy-ledger + voice-profile |

Use `outreach` for the full OSINT pipeline. Use `contacto` for a quick LinkedIn-only message when you already know who to contact.

---

## 14. Google Docs & Resume Collaboration

Collaborative resume editing between agent and user using Google Docs MCP (`@a-bonus/google-docs-mcp`) and gogcli CLI (`steipete/gogcli`).

### Tools

**google-docs-mcp** (primary — native MCP tools for Claude):
- `createDocument` — create new personalized CV
- `readDocument` — read current state (user may have edited)
- `replaceDocumentWithMarkdown` — push updated CV content
- `appendMarkdown` — add sections
- `applyTextStyle` / `applyParagraphStyle` — formatting
- `addComment` — leave review notes for user
- `listComments` — read user's feedback comments

**gogcli** (supplementary — CLI for batch operations):
- `gog docs export --format=md` — export to markdown (sync back to cv.md)
- `gog docs create --title "..." --body "..."` — create from script
- `gog drive share --email "..." --role writer` — share with user
- `gog drive list` — find existing CV documents

### Resume Pipeline

When the outreach pipeline generates a personalized CV (Block E from evaluation):

1. **Create Google Doc**: `createDocument` with title "CV - [Name] - [Company] [Role]"
2. **Write content**: `replaceDocumentWithMarkdown` with personalized CV markdown
3. **Share**: record the Google Doc URL in `data/outreach.md` alongside the outreach entry
4. **User edits**: user opens the link, makes changes directly in Google Docs
5. **Sync back** (on demand): `readDocument` → compare with `cv.md` → offer to merge changes back

### Two-Way Sync

The agent can read changes the user made in Google Docs and offer to update `cv.md`:

```
Agent: "I notice you edited the Stripe CV in Google Docs — you added a new bullet about 
       your eval framework. Want me to add this to your master cv.md?"
User: "Yes"
Agent: [updates cv.md with the new bullet]
```

This ensures `cv.md` remains the canonical source of truth while Google Docs serves as the collaboration surface.
