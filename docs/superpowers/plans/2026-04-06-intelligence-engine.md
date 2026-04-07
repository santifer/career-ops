# Intelligence Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OSINT-powered job search intelligence to career-ops: proactive prospecting, hiring manager discovery, Gmail/Google Docs integration, recursive self-improvement, and background scheduled intelligence — all additive (zero existing file modifications).

**Architecture:** Plugin layer in `intel/` directory (system layer). 6 OSINT API source modules behind an intelligent router. Multi-step pipelines for HM discovery, prospecting, outreach, and company intel. 3-loop self-improvement engine using Gemma 4 locally for overnight experiments. Gmail for bidirectional comms. Google Docs MCP + gogcli for collaborative resume editing. Background schedules via cron/loop.

**Tech Stack:** Node.js (ESM/mjs), existing Playwright, 6 OSINT APIs (Exa, BrightData, Tavily, Firecrawl, Valyu, Parallel.ai), Google Docs MCP server, gogcli CLI, Gemma 4 via Ollama, Gmail MCP tools, Claude Code scheduling.

**Scope:** This is **Phase 1** of the intelligence engine — foundation, router, modes, templates, and setup. Phase 2 (pipeline .mjs implementations, self-improvement runners, Gemma 4 eval loop) will be planned separately once Phase 1 is tested and the system has accumulated evaluation data.

**Spec:** `docs/superpowers/specs/2026-04-06-intelligence-engine-design.md`

---

## Phase 1: Foundation (Scaffolding + Router + Source Modules)

### Task 1: Project Scaffolding

**Files:**
- Create: `intel/README.md`
- Create: `intel/SETUP.md`
- Create: `intel/package.json`
- Create: `config/intel.example.yml`
- Create: `config/strategy-ledger.template.md`
- Create: `config/voice-profile.template.md`
- Create: `intel/market/us.md`
- Create: `intel/market/us-boards.yml`
- Create: `intel/market/us-outreach-norms.md`
- Create: `intel/templates/hm-report.md`
- Create: `intel/templates/outreach-draft.md`
- Create: `intel/templates/intel-briefing.md`

- [ ] **Step 1: Create intel directory tree**

```bash
mkdir -p intel/{sources,pipelines,self-improve/prompts,schedules,market,templates}
```

- [ ] **Step 2: Create intel/package.json**

```json
{
  "name": "@career-ops/intel",
  "version": "0.1.0",
  "type": "module",
  "description": "OSINT intelligence engine for career-ops",
  "scripts": {
    "test": "node --test intel/**/*.test.mjs",
    "test:router": "node --test intel/router.test.mjs",
    "test:sources": "node --test intel/sources/*.test.mjs"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

Note: No new npm dependencies. All OSINT APIs are called via MCP tools or HTTP fetch from within Claude sessions. The `googleapis` package is NOT needed — we use `google-docs-mcp` (MCP server) and `gogcli` (CLI) instead.

- [ ] **Step 3: Create config/intel.example.yml**

```yaml
# Intelligence Engine Configuration
# Copy to config/intel.yml and customize.
# API keys are read from environment variables — never put secrets in this file.

apis:
  exa:
    enabled: true
    key_env: EXA_API_KEY
    monthly_budget: 50        # USD cap (optional)
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

fallback_to_builtin: true     # Use WebSearch + Playwright if no API keys

google:
  docs_mcp: true              # google-docs-mcp server configured
  gogcli: true                # gogcli installed (brew install steipete/tap/gogcli)

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
    interval: overnight       # Runs at 2am local
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

- [ ] **Step 4: Create config/strategy-ledger.template.md**

```markdown
# Strategy Ledger

## Guiding Principles (validated, n >= 5)

_No principles yet. These emerge from your feedback on evaluations._

## Cautionary Principles (validated, n >= 5)

_No cautionary principles yet._

## Active Hypotheses (testing, n < 5)

_No hypotheses yet._

## Calibration Log

| Date | Company | Role | Score | Action | Delta | Lesson |
|------|---------|------|-------|--------|-------|--------|

## Optimization History

| Date | Loop | Pass Rate Before | After | Changes | Approved |
|------|------|-----------------|-------|---------|----------|
```

- [ ] **Step 5: Create config/voice-profile.template.md**

```markdown
# Voice Profile

## Status
Not yet analyzed. Run intel setup to scan your Gmail and learn your writing style.

## Tone
_Pending analysis_

## Structure
_Pending analysis_

## Vocabulary
_Pending analysis_

## Patterns Learned from Draft Edits

| Date | Change Made | Rule Derived |
|------|-------------|-------------|

## Last refreshed: never
```

- [ ] **Step 6: Create intel/market/us.md**

```markdown
# US Job Market — Intelligence Context

## Compensation Conventions
- Total Comp (TC) = base salary + equity (RSUs/ISOs/NSOs) + annual bonus
- Equity types: RSUs (public cos), ISOs/NSOs (startups), phantom equity (rare)
- Sign-on bonuses common at senior+ levels ($10K-$100K+)
- Research sources: levels.fyi, Glassdoor, Blind, Comparably, Paysa
- Location bands: SF/NYC/Seattle (tier 1), Austin/Denver/Boston (tier 2), remote-US (tier 3)

## Legal & Cultural
- At-will employment (either party can terminate anytime, no notice required)
- Non-competes: banned in California, FTC rule pending nationally, state-by-state otherwise
- Background checks standard at most companies
- Visa status matters: H-1B (employer-sponsored), Green Card, US Citizen, OPT/CPT
- Benefits to evaluate: 401k match (%), health insurance (PPO vs HMO, premiums), PTO days, parental leave
- Equity cliff: typically 1-year cliff, 4-year vest, monthly or quarterly after cliff

## Outreach Norms
- LinkedIn DMs are standard and expected for professional networking
- Direct email to hiring managers is common and accepted
- "Networking coffee" culture — asking for 15 minutes is normal and well-received
- Shorter, more direct messages preferred over European formality
- Reference something specific about them/their work (talks, posts, projects)
- One clear ask per message
- Follow up once after 7 days, then stop

## Job Boards (US-specific, supplements portals.yml)
- LinkedIn Jobs (primary for US market, use BrightData for data)
- Indeed (broad, high volume)
- Wellfound (startups, angel.co successor)
- Built In (tech-focused, city-specific: builtinnyc, builtinsf, etc.)
- Otta (curated tech roles, good signal-to-noise)
- Levels.fyi jobs (comp-transparent listings)
- USAJobs (federal government)
- Handshake (if early career)

## Interview Process (typical US tech)
1. Recruiter screen (30 min phone/video)
2. Hiring manager screen (45 min)
3. Technical round(s) (1-3 sessions, 45-60 min each)
4. System design / architecture (senior+ roles)
5. Behavioral / culture fit (1-2 sessions)
6. Team match / reverse interview
7. Offer negotiation

## Salary Negotiation
- Always negotiate. First offer is rarely best offer.
- Competing offers are the strongest lever
- Stock refreshers are negotiable separately from initial grant
- Ask for sign-on bonus if base is capped by band
- PTO and start date are also negotiable
- Get everything in writing before accepting verbally
```

