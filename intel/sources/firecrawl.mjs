/**
 * Firecrawl source module
 * REST API: https://api.firecrawl.dev/v1
 * Auth: Authorization: Bearer {key} from FIRECRAWL_API_KEY env var
 */

const BASE_URL = 'https://api.firecrawl.dev/v1';
const CRAWL_POLL_INTERVAL_MS = 2000;
const CRAWL_TIMEOUT_MS = 30000;

const COSTS = {
  scrape: 0.002,
  crawl: 0.01,
};

export function isAvailable() {
  return Boolean(process.env.FIRECRAWL_API_KEY);
}

export function estimateCost(queryType) {
  return COSTS[queryType] ?? 0;
}

/**
 * @param {{ type: 'scrape'|'crawl', url: string }} query
 * @returns {Promise<Array<{ title: string, url: string, snippet: string, metadata: object, source: 'firecrawl' }>>}
 */
export async function execute({ type = 'scrape', url } = {}) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error('FIRECRAWL_API_KEY environment variable is not set');
  }

  try {
    if (type === 'crawl') {
      return await _crawl(apiKey, url);
    }
    return await _scrape(apiKey, url);
  } catch {
    return [];
  }
}

function _authHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

function _normalizeItem(item) {
  return {
    title: item.metadata?.title ?? '',
    url: item.metadata?.sourceURL ?? '',
    snippet: item.markdown ?? '',
    metadata: item.metadata ?? {},
    source: 'firecrawl',
  };
}

async function _scrape(apiKey, url) {
  const response = await fetch(`${BASE_URL}/scrape`, {
    method: 'POST',
    headers: _authHeaders(apiKey),
    body: JSON.stringify({ url, formats: ['markdown'] }),
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  if (!data.success || !data.data) {
    return [];
  }

  return [_normalizeItem(data.data)];
}

async function _crawl(apiKey, url) {
  // Start the crawl job
  const startResponse = await fetch(`${BASE_URL}/crawl`, {
    method: 'POST',
    headers: _authHeaders(apiKey),
    body: JSON.stringify({
      url,
      limit: 5,
      scrapeOptions: { formats: ['markdown'] },
    }),
  });

  if (!startResponse.ok) {
    return [];
  }

  const startData = await startResponse.json();
  const jobId = startData.id;

  if (!jobId) {
    return [];
  }

  // Poll for completion
  const deadline = Date.now() + CRAWL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await _sleep(CRAWL_POLL_INTERVAL_MS);

    const pollResponse = await fetch(`${BASE_URL}/crawl/${jobId}`, {
      headers: _authHeaders(apiKey),
    });

    if (!pollResponse.ok) {
      return [];
    }

    const pollData = await pollResponse.json();

    if (pollData.status === 'completed') {
      const items = pollData.data ?? [];
      return items.map(_normalizeItem);
    }

    if (pollData.status === 'failed') {
      return [];
    }
    // status === 'scraping' or similar — keep polling
  }

  // Timed out
  return [];
}

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
