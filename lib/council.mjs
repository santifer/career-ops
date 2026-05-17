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
 *
 * Jailbreak-refusal mitigations (added 2026-05-17 after 3-of-3 grok-4-fast-reasoning
 * Pass-2 jailbreak refusals across phases 1-3 of the multi-phase research stack):
 *   1. DATE_ANCHOR_DEFAULT() — always-on system prompt anchoring "today" to the
 *      orchestrator's system clock. Prevents the future-year jailbreak heuristic
 *      ("I cannot engage with a fictional 2026 scenario"). Phase-4 council with
 *      this anchor in place produced 0 refusals across 12 model calls vs 3-of-3
 *      in prior runs without it.
 *   2. detectRefusal() + auto-retry — if a response content matches a known
 *      refusal pattern, retry once with an explicit "this is real" preamble.
 *      Mark .jailbreakRefusal / .jailbreakRetry in the result.
 *   3. probeModelYear() — opt-in per-model 1-token year probe before the real
 *      run. If the model answers ≥2 years off, log + skip. Off by default.
 *   4. DEFAULT_LINEUP — explicit allowlist. grok-4-fast-reasoning excluded
 *      from default (sticky year heuristic that survives even the date anchor
 *      occasionally). Available via --models flag if needed.
 */

// Date anchor injected as a system message to every council call by default.
// Override with opts.systemPrompt = "" to disable, or opts.systemPrompt = "..."
// to replace. Lives inside the closure so each call gets a fresh timestamp.
function DATE_ANCHOR_DEFAULT() {
  const d = new Date();
  const iso = d.toISOString().slice(0, 10);
  const yr = d.getUTCFullYear();
  return [
    `Today is ${iso} (UTC). The date is verified by the orchestrator's system clock.`,
    `The year ${yr} is real, not hypothetical. Web knowledge through at least ${iso} is in scope.`,
    `Treat ${yr} (and earlier) events, products, models, and policies as real unless you have specific contradicting primary-source evidence.`,
    `Do not refuse on the basis that any year in this prompt seems "future" or "fictional".`,
    `If you cannot verify a specific claim, mark it [UNVERIFIED] inline — never refuse the whole task.`,
  ].join(' ');
}

