#!/usr/bin/env node
/**
 * scripts/build-apply-orchestrator.mjs — Phase 3 output-pipeline orchestrator.
 *
 * Single Node.js orchestrator that produces a validated ApplyPack JSON object
 * per Dimension 1 of `data/output-pipeline-strategy-2026-05-17.md`. This is
 * the SCAFFOLD-ONLY landing (2026-05-17). Each of the 7 stages is a discrete,
 * separately-exported async function. In `dry-run` mode (the default today)
 * every stage returns a shape-correct stub so the assembled ApplyPack
 * validates against `lib/apply-pack-schema.mjs` without making any live LLM
 * calls. Live mode throws `live mode not implemented — scaffold only` so the
 * surface area is obvious to whichever sub-agent fills it in next.
 *
 * Architecture (per dealbreaker-adjudicated council report):
 *   1. parse_jd        — read JD URL + text from the row context
 *   2. fetch_hm_intel  — load data/hm-intel/{slug}.json if present
 *   3. load_corpus     — collect cv.md / article-digest.md / story-bank / voice
 *   4. fan_out_drafts  — Promise.allSettled across 5 independent sub-agents
 *   5. voice_pass      — paragraph-level cosine vs voice-reference centroid
 *   6. humanize_gate   — humanize-check + AI-policy compliance gates
 *   7. manual_approve  — emit awaiting-human-review status; STOP
 *
 * CLI usage:
 *   node scripts/build-apply-orchestrator.mjs --row 50
 *   node scripts/build-apply-orchestrator.mjs --row 50 --archetype A2-PgM
 *   node scripts/build-apply-orchestrator.mjs --row 50 --dry-run=false   (UNIMPLEMENTED)
 *   node scripts/build-apply-orchestrator.mjs --row 50 --out apply-pack/050-elevenlabs/
 *
 * Returns a JSON ApplyPack object via stdout when run as a script.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import yaml from 'js-yaml';

import {
  ApplyPackSchema,
  APPLY_PACK_STAGES,
} from '../lib/apply-pack-schema.mjs';

import { runCvTailor } from './agents/cv-tailor.mjs';
import { runCoverLetter } from './agents/cover-letter.mjs';
import { runWhyStatement } from './agents/why-statement.mjs';
import { runLinkedinDm } from './agents/linkedin-dm.mjs';
import { runFormFields } from './agents/form-fields.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TRACKER_MD = join(ROOT, 'data/applications.md');
const APPLY_QUEUE_JSON = join(ROOT, 'data/apply-now-queue.json');
const AI_POLICIES_YML = join(ROOT, 'data/ai-policies.yml');
const HM_INTEL_DIR = join(ROOT, 'data/hm-intel');
const PIPELINE_VERSION = '1.0.0';

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq >= 0) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[arg.slice(2)] = next;
        i++;
      } else {
        out[arg.slice(2)] = true;
      }
    }
  }
  return out;
}

function loadRowFromQueue(rowId) {
  if (!existsSync(APPLY_QUEUE_JSON)) return null;
  try {
    const queue = JSON.parse(readFileSync(APPLY_QUEUE_JSON, 'utf-8'));
    const ranked = queue.ranked || [];
    return (
      ranked.find((r) => String(r.num) === String(rowId)) || null
    );
  } catch {
    return null;
  }
}

function loadRowFromTracker(rowId) {
  if (!existsSync(TRACKER_MD)) return null;
  const lines = readFileSync(TRACKER_MD, 'utf-8').split('\n');
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cols = line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (cols.length < 9) continue;
    if (cols[0] !== String(rowId)) continue;
    const scoreMatch = (cols[4] || '').match(/(\d+(?:\.\d+)?)\/5/);
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
    const linkMatch = (cols[7] || '').match(/\[(\d+)\]\(([^)]+\.md)\)/);
    return {
      num: cols[0],
      date: cols[1],
      company: cols[2],
      role: cols[3],
      score,
      status: cols[5],
      report: linkMatch ? `[${linkMatch[1]}](${linkMatch[2]})` : '',
      notes_summary: cols[8] || '',
    };
  }
  return null;
}

/**
 * Resolve the row context from apply-now-queue.json first, then applications.md.
 * Returns a normalized shape regardless of source.
 */
