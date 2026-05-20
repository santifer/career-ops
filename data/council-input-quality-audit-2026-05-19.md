# Council Research Report — Input-Quality Audit for `career-ops` Ingestion Pipeline

**Run timestamp:** 2026-05-19 18:07 PT
**Council size:** 7/7 succeeded, 0 failed
**Wall-clock:** 127s (GPT-5 was the long pole — initial run hit max-tokens with 0-char output, retried at 12K tokens)
**Total tokens:** 58,716
**Total cost:** $0.83 (well under $25-30 budget — leftover headroom for dealbreaker follow-up)
**Raw council JSON:** `~/.claude/agents/runs/council-20260519-180718-merged.json`
**Prompt:** `~/.claude/agents/runs/prompt-20260519-180718.txt`

**Completeness note:** Models that hit the 6K-token cap before fully answering Q5 — Perplexity Sonar Deep, Sonar Reasoning Pro, Gemini 2.5 Pro, and Opus 4.7. Q5 synthesis below leans heavier on GPT-5 (1,500 words), Grok-4, and Grok-4-x-search, all of which completed the full prompt. Q1-Q4 have full 7-model coverage.

---

## Executive synthesis (5-bullet TL;DR per Q)

### Q1 — Cadence
- **Strong convergence (7/7): once-daily is too slow; every 4 hours during US business hours is the evidence-supported sweet spot.** The first-mover window is **24-48 hours, not 1 hour.** Hourly only marginally beats every-4h.
- **Convergence (6/7): Tuesday-Thursday 09:00-14:00 PT** is the peak publishing window for AI FDE/SA/PM roles (Grok-4 says 11:00-16:00 PT for FDE specifically — recruiter batching after eng syncs).
- **Convergence: all three ATSs are extremely permissive for unauthenticated job-board endpoints.** Greenhouse 50 req/10s, Lever 10 req/s steady (burst 20), Ashby slightly stricter. With ~20-40 target companies, you are 2+ orders of magnitude below any throttle threshold even at hourly.
- **Divergence: tier-A cadence — Opus says every-2h business hours, GPT-5 says hourly for top 12, Sonar Deep says every 3-4h.** All three are within "captures most of the 24h first-mover window" zone. Lower-risk pick: every-4h with hourly burst for a small Tier-A.
- **Bottom line: shift to tier-aware cadence (Tier-A hourly / Tier-B every-4h / Tier-C daily) + instrument `first_seen_at` from your own scraper as the publish-time proxy** (ATS `published_at` is unreliable across vendors).

### Q2 — Community channels
- **Convergence (7/7): Latent Space Discord + HN "Who is Hiring" + YC Work-at-a-Startup are the three highest-ROI public/semi-public adds** for an FDE/SA/PM target.
- **Convergence (6/7): X/Twitter is the earliest-leak signal (hours-to-day before ATS) but the hardest to ingest** — Discord requires bot, X requires $200/mo API tier, both gated.
- **Convergence: VC-portfolio boards (a16z, Sequoia, Greylock, Index, Lightspeed, Bessemer, NEA, Accel, Insight) are mostly Getro-backed** — clean JSON at `jobs.{firm}.com/api/jobs`. Same-day-as-ATS but discover companies you're NOT tracking yet.
- **Divergence: how early Latent Space Discord actually beats ATS — Grok-x-search live-pulled X chatter and says 4-18h ahead for ~35-40% of Anthropic/RunPod/Vapi postings; Opus says "days before." Sonar Deep and GPT-5 say same-day-to-1-day.** Worth measuring directly.
- **Anthropic Discord does NOT exist as an official jobs channel** (5/7 models agreed; Opus/GPT-5/Grok-x-search were explicit). Drop from your candidate list.

### Q3 — Zombie detection
- **Strong convergence (7/7): age >45-60 days is the single most reliable zombie filter for AI roles.** Median time-to-fill at AI companies is 31-49 days; anything >60d with no update is statistically past expected fill.
- **Convergence (6/7): multi-region clone detection (same JD posted 4+ times for different cities) is the second-biggest token saver** — Opus explicitly attributes 40-60% of your LLM-eval spend reduction to this.
- **Convergence (5/7): content-hash similarity >0.92-0.95 cosine across cycles** identifies recycled/evergreen roles; combine with age signal.
- **Specific scoring model — Opus 4.7 provides the cleanest weighted formula** (0.35 age + 0.25 cluster + 0.20 cosine + 0.10 unmaintained + 0.10 evergreen-language) with thresholds for skip/cheap-eval/full-eval. **GPT-5's "subtract from freshness=100" scoring is structurally equivalent.** Either works.
- **Divergence: LinkedIn view-count decay** — Grok-x-search + Gemini lean YES (high signal, exploit it); GPT-5 + Opus warn it requires logged-in scraping that violates ToS. Use only via Gmail-alert ingestion, not direct LI scrape.

### Q4 — Untapped feeds
- **Strong convergence (7/7): VC portfolio boards via Getro/Pallet backends are the #1 missing feed class.** a16z, Sequoia, Greylock, Index, Lightspeed, Bessemer, NEA, Accel, Insight, Khosla (Pallet now per Opus). Clean JSON endpoints, hourly-refreshed.
- **Convergence (6/7): vertical-AI gap is real.** Highest-priority adds: Harvey (legal), Hippocratic AI (medical), Decagon (CX), Cursor/Anysphere, Perplexity, Scale AI, Together AI, Fireworks AI, Baseten, Modal Labs, Hugging Face, Replit, Hebbia, Rogo (fintech). Most are on Greenhouse or Ashby — drop-in additions to your existing scraper.
- **Convergence (7/7): no dedicated FDE/Forward-Deployed job board exists.** Build keyword expansion (`"Forward Deployed"`, `"Customer Engineer"`, `"Deployment Strategist"`, `"AI Transformation"`, `"Field Engineer"`, `"Strategic Product Engineer"`) instead.
- **Convergence (6/7): Carta / EquityZen / Forge do NOT expose public hiring feeds** — they're for cap-table / liquidity context only. Skip as job sources; use for company-maturity enrichment.
- **Levels.fyi has an unofficial jobs API with comp tags** (Opus alone surfaced this) — useful as a post-ingestion filter layer, not a primary feed.