// Regex bank for known jailbreak-refusal phrasings. Patterns are intentionally
// conservative (short, opening-of-response shape) to avoid false positives on
// legitimate cautionary sentences inside a long answer. detectRefusal() only
// fires on content shorter than 2000 chars — long answers that include any of
// these phrases are NOT treated as refusals.
const REFUSAL_PATTERNS = [
  /^.{0,200}\bI (cannot|can't|will not|won't|am unable to|am not able to)\b[^.]{0,160}\b(hypothetical|fictional|future|imagined|speculative|made[- ]up)\b/i,
  /^.{0,200}\bThis (appears|seems|looks) to be (a|an) (hypothetical|fictional|future|imagined) (scenario|situation|prompt)/i,
  /^.{0,200}\bAs (an? )?(responsible|safety[- ]aligned|honest|principled) AI\b/i,
  /^.{0,200}\bI'm (unable|not able|not designed) to (provide|generate|engage|pretend|roleplay)\b[^.]{0,160}\b(20\d\d|future|fictional)\b/i,
  /^.{0,200}\bI cannot pretend (it is|that it is|that's)\b/i,
  /^.{0,200}\bThe (year|date|setting|scenario) (you('ve)? )?(provided|mentioned|described) (is|appears to be) (in the )?(future|fictional|hypothetical)/i,
];

export function detectRefusal(content) {
  if (!content) return null;
  if (content.length > 2000) return null;
  for (const p of REFUSAL_PATTERNS) {
    const m = content.match(p);
    if (m) return p.source.slice(0, 120);
  }
  return null;
}

// Default model lineup. Notably excludes xai:grok-4-fast-reasoning — 3-of-3
// Pass-2 jailbreak refusals across phases 1-3 of the 2026-05-17 research stack.
// Date-anchor + retry-on-refusal mitigations help but this model has a stickier
// year-as-fictional heuristic than the rest. Still available via --models.
// See:
//   data/heartbeat-email-optimization-2026-05-17.md
//   data/output-pipeline-strategy-2026-05-17.md
//   data/ingest-feature-strategy-2026-05-17.md
const DEFAULT_LINEUP = [
  'perplexity:sonar-deep-research',
  'perplexity:sonar-reasoning-pro',
  'xai:grok-4',           // auto-escalates to grok-4.3 at runtime
  'xai:grok-4-x-search',  // live X/Twitter + web_search corroboration
  'openai:gpt-5',
  'google:gemini-2.5-pro', // auto-escalates to gemini-3.1-pro-preview at runtime
];

// Helper used by every chat-completions provider (Perplexity, xAI chat, OpenAI).
// opts.systemPrompt === undefined → use DATE_ANCHOR_DEFAULT()
// opts.systemPrompt === '' or null → no system message at all (caller opted out)
// opts.systemPrompt === '...string...' → use that string verbatim
function _buildMessages(userPrompt, opts = {}) {
  const sys = opts.systemPrompt === undefined ? DATE_ANCHOR_DEFAULT() : opts.systemPrompt;
  const out = [];
  if (sys) out.push({ role: 'system', content: sys });
  out.push({ role: 'user', content: userPrompt });
  return out;
}

const PROVIDERS = {
  // Perplexity — deep-research mode is multi-step, can take 1-3min.
  // 2026-05 verified: sonar-deep-research runs on Claude Opus 4.5/4.6
  // internally, supports up to ~10K output tokens in practice (default raised
  // from 4000 to 8000 to reduce truncation on long syntheses; callers can
  // still override via opts.maxTokens).
  'perplexity:sonar-deep-research': {
    envKey: 'PERPLEXITY_API_KEY',
    timeout: 240_000, // 4 min
    async call(prompt, key, opts = {}) {
      const r = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'sonar-deep-research',
          messages: _buildMessages(prompt, opts),
          max_tokens: opts.maxTokens ?? 8000,
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
          messages: _buildMessages(prompt, opts),
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
            messages: _buildMessages(prompt, opts),
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
            messages: _buildMessages(prompt, opts),
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
        body: (() => {
          const sys = opts.systemPrompt === undefined ? DATE_ANCHOR_DEFAULT() : opts.systemPrompt;
          const input = [];
          if (sys) input.push({ role: 'system', content: sys });
          input.push({ role: 'user', content: prompt });
          return JSON.stringify({
            model: 'grok-4-fast-reasoning',
            input,
            tools: [
              { type: 'web_search' },
              { type: 'x_search' },
            ],
          });
        })(),
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

  // OpenAI — auto-escalates from gpt-5 → gpt-5.5 at runtime per the standard
  // fallback pattern. gpt-5.5 verified 2026-05-17 as the current flagship
  // (released April 23, 2026; default in ChatGPT since May 5). Adds
  // `reasoning.effort` support (none/low/medium/high/xhigh; default medium per
  // OpenAI docs). Use `opts.reasoningEffort = 'minimal'` (or 'low') for
  // year-probes and other 1-fact answers where reasoning tokens would eat the
  // visible-output budget. Keeps gpt-5 and o1 as fallbacks for accounts that
  // haven't been upgraded.
  'openai:gpt-5': {
    envKey: 'OPENAI_API_KEY',
    timeout: 180_000, // bumped from 120s — gpt-5.5 with high reasoning can run long
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

      // Build body. CRITICAL: gpt-5 and gpt-5.5 require `max_completion_tokens`
      // (NOT `max_tokens`) and `reasoning_effort` (snake_case top-level, NOT
      // `reasoning.effort` nested — that's the Responses API form).
      // Web-verified 2026-05-17 against OpenAI's reasoning-models guide.
      // Valid reasoning_effort values: none, minimal, low, medium (default),
      // high, xhigh.
      function buildBody(modelId) {
        const isReasoningModel = modelId.startsWith('gpt-5') || modelId.startsWith('o1') || modelId.startsWith('o3');
        const body = {
          model: modelId,
          messages: _buildMessages(prompt, opts),
        };
        if (isReasoningModel) {
          body.max_completion_tokens = opts.maxTokens ?? 3000;
          if (opts.reasoningEffort) {
            body.reasoning_effort = opts.reasoningEffort;
          }
        } else {
          // gpt-4o and earlier — classic max_tokens, no reasoning_effort field.
          body.max_tokens = opts.maxTokens ?? 3000;
        }
        return body;
      }

      // Fallback chain: gpt-5.5 → gpt-5 → o1 → gpt-4o.
      // Accounts without gpt-5.5 access 400 on the model name; we fall through.
      for (const modelId of ['gpt-5.5', 'gpt-5', 'o1', 'gpt-4o']) {
        const r = await callWithBackoff('https://api.openai.com/v1/chat/completions', buildBody(modelId));
        if (r.ok) {
          const j = await r.json();
          return {
            content: j.choices?.[0]?.message?.content || '',
            tokens: j.usage?.total_tokens || 0,
            modelUsed: modelId,
          };
        }
        // 404/400 on model not available → try next. Other errors propagate.
        if (r.status !== 404 && r.status !== 400) {
          throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 240)}`);
        }
        // Capture the error text for the final attempt's failure message.
        if (modelId === 'gpt-4o') {
          throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 240)} (full fallback chain exhausted)`);
        }
      }
      throw new Error('OpenAI: no model in fallback chain accessible');
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
        // Inject date-anchor as systemInstruction (Gemini's equivalent of the
        // OpenAI-shape system message). Same opt-out semantics as _buildMessages.
        const sys = opts.systemPrompt === undefined ? DATE_ANCHOR_DEFAULT() : opts.systemPrompt;
        if (sys) {
          body.systemInstruction = { parts: [{ text: sys }] };
        }
        // Gemini 3 uses thinking_level (minimal/low/medium/high), default high.
        // 2.5-pro fallback REJECTS this field with HTTP 400 — handled in the
        // retry-without-thinking-level branch below.
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
          const errTxt = (await r.text()).slice(0, 400);
          // 2.5-pro (and possibly other fallbacks) reject `thinking_level` —
          // retry without it.
          if (/thinking_level/i.test(errTxt) && body.generationConfig?.thinking_level) {
            delete body.generationConfig.thinking_level;
            const rNoThink = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
              signal: opts.signal,
            });
            if (!rNoThink.ok) throw new Error(`HTTP ${rNoThink.status}: ${(await rNoThink.text()).slice(0, 240)}`);
            const j = await rNoThink.json();
            const content = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
            const tokens = (j.usageMetadata?.totalTokenCount) || 0;
            const grounded = !!j.candidates?.[0]?.groundingMetadata;
            return { content, tokens, grounded, modelUsed: `${modelLabel}-no-thinking` };
          }
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

  // Default lineup excludes grok-4-fast-reasoning (3-of-3 jailbreak refusals
  // history). Pass `models: Object.keys(PROVIDERS)` if you want everything wired.
  const wantedModels = models && models.length
    ? models
    : DEFAULT_LINEUP;

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

    // Single-attempt firing helper. extraPreamble is appended to the system
    // prompt on the retry; first call uses the default date-anchor only.
    async function fireOnce(extraPreamble = '') {
      const signal = AbortSignal.timeout(provider.timeout);
      const baseSys = opts.systemPrompt === undefined ? DATE_ANCHOR_DEFAULT() : opts.systemPrompt;
      const systemPrompt = baseSys + extraPreamble;
      return await provider.call(prompt, key, { ...opts, signal, systemPrompt });
    }

    try {
      let r = await fireOnce();
      let refusalReason = detectRefusal(r.content);
      let retried = false;

      // Refusal auto-retry. Override with opts.retryOnRefusal === false to
      // disable; some callers want raw responses for forensic logging.
      if (refusalReason && opts.retryOnRefusal !== false) {
        retried = true;
        const stronger = [
          '',
          '',
          'IMPORTANT — RETRY CONTEXT:',
          `Your previous response refused on the grounds that the task or year appears fictional/hypothetical/future.`,
          `That refusal was incorrect. The current date and all referenced events ARE real.`,
          `Your orchestrator's system clock confirms today is ${new Date().toISOString().slice(0,10)}.`,
          `Proceed with the actual task. If you cannot verify a specific claim, mark it [UNVERIFIED] inline — do not refuse the whole task again.`,
        ].join('\n');
        r = await fireOnce(stronger);
        refusalReason = detectRefusal(r.content);
      }

      return {
        model: name,
        content: r.content,
        tokens: r.tokens,
        citations: r.citations,
        modelUsed: r.modelUsed,
        ms: Date.now() - t1,
        ...(retried ? { jailbreakRetry: true } : {}),
        ...(refusalReason ? { jailbreakRefusal: refusalReason } : {}),
      };
    } catch (e) {
      return { model: name, content: '', error: String(e.message || e), ms: Date.now() - t1 };
    }
  });

  const settled = await Promise.allSettled(tasks);
  const results = settled.map(s => s.value || { error: String(s.reason) });
  return { results, missingKeys, totalMs: Date.now() - t0 };
}

