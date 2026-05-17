#!/usr/bin/env node
/**
 * scripts/build-apply-orchestrator.test.mjs — Minimal smoke test for the
 * Phase 3 orchestrator scaffold.
 *
 * Runs the orchestrator against row 50 (ElevenLabs Communications Manager,
 * currently #12 in data/apply-now-queue.json — top of Mitchell's Tier B
 * surface per data/build-day-log-2026-05-17.md). Validates the assembled
 * ApplyPack against the canonical schema and asserts each of the 7 stages
 * produced an output.
 *
 * Exit code 0 = all checks pass.
 */

import { strict as assert } from 'assert';
import {
  orchestrateApplyPack,
  parseJd,
  fetchHmIntel,
  loadCorpus,
  fanOutDrafts,
  voicePass,
  humanizeGate,
  manualApprove,
  loadAiPolicy,
  loadRowContext,
} from './build-apply-orchestrator.mjs';
import {
  ApplyPackSchema,
  APPLY_PACK_STAGES,
} from '../lib/apply-pack-schema.mjs';

const ROW_ID = 50;
const start = Date.now();
const report = {
  ok: false,
  row_id: ROW_ID,
  checks: [],
};

function check(name, condition, detail = '') {
  if (condition) {
    report.checks.push({ name, status: 'pass', detail });
  } else {
    report.checks.push({ name, status: 'fail', detail });
    throw new Error(`check failed: ${name}${detail ? ' — ' + detail : ''}`);
  }
}

try {
  // Stage isolation sanity — each stage must be a function we can call.
  for (const stageName of [
    'parseJd',
    'fetchHmIntel',
    'loadCorpus',
    'fanOutDrafts',
    'voicePass',
    'humanizeGate',
    'manualApprove',
  ]) {
    const fns = {
      parseJd,
      fetchHmIntel,
      loadCorpus,
      fanOutDrafts,
      voicePass,
      humanizeGate,
      manualApprove,
    };
    check(`stage_exported_${stageName}`, typeof fns[stageName] === 'function');
  }

  check(
    'stage_enum_length',
    APPLY_PACK_STAGES.length === 7,
    `expected 7, got ${APPLY_PACK_STAGES.length}`
  );

  // Row context resolves
  const row = loadRowContext(ROW_ID);
  check('row_50_resolves', row !== null, `loadRowContext(${ROW_ID})`);
  check(
    'row_50_company_elevenlabs',
    row.company.toLowerCase().includes('elevenlabs'),
    `row.company=${row.company}`
  );

  // AI policy excerpt loaded (elevenlabs stub entry in data/ai-policies.yml)
  const policy = loadAiPolicy(row.company);
  check(
    'ai_policy_loaded',
    policy && typeof policy === 'object',
    'expected object excerpt from data/ai-policies.yml'
  );
  check(
    'ai_policy_has_elevenlabs',
    policy.company_slug === 'elevenlabs' || policy._resolved !== 'defaults',
    `policy.company_slug=${policy.company_slug}`
  );

  // Run the full orchestrator in dry-run mode without writing to disk
  const { pack, stages } = await orchestrateApplyPack({
    rowId: ROW_ID,
    archetype: 'B',
    dryRun: true,
    write: false,
  });

  check('orchestrator_returns_pack', pack && typeof pack === 'object');
  check('orchestrator_returns_stages', Array.isArray(stages) && stages.length === 7);

  // Each stage must have produced output evidenced in the assembled pack
  check(
    'stage_1_parse_jd_output',
    pack.inputs?.jd_url && pack.inputs?.jd_text,
    `inputs.jd_url=${pack.inputs?.jd_url?.slice(0, 30)}…`
  );
  check(
    'stage_2_fetch_hm_intel_output',
    'hm_intel_path' in pack.inputs,
    'inputs.hm_intel_path field present'
  );
  check(
    'stage_3_load_corpus_output',
    pack.inputs?.archetype,
    `inputs.archetype=${pack.inputs?.archetype}`
  );
  check(
    'stage_4_fan_out_drafts_output',
    pack.artifacts?.cv &&
      pack.artifacts?.cover_letter &&
      pack.artifacts?.why_statement &&
      pack.artifacts?.linkedin_dm &&
      Array.isArray(pack.artifacts?.form_field_answers),
    'all 5 sub-agent outputs present'
  );
  check(
    'stage_5_voice_pass_output',
    typeof pack.artifacts?.cover_letter?.voice_fidelity_cosine === 'number',
    `cover_letter.voice_fidelity_cosine=${pack.artifacts?.cover_letter?.voice_fidelity_cosine}`
  );
  check(
    'stage_6_humanize_gate_output',
    Array.isArray(pack.gates) && pack.gates.length >= 6,
    `gates.length=${pack.gates?.length}`
  );
  check(
    'stage_7_manual_approve_output',
    pack.status === 'awaiting-human-review',
    `pack.status=${pack.status}`
  );

  // AI policy excerpt is carried through into the pack
  check(
    'ai_policy_carried_into_inputs',
    pack.inputs?.company_ai_policy &&
      (pack.inputs.company_ai_policy.company_slug === 'elevenlabs' ||
        pack.inputs.company_ai_policy._resolved !== 'defaults'),
    `inputs.company_ai_policy.company_slug=${pack.inputs?.company_ai_policy?.company_slug}`
  );

  // Final schema parse must succeed (defensive — orchestrator already parsed,
  // but we re-validate here to confirm the returned object is the canonical
  // shape and nothing has mutated it post-return).
  const reparsed = ApplyPackSchema.safeParse(pack);
  check(
    'schema_validates',
    reparsed.success,
    reparsed.success
      ? 'safeParse OK'
      : `safeParse error: ${JSON.stringify(reparsed.error?.issues?.slice(0, 2))}`
  );

  report.ok = true;
  report.runtime_ms = Date.now() - start;
  report.stages_ran = APPLY_PACK_STAGES;
  report.pack_summary = {
    row_id: pack.meta.row_id,
    company: pack.meta.company,
    role: pack.meta.role,
    score: pack.meta.score,
    status: pack.status,
    gates_count: pack.gates.length,
    ai_policy_slug: pack.inputs.company_ai_policy.company_slug,
  };
} catch (err) {
  report.ok = false;
  report.error = err.message;
  report.runtime_ms = Date.now() - start;
}

process.stdout.write(JSON.stringify(report, null, 2) + '\n');
process.exit(report.ok ? 0 : 1);