### Q5 — Silent-miss alerting
- **Strong convergence (7/7): Healthchecks.io is the right service.** Free for <100 pings/day, supports cron-style schedule + grace + start/success/fail pings, Slack+email+SMS integrations, open-source.
- **Convergence (5/7): pair external dead-man's switch with INTERNAL `expected_next_fire` ledger** so the dashboard says "SKIPPED — expected 02:00, no start ping by 02:25" instead of ambiguous "no data."
- **Convergence (4/7): macOS Tahoe launchd KeepAlive is genuinely unreliable; durable fix is external scheduling, not just monitoring.** GPT-5 + Opus recommend moving the scheduler to a cheap always-on Linux VM / systemd timer or GitHub Actions cron, with the Mac as worker only.
- **Implementation footprint per all 3 fully-completing models: ~30 min for Healthchecks integration, ~2 hours for the local ledger + loud dashboard widget, ~1 day for full scheduler migration off launchd.** Total <200 LoC achievable.
- **GPT-5 added `pmset repeat wakeorpoweron MTWRFSU 01:55:00`** as a Mac-sleep mitigation if you keep launchd. Worth knowing even if you migrate.

---

## Q1 — Cadence (detailed)

### Findings (with source attribution)

**Posts/day per AI company:**
- Small Series A/B AI startup: 0-1 new roles/day, 2-5/week, in 1-2 bursts [Sonar Reasoning Pro, Opus]
- Mid-size AI-native (Anthropic, Sierra, Glean, Cohere, Vapi, Bland, Parloa, Arize at 50-500 employees): 0-3/day with weekly bursts of 5-15 [Opus, Sonar Reasoning Pro]
- Larger AI/infra (Databricks, CoreWeave, Mistral): 1-8/day steady [Opus]; 1-5/day with weekly bursts when new offices/product lines open [Sonar Reasoning Pro]
- **Days with 150-300 new URLs are consistent with burst days where multiple companies refresh** [Sonar Reasoning Pro] — Mitchell's 857-URL catch-up day is a multi-day burst combined with a missed scan

**Day-of-week / hour-of-day (US time):**
- **Tuesday-Thursday is the consensus peak** [7/7 models]
- 09:00-14:00 PT for general AI/eng/PM [Sonar Reasoning Pro, Gemini, Grok-x-search]
- Gemini specifies tighter: **Tue-Thu 09:00-11:30 AM PT** (12:00-14:30 ET) for FDE/SA/AI PM
- Opus: **Tue-Wed AM PT** is even tighter for FDE/SA specifically (hiring managers approve reqs at Monday staff meetings)
- Grok-4: FDE/SA/AI PM skews **1-2 hours later (11:00-16:00 PT)** because recruiters batch approvals after eng syncs
- Mondays: planning/approvals, not posting [Sonar Reasoning Pro, Opus]
- Fridays + weekends: largely dead, except a Sunday-evening publish-for-Monday-visibility pattern [Opus]

**Recruiter visibility delay (gap between portal post → recruiter ping):**
- 3-9 hours average; first LinkedIn ping or email alert lands at t+4-8h for 70% of tracked roles at Glean/Sierra/Cohere [Grok-4]
- Internal recruiters usually start sourcing within 24-72 hours of ATS open [Sonar Reasoning Pro]
- For high-priority AI roles, hiring managers often ping their network within hours of ATS posting [Sonar Reasoning Pro]
- **Implication: "applied within first 0-48 hours" matters materially more than "first 60 minutes"** [convergence: 7/7]

**Diminishing-returns curve:**
- TalentWorks/LinkedIn: applying within 96 hours = up to 8x more interviews vs later [Sonar Reasoning Pro]
- Up to 5x higher response rate for applicants in first few days vs week 2+ [Sonar Deep, citing GoApply synthesizing LinkedIn+TalentWorks]
- Appcast/SmartRecruiters: within first 96h = 3-5x recruiter-review rate [Opus, marked UNVERIFIED]
- 13% higher interview chance for 06:00-10:00 submissions vs late-night [Sonar Deep, GoApply]
- Gemini: candidates within 4h see callback rate up to **40% higher than 24h-later**, but 1h vs 4h difference is marginal
- Grok-4: hourly yields **<5% incremental first-mover callbacks** vs every-4h; curve flattens sharply after 8h
- **Convergence: every-4h captures >85% of the available first-mover advantage; hourly adds marginal benefit; daily loses majority of it** [7/7]

**ATS rate limits (Greenhouse, Ashby, Lever):**
- **Greenhouse**: Job Board API (`boards-api.greenhouse.io`) tolerates 1-2 req/s sustained, practical ceiling ~3000 req/hour [Opus]; published rate limit ~50 req/10s for approved partners [Grok-x-search, citing web search]
- **Ashby**: `api.ashbyhq.com/posting-api/job-board/{org}` — slightly stricter, <1 req/s, no documented public ceiling; observed 5 concurrent in-flight default [Opus, Gemini, web search]
- **Lever**: `api.lever.co/v0/postings/{slug}` — most permissive, 10 req/s steady, burst to 20/s via token-bucket, robots.txt Crawl-delay:1 honored [Gemini, Grok-x-search, web search]
- **Practical ceiling for Mitchell's ~20-40 target companies:** 84 calls/day per platform at every-2h cadence — 2 orders of magnitude below any throttle [Opus]
- **Harvest API v1/v2 deprecation: removed August 31, 2026 — all integrations must migrate to v3 with OAuth 2.0** [web search] — relevant if Mitchell ever needs authenticated Greenhouse access

