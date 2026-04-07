/**
 * Tavily source module
 * REST API: https://api.tavily.com
 * Auth: api_key field in request body from TAVILY_API_KEY env var
 */

const BASE_URL = 'https://api.tavily.com';

const COSTS = {
  search: 0.005,
  extract: 0.01,
};

export function isAvailable() {
  return Boolean(process.env.TAVILY_API_KEY);
}

export function estimateCost(queryType) {
  return COSTS[queryType] ?? 0;
}

/**
 * @param {{ type: 'search'|'extract', query?: string, urls?: string[] }} query
 * @returns {Promise<Array<{ title: string, url: string, snippet: string, metadata: object, source: 'tavily' }>>}
 */
export async function execute({ type = 'search', query, urls } = {}) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY environment variable is not set');
  }

  try {
    if (type === 'extract') {
      return await _extract(apiKey, urls);
    }
    return await _search(apiKey, query);
  } catch {
    return [];
  }
}

async function _search(apiKey, query) {
  const url = `${BASE_URL}/search`;
  const body = {
    api_key: apiKey,
    query,
    max_results: 10,
    search_depth: 'basic',
    include_raw_content: false,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  const results = data.results ?? [];

  return results.map((r) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    snippet: r.content ?? '',
    metadata: {},
    source: 'tavily',
  }));
}

async function _extract(apiKey, urls) {
  const url = `${BASE_URL}/extract`;
  const body = {
    api_key: apiKey,
    urls,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  const results = data.results ?? [];

  return results.map((r) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    snippet: r.raw_content ?? '',
    metadata: {},
    source: 'tavily',
  }));
}
