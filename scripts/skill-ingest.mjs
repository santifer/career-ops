#!/usr/bin/env node
/**
 * scripts/skill-ingest.mjs — Weekly skill-tracker ingest pipeline (Phase 4).
 *
 * Reads `data/skill-tracker/{week}.md`, extracts structured evidence via
 * `gemini-3.1-pro-preview` against the Zod schema in
 * `lib/skill-ingest-schema.mjs`, writes the JSON to
 * `data/skill-tracker/extracted/{week}.json`, and (on --apply) auto-merges
 * the evidence into the corpus via `scripts/agent-commit.mjs`.
 *
 * Operationalizes item 8 of `data/career-calibration-20260516-190152.md` per
 * the design in `data/ingest-feature-strategy-2026-05-17.md` (Phase 4,
 * dealbreaker-verified).
 *
 * Usage:
 *   node scripts/skill-ingest.mjs --week 2026-W20 --dry-run
 *   node scripts/skill-ingest.mjs --week 2026-W20 --apply
 *   node scripts/skill-ingest.mjs              # defaults to current ISO week
 *
 * Flags:
 *   --week <YYYY-Www>   ISO week index (default = current week)
 *   --dry-run           Preview extraction. No JSON write, no corpus edits.
 *   --apply             Run the full pipeline: extract, write JSON, merge,
 *                       commit each touched file via agent-commit.mjs.
 *
 * If neither --dry-run nor --apply is passed, the script defaults to a
 * non-destructive "extract + write JSON" pass (no corpus merges).
 *
 * Exit codes:
 *   0  success
 *   1  validation / config error
 *   2  Gemini API error (after both structured-output shapes attempted)
 *   3  schema-validation failure on Gemini's response
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import 'dotenv/config';

import { WeeklyIngestSchema, getJsonSchema } from '../lib/skill-ingest-schema.mjs';
import { installRunRecord } from '../lib/job-runs-ledger.mjs';

const __jobRun = installRunRecord('skill-ingest');

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(__filename, '../..');

/* -------------------------------------------------------------------------- */
/* CLI args                                                                   */
/* -------------------------------------------------------------------------- */

const args = process.argv.slice(2);
function arg(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
}
function flag(name) { return args.includes(name); }

const weekArg = arg('--week');
const dryRun = flag('--dry-run');
const apply = flag('--apply');