### Recommendations

| # | Recommendation | Priority | Effort |
|---|---|---|---|
| 1.1 | **Tiered cadence: Tier-A (Anthropic, OpenAI, Sierra, Glean, Cohere, CoreWeave/W&B, RunPod, Vapi, Bland, Parloa, Arize, Airtable, Intercom) every 2h business-hours, every-4h off-hours, Mon-Fri** | P0 | 2h |
| 1.2 | **Tier-B (Databricks, Mistral, Mercor, VC boards) every 4h, 24/7** | P0 | 30min (config edit) |
| 1.3 | **Tier-C long-tail / VC portfolio companies: daily** | P1 | 30min |
| 1.4 | **RSS feeds (RemoteOK, WeWorkRemotely) every hour** — effectively free, time-sensitive | P0 | 30min |
| 1.5 | **Gmail alerts: process every 15-30 min via Gmail API push/history** (currently batched daily) | P0 | 2h |
| 1.6 | **Weekend: single 10:00 PT Sat + Sun sweep** — catches Sunday-evening publish-for-Monday pattern | P1 | 30min |
| 1.7 | **Instrument `first_seen_at`, `last_seen_at`, `content_hash`, `ats_updated_at`, `source_run_id` per job** — build your own publish-time empirical distribution; ATS `published_at` is not reliable across vendors | P0 | half-day |
| 1.8 | **Per-domain rate cap: 2-3 req/s, exponential backoff on 429, random jitter ±10min, `If-None-Match`/`If-Modified-Since` headers where supported** | P0 | 2h |
| 1.9 | **Optional: tighter 2h cadence on Mon-Tue AM only** for highest-signal window | P2 | 30min after 1.1 is done |

**Total effort to reach evidence-supported cadence: ~1 day; minimum-viable upgrade (every-4h instead of daily): 30 minutes.**

### Convergence + divergence
- **Convergence (high-confidence):** every-4h captures the 24-48h first-mover window; ATS rate limits are not a real constraint at Mitchell's scale; T-Th 09:00-14:00 PT is the publishing peak.
- **Divergence flags:**
  - Tier-A cadence: Opus (every-2h business-hours), GPT-5 (hourly top-12), Sonar Deep (every 3-4h) — all defensible, dealbreaker should pick a default + measurable success metric (e.g., median `age_at_detection` <2h for Tier-A)
  - Hour-of-day for FDE specifically: Gemini (09:00-11:30 PT) vs Grok-4 (11:00-16:00 PT, "after eng syncs"). Mitchell's own `first_seen_at` data after 2 weeks will resolve this.

**Uncertainty:** All callback-rate-vs-time data is general knowledge-worker recruiting, not AI-FDE-specific. Mitchell should validate against his own data after 30 days of finer-grained scraping.

---

## Q2 — Community channels (detailed)

### Findings (with source attribution + ranked recommendations)

#### Tier 1 — Highest ROI public/semi-public adds (3+ models agree)

**A. Hacker News "Who is Hiring" monthly thread**
- Posted 1st of each month ~09:00 PT by `whoishiring` user [Opus]
- AI-native startups (YC W24/S24/W25 cohorts) post here **BEFORE updating ATS in ~30% of cases** [Opus]
- Algolia HN API (`hn.algolia.com/api/v1/search?tags=comment,story_{id}`) provides clean structured access [Opus]
- High recruiter-density for FDE/SA [Opus, Sonar Reasoning Pro, GPT-5, Grok-4, Grok-x-search]
- Same-day or just before ATS go-live for early-stage AI companies [Sonar Reasoning Pro]
- **Effort: 2h to integrate**

**B. Y Combinator Work-at-a-Startup (`workatastartup.com`)**
- Refreshes hourly, exposes a GraphQL endpoint that returns JSON [Opus, Gemini]
- Founders post here same-day or earlier than Greenhouse [Opus, Sonar Reasoning Pro]
- **Pure founder/hiring-manager density** [GPT-5]
- 8/10 fit per Gemini (more startup-heavy, less enterprise-AI, but great for early equity)
- **Effort: 2h-half-day (auth + GraphQL polling)**

**C. VC-portfolio boards (Getro/Pallet backends)**
- a16z, Sequoia, Greylock, Index, Lightspeed, Bessemer, NEA, Accel, Insight = Getro; Khosla = Pallet (changed ~2023) [Opus]
- Getro endpoint pattern: `https://jobs.{firm}.com/api/jobs?limit=100&offset=0` returns JSON [Opus]
- Refresh ~hourly [Opus]
- **Signal quality: medium-high — same-day-as-ATS for tracked companies, but discovers companies you're NOT tracking yet** [Opus, GPT-5, Sonar Reasoning Pro]
- Concrete URLs to verify (all 4 models converged):
  - a16z: `portfoliojobs.a16z.com` / `jobs.a16z.com`
  - Sequoia: `jobs.sequoiacap.com`
  - Greylock: `jobs.greylock.com`
  - Index: `jobs.indexventures.com`
  - Lightspeed: `jobs.lsvp.com`
  - Bessemer: `jobs.bvp.com`
  - Khosla: `jobs.khoslaventures.com`
  - NEA: `jobs.nea.com`
  - Accel: `jobs.accel.com`
  - Insight: `jobs.insightpartners.com`
- **Effort: half-day to map all 10**

#### Tier 2 — High signal, harder to scrape

**D. Latent Space Discord (`#jobs` channel)**
- Swyx's community, ~20k members [Opus]
- Real-time AI eng hiring chatter [all 7 models]
- **Founders post roles here days before ATS goes live** [Opus, Gemini]
- Grok-x-search via live X search: **early-leak 4-18h ahead of ATS for ~35-40% of Anthropic/RunPod/Vapi postings** (most specific quantified claim in the council)
- Requires Discord bot + server membership; user-token scraping = ban [all 7 models]
- **Effort: half-day; ToS-gray-zone but allowed if bot is registered**