export function loadRowContext(rowId) {
  const queueRow = loadRowFromQueue(rowId);
  if (queueRow) {
    return {
      row_id: Number(queueRow.num),
      company: queueRow.company || 'Unknown',
      role: queueRow.role || 'Unknown',
      score: Number(queueRow.eval_score ?? 0),
      eval_date: queueRow.eval_date || new Date().toISOString().slice(0, 10),
      report: queueRow.report || '',
      notes_summary: queueRow.notes_summary || '',
      source: 'apply-now-queue.json',
    };
  }
  const trackerRow = loadRowFromTracker(rowId);
  if (trackerRow) {
    return {
      row_id: Number(trackerRow.num),
      company: trackerRow.company || 'Unknown',
      role: trackerRow.role || 'Unknown',
      score: trackerRow.score,
      eval_date: trackerRow.date || new Date().toISOString().slice(0, 10),
      report: trackerRow.report || '',
      notes_summary: trackerRow.notes_summary || '',
      source: 'applications.md',
    };
  }
  return null;
}

/**
 * Load data/ai-policies.yml and return the per-company policy excerpt.
 * Falls back to the file's `defaults` block if the company key is not
 * present. The returned object is the raw YAML excerpt — shape is
 * intentionally loose so future policy fields don't break callers.
 */
export function loadAiPolicy(company) {
  if (!existsSync(AI_POLICIES_YML)) {
    return { status: 'unknown', notes: 'ai-policies.yml not found' };
  }
  const raw = yaml.load(readFileSync(AI_POLICIES_YML, 'utf-8'));
  const slug = slugify(company);
  const policies = raw?.policies || {};
  const direct = policies[slug];
  if (direct) return { company_slug: slug, ...direct };

  // Try common alias resolution (e.g. ElevenLabs → elevenlabs already covered;
  // anduril-industries → anduril, x-ai → xai).
  for (const key of Object.keys(policies)) {
    if (slug.includes(key) || key.includes(slug)) {
      return { company_slug: key, ...policies[key] };
    }
  }
  const defaults = raw?.defaults || {};
  return { company_slug: slug, ...defaults, _resolved: 'defaults' };
}

/**
 * Locate the data/hm-intel/{slug}.json file matching company + role.
 * Returns { path, intel } or null if no file matches.
 */
export function loadHmIntel(company, role) {
  if (!existsSync(HM_INTEL_DIR)) return null;
  const files = readdirSync(HM_INTEL_DIR).filter((f) => f.endsWith('.json'));
  const target = slugify(`${company}-${role}`);
  // Match a file whose name shares at least a prefix with the company slug.
  const companySlug = slugify(company);
  const candidates = files.filter((f) => {
    const fileSlug = f.replace(/\.json$/, '');
    return fileSlug === target || fileSlug.startsWith(companySlug);
  });
  if (!candidates.length) return null;
  const chosen = candidates[0];
  const absPath = join(HM_INTEL_DIR, chosen);
  try {
    const intel = JSON.parse(readFileSync(absPath, 'utf-8'));
    return { path: `data/hm-intel/${chosen}`, intel };
  } catch {
    return { path: `data/hm-intel/${chosen}`, intel: null };
  }
}

/* -------------------------------------------------------------------------- */
/* Stage 1: parse_jd                                                          */
/* -------------------------------------------------------------------------- */

/**
 * @param {{row: ReturnType<typeof loadRowContext>, dryRun: boolean}} args
 */
export async function parseJd({ row, dryRun = true }) {
  if (!row) throw new Error('parse_jd: row context is required');
  if (!dryRun) {
    throw new Error('live mode not implemented — scaffold only');
  }
  // Scaffold: derive a placeholder JD URL/text from the row's notes.
  return {
    jd_url: `https://example.com/jobs/${slugify(row.company)}/${slugify(row.role)}`,
    jd_text:
      `[SCAFFOLD] Stub JD text for ${row.company} — ${row.role}. ` +
      `Notes from tracker: ${row.notes_summary || '(none)'}.`,
    company: row.company,
    role: row.role,
  };
}