- [ ] **Step 7: Create intel/market/us-boards.yml**

```yaml
# US-specific job boards for prospector
# Supplements portals.yml tracked_companies with broader US discovery

boards:
  - name: LinkedIn Jobs
    source: brightdata
    method: linkedin_jobs_scraper
    enabled: true
    notes: "Primary US board. Requires BrightData."

  - name: Indeed
    source: tavily
    method: web_search
    query_template: 'site:indeed.com "{role}" "{location}" remote'
    enabled: true

  - name: Wellfound
    source: exa
    method: semantic_search
    query_template: 'site:wellfound.com "{role}"'
    enabled: true

  - name: Built In
    source: tavily
    method: web_search
    query_template: 'site:builtin.com "{role}" remote'
    enabled: true

  - name: Otta
    source: firecrawl
    method: crawl
    base_url: https://app.otta.com
    enabled: false
    notes: "Requires auth. Use Playwright instead."

  - name: Levels.fyi Jobs
    source: firecrawl
    method: scrape
    base_url: https://www.levels.fyi/jobs
    enabled: true
```

- [ ] **Step 8: Create intel/market/us-outreach-norms.md**

```markdown
# US Outreach Norms

## LinkedIn Connection Request (300 char max)
- Lead with something specific about THEM (not you)
- One proof point showing you're relevant
- Clear, low-pressure ask
- Example: "Hi [Name] — your talk on eval infrastructure resonated. I built production eval systems at [Company] (40% latency reduction). Would love 15 min to learn about your team's direction."

## Email (cold, to hiring manager)
- Subject: specific and short (role name + one hook)
- 3-5 sentences max
- Para 1: Why you're writing (specific reference to their work/team)
- Para 2: Your strongest proof point relevant to THEIR problem
- Para 3: Clear ask (15 min call, or "happy to share more context")
- Sign off: "Best, [First Name]"
- NO: "I hope this email finds you well", "I'm passionate about", "synergy"

## Follow-up Cadence
- Day 0: Initial outreach
- Day 7: One gentle follow-up (reference original, add new context)
- Day 14+: Stop. Move on. Don't be a pest.

## Referral Request (when you know someone at the company)
- Be direct: "I'm applying for [role]. Would you be willing to refer me?"
- Provide: your resume, the job link, 2-sentence summary of why you fit
- Make it easy for them — they just need to submit your info internally
```

- [ ] **Step 9: Create intel/templates/hm-report.md**

```markdown
# Hiring Manager Report: {company} — {role}

**Date:** {date}
**Confidence:** {HIGH|MEDIUM|LOW}

## Likely Hiring Manager

| Field | Value |
|-------|-------|
| Name | {name} |
| Title | {title} |
| LinkedIn | {linkedin_url} |
| Email | {email} ({confidence}) |
| Tenure | {years} at {company} |
| Background | {brief_background} |

## How We Found Them
{source_chain}

## Approach Angle
{what_to_reference}

## Alternative Contacts

| Name | Title | LinkedIn | Why |
|------|-------|----------|-----|

## Email Format
- Pattern: {first.last@company.com}
- Source: {how_inferred}
- Confidence: {HIGH|MEDIUM|LOW}
```

- [ ] **Step 10: Create intel/templates/outreach-draft.md**

```markdown
# Outreach Draft: {hm_name} at {company}

## LinkedIn DM (300 char max)
{draft}

## Email
**To:** {email}
**Subject:** {subject}

{body}

## Context Used
- Report: {report_link}
- Score: {score}
- Key proof points referenced: {list}
- HM-specific reference: {what_we_referenced_about_them}
```

- [ ] **Step 11: Create intel/templates/intel-briefing.md**

```markdown
# Intelligence Briefing — {date}

## New Prospects Found: {count}
{prospect_list}

## Company Signals
{signal_list}

## Market Trends
{trend_list}

## Tactics & Techniques
{tactic_list}

## Outreach Activity
- Drafts ready for review: {count}
- Responses received: {count}
- Interviews pending: {count}

---

## Archive
```

- [ ] **Step 12: Create intel/README.md (onboarding doc)**

Write the full onboarding README as specified in the design spec Section 12. Content: Quick Start (5 steps), Commands table, How It Learns section, Architecture pointer.

- [ ] **Step 13: Create intel/SETUP.md**

Write the detailed setup guide as specified in the design spec Section 12. Content: Prerequisites, API key table, Google Docs MCP setup, gogcli setup, Gemma 4 setup, verify instructions.

- [ ] **Step 14: Create intel/sources/README.md**

```markdown
# OSINT Source Modules

Source modules will be added in Phase 2. Each module wraps one OSINT API
and exposes a standard interface:

- `execute(query)` → `{ results, confidence, cost }`
- `estimateCost(queryType)` → estimated cost in USD
- `isAvailable()` → boolean (checks env var for API key)

The router (../router.mjs) determines which source to call.
For now, Claude uses MCP tools and skills directly, guided by
the router's `formatRoutingInstructions()` output.
```

- [ ] **Step 15: Commit scaffolding**

```bash
git add intel/ config/intel.example.yml config/strategy-ledger.template.md config/voice-profile.template.md intel/sources/README.md
git commit -m "feat(intel): add intelligence engine scaffolding

Directory structure, config templates, US market files,
onboarding docs, and output templates for the OSINT-powered
intelligence engine. Zero existing file modifications."
```

---

### Task 2: OSINT Router Core

**Files:**
- Create: `intel/router.mjs`
- Create: `intel/router.test.mjs`

- [ ] **Step 1: Write the failing test for query classification**