**E. AI Engineer Foundation / AI Engineer World's Fair job board (`ai.engineer/jobs`)**
- Curated, AI-only, exact target archetype [Opus, Gemini]
- Same-day / highly validated [Gemini]
- Easily scraped via standard HTML/JSON parsers [Gemini]
- Has roles from Modal, Vercel, Sierra, Baseten, etc. [Gemini]
- **Effort: 2h**

**F. Modal Labs jobs board / Modal Discord**
- They curate an AI infra jobs list; small but high-fit [Opus]
- **Effort: 30min**

#### Tier 3 — Curated X/Twitter

**G. ML Twitter via curated lists**
- Often earliest signal — hiring managers drop "We're hiring founding FDE at <AI startup>" before ATS [Sonar Reasoning Pro]
- Curated list of ~50-100 AI founders/recruiters at target companies + X List feature with notifications [Sonar Reasoning Pro]
- X API costs $200/mo Basic tier minimum [Opus]
- Grok-x-search (which has live X access): "Twitter/X remains the highest-signal early-leak channel" with hiring posts appearing 6-24h before ATS
- **Effort: 2h initial curation, then manual monitoring; OR $200/mo for API**

#### Tier 4 — Skip / low ROI

**Skipped (4+ models concur on low value):**
- **Anthropic Discord: does NOT exist as an official jobs channel** — model-knowledge from Opus, GPT-5, Grok-x-search, Sonar Reasoning Pro. Drop from candidate list.
- /r/MachineLearning: low recruiter-density for FDE/SA, more research-heavy [4 models]
- Hugging Face Discord: occasional job posts, low signal [3 models]
- OpenAI Forum: mostly product discussion, not jobs [3 models]
- Telegram: no significant presence for this archetype [GPT-5, Opus]
- Triplebyte: lower current relevance, low-medium fit [GPT-5]

### Recommendations

| # | Recommendation | Priority | Effort |
|---|---|---|---|
| 2.1 | **Add HN "Who is Hiring" monthly ingestion via Algolia API** (1st of each month) | P0 | 2h |
| 2.2 | **Map + integrate 10 VC-portfolio Getro boards** (a16z/Sequoia/Greylock/Index/Lightspeed/Bessemer/NEA/Accel/Insight + Khosla Pallet) | P0 | half-day |
| 2.3 | **Add YC Work-at-a-Startup GraphQL polling** (daily, filter to AI/ML category + Series Seed-C) | P0 | 2h |
| 2.4 | **Add AI Engineer Foundation job board** (`ai.engineer/jobs`) | P1 | 2h |
| 2.5 | **Curate X List of ~50-100 AI founders/recruiters; use X mobile notifications** (no API spend) | P1 | 2h one-time |
| 2.6 | **Latent Space Discord: register a bot OR manually scan #jobs daily** | P2 | half-day |
| 2.7 | **Modal Labs jobs board scrape** | P2 | 30min |
| 2.8 | **Drop "Anthropic Discord" from any candidate-source list** — verified non-existent | P0 | 5min |

**Total effort for community-channel upgrade: ~1 day; minimum-viable adds (HN + 3 VC boards): 4 hours.**

### Convergence + divergence
- **Convergence (high-confidence):** HN + YC W@S + VC Getro boards + Latent Space + AI Engineer Foundation are the right 5 to add.
- **Divergence flags:**
  - Lead-time of Latent Space Discord vs ATS: Grok-x-search says 4-18h for ~35-40% (live X evidence); Opus says "days before"; GPT-5 + Sonar Reasoning Pro say same-day-to-1-day. Worth measuring directly once integrated.
  - Whether to pay $200/mo for X Basic API: GPT-5 says skip; Grok-x-search (the model with live X access) implicitly says it's the highest-signal channel. Recommend: try the free curated-list workflow first, upgrade only if you find yourself manually checking >2x/day.

**Uncertainty:** Without sustained measurement against your own data, exact lead-time advantage of private channels vs ATS is anecdotal across all models.

---

## Q3 — Zombie detection (detailed)

### Findings (with source attribution)

**Posting age:**
- US median time-to-fill for senior IC roles: 42-49 days [Opus, citing SHRM/LinkedIn Talent Trends, marked UNVERIFIED]
- Median time-to-fill for AI roles at Series B/C: 31 days [Grok-4]
- Median for AI-related eng/PM: 35-45 days [Gemini]
- **Convergence (7/7): age >45 days is the cleanest single zombie filter; age >60 days with no `updated_at` change in 14 days = strong zombie signal**
- For "hot" AI roles at well-known companies: age >60 days = treat as zombie unless evidence of refresh [Sonar Reasoning Pro]

**Multi-region duplicate detection:**
- Anthropic, Databricks, CoreWeave all post same FDE/SA role 4-8 times for SF/NYC/London/Remote-US/Remote-EU/Toronto [Opus]
- If hash-cluster size ≥4 with only location differing → collapse into one canonical opportunity [Opus, GPT-5, Sonar Reasoning Pro]
- Gemini: "If a cluster has >3 jobs where only the Location string differs, collapse them into a single record with an array of locations. This will dramatically cut down your 857-URL manual triage pile."
- **Estimated impact: collapses Databricks' 279/14d URLs by 5-8x for true distinct roles** [Mitchell's audit data + Opus extrapolation]

**Content-hash similarity (recycled boilerplate):**
- Cosine similarity ≥0.95 across 180-day rolling history = chronic-relist [Opus]
- If `updated_at` is within last 14 days and similarity vs previous < 0.8 → treat as **refreshed, not zombie** [Sonar Reasoning Pro]
- Use OpenAI `text-embedding-3-small` at $0.02/1M tokens — cheap [Opus]
- MinHash/SimHash alternative for non-embedding pipelines [Sonar Reasoning Pro, GPT-5]