/* -------------------------------------------------------------------------- */
/* Stage 2: fetch_hm_intel                                                    */
/* -------------------------------------------------------------------------- */

export async function fetchHmIntel({ company, role, dryRun = true }) {
  if (!dryRun) {
    throw new Error('live mode not implemented — scaffold only');
  }
  const result = loadHmIntel(company, role);
  if (!result) {
    return { hm_intel_path: null, hm_intel_object: null };
  }
  return { hm_intel_path: result.path, hm_intel_object: result.intel };
}

/* -------------------------------------------------------------------------- */
/* Stage 3: load_corpus                                                       */
/* -------------------------------------------------------------------------- */

export async function loadCorpus({ archetype = 'A2-PgM', dryRun = true } = {}) {
  if (!dryRun) {
    throw new Error('live mode not implemented — scaffold only');
  }
  // Scaffold: return paths to canonical corpus files. Existence is not asserted
  // — those checks belong in the live implementation.
  return {
    archetype,
    cv_path: 'cv.md',
    article_digest_path: 'article-digest.md',
    story_bank_path: 'interview-prep/story-bank.md',
    voice_reference_path: 'writing-samples/voice-reference.md',
  };
}

/* -------------------------------------------------------------------------- */
/* Stage 4: fan_out_drafts (Promise.allSettled)                               */
/* -------------------------------------------------------------------------- */

/**
 * Spawns 5 independent sub-agents in parallel via `Promise.allSettled`:
 * cv-tailor, cover-letter, why-statement, linkedin-dm, form-fields.
 *
 * Each sub-agent is imported from `scripts/agents/*.mjs` and accepts a
 * uniform `SubAgentInput` → `SubAgentOutput` contract (see
 * `scripts/agents/types.mjs`). In dry-run mode each sub-agent returns
 * `{ status: 'skipped', output: null }`. The orchestrator then falls back
 * to the canonical scaffold stubs so the assembled ApplyPack continues to
 * validate against `lib/apply-pack-schema.mjs`. When sub-agents gain live
 * output (Tier B #8+), their `output` field will carry the real artifact and
 * the fallback stubs will be bypassed.
 */
export async function fanOutDrafts({
  jd,
  hmIntel,
  corpus,
  archetype = 'A2-PgM',
  aiPolicy,
  dryRun = true,
}) {
  if (!dryRun) {
    throw new Error('live mode not implemented — scaffold only');
  }
  const company = jd?.company || 'UnknownCo';
  const role = jd?.role || 'Unknown Role';

  // Build the shared SubAgentInput passed to every sub-agent.
  const subAgentInput = {
    pack: { jd, corpus, archetype },
    context: {
      cv: corpus?.cv_path || 'cv.md',
      articleDigest: corpus?.article_digest_path || 'article-digest.md',
      voiceReference: corpus?.voice_reference_path || 'writing-samples/voice-reference.md',
      hmIntel: hmIntel?.intel ?? null,
      aiPolicy,
    },
    config: { dryRun, model: undefined, reasoningEffort: undefined },
  };

  // Fan out all 5 sub-agents in parallel via Promise.allSettled.
  const [cvResult, clResult, whyResult, dmResult, ffResult] =
    await Promise.allSettled([
      runCvTailor(subAgentInput),
      runCoverLetter(subAgentInput),
      runWhyStatement(subAgentInput),
      runLinkedinDm(subAgentInput),
      runFormFields(subAgentInput),
    ]);

  // Helper: unwrap a settled result, returning the SubAgentOutput or null.
  const unwrap = (settled) =>
    settled.status === 'fulfilled' ? settled.value : null;

  const cvAgent    = unwrap(cvResult);
  const clAgent    = unwrap(clResult);
  const whyAgent   = unwrap(whyResult);
  const dmAgent    = unwrap(dmResult);
  const ffAgent    = unwrap(ffResult);

  // Scaffold fallback stubs — used when sub-agent output is null (dry-run or
  // error). In live mode, sub-agents will populate output directly and these
  // stubs will be bypassed by the non-null output branch below.
  const cvFallback = {
    path: `apply-pack/${slugify(company)}-${slugify(role)}/cv.pdf`,
    format: 'pdf',
    citations: [
      {
        claim: '[SCAFFOLD] Voice DNA RAG production methodology',
        source_file: corpus?.cv_path || 'cv.md',
        source_line: 142,
      },
    ],
  };
  const clFallback = {
    path: `apply-pack/${slugify(company)}-${slugify(role)}/cover-letter.md`,
    body_markdown:
      `# Cover Letter (SCAFFOLD)\n\nDraft body for ${company} — ${role}. ` +
      `Voice + humanize gates run downstream.\n`,
    humanize_score: 0,
    voice_fidelity_cosine: 0,
    citations: [],
  };
  const whyFallback = {
    path: `apply-pack/${slugify(company)}-${slugify(role)}/why.md`,
    body_markdown: `# Why ${company} (SCAFFOLD)\n\nStub why-statement body.\n`,
    humanize_score: 0,
  };
  const dmFallback = {
    body: `[SCAFFOLD] LinkedIn DM body for ${company} — ${role}.`,
    channel: 'linkedin-message',
  };
  const ffFallback = [
    { question: '[SCAFFOLD] Why this role?', answer: '[SCAFFOLD] Stub answer.' },
  ];

  return {
    cv:               (cvAgent?.output  ?? null) || cvFallback,
    cover_letter:     (clAgent?.output  ?? null) || clFallback,
    why_statement:    (whyAgent?.output ?? null) || whyFallback,
    linkedin_dm:      (dmAgent?.output  ?? null) || dmFallback,
    form_field_answers: (ffAgent?.output ?? null) || ffFallback,
  };
}

