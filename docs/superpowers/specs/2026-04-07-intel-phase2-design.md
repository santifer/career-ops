# Intel Engine Phase 2 — Source Modules, Orchestrator, Google Workspace Bidi Sync

**Date:** 2026-04-07
**Status:** Approved
**Approach:** Hybrid (MCP/CLI for search tools, REST for Parallel/BrightData, gws CLI + googleapis for Google)

---

## 1. Source Modules

Seven modules in `intel/sources/`, each exporting the standard interface:

```js
export async function execute(query)        // Run query, return normalized results
export function estimateCost(queryType)      // USD estimate before execution
export function isAvailable()               // API key present + service reachable
```

### Module Table

| Module | File | Integration | Primary Query Types |
|--------|------|-------------|-------------------|
| Exa | `exa.mjs` | REST API (`https://api.exa.ai`) — search, findSimilar, getContents | FIND_PERSON, DISCOVER_JOBS, COMPANY_INTEL_*, SIMILAR_COMPANIES |
| Tavily | `tavily.mjs` | REST API (`https://api.tavily.com`) — search, extract | DISCOVER_JOBS, COMPANY_INTEL_QUICK, MARKET_TRENDS |
| Firecrawl | `firecrawl.mjs` | REST API (`https://api.firecrawl.dev/v1`) — scrape, crawl | SCRAPE_URL, MONITOR_CHANGES |
| Parallel | `parallel.mjs` | REST API (`https://api.parallel.ai/v1beta`) — search, findAll, extract, enrich | FIND_PERSON, FIND_EMAIL, SIMILAR_COMPANIES, enrichment |
| Bright Data | `brightdata.mjs` | REST API (Web Scraper API) | LINKEDIN_PROFILE, LINKEDIN_JOBS |
| Valyu | `valyu.mjs` | REST API (deepsearch endpoint) | COMPANY_INTEL_DEEP, MARKET_TRENDS |
| Built-in | `builtin.mjs` | WebSearch/WebFetch (Bash-invoked) — always-available fallback | Any query type as last resort |

### Normalized Result Shape

```js
{
  title: string,
  url: string,
  snippet: string,
  metadata: {},      // source-specific fields (funding, headcount, etc.)
  source: 'exa' | 'tavily' | 'firecrawl' | 'parallel' | 'brightdata' | 'valyu' | 'builtin'
}
```

Cost estimates are hardcoded per query type (from API pricing docs) and checked against `BudgetTracker` before execution.

---

## 2. Orchestrator

New file `intel/orchestrator.mjs` — central pipeline runner connecting router -> sources -> dedup -> budget -> output.

### Core Flow

```
classify(query)  ->  getRoutingChain(type)  ->  trySource(chain[0])
                                                   | fail/budget-exceeded
                                                trySource(chain[1])
                                                   | fail
                                                trySource(chain[n])
                                                   |
                                             dedup(results)
                                                   |
                                             formatOutput(results, type)
```

### `executeQuery(query, options)`

1. `classifyQuery(query)` -> get query type from router
2. `getRoutingChain(queryType)` -> ordered list of sources
3. For each source in chain: `budget.reserveBudget()` -> `source.execute()` -> `budget.commitBudget()` (or `releaseBudget()` on failure). Stop at first success. Skip source if budget exceeded.
4. `dedup.deduplicate(results)` via existing `intel/dedup.mjs`
5. Return normalized results

### Pipeline Commands

| Function | What it does |
|----------|-------------|
| `runProspectScan(config)` | DISCOVER_JOBS across all portals -> dedup against `data/prospects.md` -> append new entries -> liveness check on URLs -> expire stale |
| `runOutreachResearch(company, role)` | FIND_PERSON -> FIND_EMAIL -> email-inference -> draft outreach using `intel/templates/outreach-draft.md` |
| `runCompanyIntel(company, depth)` | COMPANY_INTEL_QUICK or _DEEP -> format using `intel/templates/intel-briefing.md` |
| `runMarketScan()` | MARKET_TRENDS -> aggregate into `data/intelligence.md` |