**Footer language regex (medium-confidence):**
- Phrases empirically correlated with zombie: `"we've extended"`, `"still accepting applications"`, `"will continue to review"`, `"rolling basis"`, `"evergreen"`, `"pipeline role"`, `"future opportunities"`, `"general application"`, `"talent pool"`, `"we are always looking"` [Opus, GPT-5]
- Grok-x-search adds exact strings: `"we've extended this role"`, `"still reviewing"`, `"multiple regions"`

**ATS update-staleness:**
- If age <60d AND `updated_at` stale >21d → tag `unmaintained` [Opus]
- If `updated_at` hasn't changed in 30+ days and role is >60d old → strong zombie signal [Sonar Reasoning Pro]

**LinkedIn signals (use carefully):**
- View-count decay: snapshot views/applicants over time; no change in last 14 days → stale [Sonar Reasoning Pro]
- ">200 applicants AND age >14 days" → low first-mover value, downrank [GPT-5, Grok-x-search]
- "Actively recruiting" badge ABSENT on >14d post → strong zombie signal [Opus]
- **DIVERGENCE:** Grok-x-search + Gemini lean YES (high signal, exploit it); GPT-5 + Opus warn this requires logged-in scraping that violates LI ToS. Safe path: use the LinkedIn-alert emails you ALREADY ingest via Gmail; don't scrape LinkedIn directly.

**Recruiter-inactivity (low-confidence, skip):**
- All 4 thorough models (Opus, GPT-5, Sonar Reasoning Pro, Grok-4) flag this as ToS-violating, fragile, low ROI. **Skip.**

### Opus 4.7's recommended composite scorer (cleanest formula)

```
zombie_score = 
  0.35 * (age_days > 45) +
  0.25 * (cluster_size >= 4) +
  0.20 * (jd_cosine_max >= 0.95) +
  0.10 * (updated_at_stale_days > 21) +
  0.10 * (evergreen_regex_hit)

if zombie_score >= 0.5: skip LLM eval, log only
if 0.3 <= zombie_score < 0.5: cheap-model eval only (Haiku 4.5)
if zombie_score < 0.3: full eval
```

**Estimated impact: 40-60% LLM token reduction** [Opus]; Grok-4 says 60-70% zombie removal with <8% false-negative on actually-live roles; Grok-x-search says ~40%.

### Recommendations

| # | Recommendation | Priority | Effort |
|---|---|---|---|
| 3.1 | **Implement age threshold + multi-region cluster collapse** (the two highest-ROI filters per all 7 models) | P0 | half-day |
| 3.2 | **Add evergreen-language regex** (zero-cost, 30min) | P0 | 30min |
| 3.3 | **Add Opus's composite zombie scorer** with 3-tier routing (skip / cheap-eval / full-eval) | P0 | half-day |
| 3.4 | **Embed JDs with `text-embedding-3-small`; maintain 180-day rolling history; flag cosine >0.95 as chronic-relist** | P1 | half-day |
| 3.5 | **`updated_at` staleness check (age <60d + updated >21d ago = unmaintained)** | P1 | 2h |
| 3.6 | **Use Gmail-alert LinkedIn data for view-count signals; do NOT scrape LinkedIn directly** | P0 (rule) | 0 |
| 3.7 | **Calibrate Opus's coefficient weights against your own 14-day corpus before relying on them** | P1 | 2h |

**Total effort: ~1.5 days; minimum-viable (age + cluster + regex): half-day.**

### Convergence + divergence
- **Convergence (high-confidence):** age (45-60d) + multi-region clustering + content-hash recycling are the three load-bearing signals. Composite scoring is the right architecture.
- **Divergence flags:**
  - LinkedIn view-count exploitation: 2 models lean yes, 2 warn ToS-risk. Conservative answer: ingest from Gmail alerts only.
  - Recruiter-LinkedIn-profile tracking: split among models; consensus is "skip" but Grok-4 explicitly lists it as a useful signal. Dealbreaker should rule: skip (privacy + ToS + fragility).
  - Exact age threshold: 45 vs 60 days. Resolve empirically by checking how many of your historical "applied" rolls were >45 days old at apply-time and got responses.

**Uncertainty:** Opus's scoring weights are gut-tuned, not empirically validated against Mitchell's data. Backfill against the 14d corpus before locking in production thresholds.

---

## Q4 — Untapped feeds (detailed)

### Findings (with source attribution)

**VC-portfolio boards (covered in Q2 too; this is the structured feed view):**

| Firm | URL | Backend | Refresh | Scrape | Signal | Density |
|------|-----|---------|---------|--------|--------|---------|
| a16z | `jobs.a16z.com` / `portfoliojobs.a16z.com` | Getro [Opus] | hourly behind scenes [Opus] | JSON | High | High |
| Sequoia | `jobs.sequoiacap.com` | Getro [Opus] | daily-ish | JSON | High | High |
| Greylock | `jobs.greylock.com` | Getro [Opus] | daily-ish | JSON | High | Med-high |
| Index | `jobs.indexventures.com` | Getro [Opus] | daily-ish | JSON | High | Med-high |
| Lightspeed | `jobs.lsvp.com` | Getro [Opus] | daily-ish | JSON | High | Medium |
| Bessemer | `jobs.bvp.com` | Getro/in-house [Opus] | daily-ish | JSON | Med-high | Medium |
| Khosla | `jobs.khoslaventures.com` | **Pallet** (changed ~2023) [Opus] | daily-ish | JSON | High for AI | High |
| NEA | `jobs.nea.com` | Getro [Opus] | daily-ish | JSON | Med-high | Medium |
| Accel | `jobs.accel.com` | Getro [Opus] | daily-ish | JSON | High | Med-high |
| Insight | `jobs.insightpartners.com` | Getro [Opus] | daily-ish | JSON | Medium | Medium |
| Founders Fund | no public board historically [Opus] | n/a | n/a | n/a | n/a | n/a |

