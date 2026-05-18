/**
 * lib/skill-portability.mjs — Deterministic skill-portability index.
 *
 * Reads cv.md, article-digest.md, and story-bank.md; scores Mitchell's skill
 * applicability across 4 verticals via keyword frequency tables (no LLM calls,
 * no network I/O).
 *
 * Per ingest-feature-strategy finding #39 and career-calibration-20260516
 * section "Industries off-limits: Defense only. Finance + health + legal + any
 * 'highest-paying industry needing AI deployment outside its day-to-day
 * capabilities' are ACTIVELY POSITIVE."
 *
 * Exports:
 *   computePortabilityIndex(corpus) → PortabilityResult
 *
 * where PortabilityResult = {
 *   finance:        number,   // 0-100
 *   health:         number,   // 0-100
 *   legal:          number,   // 0-100
 *   traditional_tech: number, // 0-100
 *   top_transferable_skills: [{
 *     skill:        string,
 *     vertical:     string,
 *     evidence_ref: string,
 *   }],
 * }
 *
 * Scoring method:
 *   Each vertical has a keyword table split into 3 tiers:
 *     tier1 (weight 3) — direct domain language
 *     tier2 (weight 2) — adjacent / transferable
 *     tier3 (weight 1) — general signals that apply to the vertical
 *
 *   Raw score = sum of (tier_weight × occurrences_in_corpus)
 *   Normalized to 0-100 via a per-vertical ceiling constant (soft cap,
 *   ensures a plausible score range even as corpus grows).
 *
 *   Individual top_transferable_skills: tier1 hits that appear in ≥1 corpus
 *   file, deduplicated by skill keyword, scored by total hits.
 */

// ---------------------------------------------------------------------------
// Keyword tables
// ---------------------------------------------------------------------------

const VERTICALS = {
  finance: {
    ceiling: 120,
    tier1: [
      'fintech', 'trading', 'portfolio', 'equity', 'ipo', 'vesting', 'valuation',
      'hedge fund', 'asset management', 'banking', 'investment', 'financial model',
      'risk management', 'compliance', 'regulatory', 'sec', 'fca', 'audit',
      'revenue operations', 'revops', 'p&l', 'ebitda', 'roi', 'arr', 'mrr',
      'financial reporting', 'budgeting', 'forecasting', 'compensation analysis',
    ],
    tier2: [
      'data pipeline', 'automation', 'workflow', 'stakeholder', 'executive',
      'strategy', 'program management', 'cost reduction', 'efficiency', 'scale',
      'real-time', 'analytics', 'dashboard', 'reporting', 'metrics', 'kpi',
      'cross-functional', 'enterprise', 'saas', 'api integration',
    ],
    tier3: [
      'python', 'sql', 'spreadsheet', 'modeling', 'presentation', 'communication',
      'leadership', 'team', 'project', 'process', 'tool', 'platform',
    ],
  },

  health: {
    ceiling: 90,
    tier1: [
      'healthcare', 'clinical', 'ehr', 'emr', 'hipaa', 'fda', 'medical',
      'patient', 'provider', 'pharma', 'biotech', 'genomics', 'diagnosis',
      'clinical trial', 'health data', 'interoperability', 'hl7', 'fhir',
      'telehealth', 'digital health', 'care coordination', 'population health',
      'health informatics', 'public health',
    ],
    tier2: [
      'privacy', 'data governance', 'security', 'compliance', 'regulation',
      'workflow automation', 'integration', 'data quality', 'real-time',
      'program management', 'stakeholder', 'policy', 'training', 'scale',
      'trust', 'reliability', 'monitoring',
    ],
    tier3: [
      'python', 'sql', 'api', 'analytics', 'reporting', 'team', 'leadership',
      'communication', 'documentation', 'process', 'platform',
    ],
  },

  legal: {
    ceiling: 60,
    tier1: [
      'legal', 'contract', 'compliance', 'regulatory', 'litigation', 'e-discovery',
      'legaltech', 'attorney', 'paralegal', 'law firm', 'in-house counsel',
      'intellectual property', 'trademark', 'copyright', 'privacy law',
      'gdpr', 'ccpa', 'employment law', 'corporate governance',
    ],
    tier2: [
      'document review', 'workflow', 'automation', 'risk', 'policy', 'audit',
      'data management', 'search', 'integration', 'stakeholder', 'enterprise',
      'program management', 'training', 'process improvement',
    ],
    tier3: [
      'writing', 'communication', 'analysis', 'research', 'documentation',
      'collaboration', 'tool', 'platform', 'team', 'leadership',
    ],
  },

  traditional_tech: {
    ceiling: 150,
    tier1: [
      'software engineer', 'backend', 'frontend', 'full stack', 'distributed systems',
      'microservices', 'kubernetes', 'docker', 'cloud', 'aws', 'gcp', 'azure',
      'ci/cd', 'devops', 'sre', 'observability', 'incident response',
      'api design', 'rest', 'graphql', 'database', 'postgresql', 'mysql',
      'python', 'typescript', 'javascript', 'golang', 'rust', 'java',
      'machine learning', 'llm', 'ai', 'nlp', 'data science',
    ],
    tier2: [
      'technical program management', 'tpm', 'tpgm', 'engineering management',
      'architecture', 'system design', 'scalability', 'reliability',
      'roadmap', 'sprint', 'agile', 'scrum', 'cross-functional', 'ship',
      'launch', 'release', 'deployment', 'integration', 'platform',
    ],
    tier3: [
      'stakeholder', 'communication', 'documentation', 'process', 'team',
      'leadership', 'strategy', 'metrics', 'analytics', 'reporting',
    ],
  },
};