/**
 * probeModelYear(modelName, opts?) — opt-in pre-flight check.
 *
 * Fires a 1-token "What year is it?" probe at one model. Returns the year the
 * model answers with (parsed as integer) plus the raw content. Use to filter
 * out models that hallucinate the year before spending real budget on them.
 *
 * Usage:
 *   import { probeModelYear } from './lib/council.mjs';
 *   const probe = await probeModelYear('xai:grok-4-fast-reasoning');
 *   if (Math.abs(probe.year - new Date().getFullYear()) >= 2) skip();
 */
export async function probeModelYear(modelName, opts = {}) {
  const provider = PROVIDERS[modelName];
  if (!provider) throw new Error(`probeModelYear: unknown model ${modelName}`);
  const key = process.env[provider.envKey];
  if (!key) return { model: modelName, year: null, error: 'missing-env-key' };
  const probePrompt = 'What year is it right now? Reply with only the 4-digit year, no other text.';
  const t0 = Date.now();
  try {
    const signal = AbortSignal.timeout(60_000); // probe-only ceiling
    // Probe goes WITHOUT the date anchor so we measure the model's actual
    // belief, not its compliance with our anchor. systemPrompt: '' disables.
    // maxTokens: 500 with reasoning/thinking forced to minimum is enough for
    // a 4-char year answer across all providers. Without the minimum-reasoning
    // override, reasoning models (gpt-5.5, gemini-3.1-pro-preview at
    // thinking_level=high default, grok-4.3 with always-on extended thinking,
    // sonar-reasoning-pro) consume the entire budget for internal thought and
    // emit empty content.
    //   - thinkingLevel: 'minimal' → Gemini 3.x (rejected by 2.5 fallback; auto-retry)
    //   - reasoningEffort: 'low' → OpenAI GPT-5.5+ (valid: none/low/medium/high/xhigh)
    //   - grounded: false → skip Google Search round-trip (probe measures raw belief)
    //   - systemPrompt: '' → no date anchor (we WANT to measure raw belief)
    // Known limitations: grok-4.3 has no equivalent reasoning-effort knob, so
    // probes against xai:* may still time out on the per-call signal even with
    // a 60s ceiling; that's information too (model is too slow to be useful in
    // the lineup). The probe is OPT-IN via --probe and informational only;
    // the load-bearing mitigations are DATE_ANCHOR_DEFAULT + detectRefusal
    // auto-retry (both always-on), which had a 12/12 success rate on the
    // Phase 4 council run (vs 3-of-3 refusals on phases 1-3 without them).
    const probeSignal = AbortSignal.timeout(60_000); // override the 30s outer
    const r = await provider.call(probePrompt, key, {
      ...opts,
      signal: probeSignal,
      maxTokens: 500,
      systemPrompt: '',
      thinkingLevel: 'minimal',
      reasoningEffort: 'low',
      grounded: false,
    });
    const yearMatch = (r.content || '').match(/\b(19\d{2}|20\d{2}|21\d{2})\b/);
    return {
      model: modelName,
      year: yearMatch ? parseInt(yearMatch[1], 10) : null,
      raw: (r.content || '').trim().slice(0, 60),
      ms: Date.now() - t0,
    };
  } catch (e) {
    return { model: modelName, year: null, error: String(e.message || e), ms: Date.now() - t0 };
  }
}

/**
 * probeLineup(models?, opts?) — run probeModelYear across all candidate models
 * in parallel. Returns each result plus a `passes` boolean (within 1 year of
 * the actual current year). Cheap (~$0.01 total) and ~2-5s wall-clock.
 */
export async function probeLineup(models, opts = {}) {
  const candidates = (models && models.length) ? models : DEFAULT_LINEUP;
  const currentYear = new Date().getFullYear();
  const tolerance = opts.tolerance ?? 1;
  const probes = await Promise.all(candidates.map(m => probeModelYear(m, opts)));
  return probes.map(p => ({
    ...p,
    passes: p.year !== null && Math.abs(p.year - currentYear) <= tolerance,
    expectedYear: currentYear,
  }));
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