```javascript
// intel/router.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyQuery, getRoutingChain, QUERY_TYPES } from './router.mjs';

describe('classifyQuery', () => {
  it('classifies person lookup queries', () => {
    assert.equal(classifyQuery('Who is the VP of Engineering at Stripe?'), QUERY_TYPES.FIND_PERSON);
    assert.equal(classifyQuery('Find the hiring manager for ML Engineer at Anthropic'), QUERY_TYPES.FIND_PERSON);
  });

  it('classifies email discovery queries', () => {
    assert.equal(classifyQuery('What is jane.doe@stripe.com email?'), QUERY_TYPES.FIND_EMAIL);
    assert.equal(classifyQuery('Find email for John Smith at Acme'), QUERY_TYPES.FIND_EMAIL);
  });

  it('classifies job discovery queries', () => {
    assert.equal(classifyQuery('Find ML engineering roles similar to this one'), QUERY_TYPES.DISCOVER_JOBS);
    assert.equal(classifyQuery('Search for AI engineer positions in SF'), QUERY_TYPES.DISCOVER_JOBS);
  });

  it('classifies URL scraping queries', () => {
    assert.equal(classifyQuery('Extract JD from https://jobs.lever.co/company/role-id'), QUERY_TYPES.SCRAPE_URL);
  });

  it('classifies company intel queries', () => {
    assert.equal(classifyQuery('Tell me about Anthropic funding and tech stack'), QUERY_TYPES.COMPANY_INTEL_QUICK);
    assert.equal(classifyQuery('Deep research on Stripe financial health and market position'), QUERY_TYPES.COMPANY_INTEL_DEEP);
  });

  it('classifies similar company queries', () => {
    assert.equal(classifyQuery('Find companies similar to Stripe that are hiring'), QUERY_TYPES.SIMILAR_COMPANIES);
  });

  it('classifies linkedin data queries', () => {
    assert.equal(classifyQuery('Get LinkedIn profile for Jane Doe at Stripe'), QUERY_TYPES.LINKEDIN_PROFILE);
  });

  it('classifies market trend queries', () => {
    assert.equal(classifyQuery('What are hiring trends for AI engineers in 2026?'), QUERY_TYPES.MARKET_TRENDS);
  });
});

describe('getRoutingChain', () => {
  it('returns correct chain for FIND_PERSON with all APIs', () => {
    const available = ['exa', 'parallel', 'brightdata', 'tavily', 'firecrawl', 'valyu'];
    const chain = getRoutingChain(QUERY_TYPES.FIND_PERSON, available);
    assert.equal(chain[0], 'exa');
    assert.equal(chain[1], 'parallel');
    assert.equal(chain[2], 'brightdata');
  });

  it('skips unavailable APIs', () => {
    const available = ['tavily', 'firecrawl'];
    const chain = getRoutingChain(QUERY_TYPES.FIND_PERSON, available);
    assert.ok(!chain.includes('exa'));
    assert.ok(!chain.includes('brightdata'));
  });

  it('returns builtin fallback when no APIs available', () => {
    const chain = getRoutingChain(QUERY_TYPES.FIND_PERSON, []);
    assert.equal(chain[0], 'builtin');
  });

  it('routes SCRAPE_URL to firecrawl first', () => {
    const available = ['exa', 'firecrawl', 'tavily'];
    const chain = getRoutingChain(QUERY_TYPES.SCRAPE_URL, available);
    assert.equal(chain[0], 'firecrawl');
  });

  it('routes LINKEDIN_PROFILE to brightdata only', () => {
    const available = ['exa', 'brightdata', 'tavily'];
    const chain = getRoutingChain(QUERY_TYPES.LINKEDIN_PROFILE, available);
    assert.equal(chain[0], 'brightdata');
    assert.equal(chain.length, 1);
  });

  it('routes COMPANY_INTEL_DEEP to valyu first', () => {
    const available = ['exa', 'valyu', 'tavily', 'parallel'];
    const chain = getRoutingChain(QUERY_TYPES.COMPANY_INTEL_DEEP, available);
    assert.equal(chain[0], 'valyu');
  });
});

describe('classifyQuery edge cases (ambiguous queries)', () => {
  it('prefers FIND_EMAIL over FIND_PERSON when both could match', () => {
    assert.equal(classifyQuery('Find email for the VP of Engineering at Stripe'), QUERY_TYPES.FIND_EMAIL);
  });

  it('prefers SCRAPE_URL when query contains a URL regardless of other keywords', () => {
    assert.equal(classifyQuery('Find the hiring manager from https://jobs.lever.co/stripe/123'), QUERY_TYPES.SCRAPE_URL);
  });

  it('routes financial queries to COMPANY_INTEL_DEEP (merged type)', () => {
    assert.equal(classifyQuery('Stripe financial health and regulatory filings'), QUERY_TYPES.COMPANY_INTEL_DEEP);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test intel/router.test.mjs
```

Expected: FAIL — `router.mjs` doesn't exist yet.

- [ ] **Step 3: Implement the router**

