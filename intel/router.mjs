/**
 * OSINT Query Router
 *
 * Pattern-based classification of intelligence queries into typed categories,
 * with routing chains that degrade gracefully based on available APIs.
 */

// ─── Query Types ────────────────────────────────────────────────────────────

export const QUERY_TYPES = Object.freeze({
  FIND_PERSON: 'FIND_PERSON',
  FIND_EMAIL: 'FIND_EMAIL',
  DISCOVER_JOBS: 'DISCOVER_JOBS',
  SCRAPE_URL: 'SCRAPE_URL',
  COMPANY_INTEL_QUICK: 'COMPANY_INTEL_QUICK',
  COMPANY_INTEL_DEEP: 'COMPANY_INTEL_DEEP',
  SIMILAR_COMPANIES: 'SIMILAR_COMPANIES',
  LINKEDIN_PROFILE: 'LINKEDIN_PROFILE',
  LINKEDIN_JOBS: 'LINKEDIN_JOBS',
  MARKET_TRENDS: 'MARKET_TRENDS',
  MONITOR_CHANGES: 'MONITOR_CHANGES',
  INFER_EMAIL_FORMAT: 'INFER_EMAIL_FORMAT',
});

// ─── Classification Patterns (ORDER MATTERS — most specific first) ──────────

