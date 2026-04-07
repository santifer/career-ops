/**
 * Exa source module
 * REST API: https://api.exa.ai
 * Auth: x-api-key header from EXA_API_KEY env var
 */

const BASE_URL = 'https://api.exa.ai';

const COSTS = {
  search: 0.005,
  findSimilar: 0.005,
  getContents: 0.002,
};

export function isAvailable() {
  return Boolean(process.env.EXA_API_KEY);
}

export function estimateCost(queryType) {
  return COSTS[queryType] ?? 0;
}

/**
 * @param {{ type: 'search'|'findSimilar', query: string, numResults?: number, searchType?: string, extras?: object }} query
 * @returns {Promise<Array<{ title: string, url: string, snippet: string, metadata: object, source: 'exa' }>>}
 */
export async function execute({ type = 'search', query, numResults = 10, searchType, extras = {} } = {}) {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    throw new Error('EXA_API_KEY environment variable is not set');
  }

  const endpoint = type === 'findSimilar' ? '/findSimilar' : '/search';
  const url = `${BASE_URL}${endpoint}`;

  const body = {
    query,
    numResults,
    type: searchType ?? 'auto',
    contents: { text: true },
    ...extras,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
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
      snippet: r.text || r.highlight || '',
      metadata: {
        score: r.score,
        publishedDate: r.publishedDate,
        author: r.author,
      },
      source: 'exa',
    }));
  } catch {
    return [];
  }
}