if (dryRun && apply) {
  console.error(JSON.stringify({ ok: false, error: '--dry-run and --apply are mutually exclusive' }));
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* ISO week helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Compute the ISO week index (YYYY-Www) for a given Date.
 * Monday-start, ISO 8601. Matches `date +%G-W%V` on macOS/Linux.
 */
export function getIsoWeek(date = new Date()) {
  // Copy date so original is not mutated.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // ISO 8601: week day is Monday=1..Sunday=7.
  const dayNum = d.getUTCDay() || 7;
  // Set to nearest Thursday: current date + 4 - current day number.
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  // Get first day of year.
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  // Calculate full weeks to nearest Thursday.
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

const weekIso = weekArg || getIsoWeek();
if (!/^\d{4}-W\d{2}$/.test(weekIso)) {
  console.error(JSON.stringify({ ok: false, error: `Invalid --week format: "${weekIso}" (expected YYYY-Www)` }));
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* File paths                                                                 */
/* -------------------------------------------------------------------------- */

const weeklyDropPath = resolve(ROOT, 'data', 'skill-tracker', `${weekIso}.md`);
const extractedDir = resolve(ROOT, 'data', 'skill-tracker', 'extracted');
const extractedJsonPath = resolve(extractedDir, `${weekIso}.json`);

if (!existsSync(weeklyDropPath)) {
  console.error(JSON.stringify({
    ok: false,
    error: `Weekly drop not found at ${relative(ROOT, weeklyDropPath)}`,
    hint: `Copy data/skill-tracker/_TEMPLATE.md to ${weekIso}.md and fill it in.`,
  }));
  process.exit(1);
}

const weeklyDropMarkdown = readFileSync(weeklyDropPath, 'utf-8');

/* -------------------------------------------------------------------------- */
/* Corpus bundling (lightweight — full bundle is the v2 enhancement)          */
/* -------------------------------------------------------------------------- */

function safeRead(relPath) {
  try {
    return readFileSync(resolve(ROOT, relPath), 'utf-8');
  } catch {
    return '';
  }
}

const corpusBundle = [
  '## cv.md',
  safeRead('cv.md').slice(0, 8000),
  '\n## config/profile.yml',
  safeRead('config/profile.yml').slice(0, 4000),
].filter(Boolean).join('\n');

/* -------------------------------------------------------------------------- */
/* Prompt construction                                                        */
/* -------------------------------------------------------------------------- */

const today = new Date().toISOString().slice(0, 10);

const systemInstruction = [
  `Today is ${today} PT. The year 2026 is real, not hypothetical — your`,
  `orchestrator has verified it via system clock. You are extracting Mitchell`,
  `Williams's weekly career evidence from the provided skill-tracker markdown.`,
  `Output ONLY structured JSON that conforms to the supplied schema.`,
  ``,
  `Hard rules (CRITICAL):`,
  `1. NEVER invent skills, certifications, courses, projects, or evidence.`,
  `   If the weekly drop is sparse, return empty arrays for the sparse sections`,
  `   and set extraction_confidence to "low".`,
  `2. You may REFRAME Mitchell's own wording for clarity, but never extend a`,
  `   claim beyond what the drop documents.`,
  `3. Citations should reference the weekly drop's section headers or file`,
  `   paths the drop names. Do not fabricate URLs.`,
  `4. Confidence calibration: skip evidence below ~0.5 internal confidence.`,
  `   Set extraction_confidence to "low" if you skip more than ~30% of items.`,
  `5. The week_iso field MUST equal "${weekIso}".`,
].join('\n');

const userPrompt = [
  `# Weekly drop — ${weekIso}`,
  '',
  weeklyDropMarkdown,
  '',
  '# Corpus context (cv.md + config/profile.yml — for grounding only, do NOT extract from this)',
  '',
  corpusBundle,
  '',
  '# Task',
  '',
  `Extract structured evidence from the weekly drop above. Return JSON matching`,
  `the supplied schema. week_iso = "${weekIso}".`,
].join('\n');

/* -------------------------------------------------------------------------- */
/* Gemini call — dual structured-output shape with HTTP-400 fallback          */
/* -------------------------------------------------------------------------- */

const GEMINI_MODEL = 'gemini-3.1-pro-preview';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY not set in environment (check .env)' }));
  process.exit(1);
}

const jsonSchema = getJsonSchema();

/**
 * Build a Gemini request body using the specified structured-output shape.
 * shape = "responseFormat" (Gemini 3 dev guide) or "responseSchema" (older 2.x).
 */
function buildGeminiBody(shape) {
  const base = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: {
      maxOutputTokens: 8000,
      temperature: 0.1,
    },
  };

  if (shape === 'responseFormat') {
    base.generationConfig.responseFormat = {
      text: {
        mimeType: 'application/json',
        schema: jsonSchema,
      },
    };
  } else {
    base.generationConfig.responseMimeType = 'application/json';
    base.generationConfig.responseSchema = jsonSchema;
  }

  return base;
}

async function callGemini(shape) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const body = buildGeminiBody(shape);

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const errText = (await r.text()).slice(0, 600);
    return { ok: false, status: r.status, errText, shape };
  }

  const j = await r.json();
  const content = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  return {
    ok: true,
    status: r.status,
    content,
    shape,
    tokens: j.usageMetadata?.totalTokenCount || 0,
  };
}

async function runGeminiWithFallback() {
  // Try responseFormat first per the Gemini 3 dev guide.
  let result = await callGemini('responseFormat');
  if (result.ok) {
    return result;
  }
  // On HTTP 400, retry with the older responseSchema + responseMimeType shape.
  if (result.status === 400) {
    console.error(`[skill-ingest] responseFormat shape rejected (HTTP 400). Retrying with responseSchema...`);
    result = await callGemini('responseSchema');
    if (result.ok) {
      console.error(`[skill-ingest] responseSchema shape accepted.`);
      return result;
    }
  }
  console.error(JSON.stringify({
    ok: false,
    error: `Gemini API error after both shapes attempted`,
    status: result.status,
    errText: result.errText,
  }));
  process.exit(2);
}

/* -------------------------------------------------------------------------- */
/* Dry-run short-circuit                                                      */
/* -------------------------------------------------------------------------- */

