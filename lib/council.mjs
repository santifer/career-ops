/**
 * lib/council.mjs — Multi-model council client.
 *
 * Calls every premium reasoning model whose API key is set in the env,
 * in parallel, and returns each response normalized to:
 *   { model, content, error, tokens, costUsd, ms }
 *
 * Used by:
 *   - scripts/overpay-signals.mjs (cross-check equity signals)
 *   - scripts/grok-research.mjs (council augmentation)
 *   - any future script that wants multi-model coverage
 *
 * Wired models (auto-detected from env at startup):
 *   - perplexity:sonar-deep-research   (PERPLEXITY_API_KEY)
 *   - perplexity:sonar-reasoning-pro   (PERPLEXITY_API_KEY)
 *   - xai:grok-4-3                     (XAI_API_KEY) — Grok 4.3, current heavy
 *   - xai:grok-4                       (XAI_API_KEY) — fallback
 *   - xai:grok-4-fast-reasoning        (XAI_API_KEY)
 *   - openai:gpt-5                     (OPENAI_API_KEY) — w/ 429 backoff
 *   - openai:o1                        (OPENAI_API_KEY) — fallback
 *   - google:gemini-2.5-pro            (GEMINI_API_KEY)
 *   - anthropic:claude-opus-4-7        (ANTHROPIC_API_KEY) — usually skipped (session model)
 *
 * No external deps — uses native fetch (Node >= 18).
 */

