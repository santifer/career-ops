/**
 * lib/research-artifacts.mjs — Shared research artifact layer.
 *
 * Design source: refresh-master Phase 2 deliverable 5. Three consumers
 * (hm_intel_delta, positioning, role_enrichment) all do partially-overlapping
 * research on the same (company, role) tuple. Today each runs its own
 * council, paying ~3× for the underlying retrieval. This module factors out
 * the shared retrieval into ONE call per (company, role), stores the full
 * artifact at data/research-artifacts/<slug>.json, and lets each consumer
 * derive its own view cheaply.
 *
 * Artifact schema (richest superset of the three consumers):
 *   {
 *     slug, company, role, row_num,
 *     retrieved_at: ISO-8601,
 *     model: 'perplexity:sonar-deep-research',
 *     source_urls: [...],
 *     verifier_passed: bool,
 *
 *     // HM-intel slice
 *     people:    { recruiter, hm },
 *     hiring_team: [...],
 *
 *     // Toxicity / company slice
 *     sentiment: { blind, glassdoor, reddit, x_pulse },
 *
 *     // Role / comp slice
 *     comp:      { base_min, base_max, equity_stage, equity_amount, source },
 *     benefits:  { ... },
 *
 *     // Positioning slice (cheap to derive)
 *     evidence_anchors: [{ cv_md_line, claim, justification }],
 *
 *     // Free-form notes the council surfaced
 *     research_notes: [...]
 *   }
 *
 * Exports:
 *   getOrBuildArtifact({ company, role, row_num, opts? }) → Promise<artifact>
 *   buildArtifact({ company, role, row_num, opts? }) → Promise<artifact> (forces refresh)
 *   readArtifact(slug) → artifact | null
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAdapter } from './provider-adapters/index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const ARTIFACT_DIR = join(REPO_ROOT, 'data', 'research-artifacts');
const DEFAULT_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export function artifactPath(company, role) {
  const slug = `${slugify(company)}-${slugify(role)}`;
  return { slug, path: join(ARTIFACT_DIR, `${slug}.json`) };
}

export function readArtifact(slug) {
  const path = join(ARTIFACT_DIR, `${slug}.json`);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

export function isArtifactFresh(path, ttlMs = DEFAULT_TTL_MS) {
  if (!existsSync(path)) return false;
  return (Date.now() - statSync(path).mtimeMs) < ttlMs;
}

/**
 * Get an artifact for (company, role), building it if missing/stale.
 */
export async function getOrBuildArtifact({ company, role, row_num, opts = {} }) {
  const { slug, path } = artifactPath(company, role);
  if (!opts.force && isArtifactFresh(path, opts.ttlMs)) {
    return readArtifact(slug);
  }
  return await buildArtifact({ company, role, row_num, opts });
}

/**
 * Force-build an artifact. Uses perplexity-agent (Sonar Deep Research) for
 * the underlying retrieval because that's the natural-home provider for
 * recruiter + sentiment + benefits research. Falls back to anthropic-sonnet
 * if perplexity-agent is unavailable.
 */