### Liveness Integration

`runProspectScan` imports `check-liveness.mjs` and runs it on every new URL before adding to prospects. Dead links get status `Expired` immediately, saving evaluation time.

---

## 3. Google Workspace Bidirectional Sync

New directory `intel/google/` with push modules (gws CLI) and poll modules (googleapis).

### Push (gws CLI)

| Module | Triggers | Operation |
|--------|----------|-----------|
| `sheets-push.mjs` | After every evaluation/status change | `gws sheets +append` new row; `gws sheets +update` existing row on status change. Mirrors `data/applications.md` columns. |
| `docs-push.mjs` | After outreach draft or cover letter generation | `gws docs +write` creates Google Doc from draft. Returns doc URL for tracker. |
| `calendar-push.mjs` | When status -> `Interview` | `gws calendar +insert` creates event with company, role, prep notes. |

### Poll (googleapis npm package)

| Module | Schedule | Operation |
|--------|----------|-----------|
| `gmail-watch.mjs` | Every 4h | Polls Gmail for recruiter response patterns. Parses responses -> updates `data/applications.md` status (e.g., `Evaluated` -> `Responded`). Adds signal to `data/intelligence.md`. |
| `sheets-pull.mjs` | On demand + before each push | Reads Google Sheet to detect manual edits. Reconciles Sheet -> `applications.md` if Sheet is newer. Conflict: last-write-wins with timestamp column. |

### Sync Coordinator

`intel/google/sync.mjs` — coordinates push/pull operations:
- Before any push: run `sheets-pull.mjs` to capture manual edits
- After push: update last-sync timestamp
- Exposes `syncAll()` for scheduled runs

### Config Additions (config/intel.yml)

```yaml
google:
  docs_mcp: true
  gogcli: true
  gws_cli: true                              # Enable gws CLI for push operations
  tracking_sheet_id: ""                       # Google Sheet ID for application tracking
  cover_letter_folder_id: ""                  # Google Drive folder for generated docs
  gmail_monitor: true                         # Enable Gmail polling
  gmail_labels: ["INBOX"]                     # Labels to monitor
  gmail_recruiter_patterns:                   # Subject line patterns
    - "interview"
    - "application"
    - "next steps"
    - "offer"
```

### Auth Flow

One-time: `gws auth setup` + `gws auth login` (interactive). For googleapis polling, read OAuth refresh token from gws credential store (shared credentials, no separate auth). Setup checker in `engine.mjs` adds `gws` CLI availability check.

### Sync Contract

Google Sheet is a mirror, not source of truth. `applications.md` remains canonical. Sheet accepts manual edits which get pulled back. If both sides changed the same row since last sync, Sheet wins (user edited in Sheet = most recent intent).

---

## 4. Eval Loop Wiring + Self-Improvement

### Post-Evaluation Hook

After every offer evaluation (`oferta` mode), `intel/wiring.mjs` calls `recordOutcome(evaluation)`:

1. Append calibration entry to `config/strategy-ledger.md`: company, role, score, archetype, action, user feedback
2. Once 10+ entries exist, next `self_improve_cycle` triggers eval loop:
   - `buildTestSet()` from calibration entries
   - Re-evaluate each test case against current weights
   - `scoreEvaluation()` identifies systematic drift
   - `strategy-engine.mjs` promotes/prunes principles
3. Gemma 4 (or Claude fallback) generates weight adjustments via `prompts/reflection.md`
4. Eval loop accepts/rejects based on pass rate improvement

### Voice Profile Learning

After every user-edited outreach draft:
- Diff original vs. edited version
- Extract patterns (sentence length, formality, vocabulary)
- Append rules to `config/voice-profile.md`
- Future drafts read voice profile and apply rules