const PROVIDERS = {
  // Perplexity — deep-research mode is multi-step, can take 1-3min.
  'perplexity:sonar-deep-research': {
    envKey: 'PERPLEXITY_API_KEY',
    timeout: 240_000, // 4 min
    async call(prompt, key, opts = {}) {
      const r = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'sonar-deep-research',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: opts.maxTokens ?? 4000,
        }),
        signal: opts.signal,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 240)}`);
      const j = await r.json();
      return {
        content: j.choices?.[0]?.message?.content || '',
        tokens: j.usage?.total_tokens || 0,
        citations: j.citations || [],
      };
    },
  },
  'perplexity:sonar-reasoning-pro': {
    envKey: 'PERPLEXITY_API_KEY',
    timeout: 90_000,
    async call(prompt, key, opts = {}) {
      const r = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'sonar-reasoning-pro',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: opts.maxTokens ?? 3000,
        }),
        signal: opts.signal,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 240)}`);
      const j = await r.json();
      return {
        content: j.choices?.[0]?.message?.content || '',
        tokens: j.usage?.total_tokens || 0,
        citations: j.citations || [],
      };
    },
  },

  // xAI Grok — grok-4 access requires SuperGrok/console permission. Auto-skips
  // to grok-3 / grok-2 if the account doesn't have grok-4. The grok-4-fast-reasoning
  // entry below is the always-on workhorse.
  'xai:grok-4': {
    envKey: 'XAI_API_KEY',
    timeout: 120_000,
    optional: true, // skip silently if all variants 404 — grok-4-fast-reasoning carries this provider
    async call(prompt, key, opts = {}) {
      // Fallback chain. 2026-05-17 web-verified per https://docs.x.ai/developers/models/grok-4.3:
      //   - 'grok-4.3' = current heavy (1M context, native video input, always-on
      //     reasoning, ~40% cheaper than Grok 4.20). DOT-separated slug, not dash.
      //   - 'grok-4.20-0309-reasoning' = heavier reasoning variant
      //   - 'grok-4' / 'grok-4-fast' / 'grok-4-1-fast' = retired May 15, 2026;
      //     requests redirect to grok-4.3 pricing. Kept as last-resort fallbacks
      //     for accounts still on legacy aliases.
      for (const model of ['grok-4.3', 'grok-4.20-0309-reasoning', 'grok-4', 'grok-3']) {
        const r = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: opts.maxTokens ?? 3000,
          }),
          signal: opts.signal,
        });
        if (r.ok) {
          const j = await r.json();
          return { content: j.choices?.[0]?.message?.content || '', tokens: j.usage?.total_tokens || 0, modelUsed: model };
        }
        if (r.status !== 404) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 240)}`);
      }
      throw new Error('xAI: no accessible heavy grok model on this account (grok-4-fast-reasoning is still wired separately)');
    },
  },
  'xai:grok-4-fast-reasoning': {
    envKey: 'XAI_API_KEY',
    timeout: 60_000,
    async call(prompt, key, opts = {}) {
      // 2026-05-17 web-verified: 'grok-4-fast-reasoning' retired May 15, 2026 and
      // redirects to grok-4.3 pricing. The non-reasoning variant 'grok-4.20-0309-non-reasoning'
      // is the closest current analog for fast structured-output use cases.
      // Try the new slug first, fall back to the legacy alias.
      for (const model of ['grok-4.20-0309-non-reasoning', 'grok-4-fast-reasoning']) {
        const r = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: opts.maxTokens ?? 2500,
          }),
          signal: opts.signal,
        });
        if (r.ok) {
          const j = await r.json();
          return { content: j.choices?.[0]?.message?.content || '', tokens: j.usage?.total_tokens || 0, modelUsed: model };
        }
        if (r.status !== 404 && r.status !== 400) {
          throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 240)}`);
        }
      }
      throw new Error('xAI: neither grok-4.20-0309-non-reasoning nor grok-4-fast-reasoning accessible on this account');
    },
  },

  // Grok via the Responses API with web_search + x_search tools — best
  // signal for "what employees ACTUALLY say about comp/benefits/team-toxicity"
  // since X has indexed Blind / anon-startup-comms / cscareerquestions threads
  // better than any standalone search engine. Use this for the social-
  // corroboration pass that runs after the primary council pass.
  'xai:grok-4-x-search': {
    envKey: 'XAI_API_KEY',
    timeout: 120_000,
    optional: true, // skip-on-fail when account doesn't have x_search perms
    async call(prompt, key, opts = {}) {
      const r = await fetch('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'grok-4-fast-reasoning',
          input: [{ role: 'user', content: prompt }],
          tools: [
            { type: 'web_search' },
            { type: 'x_search' },
          ],
        }),
        signal: opts.signal,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 240)}`);
      const j = await r.json();
      // Responses API returns content in either output_text (legacy) or
      // output[].content[].text (new). Mirror grok-research.mjs's helper.
      let content = j.output_text || '';
      if (!content && Array.isArray(j.output)) {
        const texts = [];
        for (const item of j.output) {
          if (item.type === 'message' && Array.isArray(item.content)) {
            for (const c of item.content) {
              if ((c.type === 'output_text' || c.type === 'text') && c.text) texts.push(c.text);
            }
          }
        }
        content = texts.join('\n');
      }
      return {
        content,
        tokens: j.usage?.total_tokens || 0,
        citations: j.citations || [],
        modelUsed: 'grok-4-fast-reasoning+web_search+x_search',
      };
    },
  },

  // OpenAI
  'openai:gpt-5': {
    envKey: 'OPENAI_API_KEY',
    timeout: 180_000, // bumped from 120s — gpt-5 with deep thinking can run long
    async call(prompt, key, opts = {}) {
      // 429-retry helper added 2026-05-16: OpenAI 429s killed all 17 HM intel
      // runs from a parallel session. Now: exponential backoff (1s → 2s → 4s →
      // 8s → 16s, jittered ±10%), max 5 attempts, then surface the failure.
      async function callWithBackoff(url, body, attempt = 1) {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: opts.signal,
        });
        if (r.status === 429 && attempt <= 5) {
          // Honor Retry-After header when present; otherwise exponential backoff.
          const retryAfter = parseInt(r.headers.get('retry-after') || '0', 10);
          const baseMs = retryAfter > 0 ? retryAfter * 1000 : Math.pow(2, attempt - 1) * 1000;
          const jitterMs = baseMs * (0.9 + Math.random() * 0.2);
          await new Promise(res => setTimeout(res, jitterMs));
          return callWithBackoff(url, body, attempt + 1);
        }
        return r;
      }
      const r = await callWithBackoff('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-5',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: opts.maxTokens ?? 3000,
      });
      if (!r.ok) {
        // Fallback to o1 if gpt-5 isn't available on this account.
        if (r.status === 404 || r.status === 400) {
          const r2 = await callWithBackoff('https://api.openai.com/v1/chat/completions', {
            model: 'o1',
            messages: [{ role: 'user', content: prompt }],
            max_completion_tokens: opts.maxTokens ?? 3000,
          });
          if (!r2.ok) throw new Error(`HTTP ${r2.status}: ${(await r2.text()).slice(0, 240)}`);
          const j2 = await r2.json();
          return { content: j2.choices?.[0]?.message?.content || '', tokens: j2.usage?.total_tokens || 0, modelUsed: 'o1' };
        }
        throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 240)}`);
      }
      const j = await r.json();
      return { content: j.choices?.[0]?.message?.content || '', tokens: j.usage?.total_tokens || 0 };
    },
  },

  // Google Gemini — defaults to GROUNDED with Google Search so factual queries
  // (valuations, recent funding rounds, posting dates) hit real data instead of
  // training-set hallucinations. Pass opts.grounded === false to disable.
  // Critical lesson from 2026-05-10 equity cross-check: ungrounded Gemini
  // hallucinated OpenAI ($250B vs real $852B), Anthropic ($75B vs $380B),
  // Cursor ($4B vs $50B). Grounding fixes this.
  'google:gemini-2.5-pro': {
    envKey: 'GEMINI_API_KEY',
    timeout: 180_000, // grounded calls take longer due to search round-trips
    async call(prompt, key, opts = {}) {
      // 2026-05-17 — Mitchell wants Gemini 3.1 Pro when it makes sense.
      // gemini-3.1-pro-preview is GA-equivalent (live API 200, thinking_level
      // defaults to HIGH per Google's Gemini 3 docs). Fall through to
      // gemini-2.5-pro on 404 so the council stays alive if Google flips the
      // preview slug.
      const tryModel = async (modelId, modelLabel) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(key)}`;
        const body = {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: opts.maxTokens ?? 3000 },
        };
        // Gemini 3 uses thinking_level (minimal/low/medium/high), default high.
        // Mitchell chose high explicitly so we don't pin it; passes through
        // when the model is 3.x. For 2.5 fallback the param is silently ignored.
        if (opts.thinkingLevel) {
          body.generationConfig.thinking_level = opts.thinkingLevel;
        }
        if (opts.grounded !== false) {
          body.tools = [{ google_search: {} }];
        }
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: opts.signal,
        });
        if (!r.ok) {
          const errTxt = (await r.text()).slice(0, 300);
          // Older API names the tool `google_search_retrieval` — auto-retry.
          if (errTxt.includes('google_search') && opts.grounded !== false) {
            body.tools = [{ google_search_retrieval: {} }];
            const r2 = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
              signal: opts.signal,
            });
            if (!r2.ok) throw new Error(`HTTP ${r2.status}: ${(await r2.text()).slice(0, 240)}`);
            const j2 = await r2.json();
            const content = (j2.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
            const tokens = (j2.usageMetadata?.totalTokenCount) || 0;
            return { content, tokens, grounded: true, modelUsed: `${modelLabel}+google_search_retrieval` };
          }
          throw new Error(`HTTP ${r.status}: ${errTxt}`);
        }
        const j = await r.json();
        const content = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
        const tokens = (j.usageMetadata?.totalTokenCount) || 0;
        const grounded = !!j.candidates?.[0]?.groundingMetadata;
        return { content, tokens, grounded, modelUsed: grounded ? `${modelLabel}+google_search` : modelLabel };
      };

      try {
        return await tryModel('gemini-3.1-pro-preview', 'gemini-3.1-pro-preview');
      } catch (e) {
        if (/HTTP 404|model.*not.*found/i.test(String(e.message || e))) {
          return await tryModel('gemini-2.5-pro', 'gemini-2.5-pro');
        }
        throw e;
      }
    },
  },
};

/**
 * callCouncil({ prompt, models?, opts? })
 *   prompt:  string sent verbatim to every model
 *   models:  optional array of provider:model keys (default = all whose keys are set)
 *   opts:    { maxTokens, signal, includeMissingKeys=false }
 *
 * Returns { results: [{ model, content, error, tokens, ms, modelUsed? }], missingKeys, totalMs }
 * Calls run in parallel with Promise.allSettled — one error never blocks the others.
 */
export async function callCouncil({ prompt, models, opts = {} } = {}) {
  if (!prompt) throw new Error('callCouncil: prompt is required');
  const t0 = Date.now();

  const wantedModels = models && models.length
    ? models
    : Object.keys(PROVIDERS);

  const missingKeys = [];
  const fireable = wantedModels.filter(name => {
    const provider = PROVIDERS[name];
    if (!provider) return false;
    if (!process.env[provider.envKey]) {
      missingKeys.push({ model: name, missingEnvVar: provider.envKey });
      return false;
    }
    return true;
  });

  const tasks = fireable.map(async (name) => {
    const t1 = Date.now();
    const provider = PROVIDERS[name];
    const key = process.env[provider.envKey];
    const signal = AbortSignal.timeout(provider.timeout);
    try {
      const r = await provider.call(prompt, key, { ...opts, signal });
      return { model: name, content: r.content, tokens: r.tokens, citations: r.citations, modelUsed: r.modelUsed, ms: Date.now() - t1 };
    } catch (e) {
      return { model: name, content: '', error: String(e.message || e), ms: Date.now() - t1 };
    }
  });

  const settled = await Promise.allSettled(tasks);
  const results = settled.map(s => s.value || { error: String(s.reason) });
  return { results, missingKeys, totalMs: Date.now() - t0 };
}

/**
 * Convenience: call council, return only succeeded responses sorted by model name.
 */
export async function council(prompt, opts = {}) {
  const { results } = await callCouncil({ prompt, opts });
  return results.filter(r => !r.error).sort((a, b) => a.model.localeCompare(b.model));
}

/**
 * Pretty-print council results to stdout.
 */
export function printCouncil(report) {
  const { results, missingKeys, totalMs } = report;
  console.log(`\n=== Council results (${totalMs}ms total) ===`);
  for (const r of results) {
    if (r.error) {
      console.log(`\n[${r.model}]  ❌  (${r.ms}ms)\n  ${r.error}`);
    } else {
      console.log(`\n[${r.model}]  ✅  (${r.ms}ms, ${r.tokens} tok${r.modelUsed ? `, used: ${r.modelUsed}` : ''})\n${r.content.slice(0, 600)}${r.content.length > 600 ? '\n  ...' : ''}`);
    }
  }
  if (missingKeys.length) {
    console.log(`\nSkipped (missing env keys):`);
    missingKeys.forEach(m => console.log(`  - ${m.model} (needs ${m.missingEnvVar})`));
  }
}

// CLI: node lib/council.mjs "your prompt here"
if (import.meta.url === `file://${process.argv[1]}`) {
  const prompt = process.argv.slice(2).join(' ');
  if (!prompt) {
    console.error('Usage: node lib/council.mjs "your prompt"');
    process.exit(1);
  }
  callCouncil({ prompt }).then(printCouncil).catch(e => { console.error(e); process.exit(1); });
}