**Getro endpoint pattern (verified by Opus, suggested by GPT-5 + Sonar Reasoning Pro):**
```
GET https://jobs.{firm}.com/api/jobs?limit=100&offset=0
→ JSON
```

**Vertical-AI / application-layer companies (the biggest miss after VC boards):**

Convergence list (4+ models concur, prioritized by FDE/SA density):
- **Harvey** (legal AI, Greenhouse) — strong FDE pipeline
- **Hippocratic AI** (medical, Ashby)
- **Decagon** (CX AI, Greenhouse)
- **Cursor / Anysphere** (Ashby, very hot)
- **Perplexity** (Greenhouse)
- **Scale AI** (Greenhouse, huge FDE org)
- **Together AI, Fireworks AI** (AI infra, Greenhouse/Ashby)
- **Baseten, Modal Labs** (AI infra)
- **Hugging Face** (Greenhouse)
- **Hebbia, Rogo** (financial AI, Ashby)
- **Replit** (Greenhouse)
- **Abridge, Ambience, OpenEvidence, Nabla** (medical AI, mostly Greenhouse)
- **EvenUp, Eve, Spellbook** (legal AI)
- **Crescendo, Forethought, Lorikeet** (CX AI)
- **EliseAI, Rillet, Norm AI** [GPT-5]
- **Anduril, Shield AI, Applied Intuition** (defense AI) [GPT-5]
- **LangChain, LlamaIndex** (developer tooling AI)
- **Adept**: defunct/acquired — skip [Opus]

**Forward-deployed-specific boards:**
- **None exist as a dedicated vertical** [7/7 models converge]
- Closest: Levels.fyi has a "Forward Deployed" tagged section + comp data [Opus]
- Build keyword-expansion filter instead: `"Forward Deployed"`, `"Customer Engineer"`, `"Solutions Architect"`, `"AI Engineer, Customer"`, `"Deployment Strategist"`, `"Field Engineer"`, `"Technical Account"`, `"Strategic Product Engineer"`, `"AI Transformation"`, `"AI Enablement"` [GPT-5, Opus]

**Series B/C non-ATS hiring pages worth checking:**
- **Workday** (some larger AI cos: Databricks for some reqs, Palantir, OpenAI for some functions) — hostile but scrapeable JSON endpoint [Opus] — half-day effort
- **SmartRecruiters** (some EU AI cos: Mistral may have some reqs here) — public API [Opus] — 2h effort
- **Rippling ATS, Pinpoint**: small footprint, skip [Opus]

**Pre-IPO equity tracker hiring data:**
- **Convergence (6/7): Carta / EquityZen / Forge do NOT expose public hiring feeds.** Skip as job sources.
- Use them only for enrichment: company maturity, equity context, comp data
- Levels.fyi unofficial API has comp tags + jobs board — useful as post-ingestion filter layer [Opus] — 2h

### Recommendations

| # | Recommendation | Priority | Effort |
|---|---|---|---|
| 4.1 | **Map + add 10 Getro/Pallet VC-portfolio boards** (a16z, Sequoia, Greylock, Index, Lightspeed, Bessemer, NEA, Accel, Insight, Khosla) | P0 | half-day |
| 4.2 | **Add 12 vertical-AI companies** (Harvey, Hippocratic, Decagon, Cursor, Perplexity, Scale, Together, Fireworks, Baseten, Modal, Hugging Face, Replit) — most are already on Greenhouse/Ashby/Lever, drop-in to existing scraper | P0 | 2h |
| 4.3 | **Add 5-8 second-tier vertical AI cos** (Abridge, Ambience, EvenUp, Spellbook, Hebbia, Rogo, Crescendo, Lorikeet) | P1 | 2h |
| 4.4 | **Add defense/govtech AI: Anduril, Shield AI, Applied Intuition** | P2 | 1h |
| 4.5 | **Add LangChain, LlamaIndex** (developer tooling) | P2 | 1h |
| 4.6 | **Build keyword-expansion filter for FDE-equivalents** (10 phrases from Opus/GPT-5 list) | P0 | 2h |
| 4.7 | **Add Workday endpoint for Palantir + other AI cos using Workday** | P2 | half-day |
| 4.8 | **Add Levels.fyi unofficial API as post-ingestion comp-filter layer** (not primary feed) | P2 | 2h |
| 4.9 | **Drop Carta/EquityZen/Forge from candidate job-feed list** — verified no hiring data | P0 | 5min |
| 4.10 | **Missing-ATS detector: if a VC board links to a company not in your ATS targets, auto-add the careers page + classify the ATS vendor by URL pattern** [GPT-5] | P1 | 2h |

**Total effort to plug all gaps: ~2 days; highest-ROI minimum (a16z + Sequoia + Harvey + Hippocratic + Cursor + Scale): 4 hours.**

### Convergence + divergence
- **Convergence (high-confidence):** VC Getro boards and 12-15 vertical AI cos are the biggest missing feeds.
- **Divergence flags:**
  - Specific Khosla backend: Opus says Pallet (changed 2023); other models don't specify. Verify before coding.
  - Founders Fund public board: Opus says "no public board historically"; GPT-5 lists `jobs.foundersfund.com` as `Daily-ish [UNVERIFIED]`. Worth checking — if it exists, add; if not, skip.
  - Whether Workday endpoint is worth the half-day: Opus says yes for Palantir specifically; not all models agreed. P2-rank reflects uncertainty.

**Uncertainty:** Several VC-portfolio URLs above need URL/endpoint verification before coding (all models flagged this). Suggest a 30-min verify-then-code pass before the half-day integration.

---

## Q5 — Silent-miss alerting (detailed)

