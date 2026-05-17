/**
 * lib/apply-pack-schema.mjs — Zod v4 schema for the canonical `ApplyPack`
 * JSON contract produced by `scripts/build-apply-orchestrator.mjs`.
 *
 * Operationalizes Dimension 1 (single Node orchestrator + Zod ApplyPack
 * contracts + Promise.allSettled parallelism + 7 stages + manual approve-pack
 * gate) of `data/output-pipeline-strategy-2026-05-17.md`.
 *
 * The schema is consumed two ways, mirroring lib/skill-ingest-schema.mjs:
 *   1. Runtime validation of the orchestrator's assembled pack object.
 *   2. JSON Schema exported for any consumer (dashboard, downstream tools)
 *      via Zod v4's top-level `z.toJSONSchema(schema)` function (NOT the
 *      instance-method form; verified against zod.dev/json-schema 2026-05-17).
 *
 * Versioning: bump `pipeline_version` in any orchestrator output when this
 * schema's required fields change. Additive fields with `.default()` or
 * `.optional()` don't require a bump.
 */

import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* Sub-schemas                                                                */
/* -------------------------------------------------------------------------- */

export const ArchetypeSchema = z.enum([
  'A1',
  'A2-PgM',
  'A2-SA',
  'A2-FDE',
  'A2-AE',
  'B',
  'other',
]).describe(
  'Archetype tag from modes/_profile.md. A1 = strategic ops; A2-* = ' +
    'PgM / Solutions Architect / Forward-Deployed Engineer / Account Exec ' +
    'specializations; B = comms / editorial; other = catch-all so unknown ' +
    'archetypes do not break validation.'
);

export const MetaSchema = z.object({
  row_id: z.number().int().min(0).describe('Row number in data/applications.md or data/apply-now-queue.json.'),
  company: z.string(),
  role: z.string(),
  score: z
    .number()
    .min(0)
    .max(5)
    .describe('Evaluation score on a 0-5 scale from the upstream report.'),
  eval_date: z
    .string()
    .describe('ISO 8601 date (YYYY-MM-DD) of the evaluation that produced this pack.'),
  generated_at: z
    .string()
    .describe('ISO 8601 timestamp when the orchestrator assembled this pack.'),
  pipeline_version: z
    .string()
    .describe('Pipeline schema version, e.g. "1.0.0".'),
});

export const CitationSchema = z.object({
  claim: z.string().describe('The metric or factual claim being cited.'),
  source_file: z
    .string()
    .describe('Repo-relative path of the corpus file backing the claim (e.g. cv.md).'),
  source_line: z
    .number()
    .int()
    .min(0)
    .describe('1-based line number in the source file. Use 0 when only the file is cited.'),
});

export const InputsSchema = z.object({
  jd_url: z.string().describe('Job description URL.'),
  jd_text: z.string().describe('Plain-text snapshot of the JD (may be truncated).'),
  hm_intel_path: z
    .string()
    .nullable()
    .describe('Repo-relative path to the data/hm-intel/{slug}.json file, or null if none.'),
  archetype: ArchetypeSchema,
  company_ai_policy: z
    .record(z.string(), z.any())
    .describe(
      'Excerpt from data/ai-policies.yml for this company. Free-shape object ' +
        'so future policy fields (e.g. screening_aggressiveness) do not require ' +
        'schema bumps.'
    ),
});

export const WeightingSchema = z.object({
  sim_alpha: z
    .number()
    .default(1.0)
    .describe('Semantic-similarity weight α in Score = α·SIM + β·HM_bias - γ·AI_risk.'),
  hm_bias_beta: z
    .number()
    .default(0.7)
    .describe('Hiring-manager bias weight β.'),
  ai_risk_gamma: z
    .number()
    .default(0.5)
    .describe('AI-risk penalty weight γ. Higher = stricter humanize-gate.'),
  final_score: z
    .number()
    .describe('Computed final bullet/story score after applying the weights.'),
});

export const CvArtifactSchema = z.object({
  path: z.string().describe('Repo-relative path to the rendered CV artifact.'),
  format: z.enum(['pdf', 'html', 'tex', 'typst']),
  citations: z.array(CitationSchema).default([]),
});