const PATTERNS = [
  // 1. URL always wins
  { pattern: /https?:\/\//i, type: QUERY_TYPES.SCRAPE_URL },
  // 2-3. Email discovery
  { pattern: /\b(email|e-mail|contact)\b.*\b(for|of|at)\b/i, type: QUERY_TYPES.FIND_EMAIL },
  { pattern: /\bfind\b.*\bemail\b/i, type: QUERY_TYPES.FIND_EMAIL },
  // 2b. Email with @ address present
  { pattern: /\S+@\S+.*\bemail\b/i, type: QUERY_TYPES.FIND_EMAIL },
  { pattern: /\bemail\b.*\S+@\S+/i, type: QUERY_TYPES.FIND_EMAIL },
  // 4-5. LinkedIn profile
  { pattern: /\blinkedin\s+profile\b/i, type: QUERY_TYPES.LINKEDIN_PROFILE },
  { pattern: /\bget\b.*\blinkedin\b/i, type: QUERY_TYPES.LINKEDIN_PROFILE },
  // 6. LinkedIn jobs
  { pattern: /\blinkedin\b.*\bjob/i, type: QUERY_TYPES.LINKEDIN_JOBS },
  // 7. Email format inference
  { pattern: /\bemail\s+(format|pattern)\b/i, type: QUERY_TYPES.INFER_EMAIL_FORMAT },
  // 8. Similar companies (either order: "companies similar" or "similar companies")
  { pattern: /\b(similar|like)\b.*\b(compan|startup)/i, type: QUERY_TYPES.SIMILAR_COMPANIES },
  { pattern: /\b(compan|startup)\w*\b.*\b(similar|like)\b/i, type: QUERY_TYPES.SIMILAR_COMPANIES },
  // 9. Deep intel (explicit)
  { pattern: /\b(deep|full|comprehensive)\b.*\b(research|analysis|intel)/i, type: QUERY_TYPES.COMPANY_INTEL_DEEP },
  // 10. Company intel quick (BEFORE financial-keyword DEEP, so "tell me about" wins)
  { pattern: /\b(tell me about|what is|company info|tech stack)\b/i, type: QUERY_TYPES.COMPANY_INTEL_QUICK },
  // 11. Deep intel (financial/regulatory keywords)
  { pattern: /\b(financial|regulatory|funding|runway|filings|revenue)\b/i, type: QUERY_TYPES.COMPANY_INTEL_DEEP },
  // 12. Market trends (BEFORE find person!)
  { pattern: /\b(trends?|markets?|salary|compensation|hiring rate)\b/i, type: QUERY_TYPES.MARKET_TRENDS },
  // 13. Monitor changes
  { pattern: /\b(monitor|alert|notify)\b.*\b(company|role|job|posting|change)/i, type: QUERY_TYPES.MONITOR_CHANGES },
  // 14-15. Find person
  { pattern: /\b(who is|find|hiring manager|VP|head of|director)\b.*\bat\b/i, type: QUERY_TYPES.FIND_PERSON },
  { pattern: /\b(manager|lead|director|VP)\b.*\b(for|of|at)\b/i, type: QUERY_TYPES.FIND_PERSON },
  // 16-17. Discover jobs
  { pattern: /\b(find|search|discover|look for)\b.*\b(job|role|position|opening)/i, type: QUERY_TYPES.DISCOVER_JOBS },
  { pattern: /\b(job|role|position)s?\b.*\b(similar|matching|like)\b/i, type: QUERY_TYPES.DISCOVER_JOBS },
];

// ─── API Source Definitions ─────────────────────────────────────────────────

const API_SOURCES = {
  exa: {
    key_env: 'EXA_API_KEY',
    description: 'Exa semantic search (MCP: web_search_exa, web_fetch_exa)',
  },
  firecrawl: {
    key_env: 'FIRECRAWL_API_KEY',
    description: 'Firecrawl web scraping (MCP: firecrawl_scrape, firecrawl_crawl)',
  },
  brightdata: {
    key_env: 'BRIGHTDATA_API_KEY',
    description: 'Bright Data web scraping & LinkedIn (MCP: brightdata_scrape)',
  },
  valyu: {
    key_env: 'VALYU_API_KEY',
    description: 'Valyu deep research (MCP: valyu_deepsearch)',
  },
  tavily: {
    key_env: 'TAVILY_API_KEY',
    description: 'Tavily search (skill: tavily-search)',
  },
  parallel: {
    key_env: null, // always available — uses other available APIs in parallel
    description: 'Parallel search across available APIs (skill: parallel-web-search)',
  },
  builtin: {
    key_env: null, // always available
    description: 'Built-in WebSearch/WebFetch tools',
  },
};

// ─── Routing Table ──────────────────────────────────────────────────────────

const ROUTING_TABLE = {
  [QUERY_TYPES.FIND_PERSON]: ['exa', 'parallel', 'brightdata', 'tavily', 'builtin'],
  [QUERY_TYPES.FIND_EMAIL]: ['exa', 'parallel', 'tavily', 'builtin'],
  [QUERY_TYPES.DISCOVER_JOBS]: ['exa', 'tavily', 'parallel', 'builtin'],
  [QUERY_TYPES.SCRAPE_URL]: ['firecrawl', 'brightdata', 'builtin'],
  [QUERY_TYPES.COMPANY_INTEL_QUICK]: ['exa', 'tavily', 'parallel', 'builtin'],
  [QUERY_TYPES.COMPANY_INTEL_DEEP]: ['valyu', 'exa', 'parallel', 'tavily', 'builtin'],
  [QUERY_TYPES.SIMILAR_COMPANIES]: ['exa', 'parallel', 'tavily', 'builtin'],
  [QUERY_TYPES.LINKEDIN_PROFILE]: ['brightdata', 'builtin'],
  [QUERY_TYPES.LINKEDIN_JOBS]: ['brightdata', 'exa', 'builtin'],
  [QUERY_TYPES.MARKET_TRENDS]: ['valyu', 'exa', 'tavily', 'parallel', 'builtin'],
  [QUERY_TYPES.MONITOR_CHANGES]: ['firecrawl', 'exa', 'builtin'],
  [QUERY_TYPES.INFER_EMAIL_FORMAT]: ['exa', 'parallel', 'builtin'],
};

// ─── Exports ────────────────────────────────────────────────────────────────

/**
 * Classify a natural-language query into a QUERY_TYPE.
 * Iterates patterns in priority order; first match wins.
 * Falls back to COMPANY_INTEL_QUICK if nothing matches.
 */
export function classifyQuery(query) {
  for (const { pattern, type } of PATTERNS) {
    if (pattern.test(query)) return type;
  }
  return QUERY_TYPES.COMPANY_INTEL_QUICK;
}

/**
 * Return list of available API sources based on env vars.
 * Sources with key_env: null are always available.
 */
export function getAvailableAPIs() {
  const available = [];
  for (const [name, config] of Object.entries(API_SOURCES)) {
    if (config.key_env === null || process.env[config.key_env]) {
      available.push(name);
    }
  }
  return available;
}

/**
 * Build an ordered routing chain for a query type.
 * Filters the ROUTING_TABLE entry by available APIs.
 * Always includes 'builtin' as final fallback.
 */
export function getRoutingChain(queryType) {
  const available = new Set(getAvailableAPIs());
  const table = ROUTING_TABLE[queryType] || ['builtin'];

  const chain = table
    .filter((source) => available.has(source))
    .map((source) => ({
      source,
      description: API_SOURCES[source]?.description || source,
    }));

  // Ensure builtin fallback exists
  if (!chain.some((s) => s.source === 'builtin')) {
    chain.push({
      source: 'builtin',
      description: API_SOURCES.builtin.description,
    });
  }

  return chain;
}

/**
 * Format a human-readable routing plan for a query.
 */
export function formatRoutingInstructions(query) {
  const queryType = classifyQuery(query);
  const chain = getRoutingChain(queryType);

  const LABELS = ['PRIMARY', 'FALLBACK', 'TERTIARY', 'QUATERNARY'];
  const lines = [
    `Query type: ${queryType}`,
    `Routing chain (${chain.length} source${chain.length !== 1 ? 's' : ''}):`,
  ];

  chain.forEach((entry, i) => {
    const label = LABELS[i] || `LEVEL-${i + 1}`;
    lines.push(`  ${label}: ${entry.source} — ${entry.description}`);
  });

  return lines.join('\n');
}
