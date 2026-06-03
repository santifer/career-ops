#!/usr/bin/env node
/**
 * answer-cache.mjs — Semantic answer cache for form questions (zero model tokens).
 *
 * A small user-layer flat file (data/answer-cache.json, gitignored) of
 * previously answered form questions. Each entry stores the question text, its
 * embeddinggemma vector, the answer, field type, a `reusable` flag (the answer
 * is employer-independent), the key entities it was answered against, a
 * confidence, and a reuse count.
 *
 * Cosine similarity is computed in code over the small entry set — no vector-DB
 * server. Vectors are L2-normalised (see embed.mjs) so cosine == dot product.
 *
 * Reuse gate (ALL must hold): cosine >= threshold AND entry.reusable === true
 * AND the entity sets match. We NEVER serve a cached answer for a question
 * whose answer depends on a differing location, number, date, or dollar amount;
 * those fall through to a profile rule or to Layer 3 (the agent).
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

import { EMBED_MODEL, cosine } from './embed.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
export const CACHE_PATH = join(ROOT, 'data', 'answer-cache.json');

// Tunable: paraphrases score ~0.95, unrelated questions ~0.34 with
// embeddinggemma, so 0.85 cleanly admits paraphrases and rejects the rest.
export const DEFAULT_THRESHOLD = 0.85;
// Near-identical question → update in place instead of adding a duplicate.
const DEDUP_COS = 0.985;

const EMPTY_CACHE = () => ({
  version: 1,
  embedding_model: EMBED_MODEL,
  dim: 768,
  entries: [],
});

// ── Load / Save (atomic) ───────────────────────────────────────────────────────

export function loadCache() {
  if (!existsSync(CACHE_PATH)) return EMPTY_CACHE();
  try {
    const c = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
    if (!c || !Array.isArray(c.entries)) return EMPTY_CACHE();
    return c;
  } catch {
    return EMPTY_CACHE();
  }
}

export function saveCache(cache) {
  const tmp = join(ROOT, 'data', `.answer-cache-${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(cache, null, 2) + '\n', 'utf-8');
  renameSync(tmp, CACHE_PATH);
}

// ── Entity extraction (volatile tokens that make an answer context-specific) ───

// A compact AU-focused location lexicon. A location in a question (e.g.
// "relocate to Melbourne") ties the answer to that place; a different place
// must not reuse it.
const LOCATION_LEXICON = [
  'melbourne', 'sydney', 'brisbane', 'perth', 'adelaide', 'canberra', 'hobart',
  'darwin', 'gold coast', 'newcastle', 'wollongong', 'geelong',
  'australia', 'australian', 'nsw', 'vic', 'victoria', 'qld', 'queensland',
  'wa', 'sa', 'tasmania', 'act', 'auckland', 'wellington', 'new zealand',
  'remote', 'onsite', 'on-site', 'hybrid', 'interstate', 'overseas',
];

const MONTHS = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';

export function extractEntities(text = '') {
  const t = String(text).toLowerCase();

  const locations = [...new Set(LOCATION_LEXICON.filter((loc) => {
    const re = new RegExp(`\\b${loc.replace(/[-\s]/g, '[-\\s]')}\\b`, 'i');
    return re.test(t);
  }))];

  // money: $, AUD/USD, "k", percentages tied to currency context
  const money = [...new Set((t.match(/(?:\$|aud|usd|nzd)\s?\d[\d,\.]*\s?[km]?|\b\d[\d,\.]*\s?(?:dollars|aud|usd)\b/gi) || [])
    .map((m) => m.replace(/\s+/g, '').toLowerCase()))];

  // dates: explicit years (2024-2030) and month names
  const dates = [...new Set([
    ...(t.match(/\b20(2\d|3\d)\b/g) || []),
    ...(t.match(new RegExp(`\\b${MONTHS}\\b`, 'gi')) || []).map((m) => m.toLowerCase().slice(0, 3)),
  ])];

  // bare numbers that are NOT part of money/date already captured — these can
  // change an answer (e.g. "how many years", "how many days in office").
  const moneyDateSpans = [...money, ...dates].join(' ');
  const numbers = [...new Set((t.match(/\b\d+\b/g) || []).filter((n) => !moneyDateSpans.includes(n)))];

  return { locations, numbers, dates, money };
}

function sameSet(a = [], b = []) {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

export function entitiesCompatible(qEntities, entryEntities = {}) {
  // Require per-category set equality. Empty==empty is compatible. Any
  // difference in location/number/date/money means the contexts differ → do
  // not reuse.
  for (const cat of ['locations', 'numbers', 'dates', 'money']) {
    if (!sameSet(qEntities[cat] || [], entryEntities[cat] || [])) return false;
  }
  return true;
}

// ── Lookup ─────────────────────────────────────────────────────────────────────

/**
 * Find the best reusable cached answer for a question.
 * @returns {{ entry, score, firstUse:boolean } | null}
 * Returns null (fall through) when no entry clears the gate. Pure — does not
 * mutate the cache; call markUsed() after you actually apply the answer.
 */
