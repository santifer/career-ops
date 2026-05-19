/**
 * lib/voice-corpus.mjs — Mitchell's known-human writing corpus index.
 *
 * Single source of truth for "samples of Mitchell's actual prose". Used by
 * the AI-detection calibrator (`scripts/agents/ai-detection-hardener.mjs`)
 * to establish baseline detector behaviour against verified-human text
 * BEFORE flagging apply-pack artifacts.
 *
 * IMPORTANT — anti-fabrication rule:
 *   Every entry in this corpus must be Mitchell-written prose that exists on
 *   disk at the listed path. No paraphrase, no synthesised "in his voice"
 *   text. If the file moves or is rewritten, update the entry rather than
 *   silently letting the index rot.
 *
 * Confidence levels:
 *   "high"   = Mitchell wrote it himself (LinkedIn posts, raw notes, voice
 *              exemplars he hand-edited).
 *   "medium" = Mitchell heavily edited LLM-assisted text into his voice.
 *   "low"    = LLM-drafted then lightly reviewed (NOT to be used as a
 *              human baseline; included only as adversarial reference).
 *
 * Exports:
 *   listEntries()             → CorpusEntry[] (all entries)
 *   loadHumanBaselineProse()  → array of { id, path, prose, word_count }
 *   loadAdversarialProse()    → array (low-confidence entries)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractProseText } from './ai-detection-gate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/**
 * @typedef {Object} CorpusEntry
 * @property {string} id
 * @property {string} path          relative to repo root
 * @property {'high'|'medium'|'low'} confidence
 * @property {'narrative'|'metric'|'mixed'|'bullet'} register
 * @property {string} note
 * @property {string} [section]     optional anchor (## or # heading) to extract only one section
 */

/** @type {CorpusEntry[]} */
const CORPUS = [
  {
    id: 'voice-reference-full',
    path: 'writing-samples/voice-reference.md',
    confidence: 'high',
    register: 'narrative',
    note: 'rank=highest, weight=1.0 — full voice-reference doc. Canonical exemplar essay + Stream/HuffPost Live/AJ+ industry-impact paragraphs. Hand-edited Mitchell prose across both narrative + metric register.',
  },
  {
    id: 'voice-reference-canonical-exemplar',
    path: 'writing-samples/voice-reference.md',
    section: 'Canonical Exemplar',
    confidence: 'high',
    register: 'narrative',
    note: '## Canonical Exemplar — the "Translating complex technical concepts" essay only. Present-tense first-person narrative voice.',
  },
  {
    id: 'cv-mitchell',
    path: 'cv.md',
    confidence: 'medium',
    register: 'bullet',
    note: 'Canonical CV — bullet-heavy, metric-dense, Mitchell-written but heavily edited across many sessions.',
  },
  {
    id: 'article-digest',
    path: 'article-digest.md',
    confidence: 'medium',
    register: 'mixed',
    note: 'Proof-point digest. Mitchell-authored summaries of each project. Mixed register.',
  },
  {
    id: 'voice-reference-brief',
    path: 'data/voice-reference-brief.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Voice OS hard rules + kill list. Mitchell-curated prose about his own voice.',
  },
];

/**
 * Extract a single section from a markdown file by heading prefix.
 * Returns the section body up to the next same-level heading.
 */
function extractSection(raw, sectionName) {
  if (!sectionName) return raw;
  const lines = raw.split('\n');
  let start = -1;
  let stopLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (!m) continue;
    if (m[2].startsWith(sectionName)) {
      start = i + 1;
      stopLevel = m[1].length;
      break;
    }
  }
  if (start === -1) return ''; // section not found
  const out = [];
  for (let i = start; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= stopLevel) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

export function listEntries() {
  return CORPUS.slice();
}

/**
 * Load extracted prose for entries at the requested confidence levels.
 * Returns [{ id, path, confidence, register, prose, word_count }].
 */
export function loadCorpusProse(confidenceLevels = ['high', 'medium']) {
  const out = [];
  for (const entry of CORPUS) {
    if (!confidenceLevels.includes(entry.confidence)) continue;
    const absPath = join(ROOT, entry.path);
    if (!existsSync(absPath)) {
      out.push({ ...entry, prose: null, word_count: 0, missing: true });
      continue;
    }
    let raw = readFileSync(absPath, 'utf-8');
    if (entry.section) raw = extractSection(raw, entry.section);
    const prose = extractProseText(raw);
    const word_count = prose.split(/\s+/).filter(Boolean).length;
    out.push({ ...entry, prose, word_count, missing: false });
  }
  return out;
}

export function loadHumanBaselineProse() {
  return loadCorpusProse(['high']);
}

export function loadAdversarialProse() {
  return loadCorpusProse(['low']);
}
