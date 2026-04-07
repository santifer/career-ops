/**
 * Parallel AI source module
 * API: https://api.parallel.ai/v1beta
 */

const BASE_URL = 'https://api.parallel.ai/v1beta';

const COSTS = {
  search: 0.01,
  findAll: 0.02,
  extract: 0.005,
  enrich: 0.03,
};

export function isAvailable() {
  return Boolean(process.env.PARALLEL_API_KEY);
}

export function estimateCost(queryType) {
  return COSTS[queryType] ?? 0;
}

async function apiCall(apiKey, endpoint, body) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function execute(query) {
  const apiKey = process.env.PARALLEL_API_KEY;
  if (!apiKey) throw new Error('PARALLEL_API_KEY is not set');

  const { query: q, type = 'search', urls, items, fields } = query;

  try {
    let data;
    let results = [];

    switch (type) {
      case 'search': {
        data = await apiCall(apiKey, '/search', { query: q, max_results: 10 });
        if (!data) return [];
        results = (data.results || []).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.summary || r.description || '',
          metadata: {},
          source: 'parallel',
        }));
        break;
      }

      case 'findAll': {
        data = await apiCall(apiKey, '/findAll', { query: q, max_results: 20 });
        if (!data) return [];
        results = (data.results || []).map((r) => ({
          title: r.name || r.title,
          url: r.url,
          snippet: r.description || '',
          metadata: {},
          source: 'parallel',
        }));
        break;
      }

      case 'extract': {
        data = await apiCall(apiKey, '/extract', { urls });
        if (!data) return [];
        results = (data.results || []).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content || r.text || '',
          metadata: {},
          source: 'parallel',
        }));
        break;
      }

      case 'enrich': {
        data = await apiCall(apiKey, '/findAll/enrich', { items, fields });
        if (!data) return [];
        results = (data.results || []).map((r) => {
          const { name, url, description, ...rest } = r;
          return {
            title: name,
            url,
            snippet: description || '',
            metadata: rest,
            source: 'parallel',
          };
        });
        break;
      }

      default: {
        // Unknown type falls back to search
        data = await apiCall(apiKey, '/search', { query: q, max_results: 10 });
        if (!data) return [];
        results = (data.results || []).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.summary || r.description || '',
          metadata: {},
          source: 'parallel',
        }));
        break;
      }
    }

    return results;
  } catch {
    return [];
  }
}
