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
 *   - xai:grok-4                       (XAI_API_KEY)
 *   - xai:grok-4-fast-reasoning        (XAI_API_KEY)
 *   - openai:gpt-5                     (OPENAI_API_KEY)
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
      for (const model of ['grok-4', 'grok-3', 'grok-2']) {
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
      const r = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'grok-4-fast-reasoning',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: opts.maxTokens ?? 2500,
        }),
        signal: opts.signal,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 240)}`);
      const j = await r.json();
      return { content: j.choices?.[0]?.message?.content || '', tokens: j.usage?.total_tokens || 0 };
    },
  },

  // OpenAI
  'openai:gpt-5': {
    envKey: 'OPENAI_API_KEY',
    timeout: 120_000,
    async call(prompt, key, opts = {}) {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-5',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: opts.maxTokens ?? 3000,
        }),
        signal: opts.signal,
      });
      if (!r.ok) {
        // Fallback to o1 if gpt-5 isn't available on this account.
        if (r.status === 404 || r.status === 400) {
          const r2 = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'o1',
              messages: [{ role: 'user', content: prompt }],
              max_completion_tokens: opts.maxTokens ?? 3000,
            }),
            signal: opts.signal,
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

  // Google Gemini
  'google:gemini-2.5-pro': {
    envKey: 'GEMINI_API_KEY',
    timeout: 120_000,
    async call(prompt, key, opts = {}) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${encodeURIComponent(key)}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: opts.maxTokens ?? 3000 },
        }),
        signal: opts.signal,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 240)}`);
      const j = await r.json();
      const content = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
      const tokens = (j.usageMetadata?.totalTokenCount) || 0;
      return { content, tokens };
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
    const ctrl = new AbortController();
    const timeoutHandle = setTimeout(() => ctrl.abort(), provider.timeout);
    try {
      const r = await provider.call(prompt, key, { ...opts, signal: ctrl.signal });
      return { model: name, content: r.content, tokens: r.tokens, citations: r.citations, modelUsed: r.modelUsed, ms: Date.now() - t1 };
    } catch (e) {
      return { model: name, content: '', error: String(e.message || e), ms: Date.now() - t1 };
    } finally {
      clearTimeout(timeoutHandle);
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