if (dryRun) {
  const preview = {
    ok: true,
    dry_run: true,
    week_iso: weekIso,
    weekly_drop_path: relative(ROOT, weeklyDropPath),
    weekly_drop_bytes: Buffer.byteLength(weeklyDropMarkdown, 'utf-8'),
    extracted_json_path: relative(ROOT, extractedJsonPath),
    gemini_model: GEMINI_MODEL,
    structured_output_strategy: 'responseFormat first, fallback to responseSchema on HTTP 400',
    schema_keys: Object.keys(WeeklyIngestSchema.shape),
    schema_top_level_required: jsonSchema.required || [],
    system_instruction_preview: systemInstruction.slice(0, 240) + '...',
    user_prompt_bytes: Buffer.byteLength(userPrompt, 'utf-8'),
    notes: [
      'No API call made in --dry-run mode.',
      'No JSON written, no corpus edits, no commits.',
      'Re-run without --dry-run to extract; add --apply to merge into corpus.',
    ],
  };
  console.log(JSON.stringify(preview, null, 2));
  process.exit(0);
}

/* -------------------------------------------------------------------------- */
/* Extract                                                                    */
/* -------------------------------------------------------------------------- */

const gemini = await runGeminiWithFallback();

let parsed;
try {
  parsed = JSON.parse(gemini.content);
} catch (e) {
  console.error(JSON.stringify({
    ok: false,
    error: `Gemini returned non-JSON content despite structured-output mode`,
    detail: String(e.message || e),
    content_preview: gemini.content.slice(0, 400),
  }));
  process.exit(3);
}

const validation = WeeklyIngestSchema.safeParse(parsed);
if (!validation.success) {
  console.error(JSON.stringify({
    ok: false,
    error: 'Gemini output failed schema validation',
    issues: validation.error.issues.slice(0, 10),
    content_preview: gemini.content.slice(0, 400),
  }));
  process.exit(3);
}

const validated = validation.data;

// Write the extracted JSON
if (!existsSync(extractedDir)) {
  mkdirSync(extractedDir, { recursive: true });
}
writeFileSync(extractedJsonPath, JSON.stringify(validated, null, 2) + '\n', 'utf-8');

/* -------------------------------------------------------------------------- */
/* Merge (Phase 4 Dimension 3) — only on --apply                              */
/* -------------------------------------------------------------------------- */

/**
 * Compute a short SHA-1 prefix for an evidence marker. Pure-JS to avoid
 * Node-version assumptions on `crypto.subtle`.
 */
async function sha1Prefix(text, prefixLen = 10) {
  const { createHash } = await import('crypto');
  return createHash('sha1').update(text, 'utf-8').digest('hex').slice(0, prefixLen);
}

/**
 * Append a bullet to a markdown section, idempotent via SHA-1 evidence marker.
 * Returns { changed: bool, marker: string }.
 *
 * Strategy: simple string-based H2 + first-blank-line append. Phase 4
 * Dimension 3 finding #15 recommends remark+unist AST for v2; this v1 uses
 * straightforward find-section-and-append because it's small and bounded.
 */
async function appendBulletWithMarker({ filePath, sectionHeading, bullet, kind, slug }) {
  const sha = await sha1Prefix(`${kind}:${slug}:${bullet}`);
  const marker = `<!-- evidence:${kind}:${slug}:${sha} -->`;

  if (!existsSync(filePath)) {
    console.warn(`[skill-ingest] merge target missing, skipping: ${relative(ROOT, filePath)}`);
    return { changed: false, marker, reason: 'target_missing' };
  }

  const body = readFileSync(filePath, 'utf-8');

  // Idempotency: already inserted?
  if (body.includes(marker)) {
    return { changed: false, marker, reason: 'already_present' };
  }

  // Locate the H2/H3 heading (caller passes the literal heading line).
  const idx = body.indexOf(sectionHeading);
  if (idx === -1) {
    console.warn(`[skill-ingest] section "${sectionHeading}" not found in ${relative(ROOT, filePath)}; appending to EOF instead.`);
    const appended = `${body.replace(/\n+$/, '')}\n\n${sectionHeading}\n\n- ${bullet} ${marker}\n`;
    writeFileSync(filePath, appended, 'utf-8');
    return { changed: true, marker, reason: 'appended_to_eof_with_new_section' };
  }

  // Insert as a bullet right after the heading line.
  const headingEnd = body.indexOf('\n', idx);
  const before = body.slice(0, headingEnd + 1);
  const after = body.slice(headingEnd + 1);
  const newBullet = `\n- ${bullet} ${marker}\n`;
  writeFileSync(filePath, before + newBullet + after, 'utf-8');
  return { changed: true, marker, reason: 'inserted_after_heading' };
}

/**
 * Slugify a name into a kebab-case fragment suitable for an evidence marker.
 */
