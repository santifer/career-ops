# API Sources Roadmap

Sources that require **scanner code changes** (not just portals.yml). These cannot be added as `site:` search queries -- they need dedicated fetcher modules.

## ✅ Implemented

### Adzuna API (Spain native + multi-country) -- `scan-adzuna.mjs`

- **Script:** [`scan-adzuna.mjs`](../scan-adzuna.mjs)
- **Status:** ✅ Implemented
- **Auth:** Free `app_id` + `app_key` from [developer.adzuna.com/signup](https://developer.adzuna.com/signup)
- **Setup:** Create `.env.adzuna` in project root:
  ```
  ADZUNA_APP_ID=your_app_id
  ADZUNA_APP_KEY=your_app_key
  ```
  Or export as environment variables.
- **Usage:**
  ```bash
  npm run scan:adzuna                              # default: Spain
  node scan-adzuna.mjs --country=gb                # UK
  node scan-adzuna.mjs --countries=es,gb,de        # multi-country
  node scan-adzuna.mjs --remote-only               # only remote/teletrabajo
  node scan-adzuna.mjs --max-pages=3               # limit pages per query
  node scan-adzuna.mjs --dry-run                   # don't write files
  ```
- **Features:**
  - Reads `title_filter` (positive/negative keywords) from `portals.yml`
  - Searches 14 target role queries across 1+ countries
  - Filters by relevance (positive keywords) and exclusions (negative keywords)
  - Optional `--remote-only` flag detects "remote/teletrabajo/remoto/wfh" in title/description/location
  - Deduplicates against `data/scan-history.tsv`, `data/pipeline.md`, and `data/applications.md` (company+role)
  - Adds new offers to `data/pipeline.md` under `### Adzuna scan — {date}` section
  - Logs all results (added/skipped_title/skipped_dup/skipped_not_remote) to `data/scan-history.tsv`
  - Outputs salary range when available (£/€/$)
- **Why Adzuna:** Spain-specific (`country=es`), structured salary data, aggregates listings from LinkedIn / Indeed / company sites. Free API, no scraping, no proxies, no ban risk.
- **API limits:** Free tier allows ~250 calls/month. Default scan = ~70 calls (14 queries × 5 pages × 1 country). Tune `--max-pages` to stay within budget.

## 🚧 Pending implementation

### 2. Himalayas API
- **URL:** `https://himalayas.app/jobs/api`
- **Auth:** None
- **Why:** 100K+ remote jobs, filters by country/seniority/timezone, MCP server available
- **Effort:** 1h
- **Impact:** ⭐⭐⭐ HIGH

### 3. RemoteOK API
- **URL:** `https://remoteok.com/api`
- **Auth:** None (attribution required)
- **Why:** 30K+ remote jobs globally
- **Effort:** 30min
- **Impact:** ⭐⭐ MEDIUM (already partially covered via WebSearch)

### 4. Remotive API
- **URL:** `https://remotive.com/api/remote-jobs`
- **Auth:** None
- **Why:** Remote-first listings
- **Caveat:** 24h delay vs web (paid version removes it)
- **Effort:** 30min
- **Impact:** ⭐⭐ MEDIUM (already covered via WebSearch)

### 5. Jooble API
- **URL:** `https://jooble.org/api/about`
- **Auth:** Free registration
- **Why:** Multi-source aggregator with Spain/Europe coverage
- **Effort:** 1h
- **Impact:** ⭐⭐ MEDIUM

## Medium-priority APIs

### 6. InfoJobs API
- **URL:** `https://developer.infojobs.net`
- **Auth:** Free registration
- **Why:** Spain generalist (2.5M vacancies, 52K+ IT)
- **Caveat:** Low signal-to-noise for senior tech roles -- most listings are mid-market consultora positions
- **Effort:** 2h (auth + filters)
- **Impact:** ⭐ LOW for senior/staff candidates -- safety net only

### 7. CareerJet API
- **URL:** Python library `pip install careerjet-api-client`
- **Auth:** Free
- **Locale:** `es_ES`
- **Effort:** 30min
- **Impact:** ⭐⭐ MEDIUM

## RSS Feeds (lightweight integration)

### 8. HN Who's Hiring
- **URL:** `https://hnrss.org/whoishiring/jobs`
- **Why:** 58K+ historical postings, monthly thread
- **Effort:** 30min (RSS parser)
- **Impact:** ⭐⭐⭐ HIGH for AI/startup roles

### 9. AI-Jobs.net RSS
- **URL:** `https://ai-jobs.net/feed/`
- **Why:** 43K+ AI/ML jobs
- **Effort:** 30min
- **Impact:** ⭐⭐⭐ HIGH (already covered via WebSearch but RSS is more reliable)

### 10. WeWorkRemotely RSS
- **URL:** `https://weworkremotely.com/categories/remote-programming-jobs.rss`
- **Effort:** 30min
- **Impact:** ⭐⭐ MEDIUM (already covered via WebSearch)

### 11. Remotive RSS
- **URL:** `https://remotive.com/remote-jobs/rss-feed`
- **Effort:** 30min
- **Impact:** ⭐⭐ MEDIUM

## ATS-specific APIs (for tracked companies)

These would expand `tracked_companies` capabilities beyond Greenhouse:

### Workable
- **URL:** `https://apply.workable.com/api/v1/widget/accounts/{company}`
- **Already used by:** Hugging Face (currently scraped)
- **Effort:** 1h

### Recruitee
- **URL:** `https://{company}.recruitee.com/api/offers`
- **Effort:** 1h

### SmartRecruiters
- **URL:** `https://api.smartrecruiters.com/v1/companies/{company}/postings`
- **Effort:** 1h

### Personio (DACH-heavy)
- **URL:** `https://{company}.jobs.personio.de/xml`
- **Effort:** 1h (XML parser)
- **Impact:** Useful for German/Austrian companies

## Recommended implementation order

If implementing the scanner extension:

1. **Phase 1 (4-5h, biggest impact):**
   - Adzuna API → Spain-native salary data
   - Himalayas API → 100K+ remote jobs
   - HN Who's Hiring RSS → AI/startup signal
   - AI-Jobs.net RSS → reliable AI feed

2. **Phase 2 (2-3h, broader coverage):**
   - Jooble API → multi-source aggregator
   - Workable API → covers Hugging Face + others
   - Recruitee + SmartRecruiters → expand tracked_companies

3. **Phase 3 (optional):**
   - InfoJobs API → safety net for Spanish market
   - CareerJet, Personio → niche cases

## Things NOT to implement

| Source | Reason |
|--------|--------|
| LinkedIn scraping | Requires residential proxies + stealth, ban risk, **Proxycurl was sued and shut down July 2025** |
| Indeed via JobSpy | EU API charges €3/call, scraping rate-limited |
| Glassdoor | Strong anti-bot, low value vs cost |
| Google for Jobs | API discontinued, SerpApi costs $50/mo |
| Honeypot/Hired/Cord | Reverse-match model -- create profile manually |
| Headhunters (Michael Page, Hays, Robert Walters) | SPAs Workday-like, rarely DevRel/FDE roles |

## Key technical decisions from research

- **python-jobspy** (10K+ stars) unifies LinkedIn/Indeed/Glassdoor/Google scraping. Could be a Python sidecar to the Node scanner if LinkedIn coverage becomes critical.
- **Filter postings ≤7 days old** to avoid ghost jobs (18-22% of postings never fill).
- **Deduplicate by title+company** -- aggregators replicate listings massively.
- Run scans **2-3 times per day** rather than once.