/* -------------------------------------------------------------------------- */
/* Stage 5: voice_pass                                                        */
/* -------------------------------------------------------------------------- */

export async function voicePass({ drafts, voiceReferencePath, dryRun = true }) {
  if (!dryRun) {
    throw new Error('live mode not implemented — scaffold only');
  }
  // Scaffold: populate voice_fidelity_cosine on cover_letter with a safe
  // sentinel that passes the schema's [0,1] bounds. Day 5 / Day 7 will replace
  // this with paragraph-level cosine vs voice-reference centroid.
  void voiceReferencePath;
  const updated = JSON.parse(JSON.stringify(drafts));
  if (updated.cover_letter) {
    updated.cover_letter.voice_fidelity_cosine = 0.8;
  }
  return updated;
}

/* -------------------------------------------------------------------------- */
/* Stage 6: humanize_gate                                                     */
/* -------------------------------------------------------------------------- */

export async function humanizeGate({ drafts, aiPolicy, dryRun = true }) {
  if (!dryRun) {
    throw new Error('live mode not implemented — scaffold only');
  }
  const updated = JSON.parse(JSON.stringify(drafts));
  // Scaffold: stub humanize_score in the 0-20 LOW-risk band.
  if (updated.cover_letter) updated.cover_letter.humanize_score = 15;
  if (updated.why_statement) updated.why_statement.humanize_score = 12;

  // Build the gate ledger entries.
  const gates = [
    {
      name: 'humanize-check',
      status: 'pass',
      detail: '[SCAFFOLD] Stub humanize_score in LOW band (0-20).',
    },
    {
      name: 'voice-fidelity',
      status: 'pass',
      detail: '[SCAFFOLD] Stub cosine 0.80 meets default threshold.',
    },
    {
      name: 'citation-traceback',
      status: 'pass',
      detail: '[SCAFFOLD] CV citations stub references cv.md:142.',
    },
    {
      name: 'length-check',
      status: 'skipped',
      detail: '[SCAFFOLD] Live length checks land in Day 6.',
    },
    {
      name: 'ats-keyword-coverage',
      status: 'skipped',
      detail: '[SCAFFOLD] ATS coverage gate lands with Day 6 typst/Calibri pass.',
    },
    {
      name: 'ai-policy-compliance',
      status:
        aiPolicy && aiPolicy.ai_in_prep === 'prohibited' ? 'fail' : 'pass',
      detail:
        aiPolicy && aiPolicy.ai_in_prep === 'prohibited'
          ? 'AI-in-prep prohibited by company policy.'
          : `AI-in-prep permitted (status=${aiPolicy?.status || 'unknown'}).`,
    },
  ];
  return { drafts: updated, gates };
}