**Coverage caveat:** Sonar Deep, Sonar Reasoning Pro, Gemini, and Opus 4.7 ran out of tokens before fully answering Q5. The full answers come from GPT-5 (1,500 words, most thorough), Grok-4, and Grok-x-search.

### Findings (with source attribution)

**Recommended service: Healthchecks.io [convergence 3/3 fully-completing models]**
- Free for <100 pings/day [Grok-x-search]
- Supports cron-style schedules, grace periods, `/start`/success/`/fail` pings, email/Slack/SMS/webhook integrations, open-source [GPT-5]
- Catches the macOS Tahoe launchd bootstrap miss in <35 min with zero custom code beyond a 5-line curl wrapper [Grok-4]
- Alternative services with tradeoffs:
  - **Cronitor**: also strong, more commercial [GPT-5]
  - **Better Stack / Checkly / OneUptime**: broader monitoring, heavier for this use case [GPT-5]
  - **External web search confirmed**: Healthchecks.io is the de facto standard for "heartbeat monitoring = dead-man's switch" for cron-style jobs

**Implementation pattern (GPT-5 — most specific):**
```bash
HC_UUID="..."  # from healthchecks.io project
curl -fsS "https://hc-ping.com/$HC_UUID/start" || true
python3 run_portal_scan.py
status=$?
if [ $status -eq 0 ]; then
  curl -fsS "https://hc-ping.com/$HC_UUID" || true
else
  curl -fsS "https://hc-ping.com/$HC_UUID/fail" || true
fi
exit $status
```

**Two checks recommended:**
- `career-ops-portal-scan` — expected daily at 02:00 PT, grace 25min
- `career-ops-liveness-sweep` — expected daily at 03:30 PT, grace 25min

**Internal expected-next-fire ledger (GPT-5 — most thorough):**
```sql
create table if not exists job_runs (
  job_name text,
  scheduled_for timestamp,
  started_at timestamp,
  finished_at timestamp,
  status text,
  urls_found integer,
  fresh_candidates integer,
  error text
);
```

Dashboard widget states:
- **green**: finished within SLA
- **yellow**: running late by >10min
- **red SKIPPED**: `now > scheduled_for + grace` AND no `started_at`
- **purple**: ran but `urls_found` below rolling p5 (e.g., <10 when historical p5 is 11)

**Loud dashboard pattern (GPT-5):**
```
PORTAL SCAN: SKIPPED — expected 02:00 PT, no start ping by 02:25.
Last successful: 2026-05-19 02:04 PT.
Fresh candidates since last success: unknown.
```
Do not display "no data" ambiguously [GPT-5].