```javascript
// intel/router.mjs
// OSINT API Router — classifies queries and returns optimal source chains.
// Pure functions, no I/O. Actual API calls are made by Claude using MCP tools
// or skills, guided by the routing chain this module returns.

export const QUERY_TYPES = {
  FIND_PERSON: 'find_person',
  FIND_EMAIL: 'find_email',
  DISCOVER_JOBS: 'discover_jobs',
  SCRAPE_URL: 'scrape_url',
  COMPANY_INTEL_QUICK: 'company_intel_quick',
  COMPANY_INTEL_DEEP: 'company_intel_deep',  // also covers financial/regulatory queries
  SIMILAR_COMPANIES: 'similar_companies',
  LINKEDIN_PROFILE: 'linkedin_profile',
  LINKEDIN_JOBS: 'linkedin_jobs',
  MARKET_TRENDS: 'market_trends',
  MONITOR_CHANGES: 'monitor_changes',
  INFER_EMAIL_FORMAT: 'infer_email_format',
};

const ROUTING_TABLE = {
  [QUERY_TYPES.FIND_PERSON]:         ['exa', 'parallel', 'brightdata'],
  [QUERY_TYPES.FIND_EMAIL]:          ['exa', 'parallel', 'brightdata'],
  [QUERY_TYPES.DISCOVER_JOBS]:       ['exa', 'parallel', 'tavily'],
  [QUERY_TYPES.SCRAPE_URL]:          ['firecrawl', 'builtin', 'tavily'],
  [QUERY_TYPES.COMPANY_INTEL_QUICK]: ['tavily', 'exa'],
  [QUERY_TYPES.COMPANY_INTEL_DEEP]:  ['valyu', 'parallel', 'tavily', 'firecrawl'],
  [QUERY_TYPES.SIMILAR_COMPANIES]:   ['exa', 'parallel'],
  [QUERY_TYPES.LINKEDIN_PROFILE]:    ['brightdata'],
  [QUERY_TYPES.LINKEDIN_JOBS]:       ['brightdata', 'exa'],
  [QUERY_TYPES.MARKET_TRENDS]:       ['tavily', 'valyu', 'exa'],
  [QUERY_TYPES.MONITOR_CHANGES]:     ['parallel', 'brightdata'],
  [QUERY_TYPES.INFER_EMAIL_FORMAT]:  ['firecrawl', 'exa'],
};

const PATTERNS = [
  { type: QUERY_TYPES.SCRAPE_URL,          re: /https?:\/\//i },
  { type: QUERY_TYPES.FIND_EMAIL,          re: /\b(email|e-mail|contact)\b.*\b(for|of|at)\b/i },
  { type: QUERY_TYPES.FIND_EMAIL,          re: /\bfind\b.*\bemail\b/i },
  { type: QUERY_TYPES.LINKEDIN_PROFILE,    re: /\blinkedin\s+profile\b/i },
  { type: QUERY_TYPES.LINKEDIN_PROFILE,    re: /\bget\b.*\blinkedin\b/i },
  { type: QUERY_TYPES.LINKEDIN_JOBS,       re: /\blinkedin\b.*\bjob/i },
  { type: QUERY_TYPES.INFER_EMAIL_FORMAT,  re: /\bemail\s+(format|pattern)\b/i },
  { type: QUERY_TYPES.SIMILAR_COMPANIES,   re: /\b(similar|like)\b.*\b(compan|startup)/i },
  { type: QUERY_TYPES.COMPANY_INTEL_DEEP,  re: /\b(deep|full|comprehensive)\b.*\b(research|analysis|intel)/i },
  { type: QUERY_TYPES.COMPANY_INTEL_DEEP,  re: /\b(financial|regulatory|funding|runway|filings|revenue)\b/i },  // merged: covers financial/regulatory queries
  { type: QUERY_TYPES.MARKET_TRENDS,       re: /\b(trend|market|salary|compensation|hiring rate)\b/i },  // before QUICK to avoid "tell me about trends" shadowing
  { type: QUERY_TYPES.MONITOR_CHANGES,     re: /\b(monitor|alert|notify)\b.*\b(company|role|job|posting|change)/i },  // requires intent word + target word (not just "watch")
  { type: QUERY_TYPES.COMPANY_INTEL_QUICK, re: /\b(tell me about|what is|company info|tech stack)\b/i },
  { type: QUERY_TYPES.FIND_PERSON,         re: /\b(who is|find|hiring manager|VP|head of|director)\b.*\bat\b/i },
  { type: QUERY_TYPES.FIND_PERSON,         re: /\b(manager|lead|director|VP)\b.*\b(for|of|at)\b/i },
  { type: QUERY_TYPES.DISCOVER_JOBS,       re: /\b(find|search|discover|look for)\b.*\b(job|role|position|opening)/i },
  { type: QUERY_TYPES.DISCOVER_JOBS,       re: /\b(job|role|position)s?\b.*\b(similar|matching|like)\b/i },
];

export function classifyQuery(query) {
  for (const { type, re } of PATTERNS) {
    if (re.test(query)) return type;
  }
  return QUERY_TYPES.COMPANY_INTEL_QUICK;
}

export function getRoutingChain(queryType, availableAPIs) {
  const preferred = ROUTING_TABLE[queryType] || ROUTING_TABLE[QUERY_TYPES.COMPANY_INTEL_QUICK];
  const chain = preferred.filter(
    src => src === 'builtin' || availableAPIs.includes(src)
  );
  if (chain.length === 0) return ['builtin'];
  return chain;
}

export function getAvailableAPIs(config) {
  if (!config?.apis) return [];
  return Object.entries(config.apis)
    .filter(([, cfg]) => cfg.enabled && process.env[cfg.key_env])
    .map(([name]) => name);
}

export function formatRoutingInstructions(query, queryType, chain) {
  const sourceDescriptions = {
    exa: 'Exa semantic search (MCP: mcp__exa__web_search_exa)',
    brightdata: 'BrightData LinkedIn scraper (API call via Bash)',
    tavily: 'Tavily search (Skill: tavily-search or tavily-cli)',
    firecrawl: 'Firecrawl web scraper (Skill: firecrawl:firecrawl-cli)',
    valyu: 'Valyu deep research (Skill: valyu-best-practices)',
    parallel: 'Parallel.ai entity discovery (API call via Bash)',
    builtin: 'Built-in WebSearch + Playwright (no API key needed)',
  };

  const steps = chain.map((src, i) => {
    const desc = sourceDescriptions[src] || src;
    const role = i === 0 ? 'PRIMARY' : i === 1 ? 'FALLBACK' : 'TERTIARY';
    return `${i + 1}. [${role}] ${desc}`;
  });

  return `Query type: ${queryType}\nQuery: "${query}"\n\nRouting chain:\n${steps.join('\n')}\n\nUse PRIMARY first. If it returns low-confidence results or fails, try FALLBACK.\nAccumulate partial results across sources — combine and deduplicate before returning.`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test intel/router.test.mjs
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add intel/router.mjs intel/router.test.mjs
git commit -m "feat(intel): add OSINT query router with pattern classification

Routes queries to optimal API sources based on type. Pattern-based
classification (no LLM call needed). Graceful degradation when APIs
unavailable. Pure functions, fully tested."
```

---

### Task 3: Engine Orchestrator