export function lookup(cache, { question, embedding, threshold = DEFAULT_THRESHOLD }) {
  if (!cache || cache.embedding_model !== EMBED_MODEL) return null; // model mismatch → unusable
  if (!Array.isArray(embedding) || embedding.length === 0) return null;

  const qEntities = extractEntities(question);
  let best = null;

  for (const entry of cache.entries) {
    if (!entry.reusable) continue;
    if (!Array.isArray(entry.embedding) || entry.embedding.length !== embedding.length) continue;
    if (!entitiesCompatible(qEntities, entry.entities)) continue;

    const score = cosine(embedding, entry.embedding);
    if (score >= threshold && (!best || score > best.score)) {
      best = { entry, score };
    }
  }

  if (!best) return null;
  return { entry: best.entry, score: best.score, firstUse: (best.entry.reuse_count || 0) === 0 };
}

export function markUsed(cache, id) {
  const e = cache.entries.find((x) => x.id === id);
  if (!e) return;
  e.reuse_count = (e.reuse_count || 0) + 1;
  e.last_used_at = new Date().toISOString();
}

// ── Teach (upsert) ──────────────────────────────────────────────────────────────

/**
 * Store an answered question. If a near-identical question already exists
 * (cosine >= DEDUP_COS) the entry is updated in place rather than duplicated.
 * Auto-extracted question entities are merged with any agent-supplied ones.
 * @returns the stored entry.
 */
export function teach(cache, { question, embedding, answer, field_type, reusable, entities, confidence }) {
  const auto = extractEntities(question);
  const merged = {
    locations: [...new Set([...(entities?.locations || []), ...auto.locations])],
    numbers: [...new Set([...(entities?.numbers || []), ...auto.numbers])],
    dates: [...new Set([...(entities?.dates || []), ...auto.dates])],
    money: [...new Set([...(entities?.money || []), ...auto.money])],
  };

  // Dedup against an existing near-identical question.
  let existing = null;
  if (Array.isArray(embedding) && embedding.length) {
    for (const e of cache.entries) {
      if (!Array.isArray(e.embedding) || e.embedding.length !== embedding.length) continue;
      if (cosine(embedding, e.embedding) >= DEDUP_COS) { existing = e; break; }
    }
  }

  const now = new Date().toISOString();
  if (existing) {
    existing.question = question;
    existing.embedding = embedding;
    existing.answer = answer;
    existing.field_type = field_type ?? existing.field_type;
    existing.reusable = !!reusable;
    existing.entities = merged;
    existing.confidence = confidence ?? existing.confidence;
    existing.updated_at = now;
    return existing;
  }

  const entry = {
    id: randomUUID(),
    question,
    embedding,
    answer,
    field_type: field_type ?? 'text',
    reusable: !!reusable,
    entities: merged,
    confidence: confidence ?? 'medium',
    reuse_count: 0,
    created_at: now,
    last_used_at: null,
  };
  cache.entries.push(entry);
  return entry;
}
