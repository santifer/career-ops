/**
 * lib/provider-adapters/anthropic-sonnet.mjs — Anthropic Sonnet 4.6 adapter.
 *
 * Default adapter for refresh-master caches when no per-cache provider is
 * specified. Uses callAnthropicCached so the stable Mitchell corpus
 * (cv.md + modes/_profile.md + voice baseline) is cached across calls.
 *
 * Contract returns:
 *   ok, contentJson, costUsd, providerMetadata, sourceUrls, model
 */

import { callAnthropicCached, buildDefaultStableCorpus } from '../anthropic-cache-helper.mjs';

/**
 * Refresh one row's cache via Sonnet.
 * @param {object} cache  - cache descriptor from refresh-cache-registry
 * @param {object} row    - apply-now-queue row
 * @param {object} opts   - { promptBuilder?, schema?, maxTokens?, signal? }
 * @returns {Promise<{ok, contentJson, costUsd, providerMetadata, sourceUrls, model}>}
 */
export async function refresh(cache, row, opts = {}) {
  const t0 = Date.now();
  const corpus = buildDefaultStableCorpus({
    files: opts.stableFiles || ['cv.md', 'modes/_profile.md', 'article-digest.md'],
  });

  // Caller may supply a custom prompt builder; default is a generic refresh
  // prompt that asks for the cache schema in strict JSON. Most callers will
  // provide their own (intel-refresh, hm-research, etc).
  const varyingPrompt = opts.promptBuilder
    ? opts.promptBuilder(cache, row)
    : defaultPrompt(cache, row);

  const systemPrompt = opts.systemPrompt
    || 'You are a research adapter for Mitchell\'s career-ops refresh pipeline. Always return STRICT JSON matching the requested schema. Cite every factual claim with a source URL.';

  let response;
  try {
    response = await callAnthropicCached({
      model: 'claude-sonnet-4-6',
      systemPrompt,
      stableCorpus: [corpus.text],
      varyingPrompt,
      maxTokens: opts.maxTokens || 3000,
      caller: opts.caller || `provider-adapters:anthropic-sonnet:${cache.id}`,
      signal: opts.signal,
    });
  } catch (e) {
    return {
      ok: false,
      errors: [String(e.message || e)],
      providerMetadata: { latency_ms: Date.now() - t0, model: 'claude-sonnet-4-6' },
      model: 'claude-sonnet-4-6',
    };
  }

  const parsed = safeParseJson(response.content);
  const sourceUrls = extractSourceUrls(parsed, response.content);

  return {
    ok: !!parsed,
    contentJson: parsed,
    costUsd: response.costUsd || 0,
    providerMetadata: {
      latency_ms: Date.now() - t0,
      cache_hit_rate: response.cacheHitRate,
      cached: response.cached,
      cache_stats: response.cacheStats,
      raw_content_length: response.content.length,
      model: 'claude-sonnet-4-6',
    },
    sourceUrls,
    model: 'claude-sonnet-4-6',
  };
}

function defaultPrompt(cache, row) {
  return `Refresh cache "${cache.id}" for row #${row.num || '?'} (${row.company} — ${row.role}).\nReturn strict JSON matching the cache's documented schema.`;
}

function safeParseJson(content) {
  if (!content) return null;
  const t = String(content).trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    try { return JSON.parse(t); } catch { /* fallthrough */ }
  }
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch { /* fallthrough */ }
  }
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(t.slice(first, last + 1)); } catch { return null; }
  }
  return null;
}

function extractSourceUrls(parsed, raw) {
  const urls = new Set();
  // Common schema patterns: sources, source_urls, citations
  if (parsed) {
    const walk = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj)) {
        if (Array.isArray(v) && /^(sources?|source_urls|citations?|urls?|evidence_urls?)$/i.test(k)) {
          for (const u of v) {
            const url = typeof u === 'string' ? u : (u?.url || u?.href || '');
            if (typeof url === 'string' && /^https?:\/\//.test(url)) urls.add(url);
          }
        } else if (typeof v === 'string' && /^https?:\/\/\S+$/.test(v)) {
          urls.add(v);
        } else if (typeof v === 'object') {
          walk(v);
        }
      }
    };
    walk(parsed);
  }
  // Fallback: regex over raw content for bare URLs
  if (urls.size === 0 && raw) {
    const re = /https?:\/\/[^\s<>"'\)\]\}]+/g;
    const matches = raw.match(re) || [];
    for (const u of matches.slice(0, 20)) urls.add(u);
  }
  return Array.from(urls);
}