### Feedback Capture Points

| User Action | Recording |
|-------------|-----------|
| User applies after evaluation | `action: "applied"` in calibration log |
| User says "skip" or adjusts score | Adjustment note in calibration log |
| User edits outreach draft | Voice profile update |
| Interview outcome (status -> Offer/Rejected) | Outcome signal for score calibration |
| Google Sheet manual status change | Captured by sheets-pull, triggers calibration entry |

---

## 5. Recurring Schedules

| Schedule | Interval | Pipeline | Sources |
|----------|----------|----------|---------|
| `prospect_scan` | 6h | `runProspectScan` -> liveness -> dedup -> sheets-push | Exa, Tavily, Parallel |
| `company_watch` | 12h | `runCompanyIntel` on tracked companies (Evaluated/Applied/Interview) | Exa, Valyu, Parallel |
| `market_trends` | 24h | `runMarketScan` -> update `data/intelligence.md` | Valyu, Exa, Tavily |
| `self_improve_cycle` | overnight | Eval loop -> strategy engine -> Gemma 4 reflection | Local only |
| `outreach_research` | 24h | `runOutreachResearch` for top 5 uncontacted high-score offers | Parallel, Exa, Bright Data |
| `gmail_monitor` | 4h | `gmail-watch.mjs` -> status updates -> sheets-push | Google only |

---

## 6. Agent Team Architecture

Agents 1-4 run in parallel. Agent 5 blocks on 1+2. Agent 6 blocks on 3+4+5.

| Agent | Builds | Blocks On |
|-------|--------|-----------|
| Agent 1: Sources A | `exa.mjs`, `tavily.mjs`, `firecrawl.mjs` + tests | None |
| Agent 2: Sources B | `parallel.mjs`, `brightdata.mjs`, `valyu.mjs`, `builtin.mjs` + tests | None |
| Agent 3: Google Push | `sheets-push.mjs`, `docs-push.mjs`, `calendar-push.mjs` + tests | None |
| Agent 4: Google Poll | `gmail-watch.mjs`, `sheets-pull.mjs` + tests | None |
| Agent 5: Orchestrator | `orchestrator.mjs` + pipeline functions + tests | Agents 1, 2 |
| Agent 6: Wiring | Eval loop wiring, voice profile, schedules, config, README | Agents 3, 4, 5 |

---

## 7. File Inventory

### New Files (31)

**Source modules (14):**
- `intel/sources/exa.mjs` + `exa.test.mjs`
- `intel/sources/tavily.mjs` + `tavily.test.mjs`
- `intel/sources/firecrawl.mjs` + `firecrawl.test.mjs`
- `intel/sources/parallel.mjs` + `parallel.test.mjs`
- `intel/sources/brightdata.mjs` + `brightdata.test.mjs`
- `intel/sources/valyu.mjs` + `valyu.test.mjs`
- `intel/sources/builtin.mjs` + `builtin.test.mjs`

**Orchestrator (2):**
- `intel/orchestrator.mjs` + `orchestrator.test.mjs`

**Google integration (11):**
- `intel/google/sheets-push.mjs` + `sheets-push.test.mjs`
- `intel/google/docs-push.mjs` + `docs-push.test.mjs`
- `intel/google/calendar-push.mjs` + `calendar-push.test.mjs`
- `intel/google/gmail-watch.mjs` + `gmail-watch.test.mjs`
- `intel/google/sheets-pull.mjs` + `sheets-pull.test.mjs`
- `intel/google/sync.mjs`

**Wiring (2):**
- `intel/wiring.mjs` + `wiring.test.mjs`

### Modified Files (5)

- `config/intel.example.yml` — Google config additions
- `config/intel.yml` — Same
- `intel/engine.mjs` — Add gws CLI check
- `intel/SETUP.md` — Google Workspace setup instructions
- `intel/README.md` — Updated architecture + commands