export async function buildArtifact({ company, role, row_num, opts = {} }) {
  const { slug, path } = artifactPath(company, role);
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const prompt = buildSupersetPrompt(company, role);
  const writerProvider = opts.writerProvider || 'perplexity-agent';
  const writer = getAdapter(writerProvider);
  if (!writer) {
    return { ok: false, errors: [`writer adapter "${writerProvider}" not found`] };
  }

  const cacheStub = { id: 'research_artifact', minCitationsPer100Tokens: 1.0 };
  const rowStub = { num: row_num, company, role };
  const writerResult = await writer.refresh(cacheStub, rowStub, {
    ...opts,
    promptBuilder: () => prompt,
    systemPrompt: `You are Mitchell's research artifact builder. Today is ${new Date().toISOString().slice(0, 10)}. Build a comprehensive research artifact for (${company}, ${role}) covering people, sentiment, comp, benefits, evidence_anchors. Use live web search aggressively. STRICT JSON only.`,
    maxTokens: 6000,
    contextSize: 'high',
    caller: `research-artifacts:build:${slug}`,
  });

  if (!writerResult.ok || !writerResult.contentJson) {
    return { ok: false, errors: writerResult.errors || ['no parseable JSON'], slug };
  }

  const artifact = {
    slug,
    company,
    role,
    row_num,
    retrieved_at: new Date().toISOString(),
    model: writerResult.model || writerProvider,
    source_urls: writerResult.sourceUrls || [],
    verifier_passed: null, // filled in by verifier-lane caller
    provider_metadata: writerResult.providerMetadata || {},
    ...(writerResult.contentJson || {}),
  };

  writeFileSync(path, JSON.stringify(artifact, null, 2));
  return { ok: true, artifact, path, slug };
}

function buildSupersetPrompt(company, role) {
  return [
    `# Research artifact build for ${company} — ${role}`,
    `Return ONE strict JSON object with the following fields. Skip a field by setting it to null. Cite every claim with a URL.`,
    ``,
    `{`,
    `  "people": {`,
    `    "likely_recruiter": { "name": "string|unknown", "linkedin_url": "string|unknown", "rationale": "..." },`,
    `    "likely_hm":        { "name": "string|unknown", "linkedin_url": "string|unknown", "rationale": "..." }`,
    `  },`,
    `  "hiring_team": [{ "name": "...", "title": "...", "linkedin_url": "...", "rationale": "..." }],`,
    `  "sentiment": {`,
    `    "blind_score": "rating + 1-line sentiment summary",`,
    `    "glassdoor_score": "rating + recent themes",`,
    `    "reddit_pulse": "1-2 specific threads quoted",`,
    `    "x_pulse": "recent founder/exec posts"`,
    `  },`,
    `  "comp": {`,
    `    "base_min": null,`,
    `    "base_max": null,`,
    `    "equity_stage": "Pre-IPO Series X / Late / Public / etc.",`,
    `    "equity_amount": "string description if known",`,
    `    "source": "levels.fyi/blind/JD/etc"`,
    `  },`,
    `  "benefits": {`,
    `    "relo": "package summary or 'unknown'",`,
    `    "401k": "match policy",`,
    `    "healthcare": "plan tier",`,
    `    "other": "meals/learning/parental/sabbatical"`,
    `  },`,
    `  "evidence_anchors": [{ "claim": "...", "rationale": "...", "url": "..." }],`,
    `  "research_notes": ["any signal that doesn't fit elsewhere"]`,
    `}`,
    ``,
    `Be concrete. Cite. Set name="unknown" rather than fabricate.`,
  ].join('\n');
}

/**
 * Derive an HM-intel view from an artifact (cheap, no LLM call).
 */
export function deriveHmIntelView(artifact) {
  if (!artifact) return null;
  return {
    derived_from: artifact.slug,
    retrieved_at: artifact.retrieved_at,
    model: artifact.model,
    source_urls: artifact.source_urls,
    company: artifact.company,
    role: artifact.role,
    people: artifact.people || {},
    hiring_team: artifact.hiring_team || [],
    sentiment: artifact.sentiment || {},
    comp: artifact.comp || {},
    benefits: artifact.benefits || {},
  };
}

/**
 * Derive a positioning seed from an artifact (cheap, no LLM call).
 * The full positioning slot can run a small adjudication on top of this.
 */
export function derivePositioningSeed(artifact) {
  if (!artifact) return null;
  return {
    derived_from: artifact.slug,
    retrieved_at: artifact.retrieved_at,
    model: artifact.model,
    source_urls: artifact.source_urls,
    evidence_anchors: artifact.evidence_anchors || [],
    sentiment_signals: artifact.sentiment || {},
    company: artifact.company,
    role: artifact.role,
  };
}
