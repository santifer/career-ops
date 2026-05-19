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

  // ── Expanded corpus (δ.NH.1 — 2026-05-19) ──────────────────────────────────
  // 20 additional verified-Mitchell portfolio stories from storytellermitch.com,
  // plus 1 Mitchell-approved cover letter and 1 story-bank STAR+R entry.
  // Source: dashboard/stories/*.html — first-person narrative essays, hand-edited
  // to Mitchell's voice, published at storytellermitch.com. All confidence=high.
  {
    id: 'story-comms-triage-agent-xge',
    path: 'data/human-examples/sample-01-comms-triage-agent-google-xge.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Portfolio story: Communications Triage Agent at Google xGE — ~806w, first-person narrative.',
  },
  {
    id: 'story-stream-launch-breaking-news',
    path: 'data/human-examples/sample-02-stream-launch-night-breaking-news.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Portfolio story: The Stream launch night and OBL breaking news — ~580w, first-person narrative.',
  },
  {
    id: 'story-huffpost-live-scientology',
    path: 'data/human-examples/sample-03-huffpost-live-scientology-exclusive.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Portfolio story: HuffPost Live Scientology exclusive booking — ~756w, first-person narrative.',
  },
  {
    id: 'story-ahmed-coalition-2026',
    path: 'data/human-examples/sample-04-ahmed-coalition-2026.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Portfolio story: Ahmed Shihab-Eldin Kuwait coalition April 2026 — ~669w, first-person narrative.',
  },
  {
    id: 'story-executive-rag-voice-dna-xge',
    path: 'data/human-examples/sample-05-executive-rag-voice-dna-xge.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Portfolio story: Executive RAG + Voice DNA pipeline at xGE — ~730w, first-person narrative.',
  },
  {
    id: 'story-mentorship-platform-xge',
    path: 'data/human-examples/sample-06-mentorship-platform-xge.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Portfolio story: AI-driven mentorship matching platform at Google xGE — ~694w, first-person narrative.',
  },
  {
    id: 'story-aj-viral-video-production',
    path: 'data/human-examples/sample-07-aj-viral-video-production.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Portfolio story: AJ+ viral video campaign architecture — ~688w, first-person narrative.',
  },
  {
    id: 'story-aj-talent-pipeline',
    path: 'data/human-examples/sample-08-aj-talent-pipeline.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Portfolio story: AJ+ talent pipeline architecture — ~708w, first-person narrative.',
  },
  {
    id: 'story-approvals-matrix-xge',
    path: 'data/human-examples/sample-09-approvals-matrix-overhaul-xge.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Portfolio story: Approvals matrix overhaul at Google xGE — ~710w, first-person narrative.',
  },
  {
    id: 'story-day-one-orientation-xge',
    path: 'data/human-examples/sample-10-day-one-orientation-xge.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Portfolio story: Day-one technical orientation overhaul at Google Corp Eng — ~686w, first-person narrative.',
  },
  {
    id: 'story-career-ops-open-source',
    path: 'data/human-examples/sample-11-career-ops-open-source-build.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Portfolio story: career-ops open-source fork build — ~632w, first-person narrative.',
  },
  {
    id: 'story-stic-summit-architecture',
    path: 'data/human-examples/sample-12-stic-summit-architecture.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Portfolio story: STIC Summit architecture — ~747w, first-person narrative.',
  },
  {
    id: 'story-xge-org-partnership-des',
    path: 'data/human-examples/sample-13-xge-org-partnership-des.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Portfolio story: xGE org partnership with Distinguished Engineers — ~693w, first-person narrative.',
  },
  {
    id: 'story-voice-dna-kill-list-rag',
    path: 'data/human-examples/sample-14-voice-dna-kill-list-rag.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Portfolio story: Voice DNA Kill List RAG pipeline — ~732w, first-person narrative.',
  },
  {
    id: 'story-stream-751-to-59k',
    path: 'data/human-examples/sample-15-stream-launch-751-to-59k.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Portfolio story: The Stream launch night, @ReallyVirtual 751→59k — ~641w, first-person narrative.',
  },
  {
    id: 'story-huffpost-live-trans-navy',
    path: 'data/human-examples/sample-16-huffpost-live-trans-navy.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Portfolio story: HuffPost Live anonymous trans Navy service member booking — ~656w, first-person narrative.',
  },
  {
    id: 'story-xge-voice-dna-kill-list',
    path: 'data/human-examples/sample-17-xge-voice-dna-kill-list.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Portfolio story: xGE Voice DNA kill list — ~741w, first-person narrative.',
  },
  {
    id: 'story-career-ops-zero-token-scanner',
    path: 'data/human-examples/sample-18-career-ops-zero-token-scanner.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Portfolio story: career-ops zero-token portal scanning — ~600w, first-person narrative.',
  },
  {
    id: 'story-xge-comms-agent-build',
    path: 'data/human-examples/sample-19-xge-comms-agent-build.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Portfolio story: xGE communications agent build — ~645w, first-person narrative.',
  },
  {
    id: 'story-senior-eng-mentorship-transition',
    path: 'data/human-examples/sample-20-senior-eng-mentorship-transition.md',
    confidence: 'high',
    register: 'narrative',
    note: 'Portfolio story: Senior engineering mentorship platform transition — ~615w, first-person narrative.',
  },
  {
    id: 'cover-letter-044-anthropic-comms-lead',
    path: 'data/human-examples/sample-21-cover-letter-044-anthropic-comms-lead.md',
    confidence: 'medium',
    register: 'narrative',
    note: 'Cover letter for Anthropic Communications Lead (row 044) — Phase-7 rubric-constrained, Mitchell-approved, manually calibrated to his voice. ~234w.',
  },
  {
    id: 'story-bank-ahmed-coalition',
    path: 'data/human-examples/sample-22-story-bank-ahmed-coalition.md',
    confidence: 'high',
    register: 'mixed',
    note: 'STAR+R story bank entry — Ahmed coalition 2026. Mitchell-authored structured narrative. ~463w.',
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