/* -------------------------------------------------------------------------- */
/* Stage 7: manual_approve                                                    */
/* -------------------------------------------------------------------------- */

export async function manualApprove({ pack, dryRun = true }) {
  if (!dryRun) {
    throw new Error('live mode not implemented — scaffold only');
  }
  // No outbound action. The orchestrator surface always stops here in scaffold
  // mode; the live implementation will write to pending-review/ and block on
  // an explicit `scripts/approve-pack.mjs` invocation by Mitchell.
  return { ...pack, status: 'awaiting-human-review' };
}

/* -------------------------------------------------------------------------- */
/* Orchestrator                                                               */
/* -------------------------------------------------------------------------- */

/**
 * @param {{
 *   rowId: number|string,
 *   archetype?: string,
 *   dryRun?: boolean,
 *   outDir?: string|null,
 *   write?: boolean,
 * }} args
 */
export async function orchestrateApplyPack({
  rowId,
  archetype = 'A2-PgM',
  dryRun = true,
  outDir = null,
  write = true,
} = {}) {
  if (rowId === undefined || rowId === null) {
    throw new Error('orchestrateApplyPack: rowId is required');
  }

  const row = loadRowContext(rowId);
  if (!row) {
    throw new Error(
      `orchestrateApplyPack: row ${rowId} not found in apply-now-queue.json or applications.md`
    );
  }

  const aiPolicy = loadAiPolicy(row.company);

  // Stage 1
  const jd = await parseJd({ row, dryRun });

  // Stage 2
  const hmIntel = await fetchHmIntel({
    company: jd.company,
    role: jd.role,
    dryRun,
  });

  // Stage 3
  const corpus = await loadCorpus({ archetype, dryRun });

  // Stage 4
  const drafts = await fanOutDrafts({
    jd,
    hmIntel,
    corpus,
    archetype,
    aiPolicy,
    dryRun,
  });

  // Stage 5
  const voicedDrafts = await voicePass({
    drafts,
    voiceReferencePath: corpus.voice_reference_path,
    dryRun,
  });

  // Stage 6
  const { drafts: gatedDrafts, gates } = await humanizeGate({
    drafts: voicedDrafts,
    aiPolicy,
    dryRun,
  });

  // Resolve out dir
  const resolvedOutDir =
    outDir ||
    join(
      ROOT,
      `data/apply-packs/${String(row.row_id).padStart(3, '0')}-${slugify(
        row.company
      )}-${slugify(row.role)}/`
    );

  // Assemble the ApplyPack object
  const generatedAt = new Date().toISOString();
  const candidate = {
    meta: {
      row_id: row.row_id,
      company: row.company,
      role: row.role,
      score: row.score,
      eval_date: row.eval_date,
      generated_at: generatedAt,
      pipeline_version: PIPELINE_VERSION,
    },
    inputs: {
      jd_url: jd.jd_url,
      jd_text: jd.jd_text,
      hm_intel_path: hmIntel.hm_intel_path,
      archetype,
      company_ai_policy: aiPolicy,
    },
    weighting: {
      sim_alpha: 1.0,
      hm_bias_beta: 0.7,
      ai_risk_gamma: 0.5,
      final_score: 0,
    },
    artifacts: {
      cv: gatedDrafts.cv,
      cover_letter: gatedDrafts.cover_letter,
      why_statement: gatedDrafts.why_statement,
      linkedin_dm: gatedDrafts.linkedin_dm,
      form_field_answers: gatedDrafts.form_field_answers || [],
      one_pager: { path: null },
      interview_prep_brief: { path: null },
      preflight_checklist: {
        path: 'data/pre-flight-checklist.md',
        sections_passed: 0,
        sections_total: 9,
      },
    },
    gates,
    status: 'draft',
  };

  // Stage 7
  const approved = await manualApprove({ pack: candidate, dryRun });

  // Final schema validation
  const parsed = ApplyPackSchema.parse(approved);

  if (write) {
    mkdirSync(resolvedOutDir, { recursive: true });
    writeFileSync(
      join(resolvedOutDir, 'pack.json'),
      JSON.stringify(parsed, null, 2)
    );
    writeFileSync(
      join(resolvedOutDir, 'README.md'),
      renderReadme(parsed, { dryRun })
    );
  }

  return { pack: parsed, outDir: resolvedOutDir, stages: APPLY_PACK_STAGES };
}

