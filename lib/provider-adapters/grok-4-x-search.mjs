/**
 * lib/provider-adapters/grok-4-x-search.mjs — xAI Grok-4 with live web + X
 * (Twitter) search adapter (Phase 2).
 *
 * Verified API behavior (WebFetch docs.x.ai/docs/api-reference 2026-05-19 +
 * cross-ref to lib/council.mjs:218,857 which already calls Grok with live
 * search):
 *   - POST https://api.x.ai/v1/chat/completions
 *   - Auth: `Authorization: Bearer <XAI_API_KEY>`
 *   - Live search via search_parameters: { mode: 'on'|'auto'|'off', sources:
 *     [{type:'web'},{type:'x'}], return_citations: true }
 *   - Response.citations: array of URL strings (Sources used by the model)
 *
 * EPSILON's morning-handoff 2026-05-19 flagged a regression where Grok-x-
 * search returned 0 citations on both ATS-landscape attempts. The adapter
 * surfaces citation count in providerMetadata so callers can detect the
 * regression and fall back to perplexity-agent-api if citations.length === 0.
 *
 * Adapter contract returns:
 *   { ok, contentJson, costUsd, providerMetadata, sourceUrls, model }
 */

const ENDPOINT = 'https://api.x.ai/v1/chat/completions';

const PRICING = {
  // Per lib/council.mjs MODEL_COST_RATES (verified blend per xAI public pricing):
  'grok-4-1-fast-reasoning':  { input: 1.0, output: 5.0 },
  'grok-4':                    { input: 3.0, output: 15.0 },
};

export async function refresh(cache, row, opts = {}) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      errors: ['NEEDS_HUMAN: XAI_API_KEY not set in .env. Add it and retry.'],
      providerMetadata: { stub: false, missing_env: 'XAI_API_KEY' },
      model: opts.model || 'grok-4-1-fast-reasoning',
    };
  }

  const t0 = Date.now();
  const model = opts.model || 'grok-4-1-fast-reasoning';
  const systemPrompt = opts.systemPrompt
    || `You are a research adapter for Mitchell's career-ops refresh pipeline. Use live web AND X/Twitter search aggressively. Return STRICT JSON matching the requested schema. Every factual claim MUST be backed by a URL — return them in the citations array. As of ${new Date().toISOString().slice(0, 10)}.`;
  const userPrompt = opts.promptBuilder ? opts.promptBuilder(cache, row) : defaultPrompt(cache, row);

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_completion_tokens: opts.maxTokens || 4000,
    search_parameters: {
      mode: opts.searchMode || 'on',
      sources: opts.sources || [{ type: 'web' }, { type: 'x' }],
      return_citations: true,
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
      // Phase A.0 hardening: default 2-min ceiling so adapter calls without caller signal don't idle.
      signal: opts.signal ?? AbortSignal.timeout(120_000),
    });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return {
        ok: false,
        errors: ['xAI fetch TIMEOUT after 120000ms — slow upstream; not retrying'],
        providerMetadata: { latency_ms: Date.now() - t0, model, timed_out: true },
        model,
      };
    }
    return {
      ok: false,
      errors: [`xAI fetch error: ${String(e.message || e)}`],
      providerMetadata: { latency_ms: Date.now() - t0, model },
      model,
    };
  }

  if (!r.ok) {
    const txt = (await r.text()).slice(0, 480);
    return {
      ok: false,
      errors: [`xAI HTTP ${r.status}: ${txt}`],
      providerMetadata: { latency_ms: Date.now() - t0, http: r.status, model },
      model,
    };
  }

  const j = await r.json();
  const content = j.choices?.[0]?.message?.content || '';
  const inputTokens = j.usage?.prompt_tokens || 0;
  const outputTokens = j.usage?.completion_tokens || 0;
  const totalTokens = j.usage?.total_tokens || (inputTokens + outputTokens);

  const p = PRICING[model] || PRICING['grok-4-1-fast-reasoning'];
  const costUsd =
    (inputTokens / 1_000_000) * p.input +
    (outputTokens / 1_000_000) * p.output;

  const citations = Array.isArray(j.citations) ? j.citations.filter(c => typeof c === 'string') : [];
  const parsed = safeParseJson(content);

  // 2026-05-19 EPSILON regression: live-search returning 0 citations.
  // Surface this so verifier-lane / orchestrator can fall back to Perplexity.
  const regressionFlag = citations.length === 0 && opts.searchMode !== 'off';

  return {
    ok: !!parsed && !regressionFlag,
    contentJson: parsed,
    costUsd,
    providerMetadata: {
      latency_ms: Date.now() - t0,
      tokens: totalTokens,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      search_mode: body.search_parameters.mode,
      sources: body.search_parameters.sources.map(s => s.type),
      citations_count: citations.length,
      regression_flag_zero_citations: regressionFlag,
      model,
      raw_content_length: content.length,
    },
    sourceUrls: citations,
    model,
    errors: regressionFlag
      ? [`grok-4-x-search regression: 0 citations returned (EPSILON 2026-05-19 known issue). Verifier should re-route to perplexity-agent-api or fall back to anthropic-sonnet.`]
      : undefined,
  };
}

function defaultPrompt(cache, row) {
  return `Refresh cache "${cache.id}" for row #${row.num || '?'} (${row.company} — ${row.role}).\nUse live web + X/Twitter search. Return strict JSON. Every fact MUST carry a URL citation.`;
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