export const CoverLetterArtifactSchema = z.object({
  path: z.string(),
  body_markdown: z.string().describe('Cover-letter body in markdown.'),
  humanize_score: z
    .number()
    .min(0)
    .max(100)
    .describe('humanize-check.mjs risk score 0-100 (lower = more human).'),
  voice_fidelity_cosine: z
    .number()
    .min(0)
    .max(1)
    .describe('Cosine similarity vs writing-samples/voice-reference.md centroid. 1.0 = identical.'),
  citations: z.array(CitationSchema).default([]),
});

export const WhyStatementArtifactSchema = z.object({
  path: z.string(),
  body_markdown: z.string(),
  humanize_score: z.number().min(0).max(100),
});

export const LinkedInDmArtifactSchema = z.object({
  body: z.string(),
  channel: z.enum(['linkedin-inmail', 'linkedin-message']),
});

export const FormFieldAnswerSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

export const OnePagerArtifactSchema = z.object({
  path: z.string().nullable().describe('Repo-relative path, or null if not produced.'),
});

export const InterviewPrepBriefSchema = z.object({
  path: z.string().nullable(),
});

export const PreflightChecklistSchema = z.object({
  path: z.string(),
  sections_passed: z.number().int().min(0),
  sections_total: z.number().int().min(0),
});

export const ArtifactsSchema = z.object({
  cv: CvArtifactSchema,
  cover_letter: CoverLetterArtifactSchema,
  why_statement: WhyStatementArtifactSchema,
  linkedin_dm: LinkedInDmArtifactSchema,
  form_field_answers: z.array(FormFieldAnswerSchema).default([]),
  one_pager: OnePagerArtifactSchema,
  interview_prep_brief: InterviewPrepBriefSchema,
  preflight_checklist: PreflightChecklistSchema,
});

export const GateStatusSchema = z.enum(['pass', 'warn', 'fail', 'skipped']);

export const GateSchema = z.object({
  name: z
    .string()
    .describe(
      'Gate name — one of: humanize-check, voice-fidelity, citation-traceback, ' +
        'length-check, ats-keyword-coverage, ai-policy-compliance. Free-string so ' +
        'future gates do not require schema bumps.'
    ),
  status: GateStatusSchema,
  detail: z.string().describe('1-2 sentence explanation of why the gate passed/warned/failed.'),
});

export const PackStatusSchema = z.enum([
  'draft',
  'awaiting-human-review',
  'approved',
  'submitted',
  'rejected',
]);

/* -------------------------------------------------------------------------- */
/* Stage enum (canonical ordering)                                            */
/* -------------------------------------------------------------------------- */

export const ApplyPackStage = z.enum([
  'parse_jd',
  'fetch_hm_intel',
  'load_corpus',
  'fan_out_drafts',
  'voice_pass',
  'humanize_gate',
  'manual_approve',
]);

/** Canonical 7-stage list, in execution order. */
export const APPLY_PACK_STAGES = [
  'parse_jd',
  'fetch_hm_intel',
  'load_corpus',
  'fan_out_drafts',
  'voice_pass',
  'humanize_gate',
  'manual_approve',
];

/* -------------------------------------------------------------------------- */
/* Top-level schema                                                           */
/* -------------------------------------------------------------------------- */

export const ApplyPackSchema = z.object({
  meta: MetaSchema,
  inputs: InputsSchema,
  weighting: WeightingSchema,
  artifacts: ArtifactsSchema,
  gates: z.array(GateSchema).default([]),
  status: PackStatusSchema,
});

/* -------------------------------------------------------------------------- */
/* JSON Schema export                                                         */
/* -------------------------------------------------------------------------- */

/**
 * JSON Schema representation of ApplyPackSchema, suitable for downstream
 * consumers (dashboard pack-validation, future API surfaces, etc.).
 *
 * Generated via `z.toJSONSchema()` — the top-level function form (not
 * `ApplyPackSchema.toJSONSchema()`, which does NOT exist in Zod v4).
 *
 * Verified May 17 2026 against zod.dev/json-schema.
 */
export function getApplyPackJsonSchema() {
  return z.toJSONSchema(ApplyPackSchema);
}

/** Pre-computed JSON Schema, frozen at module load. */
export const ApplyPackJsonSchema = getApplyPackJsonSchema();

export default ApplyPackSchema;