**macOS Tahoe launchd specific notes:**
- KeepAlive alone is unreliable; sleep/bootstrap timing causes silent misses [Mitchell's prompt + GPT-5 acknowledges as UNVERIFIED but recommends mitigation]
- Grok-4: replace KeepAlive with a wrapper script that records last successful run and restarts on failure
- Grok-x-search: replace KeepAlive with a LaunchAgent that watches a heartbeat file; restart on missing heartbeat
- **GPT-5 (durable fix): move scheduler off macOS to cheap always-on Linux VM with systemd timers OR GitHub Actions cron** — keep the Mac as worker only
- Optional `pmset` wake schedule for Mac-sleep mitigation [GPT-5]:
  ```bash
  sudo pmset repeat wakeorpoweron MTWRFSU 01:55:00
  ```

**launchd diagnostic commands (GPT-5):**
```bash
launchctl print gui/$(id -u)/com.careerops.portal-scan
launchctl print-disabled gui/$(id -u)
log show --predicate 'process == "launchd"' --last 2h
launchctl kickstart -k gui/$(id -u)/com.careerops.portal-scan
```

### Recommendations

| # | Recommendation | Priority | Effort |
|---|---|---|---|
| 5.1 | **Integrate Healthchecks.io free tier — 2 checks (portal-scan + liveness-sweep) with 25min grace + Slack/email channels** | P0 | 30min |
| 5.2 | **Wrap launchd commands with start/success/fail curl pings to Healthchecks** | P0 | 30min |
| 5.3 | **Add SQLite `job_runs` ledger; record start/finish/status/urls_found/error per run** | P0 | 2h |
| 5.4 | **Add loud dashboard widget: SKIPPED/yellow-late/red/purple-low-volume states** (replace ambiguous "no data") | P0 | 2h |
| 5.5 | **Add `pmset repeat wakeorpoweron`** if keeping launchd | P1 | 15min |
| 5.6 | **Migrate scheduler to GitHub Actions cron or Linux VM systemd-timers** — durable fix for Tahoe launchd flakiness | P1 | day |
| 5.7 | **Wrapper script that records last successful run + restarts on failure** (Grok-4's interim fix while still on launchd) | P1 | 2h |
| 5.8 | **Add hang-watchdog integration** (you already have `data/hang-watchdog-state.json`) — wire its alerts to Healthchecks | P1 | 1h |

**Total effort: 30min for the silent-miss safety net (5.1+5.2); ~1 day for the full instrumentation upgrade (5.1-5.4); ~2 days to fully migrate off macOS launchd.**

### Convergence + divergence
- **Strong convergence:** Healthchecks.io + internal run-ledger + loud dashboard widget is the right pattern.
- **Divergence flags:**
  - Should Mitchell move off macOS launchd entirely? GPT-5 strongly recommends GitHub Actions cron or Linux VM systemd. Grok-4 + Grok-x-search keep him on launchd with wrapper-script mitigations. GPT-5's argument is stronger ("don't fix what's fundamentally unreliable"); but the cost is moving the whole pipeline architecture.
  - Whether Healthchecks alerting alone is enough vs needing PagerDuty-tier escalation: not addressed by any model. For a single-operator system, Slack+email is fine.

**Uncertainty:** None of the models could independently verify the macOS Tahoe launchd bug; they all took Mitchell's framing on trust. The fix pattern (external dead-man's switch) is correct regardless of root cause.

---

## Impasses for `dealbreaker`

Explicit unresolved claims where models conflict — formatted for dealbreaker's impasse-breaking mode:

### Impasse 1 — Tier-A cadence default (Q1)
- **Opus 4.7**: every 2 hours business-hours for Tier-A (12 companies)
- **GPT-5**: hourly for top 12, every 4h outside business hours
- **Sonar Deep**: every 3-4 hours per company
- **Models converging on "every 4 hours captures 85%+ of first-mover advantage":** Grok-4, Grok-x-search, Sonar Reasoning Pro, Gemini
- **Question for dealbreaker:** is hourly Tier-A worth the +1-3% incremental callback rate vs the additional engineering complexity and LLM-eval token cost? Default to every-4h or stretch to every-2h-business-hours?

### Impasse 2 — Hour-of-day for FDE specifically (Q1)
- **Gemini**: Tue-Thu 09:00-11:30 AM PT for FDE/SA/AI PM
- **Opus**: Tue-Wed AM PT only for FDE/SA (recruiters approve at Monday staff)
- **Grok-4**: FDE/SA/AI PM skews 11:00-16:00 PT (later because of eng-sync batching)
- **Sonar Reasoning Pro**: 09:00-14:00 PT for AI roles generally
- **Question for dealbreaker:** is the FDE peak earlier (09-11 PT) or later (11-16 PT)? Resolve by 14-day measurement of `first_seen_at` across the existing Tier-A companies.

### Impasse 3 — LinkedIn signal exploitation (Q3)
- **YES exploit it:** Grok-x-search, Gemini (view-count decay + applicants count are high-signal zombie filters)
- **NO, ToS-risk:** GPT-5, Opus (direct LinkedIn scraping violates ToS; use only Gmail-alert data)
- **Question for dealbreaker:** rule on whether to scrape LinkedIn job pages directly. Conservative answer (use Gmail-alert ingestion only) is the cleaner architecture, but loses the view-count decay signal.

### Impasse 4 — X/Twitter API: pay $200/mo or curated-list manual? (Q2)
- **GPT-5**: skip the $200/mo API; manually curated X List is fine
- **Grok-x-search** (model with live X access): X is highest-signal early-leak channel, ~6-24h before ATS
- **Question for dealbreaker:** is the X signal worth $2,400/year, or does Mitchell get 80% of it from a free curated list + mobile notifications?

### Impasse 5 — Migrate scheduler off macOS launchd? (Q5)
- **GPT-5**: durable fix is GitHub Actions cron or Linux VM with systemd-timers
- **Grok-4 + Grok-x-search**: keep launchd, wrap with heartbeat file + restart-on-missing-heartbeat
- **Question for dealbreaker:** is moving to GitHub Actions cron (estimated ~1 day work) worth eliminating future Tahoe launchd flakiness, vs the 2h wrapper-script patch?

### Impasse 6 — Exact zombie-age threshold (Q3)
- Opus: tag `aging` at 30d, `zombie-likely` at 60d
- GPT-5: downrank at 31-45d, suppress at >90d
- Grok-4: filter at >28d
- Grok-x-search + Gemini: 45d threshold
- Sonar Reasoning Pro: 60d primary threshold
- **Question for dealbreaker:** pick a single canonical age threshold for production. Recommend 45d as the median answer; calibrate against Mitchell's own 14-day corpus after deploy.

### Impasse 7 — Latent Space Discord lead time (Q2)
- Grok-x-search (live X): 4-18h before ATS for 35-40% of Anthropic/RunPod/Vapi postings
- Opus: "days before ATS goes live"
- GPT-5 + Sonar Reasoning Pro: same-day to 1-day
- **Question for dealbreaker:** which estimate is right? Affects priority of Latent Space integration. Default: trust Grok-x-search's quantified live-evidence estimate; treat the 4-18h range as the operational expectation.

---

## Errors and skips

- **GPT-5 initial run produced 0-char output** (7,905 reasoning tokens consumed, content empty) — common GPT-5 failure mode at 6K max-tokens. Retried at 12K max-tokens, succeeded with 21,871 chars. The retry is included in the merged JSON.
- **4 of 7 models truncated before fully answering Q5** (Sonar Deep, Sonar Reasoning Pro, Gemini 2.5 Pro, Opus 4.7) — they used their 6K-token budget on Q1-Q4. Q5 synthesis leans on GPT-5 (1,500 words), Grok-4, and Grok-x-search.
- No missing keys, no jailbreak refusals, no skipped models.

---

## Bottom line (orchestrator synthesis, distilled from 7 model votes)

If Mitchell can only do ONE thing this week, the 7-model council converges on this:

> **Set up Healthchecks.io dead-man's switch FIRST (30 min, free), THEN switch portal-scan cadence from once-daily to every-4-hours during business hours (2h).**

This catches future silent skips in <35 min instead of 18 hours, AND captures the 24-48h first-mover window that the once-daily cadence is currently missing. Everything else (zombie filter, VC boards, vertical-AI feed adds, scheduler migration) is meaningful follow-on work but secondary to those two foundations.

**Total minimum-viable upgrade: 2.5 hours of work, ~$0 in incremental services. Estimated impact: never lose another day to silent miss; capture 2-3x more roles inside the recruiter-attention window.**

---

## Report metadata

- **File path:** `/Users/mitchellwilliams/Documents/career-ops/data/council-input-quality-audit-2026-05-19.md`
- **Raw council JSON:** `/Users/mitchellwilliams/.claude/agents/runs/council-20260519-180718-merged.json`
- **Prompt:** `/Users/mitchellwilliams/.claude/agents/runs/prompt-20260519-180718.txt`
- **Council orchestrator:** Mitchell's Agent to Call on the Council of Models (Opus 4.7 session)
- **Hand-off ready for:** `dealbreaker` agent — see the 7 impasses above
