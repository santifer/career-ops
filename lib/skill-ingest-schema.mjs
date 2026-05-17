/**
 * lib/skill-ingest-schema.mjs — Zod v4 schema for the weekly skill-tracker
 * extraction output.
 *
 * Operationalizes Phase 4 (Dimensions 1-2) of
 * `data/ingest-feature-strategy-2026-05-17.md` and item 8 of the calibration
 * brief at `data/career-calibration-20260516-190152.md`.
 *
 * The schema is consumed two ways:
 *   1. Runtime validation of Gemini's structured output (the Zod object).
 *   2. JSON Schema embedded in the Gemini structured-output request, via
 *      Zod v4's native `z.toJSONSchema(schema)` top-level function (NOT the
 *      instance-method form; verified against zod.dev/json-schema 2026-05-17).
 *
 * Field shapes follow the task spec verbatim. Diffs from the council report
 * are intentional and noted inline.
 */

import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* Sub-schemas                                                                */
/* -------------------------------------------------------------------------- */

export const SkillSchema = z.object({
  name: z.string().describe('Skill name as it would appear on cv.md (e.g. "Python (asyncio)").'),
  level_change: z
    .enum(['new', 'improved', 'maintained'])
    .describe('"new" = first appearance; "improved" = level-up evidence; "maintained" = still in active use but no level change.'),
  evidence: z
    .string()
    .describe('One- or two-sentence concrete evidence — what was built, shipped, or demonstrated. Quote artifact paths or PR numbers when available.'),
  citations: z
    .array(z.string())
    .default([])
    .describe('Source citations: weekly-drop section headers, file paths, URLs. Empty array allowed when the weekly drop is self-citing.'),
});

export const ProjectSchema = z.object({
  name: z.string(),
  status_change: z
    .enum(['started', 'in_progress', 'shipped', 'blocked', 'completed', 'none'])
    .describe('Project lifecycle transition observed this week.'),
  ship_date: z
    .string()
    .nullable()
    .describe('ISO 8601 date (YYYY-MM-DD) when the project shipped. Null when status_change is not "shipped" or "completed".'),
  evidence: z.string(),
});

export const CertificationSchema = z.object({
  name: z.string(),
  issuer: z.string().describe('Issuing body (e.g. "Google", "AWS", "Coursera").'),
  date: z.string().describe('ISO 8601 completion date (YYYY-MM-DD).'),
  artifact_url: z
    .string()
    .nullable()
    .describe('URL to the certification artifact or verification page. Null if no public artifact exists.'),
});

export const CourseSchema = z.object({
  name: z.string(),
  provider: z.string().describe('Course provider (e.g. "Google internal", "Coursera", "Udemy").'),
  completion_date: z
    .string()
    .nullable()
    .describe('ISO 8601 date or null if still in progress.'),
  units_completed: z
    .number()
    .int()
    .min(0)
    .nullable()
    .describe('Cumulative units / modules completed. Null when the course has no modular progress.'),
  key_skills: z
    .array(z.string())
    .default([])
    .describe('Skills this course built or reinforced. Maps loosely to the SkillSchema.name values.'),
});

export const TpgmEvidenceSchema = z.object({
  work_item: z
    .string()
    .describe('What Mitchell did (system design, agent orchestration, on-call, integration architecture, data analysis ownership).'),
  technical_signal: z
    .string()
    .describe('Which of the five TPgM signal categories this maps to, plus the specific demonstration.'),
  scoring_impact: z
    .number()
    .min(-1)
    .max(1)
    .describe('Normalized scoring delta in [-1, 1]. Positive = strengthens TPgM credibility; negative = weakens. Most items 0.05–0.20.'),
});

export const PmBridgeEvidenceSchema = z.object({
  evidence: z
    .string()
    .describe('Specific evidence that bridges the PM transition (product judgment, stakeholder management, prioritization, cross-functional design).'),
  weight_for_pm_transition: z
    .number()
    .min(0)
    .max(1)
    .describe('How much this evidence moves the PM-Bridge-Buildability score, in [0, 1]. 0.0 = trivial, 1.0 = career-changing.'),
});

export const SkillPortabilityEvidenceSchema = z.object({
  evidence: z
    .string()
    .describe('Specific evidence of skill portability into a non-current-industry vertical.'),
  target_industry: z
    .string()
    .describe('Industry vertical this evidence applies to (e.g. "finance", "health", "legal", "other").'),
});

/* -------------------------------------------------------------------------- */
/* Top-level schema                                                           */
/* -------------------------------------------------------------------------- */

export const WeeklyIngestSchema = z.object({
  week_iso: z
    .string()
    .describe('ISO week index in YYYY-Www form (e.g. "2026-W20"). Monday-start per ISO 8601.'),
  extraction_confidence: z
    .enum(['high', 'medium', 'low'])
    .describe('Overall confidence in the extraction. "low" required when the weekly drop is sparse — do NOT pad to look productive.'),
  skills: z.array(SkillSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  certifications: z.array(CertificationSchema).default([]),
  courses: z.array(CourseSchema).default([]),
  tpgm_evidence: z.array(TpgmEvidenceSchema).default([]),
  pm_bridge_evidence: z.array(PmBridgeEvidenceSchema).default([]),
  skill_portability_evidence: z.array(SkillPortabilityEvidenceSchema).default([]),
});

/* -------------------------------------------------------------------------- */
/* JSON Schema export                                                         */
/* -------------------------------------------------------------------------- */

/**
 * JSON Schema representation of WeeklyIngestSchema, suitable for Gemini's
 * structured-output `responseSchema` (or `responseFormat.text.schema`) field.
 *
 * Generated lazily via `z.toJSONSchema()` — the top-level function form (not
 * `WeeklyIngestSchema.toJSONSchema()`, which does NOT exist in Zod v4).
 *
 * Verified May 17 2026 against zod.dev/json-schema.
 */
export function getJsonSchema() {
  return z.toJSONSchema(WeeklyIngestSchema);
}

/**
 * Pre-computed JSON Schema, frozen at module load. Use this directly when the
 * schema is known to be static; use `getJsonSchema()` if you need a fresh
 * object (e.g. mutating before serialization).
 */
export const WeeklyIngestJsonSchema = getJsonSchema();

export default WeeklyIngestSchema;
