#!/usr/bin/env node
/**
 * queue-resolve.mjs — Layered field resolver for the prepare stage.
 *
 * The whole point: fill as much as possible with ZERO model tokens, and hand
 * the agent only the few truly novel fields (as compact structured data, never
 * the DOM). Two sub-commands, both operating on data/apply-queue.json:
 *
 *   node queue-resolve.mjs --pre <role-id>
 *     Layer 1 (field-rules, deterministic) + Layer 2 (embed + answer-cache)
 *     resolve every form field they can. Resolved answers are written into
 *     role.drafts with provenance. Prints JSON: { resolved:[...], novel:[...] }.
 *     The `novel` list is what the agent must answer in Layer 3.
 *
 *   node queue-resolve.mjs --teach <role-id> '<json-array>'
 *     Stores the agent's Layer-3 answers into role.drafts (provenance: model)
 *     AND teaches the answer-cache (embeds each question, stores answer +
 *     reusable flag + entities) so future paraphrases hit Layer 2 for free.
 *     JSON array items: { label, type?, answer, reusable, entities?, confidence? }
 *
 * No network. No generative model. The only embedding calls go to the local
 * embeddinggemma endpoint (embed.mjs). If embeddings are unavailable, Layer 2
 * is skipped and those fields become novel — prepare still works.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

import { loadQueue, saveQueue } from './queue-store.mjs';
import {
  matchProfileRule, normLabel, looksLikeVisaSelect, pickVisaOption,
  chooseOptionDeterministic,
} from './field-rules.mjs';
import { embedSync, cosine } from './embed.mjs';
import {
  loadCache, saveCache, lookup, markUsed, teach, DEFAULT_THRESHOLD,
} from './answer-cache.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

function loadProfile() {
  const p = join(ROOT, 'config', 'profile.yml');
  if (!existsSync(p)) throw new Error('config/profile.yml not found');
  return yaml.load(readFileSync(p, 'utf-8'));
}

function isFileField(f) {
  return f.kind === 'resume' || /file/i.test(f.type || '');
}

function isSelectField(f) {
  return /select/i.test(f.type || '') || (Array.isArray(f.options) && f.options.length > 0);
}

function threshold(profile) {
  const t = profile?.embedding?.threshold;
  return typeof t === 'number' ? t : DEFAULT_THRESHOLD;
}

// ── --pre ───────────────────────────────────────────────────────────────────

function preResolve(roleId) {
  const profile = loadProfile();
  const queue = loadQueue();
  const role = queue.roles.find((r) => r.id === roleId);
  if (!role) throw new Error(`role not found: ${roleId}`);

  const fields = Array.isArray(role.free_text_fields) ? role.free_text_fields : [];
  role.drafts = role.drafts || {};

  const resolved = [];
  const novel = [];
  const l2candidates = [];   // text fields with no L1 rule → cache lookup
  const optionChoices = [];  // L1 selects needing an embedding-assisted option pick

  const setDraft = (f, patch, summary) => {
    role.drafts[normLabel(f.label)] = { field_type: f.type, label: f.label, ...patch };
    resolved.push({ label: f.label, ...summary });
  };

  // Layer 1 — deterministic profile rules (+ option mapping for selects)
  for (const f of fields) {
    if (isFileField(f)) continue; // resume/cover-letter file → CV attach at fill

    if (isSelectField(f)) {
      const options = f.options || [];
      // Visa/work-rights dropdown → answer from the locked visa policy.
      if (looksLikeVisaSelect(f.label, options)) {
        const pick = pickVisaOption(options, role.visa_answer);
        if (pick) setDraft(f, { answer: pick, widget: 'select', source: 'deterministic', rule: 'visa' },
          { source: 'deterministic', rule: 'visa' });
        else novel.push({ label: f.label, type: f.type, required: !!f.required, options, help: f.help || null });
        continue;
      }
      const hit = matchProfileRule(f.label, f.type, profile, role);
      if (hit) {
        const det = chooseOptionDeterministic(hit.value, options);
        if (det) {
          setDraft(f, { answer: det, widget: 'select', source: 'deterministic', rule: hit.rule },
            { source: 'deterministic', rule: hit.rule });
        } else {
          optionChoices.push({ field: f, intent: hit.value, rule: hit.rule, options });
        }
      } else {
        novel.push({ label: f.label, type: f.type, required: !!f.required, options, help: f.help || null });
      }
      continue;
    }

    // Text / textarea
    const hit = matchProfileRule(f.label, f.type, profile, role);
    if (hit) {
      setDraft(f, { answer: hit.value, widget: 'text', source: 'deterministic', rule: hit.rule },
        { source: 'deterministic', rule: hit.rule });
    } else {
      l2candidates.push(f);
    }
  }

  // One embedding batch. L2 question lookups occupy the first l2candidates.length
  // slots (so embeddings[i] is candidate i); option-choice groups follow, each
  // recording its base offset.
  const texts = l2candidates.map((f) => f.label);
  optionChoices.forEach((oc) => {
    oc._base = texts.length;
    texts.push(oc.intent, ...oc.options);
  });

  let embeddings = null;
  if (texts.length > 0) {
    try {
      embeddings = embedSync(texts).embeddings;
    } catch (e) {
      process.stderr.write(`⚠️  Layer 2 / option-embed skipped (embedding unavailable): ${e.message}\n`);
    }
  }

  // Resolve embedding-assisted option choices.
  for (const oc of optionChoices) {
    let pick = null;
    if (embeddings) {
      const base = oc._base;
      const intentVec = embeddings[base];
      let best = -Infinity;
      oc.options.forEach((opt, k) => {
        const s = cosine(intentVec, embeddings[base + 1 + k]);
        if (s > best) { best = s; pick = opt; }
      });
    }
    if (pick) {
      setDraft(oc.field, { answer: pick, widget: 'select', source: 'deterministic', rule: oc.rule },
        { source: 'deterministic', rule: oc.rule });
    } else {
      novel.push({ label: oc.field.label, type: oc.field.type, required: !!oc.field.required, options: oc.options, help: null });
    }
  }

  // Layer 2 — semantic answer cache for the text candidates (zero model tokens).
  if (l2candidates.length > 0) {
    const cache = loadCache();
    let cacheTouched = false;
    l2candidates.forEach((f, i) => {
      const emb = embeddings ? embeddings[i] : null;
      const hit = emb ? lookup(cache, { question: f.label, embedding: emb, threshold: threshold(profile) }) : null;
      if (hit) {
        setDraft(f, {
          answer: hit.entry.answer, widget: isSelectField(f) ? 'select' : 'text',
          source: 'cache', cacheId: hit.entry.id, score: Number(hit.score.toFixed(3)), firstUse: hit.firstUse,
        }, { source: 'cache', score: Number(hit.score.toFixed(3)), firstUse: hit.firstUse });
        markUsed(cache, hit.entry.id);
        cacheTouched = true;
      } else {
        novel.push({ label: f.label, type: f.type, required: !!f.required, options: f.options || null, help: f.help || null });
      }
    });
    if (cacheTouched) saveCache(cache);
  }

  saveQueue(queue);
  return { roleId, company: role.company, title: role.title, resolved, novel };
}

// ── --teach ───────────────────────────────────────────────────────────────────

function teachAnswers(roleId, jsonArg) {
  const queue = loadQueue();
  const role = queue.roles.find((r) => r.id === roleId);
  if (!role) throw new Error(`role not found: ${roleId}`);
  role.drafts = role.drafts || {};

  // Accept either an inline JSON array or @/path/to/file.json (avoids shell
  // escaping when answers contain quotes).
  let raw = jsonArg;
  if (jsonArg.startsWith('@')) raw = readFileSync(jsonArg.slice(1), 'utf-8');
  let items;
  try {
    items = JSON.parse(raw);
  } catch (e) {
    throw new Error(`--teach expects a JSON array: ${e.message}`);
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('--teach: empty or non-array payload');
  }

  // Embed all questions in one batch (may fail → we still store drafts).
  let embeddings = null;
  try {
    const out = embedSync(items.map((it) => it.label));
    embeddings = out.embeddings;
  } catch (e) {
    process.stderr.write(`⚠️  cache teach skipped (embedding unavailable): ${e.message}\n`);
  }

  const cache = loadCache();
  const taught = [];
  items.forEach((it, i) => {
    if (!it.label || it.answer == null) return;
    const key = normLabel(it.label);
    role.drafts[key] = {
      answer: it.answer, source: 'model', field_type: it.type || 'textarea',
      label: it.label, reusable: !!it.reusable, confidence: it.confidence || 'medium',
    };
    if (embeddings && embeddings[i]) {
      teach(cache, {
        question: it.label, embedding: embeddings[i], answer: it.answer,
        field_type: it.type || 'textarea', reusable: !!it.reusable,
        entities: it.entities || {}, confidence: it.confidence || 'medium',
      });
      taught.push({ label: it.label, reusable: !!it.reusable, cached: true });
    } else {
      taught.push({ label: it.label, reusable: !!it.reusable, cached: false });
    }
  });

  if (embeddings) saveCache(cache);
  saveQueue(queue);
  return { roleId, taught };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  const [, , cmd, roleId, jsonArg] = process.argv;
  if (cmd === '--pre' && roleId) {
    const out = preResolve(roleId);
    // Human summary → stderr; machine JSON → stdout
    process.stderr.write(`\n${out.company} – ${out.title}\n`);
    process.stderr.write(`Layer 1+2 resolved ${out.resolved.length} field(s); ${out.novel.length} novel field(s) for Layer 3.\n`);
    for (const r of out.resolved) {
      process.stderr.write(`  ✓ [${r.source}${r.rule ? ':' + r.rule : ''}${r.score ? ' ' + r.score : ''}] ${r.label}\n`);
    }
    for (const n of out.novel) process.stderr.write(`  • [novel] ${n.label}\n`);
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }
  if (cmd === '--teach' && roleId && jsonArg) {
    const out = teachAnswers(roleId, jsonArg);
    process.stderr.write(`Stored ${out.taught.length} model answer(s); cached ${out.taught.filter((t) => t.cached).length}.\n`);
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }
  process.stderr.write(
    'Usage:\n  node queue-resolve.mjs --pre <role-id>\n' +
    "  node queue-resolve.mjs --teach <role-id> '<json-array>'\n"
  );
  process.exit(1);
}

main();
