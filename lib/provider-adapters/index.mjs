/**
 * lib/provider-adapters/index.mjs — Provider-adapter registry.
 *
 * Design source: refresh-master Phase 1.5 deliverable 3 (provider field on
 * cache registry) + Phase 2 deliverable 1 (real Perplexity Agent +
 * Grok-x adapters). This module is the dispatch table.
 *
 * Adapter contract:
 *   async refresh(cache, row, opts) → {
 *     ok, contentJson, costUsd, providerMetadata, sourceUrls, model,
 *     verifierHint?,  // string hint about whether output should be cross-verified
 *     errors?,        // [string]
 *   }
 *
 * Adapters MUST:
 *   - return source_urls (≥1 citation per 100 tokens of output content)
 *   - return retrieved_at (ISO-8601 timestamp)
 *   - return providerMetadata.model (resolved model id used)
 *   - never write the cache themselves — that's the orchestrator's job (so
 *     cache-write-validator can gate writes)
 *
 * Phase 1.5: Anthropic adapter fully real; Perplexity + Grok stubs return
 * NOT_IMPLEMENTED to force Phase 2 to upgrade them before flipping caches.
 */

import * as anthropicSonnet from './anthropic-sonnet.mjs';
import * as perplexityAgent from './perplexity-agent-api.mjs';
import * as grokXSearch from './grok-4-x-search.mjs';

export const ADAPTERS = {
  'anthropic-sonnet':    anthropicSonnet,
  'perplexity-agent':    perplexityAgent,
  'grok-4-x-search':     grokXSearch,
};

export function getAdapter(providerName) {
  return ADAPTERS[providerName] || null;
}

export function listProviders() {
  return Object.keys(ADAPTERS);
}