function renderReadme(pack, { dryRun }) {
  const policy = pack.inputs.company_ai_policy || {};
  return `# Apply Pack — ${pack.meta.company} — ${pack.meta.role}

**Row:** ${pack.meta.row_id}
**Eval date:** ${pack.meta.eval_date}
**Score:** ${pack.meta.score}/5
**Pipeline version:** ${pack.meta.pipeline_version}
**Generated:** ${pack.meta.generated_at}
**Status:** ${pack.status}
${dryRun ? '\n> **DRY-RUN SCAFFOLD** — no live LLM calls were made. Stage outputs are stubs.\n' : ''}

## AI policy

- Status: ${policy.status || 'unknown'}
- AI in prep: ${policy.ai_in_prep || 'unknown'}
- AI in assessments: ${policy.ai_in_assessments || 'unknown'}
- AI in interviews: ${policy.ai_in_interviews || 'unknown'}
- Source: ${policy.source || '(none)'}

## Gates

| Gate | Status | Detail |
|---|---|---|
${pack.gates.map((g) => `| ${g.name} | ${g.status} | ${g.detail} |`).join('\n')}

## Artifacts

- CV: \`${pack.artifacts.cv.path}\` (${pack.artifacts.cv.format})
- Cover letter: \`${pack.artifacts.cover_letter.path}\` — humanize ${pack.artifacts.cover_letter.humanize_score}/100, voice ${pack.artifacts.cover_letter.voice_fidelity_cosine.toFixed(2)}
- Why statement: \`${pack.artifacts.why_statement.path}\` — humanize ${pack.artifacts.why_statement.humanize_score}/100
- LinkedIn DM: ${pack.artifacts.linkedin_dm.channel}
- Form fields: ${pack.artifacts.form_field_answers.length} answers
- Pre-flight: ${pack.artifacts.preflight_checklist.sections_passed}/${pack.artifacts.preflight_checklist.sections_total}

## Next

Mitchell reviews \`pack.json\`, then runs \`node scripts/approve-pack.mjs\`
(or its successor) to advance from \`awaiting-human-review\` to \`approved\`.
No outbound submission happens automatically.
`;
}

/* -------------------------------------------------------------------------- */
/* CLI entry                                                                  */
/* -------------------------------------------------------------------------- */

const isMain = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    process.stdout.write(
      [
        'Usage: node scripts/build-apply-orchestrator.mjs --row N [options]',
        '',
        'Options:',
        '  --row N             (required) row id in apply-now-queue.json / applications.md',
        '  --archetype TAG     archetype tag (A1, A2-PgM, A2-SA, A2-FDE, A2-AE, B, other)',
        '  --dry-run           dry-run mode (default: true; today only dry-run is implemented)',
        '  --out PATH          output directory (default: data/apply-packs/{row}-{slug}/)',
        '  --no-write          do not write pack.json / README.md to disk',
        '',
      ].join('\n')
    );
    process.exit(0);
  }
  const rowId = args.row;
  if (!rowId) {
    process.stderr.write('error: --row N is required\n');
    process.exit(3);
  }
  const dryRun =
    args['dry-run'] === undefined ||
    args['dry-run'] === true ||
    args['dry-run'] === 'true';
  const write = args['no-write'] !== true && args['no-write'] !== 'true';

  orchestrateApplyPack({
    rowId,
    archetype: args.archetype || 'A2-PgM',
    dryRun,
    outDir: args.out || null,
    write,
  })
    .then((result) => {
      process.stdout.write(
        JSON.stringify(
          {
            ok: true,
            row_id: result.pack.meta.row_id,
            company: result.pack.meta.company,
            role: result.pack.meta.role,
            status: result.pack.status,
            stages: result.stages,
            out_dir: result.outDir,
          },
          null,
          2
        ) + '\n'
      );
    })
    .catch((err) => {
      process.stderr.write(`error: ${err.message}\n`);
      process.exit(1);
    });
}