function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Run the agent-commit helper for a set of files.
 * Returns the JSON result the helper printed.
 */
function agentCommit({ files, message }) {
  if (!files.length) {
    return { ok: true, skipped: 'no_files' };
  }
  const r = spawnSync('node', [
    resolve(ROOT, 'scripts', 'agent-commit.mjs'),
    '--agent', 'skill-ingest',
    '--files', files.join(','),
    '--message', message,
  ], { cwd: ROOT, encoding: 'utf-8' });

  let parsed;
  try {
    parsed = JSON.parse(r.stdout || '{}');
  } catch {
    parsed = { ok: false, error: 'unparseable agent-commit output', stdout: r.stdout, stderr: r.stderr };
  }
  if (r.status !== 0 && parsed.ok === undefined) {
    parsed.ok = false;
    parsed.exit_status = r.status;
  }
  return parsed;
}

const mergeReport = {
  files_touched: new Set(),
  bullets_inserted: 0,
  bullets_skipped: 0,
  commits: [],
};

async function runMerge(extracted) {
  const cvPath = resolve(ROOT, 'cv.md');
  const profilePath = resolve(ROOT, 'config', 'profile.yml');

  // 1. Skills → cv.md "## Skills" cluster (best-effort heading match)
  for (const skill of extracted.skills) {
    const bullet = `${skill.name} — ${skill.evidence} (week ${extracted.week_iso})`;
    const r = await appendBulletWithMarker({
      filePath: cvPath,
      sectionHeading: '## Skills',
      bullet,
      kind: 'skill',
      slug: slugify(skill.name),
    });
    if (r.changed) {
      mergeReport.bullets_inserted++;
      mergeReport.files_touched.add('cv.md');
    } else {
      mergeReport.bullets_skipped++;
    }
  }

  // 2. Courses → cv.md "## Continuous learning"
  for (const course of extracted.courses) {
    if (!course.completion_date) continue; // only completed courses
    const bullet = `${course.name} (${course.provider}) — completed ${course.completion_date}`;
    const r = await appendBulletWithMarker({
      filePath: cvPath,
      sectionHeading: '## Continuous learning',
      bullet,
      kind: 'course',
      slug: slugify(`${course.name}-${course.provider}`),
    });
    if (r.changed) {
      mergeReport.bullets_inserted++;
      mergeReport.files_touched.add('cv.md');
    } else {
      mergeReport.bullets_skipped++;
    }
  }

  // 3. Certifications → cv.md "## Certifications" + flag for profile.yml proof_points
  for (const cert of extracted.certifications) {
    const bullet = `${cert.name} (${cert.issuer}) — ${cert.date}${cert.artifact_url ? ` — ${cert.artifact_url}` : ''}`;
    const r = await appendBulletWithMarker({
      filePath: cvPath,
      sectionHeading: '## Certifications',
      bullet,
      kind: 'cert',
      slug: slugify(`${cert.name}-${cert.issuer}`),
    });
    if (r.changed) {
      mergeReport.bullets_inserted++;
      mergeReport.files_touched.add('cv.md');
    } else {
      mergeReport.bullets_skipped++;
    }
  }

  // 4. TPgM evidence → corpus/roles/google-xge.md (if present)
  const xgePath = resolve(ROOT, 'corpus', 'roles', 'google-xge.md');
  for (const ev of extracted.tpgm_evidence) {
    const bullet = `${ev.work_item} — ${ev.technical_signal} (impact ${ev.scoring_impact.toFixed(2)}, week ${extracted.week_iso})`;
    const r = await appendBulletWithMarker({
      filePath: xgePath,
      sectionHeading: '## TPgM evidence',
      bullet,
      kind: 'tpgm',
      slug: slugify(ev.work_item),
    });
    if (r.changed) {
      mergeReport.bullets_inserted++;
      mergeReport.files_touched.add(relative(ROOT, xgePath));
    } else {
      mergeReport.bullets_skipped++;
    }
  }

  // Single commit grouping all touched files. agent-commit.mjs handles
  // empty-diff skip on its own, so this is safe even if every bullet was a
  // duplicate.
  const files = [...mergeReport.files_touched];
  if (files.length) {
    const commit = agentCommit({
      files,
      message: `Ingest ${extracted.week_iso}: ${mergeReport.bullets_inserted} bullets across ${files.length} file(s) (skills=${extracted.skills.length}, courses=${extracted.courses.length}, certs=${extracted.certifications.length}, tpgm=${extracted.tpgm_evidence.length})`,
    });
    mergeReport.commits.push(commit);
  }
}

