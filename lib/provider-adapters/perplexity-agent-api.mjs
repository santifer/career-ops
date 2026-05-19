/**
 * lib/provider-adapters/perplexity-agent-api.mjs — Perplexity Sonar Deep
 * Research adapter (Phase 2).
 *
 * Verified API behavior (WebFetch docs.perplexity.ai/api-reference/chat-
 * completions-post + cross-ref to lib/council.mjs:736 as of 2026-05-19):
 *   - POST https://api.perplexity.ai/chat/completions
 *   - Auth: `Authorization: Bearer <PERPLEXITY_API_KEY>`
 *   - Models: sonar, sonar-pro, sonar-deep-research, sonar-reasoning-pro
 *   - Web-search options: search_mode (web|academic|sec), web_search_options
 *     {search_type: fast|pro|auto, search_context_size: low|medium|high}
 *   - Response.citations: array of URL strings (Sources used by the model)
 *
 * Adapter contract returns:
 *   { ok, contentJson, costUsd, providerMetadata, sourceUrls, model }
 *
 * If PERPLEXITY_API_KEY is missing, returns ok:false with explicit
 * NEEDS_HUMAN error pointing to the .env requirement (per Phase 2
 * NEEDS_HUMAN protocol).
 */

const ENDPOINT = 'https://api.perplexity.ai/chat/completions';

const PRICING = {
  // Per Perplexity public pricing page (verified 2026-05-19):
  // sonar-pro: $3 input / $15 output / $6 search per 1M
  // sonar-deep-research: $5 input / $5 output (search inclusive)
  // sonar-reasoning-pro: $2 input / $8 output / $5 search per 1M
  // sonar:  $1 input / $1 output (search inclusive)
  'sonar':                 { input: 1.0, output: 1.0 },
  'sonar-pro':             { input: 3.0, output: 15.0 },
  'sonar-deep-research':   { input: 5.0, output: 5.0 },
  'sonar-reasoning-pro':   { input: 2.0, output: 8.0 },
};

/**
 * Refresh one cache via Perplexity Sonar Deep Research (default) — high
 * citation density for toxicity_composite + company_pulse caches.
 *
 * Optional opts:
 *   - model:        override default 'sonar-deep-research'
 *   - searchMode:   'web' (default) | 'academic' | 'sec'
 *   - contextSize:  'low' | 'medium' | 'high' (default)
 *   - maxTokens:    default 4000
 *   - promptBuilder: (cache, row) → string
 *   - systemPrompt: override default research-framing prompt
 */
export async function refresh(cache, row, opts = {}) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      errors: ['NEEDS_HUMAN: PERPLEXITY_API_KEY not set in .env. Add it and retry.'],
      providerMetadata: { stub: false, missing_env: 'PERPLEXITY_API_KEY' },
      model: opts.model || 'sonar-deep-research',
    };
  }

  const t0 = Date.now();
  const model = opts.model || 'sonar-deep-research';
  const systemPrompt = opts.systemPrompt
    || `You are a research adapter for Mitchell's career-ops refresh pipeline. Return STRICT JSON matching the requested schema. Every factual claim MUST be backed by a URL from your search results. As of ${new Date().toISOString().slice(0, 10)}.`;
  const userPrompt = opts.promptBuilder ? opts.promptBuilder(cache, row) : defaultPrompt(cache, row);

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: opts.maxTokens || 4000,
    search_mode: opts.searchMode || 'web',
    web_search_options: {
      search_context_size: opts.contextSize || 'high',
    },
  };

  let r;
  try {
    r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    return {
      ok: false,
      errors: [`Perplexity fetch error: ${String(e.message || e)}`],
      providerMetadata: { latency_ms: Date.now() - t0, model },
      model,
    };
  }

  if (!r.ok) {
    const txt = (await r.text()).slice(0, 480);
    return {
      ok: false,
      errors: [`Perplexity HTTP ${r.status}: ${txt}`],
      providerMetadata: { latency_ms: Date.now() - t0, http: r.status, model },
      model,
    };
  }

  const j = await r.json();
  const content = j.choices?.[0]?.message?.content || '';
  const inputTokens = j.usage?.prompt_tokens || j.usage?.input_tokens || 0;
  const outputTokens = j.usage?.completion_tokens || j.usage?.output_tokens || 0;
  const totalTokens = j.usage?.total_tokens || (inputTokens + outputTokens);

  const p = PRICING[model] || { input: 5.0, output: 5.0 };
  const costUsd =
    (inputTokens / 1_000_000) * p.input +
    (outputTokens / 1_000_000) * p.output;

  const citations = Array.isArray(j.citations) ? j.citations.filter(c => typeof c === 'string') : [];
  const parsed = safeParseJson(content);

  return {
    ok: !!parsed,
    contentJson: parsed,
    costUsd,
    providerMetadata: {
      latency_ms: Date.now() - t0,
      tokens: totalTokens,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      search_mode: body.search_mode,
      context_size: body.web_search_options.search_context_size,
      model,
      raw_content_length: content.length,
    },
    sourceUrls: citations,
    model,
  };
}

function defaultPrompt(cache, row) {
  return `Refresh cache "${cache.id}" for row #${row.num || '?'} (${row.company} — ${row.role}).\nReturn strict JSON matching the cache's documented schema. Every fact MUST carry a source URL.`;
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
