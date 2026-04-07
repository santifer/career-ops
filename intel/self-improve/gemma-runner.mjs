/**
 * Gemma 4 Runner — Ollama REST API wrapper
 *
 * Builds requests for and communicates with a remote Ollama instance
 * running gemma4-opus-distill (or any other model).
 */

const DEFAULT_HOST = process.env.OLLAMA_HOST || 'http://100.76.84.16:11434';
const DEFAULT_MODEL = 'gemma4-opus-distill:q8_0';

/**
 * Build a full Ollama URL from host and endpoint.
 */
export function buildOllamaUrl(host, endpoint) {
  const base = host || DEFAULT_HOST;
  return `${base.replace(/\/+$/, '')}${endpoint}`;
}

/**
 * Build a request body for /api/generate.
 */
export function buildRequestBody(model, prompt, opts = {}) {
  const body = {
    model,
    prompt,
    stream: false,
    options: {},
  };
  if (opts.system) body.system = opts.system;
  if (opts.temperature != null) body.options.temperature = opts.temperature;
  return body;
}

/**
 * Parse an Ollama /api/generate response JSON.
 */
export function parseOllamaResponse(json) {
  if (!json || typeof json !== 'object') return '';
  return json.response || '';
}

/**
 * Check if an Ollama host is reachable by fetching /api/tags.
 */
export async function isOllamaAvailable(host) {
  const url = buildOllamaUrl(host, '/api/tags');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Run a prompt through a Gemma model via Ollama.
 */
export async function runGemma(prompt, opts = {}) {
  const host = opts.host || DEFAULT_HOST;
  const model = opts.model || DEFAULT_MODEL;
  const url = buildOllamaUrl(host, '/api/generate');
  const body = buildRequestBody(model, prompt, opts);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return parseOllamaResponse(json);
}

/**
 * List available models on an Ollama host.
 */
export async function listModels(host) {
  const url = buildOllamaUrl(host || DEFAULT_HOST, '/api/tags');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const json = await res.json();
  return (json.models || []).map((m) => m.name);
}