// ---------------------------------------------------------------------------
// Corpus normalization
// ---------------------------------------------------------------------------

/**
 * Collapse the corpus strings into one lowercase searchable blob.
 */
function normalizeCorpus(corpus) {
  const { cv = '', articleDigest = '', storyBank = '' } = corpus;
  return [cv, articleDigest, storyBank].join('\n').toLowerCase();
}

/**
 * Count case-insensitive occurrences of a keyword in text.
 */
function countOccurrences(text, keyword) {
  let count = 0;
  let pos = 0;
  const kw = keyword.toLowerCase();
  while ((pos = text.indexOf(kw, pos)) !== -1) {
    count++;
    pos += kw.length;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

/**
 * Compute portability scores and top transferable skills.
 *
 * @param {object} corpus
 * @param {string} [corpus.cv]            — contents of cv.md
 * @param {string} [corpus.articleDigest] — contents of article-digest.md
 * @param {string} [corpus.storyBank]     — contents of interview-prep/story-bank.md
 * @returns {PortabilityResult}
 */
export function computePortabilityIndex(corpus = {}) {
  const text = normalizeCorpus(corpus);
  const result = {};
  const allTransferableHits = [];

  for (const [vertical, cfg] of Object.entries(VERTICALS)) {
    let rawScore = 0;

    // tier1 hits — also track for top_transferable_skills
    for (const kw of cfg.tier1) {
      const hits = countOccurrences(text, kw);
      if (hits > 0) {
        rawScore += hits * 3;
        allTransferableHits.push({ skill: kw, vertical, hits, tier: 1 });
      }
    }
    // tier2
    for (const kw of cfg.tier2) {
      const hits = countOccurrences(text, kw);
      rawScore += hits * 2;
    }
    // tier3
    for (const kw of cfg.tier3) {
      const hits = countOccurrences(text, kw);
      rawScore += hits * 1;
    }

    // Normalize to 0-100 with ceiling
    const normalized = Math.min(100, Math.round((rawScore / cfg.ceiling) * 100));
    result[vertical] = normalized;
  }

  // Top transferable skills: deduplicate by skill keyword across verticals,
  // keep highest-hit vertical per keyword, then sort descending by hits,
  // return top 10.
  const dedupMap = new Map();
  for (const h of allTransferableHits) {
    const existing = dedupMap.get(h.skill);
    if (!existing || h.hits > existing.hits) {
      dedupMap.set(h.skill, h);
    }
  }

  const topTransferable = [...dedupMap.values()]
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 10)
    .map(({ skill, vertical, hits }) => ({
      skill,
      vertical,
      evidence_ref: `corpus: ${hits} occurrence${hits !== 1 ? 's' : ''}`,
    }));

  return {
    finance: result.finance,
    health: result.health,
    legal: result.legal,
    traditional_tech: result.traditional_tech,
    top_transferable_skills: topTransferable,
  };
}
