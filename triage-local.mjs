/**
 * triage-local.mjs — Ollama-based local triage (zero API cost)
 *
 * Model fallback chain for M2 Air 24 GB unified memory:
 *   1. qwen2.5:14b  (preferred — best quality, needs ~12GB)
 *   2. qwen3:8b     (already installed, 5.2GB — fast fallback)
 *   3. llama3.2:3b  (minimal, auto-pulled if nothing else fits)
 *
 * Set OLLAMA_MODEL env var to override selection.
 * Set OLLAMA_HOST to override base URL (default: http://localhost:11434).
 *
 * Returns null (not throws) when Ollama is unavailable — provider routing
 * in triage.mjs will fall through to the next provider.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));

// Model chain: { name, minMemGB, tokensPerSec }
// Ordered by quality preference; selection skips entries requiring more than available RAM
const MODEL_CHAIN = [
  { name: 'qwen2.5:14b',  minMemGB: 12, tokensPerSec: '25–45' },
  { name: 'qwen3:8b',     minMemGB: 6,  tokensPerSec: '40–70' },
  { name: 'llama3.2:3b',  minMemGB: 3,  tokensPerSec: '80–120' },
];

const OLLAMA_BASE          = process.env.OLLAMA_HOST  || 'http://localhost:11434';
const OLLAMA_MODEL_OVERRIDE = process.env.OLLAMA_MODEL || null;
const TRIAGE_PROMPT        = join(ROOT, 'batch', 'triage-prompt.md');

// macOS available memory estimate: (pages free + inactive) × page size
async function getAvailableMemGB() {
  try {
    const out = execFileSync('vm_stat', [], { encoding: 'utf8', timeout: 3000 });
    const pagesFree     = parseInt(out.match(/Pages free:\s+(\d+)/)?.[1]     || '0');
    const pagesInactive = parseInt(out.match(/Pages inactive:\s+(\d+)/)?.[1] || '0');
    return ((pagesFree + pagesInactive) * 16384) / 1e9;
  } catch {
    return 24; // assume plenty on failure
  }
}

async function isOllamaRunning() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function getAvailableModels() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) });
    const data = await res.json();
    return (data.models || []).map(m => m.name);
  } catch {
    return [];
  }
}

async function pullModel(modelName) {
  console.log(`[ollama] Pulling ${modelName} — this may take several minutes...`);
  const res = await fetch(`${OLLAMA_BASE}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName, stream: false }),
    signal: AbortSignal.timeout(600_000), // 10 min
  });
  if (!res.ok) throw new Error(`Pull failed: ${res.status}`);
  console.log(`[ollama] ${modelName} ready`);
}

async function selectModel() {
  if (OLLAMA_MODEL_OVERRIDE) return OLLAMA_MODEL_OVERRIDE;

  const availMem  = await getAvailableMemGB();
  const available = await getAvailableModels();
  console.log(`[ollama] Available memory: ~${availMem.toFixed(1)} GB | Models: ${available.join(', ') || 'none'}`);

  for (const m of MODEL_CHAIN) {
    if (availMem < m.minMemGB) {
      console.log(`[ollama] ${m.name} needs ${m.minMemGB}GB — skipping`);
      continue;
    }
    // Check if model (or a tag variant) is already pulled
    const modelBase = m.name.split(':')[0];
    if (available.some(a => a === m.name || a.startsWith(modelBase + ':'))) {
      console.log(`[ollama] Using ${m.name} (~${m.tokensPerSec} tok/s)`);
      return m.name;
    }
  }

  // Nothing useful pulled — auto-pull the smallest viable option
  const smallest = MODEL_CHAIN[MODEL_CHAIN.length - 1];
  if (availMem >= smallest.minMemGB) {
    console.log(`[ollama] No suitable models found — auto-pulling ${smallest.name} (smallest)`);
    await pullModel(smallest.name);
    return smallest.name;
  }

  return null;
}

// Inline JSON parser (mirrors parseTriageOutput from triage.mjs to avoid circular dep)
function parseOutput(raw) {
  if (!raw) return { error: 'empty output' };
  const cleaned = raw
    .replace(/^```json?\s*/im, '')
    .replace(/```\s*$/m, '')
    .replace(/^\s*Here.*?:\s*/im, '')
    .trim();
  const jsonMatch = cleaned.match(/\{[^}]+\}/);
  if (!jsonMatch) return { error: 'no JSON object found' };
  try {
    const obj = JSON.parse(jsonMatch[0]);
    const score = parseFloat(obj.score);
    if (typeof obj.score === 'undefined') return { error: 'missing score' };
    if (isNaN(score) || score < 1.0 || score > 5.0) return { error: `invalid score: ${obj.score}` };
    // Same normalization as triage.mjs — accept A2b/A2c/B1a etc. sub-tier
    // suffixes that local LLMs (qwen3:8b / llama3.2:3b) emit. Collapse to
    // canonical 4-arity since downstream doesn't use the sub-tier.
    let archetype = String(obj.archetype || '').trim().toUpperCase();
    const normalized = (
      /^A1/.test(archetype) ? 'A1' :
      /^A2/.test(archetype) ? 'A2' :
      /^B/.test(archetype)  ? 'B'  :
      /^NO|NONE|SKIP/.test(archetype) ? 'NO' :
      ''
    );
    if (!normalized) return { error: `invalid archetype: ${archetype}` };
    archetype = normalized;
    const decision = String(obj.decision || '');
    if (!['ADVANCE', 'SKIP'].includes(decision)) return { error: `invalid decision: ${decision}` };
    const reason = String(obj.reason || '').slice(0, 120);
    return { score, archetype, decision, reason };
  } catch (e) {
    return { error: `JSON parse failed: ${e.message}` };
  }
}

export async function quickScoreLocal(url, tier, jdSnippet) {
  if (!(await isOllamaRunning())) {
    return null; // Ollama not running — fall through to next provider
  }

  const model = await selectModel();
  if (!model) {
    console.log('[ollama] No viable model available — skipping local triage');
    return null;
  }

  if (!existsSync(TRIAGE_PROMPT)) {
    console.warn('[ollama] triage-prompt.md not found — skipping');
    return null;
  }

  const promptTemplate = readFileSync(TRIAGE_PROMPT, 'utf8');
  const prompt = promptTemplate
    .replace('{{URL}}', url)
    .replace('{{TIER}}', String(tier))
    .replace('{{JD_SNIPPET}}', (jdSnippet || '(page body unavailable)').slice(0, 3000));

  // Use /api/chat with think: false — required for reasoning models like qwen3
  // that return empty `response` in /api/generate when thinking is enabled
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      think: false,
      options: { temperature: 0.0, num_predict: 80 },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) throw new Error(`Ollama chat failed: ${res.status}`);
  const data = await res.json();
  const raw = data.message?.content || data.response || '';
  const parsed = parseOutput(raw);

  if (parsed.error) {
    console.warn(`[ollama] Parse failed: ${parsed.error} — raw: ${raw.slice(0, 100)}`);
    return null; // fall through to next provider rather than erroring
  }

  return parsed;
}