**Files:**
- Create: `intel/engine.mjs`
- Create: `intel/engine.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// intel/engine.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkSetup, getSetupStatus } from './engine.mjs';

describe('checkSetup', () => {
  it('detects missing intel.yml', () => {
    const status = checkSetup('/nonexistent/path');
    assert.equal(status.intelYml, false);
  });

  it('returns structured status object', () => {
    const status = checkSetup('/nonexistent/path');
    assert.ok('intelYml' in status);
    assert.ok('strategyLedger' in status);
    assert.ok('voiceProfile' in status);
    assert.ok('outreachMd' in status);
    assert.ok('prospectsMd' in status);
    assert.ok('intelligenceMd' in status);
    assert.ok('availableAPIs' in status);
    assert.ok('gemmaAvailable' in status);
    assert.ok('gogcliAvailable' in status);
    assert.ok('ready' in status);
  });

  it('marks not ready when core files missing', () => {
    const status = checkSetup('/nonexistent/path');
    assert.equal(status.ready, false);
  });
});

describe('getSetupStatus', () => {
  it('returns human-readable status string', () => {
    const status = checkSetup('/nonexistent/path');
    const text = getSetupStatus(status);
    assert.ok(text.includes('config/intel.yml'));
    assert.ok(typeof text === 'string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test intel/engine.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Implement the engine**

```javascript
// intel/engine.mjs
// Intelligence Engine — setup checker and orchestrator entry point.

import { existsSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

export function checkSetup(projectRoot) {
  const check = (rel) => existsSync(join(projectRoot, rel));

  let gemmaAvailable = false;
  try {
    const out = execFileSync('ollama', ['list'], { encoding: 'utf-8', timeout: 5000 });
    gemmaAvailable = /gemma4/i.test(out);
  } catch { /* ollama not installed or not running */ }

  let gogcliAvailable = false;
  try {
    execFileSync('which', ['gog'], { encoding: 'utf-8', timeout: 3000 });
    gogcliAvailable = true;
  } catch { /* not installed */ }

  const knownKeys = {
    exa: 'EXA_API_KEY',
    brightdata: 'BRIGHTDATA_API_KEY',
    tavily: 'TAVILY_API_KEY',
    firecrawl: 'FIRECRAWL_API_KEY',
    valyu: 'VALYU_API_KEY',
    parallel: 'PARALLEL_API_KEY',
  };
  const availableAPIs = Object.entries(knownKeys)
    .filter(([, envVar]) => process.env[envVar])
    .map(([name]) => name);

  const status = {
    intelYml: check('config/intel.yml'),
    strategyLedger: check('config/strategy-ledger.md'),
    voiceProfile: check('config/voice-profile.md'),
    outreachMd: check('data/outreach.md'),
    prospectsMd: check('data/prospects.md'),
    intelligenceMd: check('data/intelligence.md'),
    availableAPIs,
    gemmaAvailable,
    gogcliAvailable,
    ready: false,
  };

  status.ready = status.intelYml && status.outreachMd && status.prospectsMd && status.intelligenceMd;
  return status;
}

export function getSetupStatus(status) {
  const lines = [];
  const yes = (v) => v ? 'OK' : 'MISSING';

  lines.push('Intelligence Engine Status');
  lines.push('='.repeat(40));
  lines.push(`config/intel.yml:          ${yes(status.intelYml)}`);
  lines.push(`config/strategy-ledger.md: ${yes(status.strategyLedger)}`);
  lines.push(`config/voice-profile.md:   ${yes(status.voiceProfile)}`);
  lines.push(`data/outreach.md:          ${yes(status.outreachMd)}`);
  lines.push(`data/prospects.md:         ${yes(status.prospectsMd)}`);
  lines.push(`data/intelligence.md:      ${yes(status.intelligenceMd)}`);
  lines.push('');
  lines.push(`OSINT APIs available: ${status.availableAPIs.length > 0 ? status.availableAPIs.join(', ') : 'none (will use WebSearch + Playwright)'}`);
  lines.push(`Gemma 4 (local):     ${status.gemmaAvailable ? 'OK (overnight self-improvement enabled)' : 'not found (optional: ollama pull gemma4:26b)'}`);
  lines.push(`gogcli:              ${status.gogcliAvailable ? 'OK' : 'not found (optional: brew install steipete/tap/gogcli)'}`);
  lines.push('');
  lines.push(`Ready: ${status.ready ? 'YES' : 'NO — run "set up the intelligence engine" to initialize'}`);

  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test intel/engine.test.mjs
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add intel/engine.mjs intel/engine.test.mjs
git commit -m "feat(intel): add engine orchestrator with setup checker"
```

---

## Phase 2: Mode Files (Claude's Instructions)

### Task 4: OSINT Mode

**Files:**
- Create: `modes/osint.md`

- [ ] **Step 1: Create modes/osint.md**

Write the full OSINT mode as specified in design spec Section 4 (OSINT Router) combined with the deep research pipeline. Covers: target type classification (company/person/role), routing chain execution, parallel query strategy per source, report synthesis, and next-step suggestions. Full content specified in design spec — implement exactly.

- [ ] **Step 2: Commit**

```bash
git add modes/osint.md
git commit -m "feat(intel): add OSINT mode for deep company/person/role research"
```

---

### Task 5: Prospect Mode

**Files:**
- Create: `modes/prospect.md`

- [ ] **Step 1: Create modes/prospect.md**

Write the full prospect mode as specified in design spec Section 6. Covers: display mode (show/manage existing prospects), discovery mode (3 discovery strategies: semantic match, signal-based, market sweep), prospects tracker format, learning loop, and integration with existing scan. Full content specified in design spec — implement exactly.

- [ ] **Step 2: Commit**

```bash
git add modes/prospect.md
git commit -m "feat(intel): add prospect mode for proactive job discovery"
```

---

### Task 6: Outreach Mode

**Files:**
- Create: `modes/outreach.md`

- [ ] **Step 1: Create modes/outreach.md**

Write the full outreach mode as specified in design spec Sections 5 (HM Discovery) + 7 (Gmail) + Google Docs integration. Covers: 7-stage pipeline (org mapping, signal enrichment, hierarchy inference, contact discovery, outreach drafting, Gmail draft creation, Google Docs resume creation), outreach tracker format, voice profile usage, ethical guardrails (never auto-send). Full content specified in design spec — implement exactly.

- [ ] **Step 2: Commit**

```bash
git add modes/outreach.md
git commit -m "feat(intel): add outreach mode for HM discovery + outreach pipeline"
```

---

### Task 7: Improve Mode

**Files:**
- Create: `modes/improve.md`

- [ ] **Step 1: Create modes/improve.md**

Write the full improve mode as specified in design spec Section 8. Covers: 3 nested loops (strategy ledger analysis, prompt optimization via Gemma 4, meta-harness review), binary eval criteria, autoresearch-style iteration, human gates, and reporting format. Full content specified in design spec — implement exactly.

- [ ] **Step 2: Commit**

```bash
git add modes/improve.md
git commit -m "feat(intel): add self-improvement mode with 3 optimization loops"
```

---

## Phase 3: Data Files & Self-Improvement

### Task 8: Setup File Generators

**Files:**
- Create: `intel/setup.mjs`
- Create: `intel/setup.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// intel/setup.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateIntelYml, generateEmptyTracker, generateEmptyProspects, generateEmptyIntelligence } from './setup.mjs';

describe('generateIntelYml', () => {
  it('generates valid YAML with API config', () => {
    const profile = {
      candidate: { full_name: 'Jane Smith', location: 'San Francisco, CA' },
      target_roles: { primary: ['Senior AI Engineer'] },
    };
    const yml = generateIntelYml(profile);
    assert.ok(yml.includes('apis:'));
    assert.ok(yml.includes('EXA_API_KEY'));
    assert.ok(yml.includes('schedules:'));
  });
});

describe('generateEmptyTracker', () => {
  it('generates outreach tracker with correct headers', () => {
    const md = generateEmptyTracker();
    assert.ok(md.includes('# Outreach Tracker'));
    assert.ok(md.includes('| # | Date'));
    assert.ok(md.includes('## Queue'));
  });
});

describe('generateEmptyProspects', () => {
  it('generates prospects tracker', () => {
    const md = generateEmptyProspects();
    assert.ok(md.includes('# Prospects'));
    assert.ok(md.includes('## New (unreviewed)'));
  });
});

describe('generateEmptyIntelligence', () => {
  it('generates intelligence briefing', () => {
    const md = generateEmptyIntelligence();
    assert.ok(md.includes('# Intelligence Briefing'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test intel/setup.test.mjs
```

- [ ] **Step 3: Implement setup.mjs**

Generate `config/intel.yml` from profile, and empty `data/outreach.md`, `data/prospects.md`, `data/intelligence.md`. Uses the config/intel.example.yml as template. Pure generation functions, no side effects.

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test intel/setup.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add intel/setup.mjs intel/setup.test.mjs
git commit -m "feat(intel): add setup file generators for onboarding"
```

---

### Task 9: Self-Improvement Prompts

**Files:**
- Create: `intel/self-improve/prompts/reflection.md`
- Create: `intel/self-improve/prompts/principle-distill.md`
- Create: `intel/self-improve/prompts/harness-synthesize.md`

- [ ] **Step 1: Create all 3 prompts**

**reflection.md**: Evaluation accuracy analysis. Given JD + score + user action, identify mis-scored dimensions and propose instruction fixes. Uses GEPA-inspired error-driven reflection.

**principle-distill.md**: Extract reusable principles from calibration log patterns. Promotes to guiding/cautionary when n>=5, prunes when contradicted.

**harness-synthesize.md**: Meta-optimization — analyze Loop 2 history, identify criteria that are too easy/hard, propose updated eval criteria and reflection prompts.

- [ ] **Step 2: Commit**

```bash
git add intel/self-improve/prompts/
git commit -m "feat(intel): add self-improvement prompts for reflection, distillation, and meta-optimization"
```

---

### Task 10: Schedule Definitions

**Files:**
- Create: `intel/schedules/market-scan.md`
- Create: `intel/schedules/trend-analysis.md`
- Create: `intel/schedules/company-watch.md`
- Create: `intel/schedules/self-improve-cycle.md`
- Create: `intel/schedules/outreach-research.md`

- [ ] **Step 1: Create all 5 schedule files**

Each defines: what it does, execution steps, interval, API requirements, fallback behavior. Content as specified in design spec Section 9.

- [ ] **Step 2: Commit**

```bash
git add intel/schedules/
git commit -m "feat(intel): add background schedule definitions for all 5 intelligence cycles"
```

---

### Task 11: Integration Templates

**Files:**
- Create: `intel/claude-md-append.md`
- Create: `intel/data-contract-append.md`

- [ ] **Step 1: Create CLAUDE.md append template**

Contains the intel commands table, prerequisites check, integration hooks (post-evaluation HM suggestion, strategy ledger recording), Google integration instructions, and OSINT routing instructions. Wrapped in HTML comments for clean append.

- [ ] **Step 2: Create DATA_CONTRACT.md append template**

Contains the intel-specific user layer and system layer file listings.

- [ ] **Step 3: Commit**

```bash
git add intel/claude-md-append.md intel/data-contract-append.md
git commit -m "feat(intel): add CLAUDE.md and DATA_CONTRACT.md append templates"
```

---

## Phase 4: Integration Testing & Final Assembly

### Task 12: Integration Tests

**Files:**
- Create: `intel/integration.test.mjs`

- [ ] **Step 1: Write integration test**

```javascript
// intel/integration.test.mjs
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { checkSetup, getSetupStatus } from './engine.mjs';
import { generateIntelYml, generateEmptyTracker, generateEmptyProspects, generateEmptyIntelligence } from './setup.mjs';
import { classifyQuery, getRoutingChain, formatRoutingInstructions, QUERY_TYPES } from './router.mjs';

describe('Integration: Full Setup Flow', () => {
  let tmpDir;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'intel-test-'));
    mkdirSync(join(tmpDir, 'config'), { recursive: true });
    mkdirSync(join(tmpDir, 'data'), { recursive: true });
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports not ready before setup', () => {
    const status = checkSetup(tmpDir);
    assert.equal(status.ready, false);
  });

  it('generates and writes all files', () => {
    const profile = { candidate: { full_name: 'Test' }, target_roles: { primary: ['AI Eng'] } };
    writeFileSync(join(tmpDir, 'config', 'intel.yml'), generateIntelYml(profile));
    writeFileSync(join(tmpDir, 'data', 'outreach.md'), generateEmptyTracker());
    writeFileSync(join(tmpDir, 'data', 'prospects.md'), generateEmptyProspects());
    writeFileSync(join(tmpDir, 'data', 'intelligence.md'), generateEmptyIntelligence());

    const status = checkSetup(tmpDir);
    assert.equal(status.ready, true);
  });
});

describe('Integration: Router end-to-end', () => {
  it('routes HM query with full API set', () => {
    const query = 'Who is the VP of Engineering at Stripe?';
    const type = classifyQuery(query);
    assert.equal(type, QUERY_TYPES.FIND_PERSON);
    const chain = getRoutingChain(type, ['exa', 'parallel', 'brightdata']);
    assert.equal(chain[0], 'exa');
    const instructions = formatRoutingInstructions(query, type, chain);
    assert.ok(instructions.includes('PRIMARY'));
  });

  it('falls back gracefully with no APIs', () => {
    const query = 'Find ML engineer roles in SF';
    const type = classifyQuery(query);
    const chain = getRoutingChain(type, []);
    assert.equal(chain[0], 'builtin');
  });
});
```

- [ ] **Step 2: Run all tests**

```bash
node --test 'intel/**/*.test.mjs'
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add intel/integration.test.mjs
git commit -m "test(intel): add integration tests for setup flow and router"
```

---

### Task 13: Final Assembly

**Files:**
- Create: `intel/.gitignore`

- [ ] **Step 1: Verify intel/package.json scripts work**

```bash
cd intel && npm test && cd ..
```

All npm scripts live in `intel/package.json`, NOT the root. This preserves the additive-only constraint.

- [ ] **Step 2: Create intel/.gitignore**

```
*.log
```

- [ ] **Step 3: Run final test suite**

```bash
cd intel && npm test && cd ..
```

Expected: All tests PASS.

- [ ] **Step 4: Run setup check**

```bash
node -e "import('./intel/engine.mjs').then(m => console.log(m.getSetupStatus(m.checkSetup('.'))))"
```

Expected: Status with "Ready: NO" (user hasn't run setup yet).

- [ ] **Step 5: Commit**

```bash
git add intel/.gitignore
git commit -m "feat(intel): finalize phase 1 with gitignore and test verification"
```

---

## Phase 2: Pipeline Implementations (builds on Phase 1)

> Phase 2 should be planned AFTER Phase 1 is deployed and has accumulated 10+ evaluations with user feedback. The tasks below are stubs — each will be fully specified in a separate planning cycle.

### Task 14: File Locking Module

**Files:**
- Create: `intel/lock.mjs`
- Create: `intel/lock.test.mjs`

Implement advisory file locking for concurrent schedule writes. Pattern: acquire lock → read → write → release. Stale lock detection (>60s). Used by all pipelines that write to shared data files.

### Task 15: Budget Reservation Module

**Files:**
- Create: `intel/budget.mjs`
- Create: `intel/budget.test.mjs`
- Create: `data/intel-usage.log` (on first use)

Pre-debit budget reservation before API calls. `reserveBudget(source, estimate)` → `commitBudget(source, actual)` → `releaseBudget(source)` on failure. Atomic operations using lockfile.

### Task 16: Strategy Engine

**Files:**
- Create: `intel/self-improve/strategy-engine.mjs`
- Create: `intel/self-improve/strategy-engine.test.mjs`

Read/write strategy-ledger.md. Principle promotion (n>=10 across 3+ companies). Conflict detection vs profile.yml deal-breakers. Bias detection (re-evaluate principles every 30 days). Pruning when accuracy <60%.

### Task 17: Exemplar Manager

**Files:**
- Create: `intel/self-improve/exemplar-manager.mjs`
- Create: `intel/self-improve/exemplar-manager.test.mjs`

Manage config/exemplars/ directory. Store best past evaluations as few-shot examples. Replace weaker exemplars when better ones arrive. Convergence toward user's actual preferences.

### Task 18: Gemma 4 Runner

**Files:**
- Create: `intel/self-improve/gemma-runner.mjs`
- Create: `intel/self-improve/gemma-runner.test.mjs`

Ollama integration for local Gemma 4 eval loops. Autoresearch pattern: iterate → evaluate → keep if better → discard if not. Transfer validation: run 3-5 test evals on Claude after Gemma 4 proposes changes. Graceful fallback if Ollama not running.

### Task 19: HM Discovery Pipeline

**Files:**
- Create: `intel/pipelines/hm-discovery.mjs`
- Create: `intel/pipelines/hm-discovery.test.mjs`

6-stage pipeline from spec Section 5. Dual confidence scoring (person vs email). PII tagging for purge command. Lockfile for outreach.md writes.

### Task 20: Email Inference Pipeline

**Files:**
- Create: `intel/pipelines/email-inference.mjs`
- Create: `intel/pipelines/email-inference.test.mjs`

Email format detection via Firecrawl team page scraping + Exa search. Pattern library (first.last, flast, first, etc.). Ambiguity detection for common names.

### Task 21: Prospector Pipeline

**Files:**
- Create: `intel/pipelines/prospector.mjs`
- Create: `intel/pipelines/prospector.test.mjs`

3 discovery modes (semantic, signal, sweep). Cross-source dedup by normalized company+role tuple. 30-day prospect expiry. Lockfile for prospects.md writes.

### Task 22: Gmail IO Pipeline

**Files:**
- Create: `intel/pipelines/gmail-io.mjs`
- Create: `intel/pipelines/gmail-io.test.mjs`

Two cadences: (1) **Response monitoring (every 4h):** resilient thread matching (thread ID + subject+recipient fallback + company+date proximity), response classification, reply drafting, follow-up scheduling. (2) **Daily Gmail intelligence mining:** extract LinkedIn job alert emails → cross-reference prospects.md via dedup module, detect ATS status emails → surface as suggestions in intelligence.md (NOT applications.md — data contract), detect interview invitations → flag in briefing. Voice learning with scoped rules (universal vs industry-specific vs one-off).

### Task 23: Google Docs Resume Pipeline

**Files:**
- Create: `intel/pipelines/gdocs-resume.mjs`
- Create: `intel/pipelines/gdocs-resume.test.mjs`

Create/update personalized CVs in Google Docs via MCP. Two-way sync with cv.md. Share link tracking in outreach.md. Export via gogcli.

### Task 24: Company Intel Pipeline

**Files:**
- Create: `intel/pipelines/company-intel.mjs`
- Create: `intel/pipelines/company-intel.test.mjs`

Deep company research using router chain. Synthesize findings into structured report. Save to intelligence.md. Lockfile for shared file writes.

### Task 25: Outreach Drafter Pipeline

**Files:**
- Create: `intel/pipelines/outreach-drafter.mjs`
- Create: `intel/pipelines/outreach-drafter.test.mjs`

Voice-profile-aware outreach drafting. 2 variants (LinkedIn DM + email). Gmail draft creation with error handling for OAuth expiry. Google Docs resume creation per role.

### Task 26: PII Purge Command

**Files:**
- Create: `intel/purge-pii.mjs`
- Create: `modes/purge.md`

Scan data/outreach.md, data/intelligence.md, reports/ for PII tags. Offer redaction/deletion for entries older than configurable retention (default 90 days).

### Task 27: Eval Loop Runner

**Files:**
- Create: `intel/self-improve/eval-loop.mjs`
- Create: `intel/self-improve/eval-loop.test.mjs`

Autoresearch-style tight eval loop. Reads test set from applications + reports. Binary eval criteria (GEPA-inspired). Gemma 4 reflection on failures. Transfer validation on Claude. Human gate for all changes.

### Task 28: Harness Optimizer

**Files:**
- Create: `intel/self-improve/harness-optimizer.mjs`

Meta-harness optimization (Ouroboros pattern). Analyzes Loop 2 history. Proposes updated eval criteria when Loop 2 plateaus. Monthly trigger.

### Task 29: Schema Version Checker

**Files:**
- Modify: `intel/engine.mjs` (add SCHEMA_VERSION check)

Add SCHEMA_VERSION comment detection for `data/applications.md` and `modes/_shared.md`. Warn if format has changed since intel was built. Advisory only — never blocks. Per spec Section 11 (Semantic Compatibility).

### Task 30: Dedup Module (shared)

**Files:**
- Create: `intel/dedup.mjs`
- Create: `intel/dedup.test.mjs`

Shared cross-source deduplication module used by prospector, Gmail IO, and any pipeline that discovers roles. URL-exact matching + normalized company+role tuple matching. Per spec Section 6 (Cross-Source Deduplication). Extracted as shared module rather than embedded in one pipeline.

### Task 31: Prospect Lifecycle Manager

**Files:**
- Create: `intel/pipelines/prospect-lifecycle.mjs`

Handles prospect expiry (30-day auto-archive), compaction (90-day removal), and the "show expired" command. Runs as part of prospect_scan schedule. Per spec Section 6 (Prospect Expiry & Archival). Expired prospects do NOT generate negative learning signals unless user actively reviews and dismisses them.

---

## Summary

### What's Built After This Plan

| Component | Files | Tested | Phase |
|-----------|-------|--------|-------|
| Directory scaffolding + templates | `intel/`, `config/` templates | N/A | Phase 1 |
| OSINT Router (query classification + routing) | `intel/router.mjs` | Yes | Phase 1 |
| Engine orchestrator (setup checker) | `intel/engine.mjs` | Yes | Phase 1 |
| Setup generators (onboarding) | `intel/setup.mjs` | Yes | Phase 1 |
| OSINT mode (deep research) | `modes/osint.md` | N/A (mode file) | Phase 1 |
| Prospect mode (job discovery) | `modes/prospect.md` | N/A (mode file) | Phase 1 |
| Outreach mode (HM + Gmail + GDocs) | `modes/outreach.md` | N/A (mode file) | Phase 1 |
| Improve mode (self-improvement) | `modes/improve.md` | N/A (mode file) | Phase 1 |
| Self-improvement prompts | `intel/self-improve/prompts/` | N/A (prompts) | Phase 1 |
| Schedule definitions | `intel/schedules/` | N/A (definitions) | Phase 1 |
| US market knowledge | `intel/market/` | N/A (content) | Phase 1 |
| Output templates | `intel/templates/` | N/A (templates) | Phase 1 |
| Source modules README | `intel/sources/README.md` | N/A (docs) | Phase 1 |
| Onboarding docs | `intel/README.md`, `SETUP.md` | N/A (docs) | Phase 1 |
| Integration templates | `intel/*-append.md` | N/A (templates) | Phase 1 |
| Integration tests | `intel/integration.test.mjs` | Yes | Phase 1 |
| File locking module | `intel/lock.mjs` | Yes | Phase 2 (stub) |
| Budget reservation module | `intel/budget.mjs` | Yes | Phase 2 (stub) |
| Strategy engine | `intel/self-improve/strategy-engine.mjs` | Yes | Phase 2 (stub) |
| Exemplar manager | `intel/self-improve/exemplar-manager.mjs` | Yes | Phase 2 (stub) |
| Gemma 4 runner | `intel/self-improve/gemma-runner.mjs` | Yes | Phase 2 (stub) |
| HM discovery pipeline | `intel/pipelines/hm-discovery.mjs` | Yes | Phase 2 (stub) |
| Email inference pipeline | `intel/pipelines/email-inference.mjs` | Yes | Phase 2 (stub) |
| Prospector pipeline | `intel/pipelines/prospector.mjs` | Yes | Phase 2 (stub) |
| Gmail IO pipeline | `intel/pipelines/gmail-io.mjs` | Yes | Phase 2 (stub) |
| Google Docs resume pipeline | `intel/pipelines/gdocs-resume.mjs` | Yes | Phase 2 (stub) |
| Company intel pipeline | `intel/pipelines/company-intel.mjs` | Yes | Phase 2 (stub) |
| Outreach drafter pipeline | `intel/pipelines/outreach-drafter.mjs` | Yes | Phase 2 (stub) |
| PII purge command | `intel/purge-pii.mjs` | N/A | Phase 2 (stub) |
| Eval loop runner | `intel/self-improve/eval-loop.mjs` | Yes | Phase 2 (stub) |
| Harness optimizer | `intel/self-improve/harness-optimizer.mjs` | N/A | Phase 2 (stub) |

### Post-Plan: User Runs Setup

After executing this plan, the user says **"set up the intelligence engine"** which:
1. Copies templates to create `config/intel.yml`, `config/strategy-ledger.md`, `config/voice-profile.md`
2. Creates `data/outreach.md`, `data/prospects.md`, `data/intelligence.md`
3. Appends intel section to `CLAUDE.md` and `DATA_CONTRACT.md`
4. Sets up background schedules (if `/schedule` available)
5. Runs first prospect scan

### Phase 2: What Comes Next

Phase 2 tasks (14-28) are stubs above. Each will be fully specified in a separate planning cycle after Phase 1 is deployed and the system has accumulated 10+ evaluations with user feedback. Key Phase 2 deliverables:

- File locking and budget reservation (infrastructure)
- Strategy engine, exemplar manager, Gemma 4 runner (self-improvement)
- HM discovery, email inference, prospector, company intel (OSINT pipelines)
- Gmail IO, Google Docs resume, outreach drafter (communication pipelines)
- PII purge, eval loop runner, harness optimizer (maintenance and meta-optimization)