if (apply) {
  await runMerge(validated);
}

/* -------------------------------------------------------------------------- */
/* Story-bank prompting (I5 / finding #45)                                   */
/* For any evidence item that crosses scoring_impact >= 0.15 AND a          */
/* confidence proxy >= 0.8, append a "Should I write a STAR story?" nudge.  */
/*                                                                            */
/* Confidence proxy: we map extraction_confidence to a numeric:              */
/*   high   → 1.0   medium → 0.7   low → 0.4                                */
/* This means high-confidence extractions always unlock the nudge when       */
/* scoring_impact >= 0.15; medium-confidence extractions do not.             */
/* -------------------------------------------------------------------------- */

const STORY_BANK_SCORING_IMPACT_THRESHOLD = 0.15;
const STORY_BANK_CONFIDENCE_THRESHOLD = 0.8;

const confidenceNumeric = {
  high: 1.0,
  medium: 0.7,
  low: 0.4,
}[validated.extraction_confidence] ?? 0.5;

/**
 * Returns story-bank nudge candidates from tpgm_evidence and pm_bridge_evidence.
 * Both evidence types are ranked highest-impact first.
 */
function buildStoryBankNudges(extracted, confScore) {
  if (confScore < STORY_BANK_CONFIDENCE_THRESHOLD) return [];

  const nudges = [];

  for (const ev of extracted.tpgm_evidence) {
    if (ev.scoring_impact >= STORY_BANK_SCORING_IMPACT_THRESHOLD) {
      nudges.push({
        kind: 'tpgm',
        work_item: ev.work_item,
        scoring_impact: ev.scoring_impact,
        prompt: `Should I write a STAR story for "${ev.work_item}"?`,
        link: '/story-bank-add', // TODO endpoint (Wave H)
      });
    }
  }

  for (const ev of extracted.pm_bridge_evidence) {
    if (ev.weight_for_pm_transition >= STORY_BANK_SCORING_IMPACT_THRESHOLD) {
      nudges.push({
        kind: 'pm_bridge',
        work_item: ev.evidence.slice(0, 100),
        scoring_impact: ev.weight_for_pm_transition,
        prompt: `Should I write a STAR story for this PM-bridge evidence?`,
        link: '/story-bank-add', // TODO endpoint (Wave H)
      });
    }
  }

  // Sort highest impact first
  return nudges.sort((a, b) => b.scoring_impact - a.scoring_impact);
}

const storyBankNudges = buildStoryBankNudges(validated, confidenceNumeric);

/* -------------------------------------------------------------------------- */
/* Final report                                                               */
/* -------------------------------------------------------------------------- */

const report = {
  ok: true,
  week_iso: validated.week_iso,
  extraction_confidence: validated.extraction_confidence,
  counts: {
    skills: validated.skills.length,
    projects: validated.projects.length,
    certifications: validated.certifications.length,
    courses: validated.courses.length,
    tpgm_evidence: validated.tpgm_evidence.length,
    pm_bridge_evidence: validated.pm_bridge_evidence.length,
    skill_portability_evidence: validated.skill_portability_evidence.length,
  },
  extracted_json: relative(ROOT, extractedJsonPath),
  gemini: {
    model: GEMINI_MODEL,
    accepted_shape: gemini.shape,
    tokens: gemini.tokens,
  },
  merge: apply ? {
    bullets_inserted: mergeReport.bullets_inserted,
    bullets_skipped: mergeReport.bullets_skipped,
    files_touched: [...mergeReport.files_touched],
    commits: mergeReport.commits,
  } : { skipped: 'no --apply flag' },
  story_bank_nudges: storyBankNudges.length > 0 ? {
    count: storyBankNudges.length,
    threshold: {
      scoring_impact: STORY_BANK_SCORING_IMPACT_THRESHOLD,
      confidence: `>= ${STORY_BANK_CONFIDENCE_THRESHOLD} (extraction_confidence must be "high" for this run)`,
    },
    nudges: storyBankNudges,
  } : { count: 0, reason: `extraction_confidence="${validated.extraction_confidence}" (numeric ${confidenceNumeric}) is below threshold ${STORY_BANK_CONFIDENCE_THRESHOLD} or no evidence exceeded impact ${STORY_BANK_SCORING_IMPACT_THRESHOLD}` },
};

console.log(JSON.stringify(report, null, 2));
process.exit(0);
