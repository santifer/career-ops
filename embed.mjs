#!/usr/bin/env node
/**
 * embed.mjs — Node client for the local embeddinggemma embedder.
 *
 * Spawns tools/embed_gemma.py with a Python interpreter that has
 * sentence-transformers + torch, pipes a batch of question strings in, and
 * returns L2-normalised 768-dim vectors. The model is loaded from the shared
 * HuggingFace cache (offline) — no network, no generative model, localhost only.
 *
 * Interpreter resolution order (first that exists wins):
 *   1. $CAREER_OPS_EMBED_PYTHON
 *   2. config/profile.yml → embedding.python
 *   3. the candidates in DEFAULT_PYTHONS below (the EMOTE venv ships the libs)
 *
 * We only READ the shared HF cache and EXECUTE the interpreter; we never modify
 * any other project.
 *
 * Usage (module):  import { embed } from './embed.mjs'
 *   const { model, dim, embeddings } = await embed(['question 1', 'question 2']);
 *
 * Usage (CLI smoke test):  echo '["q1","q2"]' | node embed.mjs
 */

import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(ROOT, 'tools', 'embed_gemma.py');

export const EMBED_MODEL = 'google/embeddinggemma-300m';

// Known interpreters that already carry sentence-transformers + torch.
// The EMOTE venv is the user's existing setup; we execute it read-only.
const DEFAULT_PYTHONS = [
  join(ROOT, '.venv', 'bin', 'python'),
  '/Users/neil/Desktop/EMOTE/experience-sampling-database/venv/bin/python',
];

function profileEmbeddingPython() {
  try {
    const p = join(ROOT, 'config', 'profile.yml');
    if (!existsSync(p)) return null;
    const cfg = yaml.load(readFileSync(p, 'utf-8'));
    return cfg?.embedding?.python || null;
  } catch {
    return null;
  }
}

export function resolvePython() {
  const candidates = [
    process.env.CAREER_OPS_EMBED_PYTHON,
    profileEmbeddingPython(),
    ...DEFAULT_PYTHONS,
  ].filter(Boolean);

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/**
 * Embed a batch of strings. Returns { model, dim, embeddings:number[][] }.
 * Throws with an actionable message if no usable interpreter is found or the
 * Python side errors — callers (Layer 2) should catch and degrade gracefully
 * (fall through to Layer 3) rather than crash the prepare run.
 */
export function embedSync(texts) {
  if (!Array.isArray(texts)) throw new Error('embed: texts must be an array');
  if (texts.length === 0) return { model: EMBED_MODEL, dim: 0, embeddings: [] };

  const py = resolvePython();
  if (!py) {
    throw new Error(
      'No embedding interpreter found. Set embedding.python in config/profile.yml ' +
      'or $CAREER_OPS_EMBED_PYTHON to a Python with sentence-transformers + torch.'
    );
  }

  const res = spawnSync(py, [SCRIPT], {
    input: JSON.stringify({ texts }),
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 180_000,
  });

  if (res.error) throw new Error(`embed: spawn failed: ${res.error.message}`);
  if (res.status !== 0) {
    throw new Error(`embed: python exited ${res.status}: ${(res.stderr || '').slice(-300)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    throw new Error(`embed: could not parse python output: ${(res.stdout || '').slice(0, 200)}`);
  }
  if (parsed.error) throw new Error(`embed: ${parsed.error}`);
  return parsed;
}

export async function embed(texts) {
  return embedSync(texts);
}

// ── cosine for L2-normalised vectors (dot product) ─────────────────────────────
export function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// CLI smoke test (compare resolved paths — the project path contains a space,
// which import.meta.url percent-encodes but argv[1] does not).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let buf = '';
  process.stdin.on('data', (c) => (buf += c));
  process.stdin.on('end', () => {
    let texts;
    try { texts = JSON.parse(buf); } catch { texts = buf.split('\n').filter(Boolean); }
    try {
      const out = embedSync(texts);
      console.log(JSON.stringify({ model: out.model, dim: out.dim, count: out.embeddings.length }, null, 2));
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
  });
}
