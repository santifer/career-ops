/**
 * Built-in fallback source module
 * Always available, no API key needed, cost always $0
 */

export function isAvailable() {
  return true;
}

export function estimateCost(_queryType) {
  return 0;
}

export async function execute(query) {
  const { query: q, type = 'search' } = query;

  return [
    {
      title: `[builtin] ${type}: ${q}`,
      url: '',
      snippet: `Use WebSearch/WebFetch to research: ${q}`,
      metadata: {
        requiresManualExecution: true,
        suggestedTool: type === 'scrape' ? 'WebFetch' : 'WebSearch',
      },
      source: 'builtin',
    },
  ];
}
