/**
 * Valyu source module
 * API: https://api.valyu.network/v1
 */

const BASE_URL = 'https://api.valyu.network/v1';

const COSTS = {
  deepsearch: 0.02,
};

export function isAvailable() {
  return Boolean(process.env.VALYU_API_KEY);
}

export function estimateCost(queryType) {
  return COSTS[queryType] ?? 0;
}

export async function execute(query) {
  const apiKey = process.env.VALYU_API_KEY;
  if (!apiKey) throw new Error('VALYU_API_KEY is not set');

  const { query: q } = query;

  try {
    const res = await fetch(`${BASE_URL}/deepsearch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: q,
        search_type: 'all',
        max_num_results: 10,
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const items = data.results || [];

    return items.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content || r.text || '',
      metadata: {
        dataSource: r.source,
        relevanceScore: r.relevance_score,
      },
      source: 'valyu',
    }));
  } catch {
    return [];
  }
}
