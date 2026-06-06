#!/usr/bin/env node
/**
 * CLI helper: apply pending live copy edits as one AI-owned batch.
 *
 * The browser Save path stages copy edits in .impeccable/live. This script is
 * called by /manual-edit-commit when the user clicks Apply copy edits. It gives
 * the local AI runner the full staged batch plus evidence, validates the files
 * the runner reports touching, and clears only entries reported as applied.
 *
 * Usage:
 *   node live-commit-manual-edits.mjs
 *   node live-commit-manual-edits.mjs --page-url=/
 *
 * Output JSON:
 *   { applied, failed, files, cleared, count, pageUrl }
 */

import { buildManualEditEvidence } from './live-manual-edit-evidence.mjs';
import { readBuffer, readBufferStrict, writeBuffer, countByPage } from './live-manual-edits-buffer.mjs';
import { isGeneratedFile } from './is-generated.mjs';
import {
  runCopyEditBatchAgent,
  runCopyEditPostApplyChecks,
} from './live-copy-edit-agent.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROLLBACK_EXTENSIONS = new Set([
  '.astro',
  '.cjs',
  '.css',
  '.htm',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mdx',
  '.mjs',
  '.scss',
  '.svelte',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.yaml',
  '.yml',
]);
const ROLLBACK_SKIP_DIRS = new Set([
  '.astro',
  '.git',
  '.impeccable',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);
const DEFAULT_REPAIR_ATTEMPTS = 3;

function argVal(args, name) {
  const prefix = name + '=';
  for (const arg of args) {
    if (arg === name) return true;
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return null;
}

function countOps(entries) {
  let count = 0;
  for (const entry of entries || []) count += Array.isArray(entry.ops) ? entry.ops.length : 0;
  return count;
}

function summarizeAppliedEntries(entries, appliedEntryIds) {
  const ids = new Set(appliedEntryIds);
  const out = [];
  for (const entry of entries || []) {
    if (!ids.has(entry.id)) continue;
    for (const op of entry.ops || []) {
      out.push({
        id: entry.id,
        ref: op.ref,
        originalText: op.originalText,
        newText: op.newText,
      });
    }
  }
  return out;
}

function normalizeFailedEntries(batch, result, fallbackReason) {
  const failed = [];
  const failedByEntryId = new Map();
  for (const item of result?.failed || []) {
    const entryId = item.entryId || item.id || null;
    if (!entryId) continue;
    failedByEntryId.set(entryId, item);
  }

  for (const entry of batch.entries || []) {
    const item = failedByEntryId.get(entry.id);
    if (!item) continue;
    failed.push({
      id: entry.id,
      reason: item.reason || item.message || fallbackReason || 'failed',
      candidates: Array.isArray(item.candidates) && item.candidates.length > 0
        ? item.candidates
        : candidatesForEntry(batch, entry.id),
    });
  }
  return failed;
}

function mergeFailedEntries(...groups) {
  const out = [];
  const indexById = new Map();
  for (const item of groups.flatMap((group) => Array.isArray(group) ? group : [])) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' && item.id ? item.id : null;
    if (!id) {
      out.push(item);
      continue;
    }
    const existingIndex = indexById.get(id);
    if (existingIndex === undefined) {
      indexById.set(id, out.length);
      out.push(item);
      continue;
    }
    out[existingIndex] = {
      ...out[existingIndex],
      ...item,
      candidates: item.candidates || out[existingIndex].candidates,
      checks: item.checks || out[existingIndex].checks,
    };
  }
  return out;
}

function candidatesForEntry(batch, entryId) {
  return (batch.candidates || [])
    .filter((candidate) => candidate.entryId === entryId)
    .flatMap((candidate) => [
      ...(candidate.sourceHint ? [candidate.sourceHint] : []),
      ...(candidate.textMatches || []),
      ...(candidate.objectKeyMatches || []),
      ...(candidate.locatorMatches || []),
      ...(candidate.contextTextMatches || []),
    ])
    .slice(0, 12);
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))];
}

function allEntryIds(batch) {
  return (batch?.entries || []).map((entry) => entry.id).filter(Boolean);
}

function mergeUniqueStrings(...groups) {
  return uniqueStrings(groups.flatMap((group) => Array.isArray(group) ? group : []));
}

function repairAttemptLimit(env = process.env) {
  const value = Number(env.IMPECCABLE_LIVE_MANUAL_EDIT_REPAIR_ATTEMPTS || DEFAULT_REPAIR_ATTEMPTS);
  if (!Number.isFinite(value)) return DEFAULT_REPAIR_ATTEMPTS;
  return Math.max(1, Math.min(10, Math.trunc(value)));
}

function summarizeRepairFailures(failures = []) {
  return failures.map((failure) => {
    const out = {
      reason: failure.reason || failure.detail || 'validation_failed',
    };
    if (failure.id || failure.entryId) out.entryId = failure.id || failure.entryId;
    if (failure.ref) out.ref = failure.ref;
    if (failure.detail) out.detail = failure.detail;
    if (failure.file) out.file = failure.file;
    if (failure.message) out.message = failure.message;
    if (failure.marker) out.marker = failure.marker;
    if (Array.isArray(failure.files)) out.files = failure.files.slice(0, 8);
    if (Array.isArray(failure.candidates)) {
      out.candidates = failure.candidates.slice(0, 8).map((candidate) => ({
        file: candidate.file,
        line: candidate.line,
        kind: candidate.kind,
        reason: candidate.reason,
      }));
    }
    if (Array.isArray(failure.failures)) {
      out.failures = failure.failures.slice(0, 8).map((item) => ({
        ref: item.ref,
        reason: item.reason || item.detail,
        detail: item.detail,
        candidates: Array.isArray(item.candidates)
          ? item.candidates.slice(0, 6).map((candidate) => ({
              file: candidate.file,
              line: candidate.line,
              kind: candidate.kind,
              reason: candidate.reason,
            }))
          : undefined,
      }));
    }
    if (failure.checks) out.checks = failure.checks;
    return out;
  }).slice(0, 20);
}

function buildRepairBatch(batch, repair) {
  return {
    ...batch,
    repair,
  };
}

function normalizeProjectSourcePath(cwd, file, opts = {}) {
  if (!file || typeof file !== 'string') return null;
  const absolute = path.isAbsolute(file) ? file : path.resolve(cwd, file);
  const relative = path.relative(cwd, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  if (opts.requireExists && !fs.existsSync(absolute)) return null;
  if (isGeneratedFile(absolute, { cwd })) return null;
  return relative;
}

function normalizeRelativeFile(cwd, file) {
  return normalizeProjectSourcePath(cwd, file, { requireExists: true });
}

function sourceHintWindowFailure(cwd, op) {
  const hint = op?.sourceHint;
  if (!hint?.file || !hint.line) return null;
  const relative = normalizeRelativeFile(cwd, hint.file);
  if (!relative) return null;
  const absolute = path.resolve(cwd, relative);
  let content;
  try { content = fs.readFileSync(absolute, 'utf-8'); } catch { return null; }
  const lines = content.split('\n');
  const line = Math.max(1, Number(hint.line) || 1);
  const lineText = lines[line - 1] || '';
  const start = Math.max(0, line - 5);
  const end = Math.min(lines.length, line + 4);
  if (
    typeof op.originalText === 'string'
    && op.originalText
    && lineText.includes(op.originalText)
    && !lineShowsAppliedOp(lineText, op)
  ) {
    return {
      file: relative,
      line,
      reason: 'source_hint_still_contains_original_text',
    };
  }
  if (lines.slice(start, end).some((candidateLine) => lineShowsAppliedOp(candidateLine, op))) return null;
  return null;
}

function verificationTargetsForOp(batch, op, reportedFiles, cwd) {
  const candidate = (batch.candidates || []).find((item) => item.entryId === op.entryId && item.ref === op.ref);
  const out = [];
  const reportedFileSet = new Set(reportedFiles || []);
  const add = (file, line, kind) => {
    const relativeFile = normalizeRelativeFile(cwd, file);
    const lineNumber = Number(line);
    if (!relativeFile || !Number.isFinite(lineNumber) || lineNumber < 1) return;
    out.push({ file: relativeFile, line: lineNumber, kind, reported: reportedFileSet.has(relativeFile) });
  };

  add(op.sourceHint?.file, op.sourceHint?.line, 'source_hint');
  add(candidate?.sourceHint?.relativeFile || candidate?.sourceHint?.file, candidate?.sourceHint?.line, 'candidate_source_hint');
  for (const item of candidate?.textMatches || []) add(item.file, item.line, 'text_match');
  for (const item of candidate?.objectKeyMatches || []) add(item.file, item.line, 'object_key_match');
  for (const item of candidate?.locatorMatches || []) add(item.file, item.line, 'locator_match');
  for (const item of candidate?.contextTextMatches || []) add(item.file, item.line, 'context_text_match');

  // Manual copy edits often stage coupled leaves from the same UI object, e.g.
  // a card label plus its count. Dynamic source stores both on the label/key
  // line, so the count op may need the sibling label's data candidates.
  for (const siblingCandidate of siblingCandidatesForEntry(batch, op)) {
    add(siblingCandidate.sourceHint?.relativeFile || siblingCandidate.sourceHint?.file, siblingCandidate.sourceHint?.line, 'entry_source_hint');
    for (const item of siblingCandidate.textMatches || []) add(item.file, item.line, 'entry_text_match');
    for (const item of siblingCandidate.objectKeyMatches || []) add(item.file, item.line, 'entry_object_key_match');
    for (const item of siblingCandidate.contextTextMatches || []) add(item.file, item.line, 'entry_context_text_match');
  }

  for (const relativeFile of reportedFiles || []) {
    for (const target of locatorTargetsInFile(cwd, relativeFile, op)) {
      out.push(target);
    }
  }

  const seen = new Set();
  return out.filter((target) => {
    const key = target.file + ':' + target.line + ':' + target.kind;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function objectKeyCandidatesForOp(batch, op) {
  const candidates = (batch.candidates || [])
    .filter((item) => item.entryId === op.entryId && item.ref === op.ref);
  return candidates.flatMap((candidate) => candidate.objectKeyMatches || []);
}

function lineHasObjectKey(line, text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  const quotedKey = new RegExp('(^|[\\s,{])([\'"`])' + escapeRegExp(text) + '\\2\\s*:');
  if (quotedKey.test(line)) return true;
  const identifierSafe = /^[A-Za-z_$][\w$]*$/.test(text);
  if (!identifierSafe) return false;
  const bareKey = new RegExp('(^|[\\s,{])' + escapeRegExp(text) + '\\s*:');
  return bareKey.test(line);
}

function objectKeyMatchStillUsesOriginal(cwd, match, op) {
  const relative = normalizeRelativeFile(cwd, match?.file);
  const lineNumber = Number(match?.line);
  if (!relative || !Number.isFinite(lineNumber) || lineNumber < 1) return false;
  let lines;
  try { lines = fs.readFileSync(path.resolve(cwd, relative), 'utf-8').split('\n'); } catch { return false; }
  const start = Math.max(0, lineNumber - 4);
  const end = Math.min(lines.length, lineNumber + 3);
  const windowLines = lines.slice(start, end);
  if (windowLines.some((line) => lineHasObjectKey(line, op.newText))) return false;
  return windowLines.some((line) => lineHasObjectKey(line, op.originalText));
}

function coupledObjectKeyFailuresForOp(batch, op, cwd) {
  if (
    typeof op?.originalText !== 'string'
    || typeof op?.newText !== 'string'
    || op.originalText === op.newText
  ) return [];
  return objectKeyCandidatesForOp(batch, op)
    .filter((match) => objectKeyMatchStillUsesOriginal(cwd, match, op))
    .map((match) => ({
      ref: op.ref,
      reason: 'source_verification_failed',
      detail: 'edited_text_source_key_dependency_not_updated',
      candidates: [{
        file: normalizeRelativeFile(cwd, match.file) || match.file,
        line: match.line,
        kind: 'object_key_match',
        reason: 'edited text is also a source key; update the coupled key to newText or fail the entry',
      }],
    }));
}

function siblingCandidatesForEntry(batch, op) {
  if (!op?.entryId) return [];
  return (batch.candidates || []).filter((item) => item.entryId === op.entryId && item.ref !== op.ref);
}

function locatorTargetsInFile(cwd, relativeFile, op) {
  if (!opHasLocator(op)) return [];
  const absolute = path.resolve(cwd, relativeFile);
  let lines;
  try { lines = fs.readFileSync(absolute, 'utf-8').split('\n'); } catch { return []; }
  const out = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lineMatchesManualEditLocator(lines[index], op)) continue;
    out.push({ file: relativeFile, line: index + 1, kind: 'reported_locator_match' });
    if (out.length >= 20) break;
  }
  return out;
}

function verificationTargetPasses(cwd, target, op) {
  let lines;
  try { lines = fs.readFileSync(path.resolve(cwd, target.file), 'utf-8').split('\n'); } catch { return false; }
  return verificationTargetPassesLines(lines, target, op);
}

function verificationTargetPassesLines(lines, target, op) {
  const line = lines[target.line - 1] || '';
  if (lineShowsAppliedOp(line, op)) return true;
  const originalText = typeof op?.originalText === 'string' ? op.originalText : '';
  if (originalText && line.includes(originalText)) return false;
  const kind = String(target.kind || '');
  const canSearchWindow = target.reported
    || kind.includes('context_text_match')
    || kind.includes('object_key_match')
    || kind.includes('text_match');
  if (!canSearchWindow) return false;
  const radius = kind.includes('context_text_match') ? 20 : 4;
  const start = Math.max(0, target.line - radius - 1);
  const end = Math.min(lines.length, target.line + radius);
  const windowLines = lines.slice(start, end);
  if (windowLines.some((candidateLine) => lineShowsAppliedOp(candidateLine, op))) return true;
  if (windowShowsAppliedOp(windowLines, op)) return true;
  return false;
}

function windowShowsAppliedOp(lines, op) {
  const newText = typeof op?.newText === 'string' ? op.newText : '';
  if (!newText) return false;
  const originalText = typeof op?.originalText === 'string' ? op.originalText : '';
  const normalizedNew = normalizeVerificationText(newText);
  const normalizedOriginal = normalizeVerificationText(originalText);
  const normalizedWindow = normalizeVerificationText(lines.join('\n'));
  if (!normalizedNew || !normalizedWindow.includes(normalizedNew)) return false;
  if (normalizedOriginal && !normalizedNew.includes(normalizedOriginal) && normalizedWindow.includes(normalizedOriginal)) return false;
  return true;
}

function normalizeVerificationText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function lineShowsAppliedOp(line, op) {
  const originalText = typeof op?.originalText === 'string' ? op.originalText : '';
  const newText = typeof op?.newText === 'string' ? op.newText : '';
  const deletion = op?.deleted === true || newText.length === 0;
  if (deletion) return !!originalText && !line.includes(originalText);
  if (!line.includes(newText)) return false;
  if (originalText && !newText.includes(originalText) && line.includes(originalText)) return false;
  return true;
}

function opHasLocator(op) {
  return !!(
    op?.tag
    || op?.elementId
    || (Array.isArray(op?.classes) && op.classes.filter(Boolean).length > 0)
  );
}

function lineMatchesManualEditLocator(line, op) {
  if (op.tag) {
    const tagRe = new RegExp('<\\s*' + escapeRegExp(op.tag) + '(?=[\\s>/]|$)', 'i');
    if (!tagRe.test(line)) return false;
  }

  if (op.elementId) {
    const idRe = new RegExp('\\bid\\s*=\\s*["\']' + escapeRegExp(op.elementId) + '["\']');
    if (!idRe.test(line)) return false;
  }

  const classes = Array.isArray(op.classes) ? op.classes.filter(Boolean) : [];
  for (const className of classes) {
    if (!line.includes(className)) return false;
  }

  return true;
}

function verifyAppliedEntry({ batch, entry, reportedFiles, cwd }) {
  const failures = [];
  for (const rawOp of entry.ops || []) {
    const op = { ...rawOp, entryId: entry.id };
    if (op.deleted === true && typeof op.newText !== 'string') op.newText = '';
    if (typeof op.newText !== 'string') {
      failures.push({
        ref: op.ref,
        reason: 'source_verification_failed',
        detail: 'missing_newText',
        candidates: candidatesForEntry(batch, entry.id).slice(0, 12),
      });
      continue;
    }
    const targets = verificationTargetsForOp(batch, op, reportedFiles, cwd);
    const coupledObjectKeyFailures = coupledObjectKeyFailuresForOp(batch, op, cwd);
    if (
      coupledObjectKeyFailures.length === 0
      && targets.some((target) => verificationTargetPasses(cwd, target, op))
    ) continue;

    if (coupledObjectKeyFailures.length > 0) {
      failures.push(...coupledObjectKeyFailures.map((failure) => ({
        ...failure,
        candidates: [
          ...(failure.candidates || []),
          ...targets.map((target) => ({ file: target.file, line: target.line, kind: target.kind })),
          ...candidatesForEntry(batch, entry.id),
        ].slice(0, 12),
      })));
      continue;
    }

    const hintedOldText = sourceHintWindowFailure(cwd, op);
    if (hintedOldText) {
      failures.push({
        ref: op.ref,
        reason: 'source_verification_failed',
        detail: hintedOldText.reason,
        candidates: [hintedOldText, ...targets.map((target) => ({ file: target.file, line: target.line, kind: target.kind })), ...candidatesForEntry(batch, entry.id)].slice(0, 12),
      });
      continue;
    }

    failures.push({
      ref: op.ref,
      reason: 'source_verification_failed',
      detail: op.newText.length === 0 ? 'originalText_still_present_in_plausible_source_location' : 'newText_not_found_in_plausible_source_location',
      candidates: targets.map((target) => ({ file: target.file, line: target.line, kind: target.kind })).concat(candidatesForEntry(batch, entry.id)).slice(0, 12),
    });
  }
  return failures;
}

function snapshotTargetPasses(snapshot, target, op) {
  const before = snapshot.get(target.file)?.content;
  if (typeof before !== 'string') return false;
  return verificationTargetPassesLines(before.split('\n'), target, op);
}

function findUnappliedEntrySourceChanges({ batch, entries, reportedFiles, cwd, rollbackSnapshot }) {
  const failures = [];
  for (const entry of entries || []) {
    for (const rawOp of entry.ops || []) {
      const op = { ...rawOp, entryId: entry.id };
      if (typeof op.newText !== 'string' || op.newText.length === 0) continue;
      const targets = verificationTargetsForOp(batch, op, reportedFiles, cwd);
      const leakedTargets = targets.filter((target) =>
        verificationTargetPasses(cwd, target, op)
        && !snapshotTargetPasses(rollbackSnapshot, target, op)
      );
      if (leakedTargets.length === 0) continue;
      failures.push({
        id: entry.id,
        reason: 'failed_entry_source_changed',
        ref: op.ref,
        newText: op.newText,
        candidates: leakedTargets
          .map((target) => ({ file: target.file, line: target.line, kind: target.kind }))
          .concat(candidatesForEntry(batch, entry.id))
          .slice(0, 12),
      });
      break;
    }
  }
  return failures;
}

function verificationFailuresForEntries(batch, entries, reason, extra = {}) {
  return entries.map((entry) => ({
    id: entry.id,
    reason,
    candidates: candidatesForEntry(batch, entry.id),
    ...extra,
  }));
}

function clearAppliedEntries(cwd, appliedEntryIds) {
  const ids = new Set(appliedEntryIds);
  if (ids.size === 0) return 0;
  const buffer = readBuffer(cwd);
  let cleared = 0;
  const kept = [];
  for (const entry of buffer.entries || []) {
    if (ids.has(entry.id)) {
      cleared += Array.isArray(entry.ops) ? entry.ops.length : 0;
    } else {
      kept.push(entry);
    }
  }
  writeBuffer(cwd, { version: buffer.version || 1, entries: kept });
  return cleared;
}

function snapshotRollbackFiles(cwd, files = null) {
  const snapshot = new Map();
  const rollbackFiles = Array.isArray(files) && files.length > 0
    ? uniqueStrings(files).map((file) => normalizeRollbackPath(cwd, file)).filter(Boolean)
    : collectRollbackFiles(cwd);
  for (const relativeFile of rollbackFiles) {
    const absolute = path.resolve(cwd, relativeFile);
    try {
      snapshot.set(relativeFile, {
        existed: true,
        content: fs.readFileSync(absolute, 'utf-8'),
      });
    } catch (err) {
      if (err?.code === 'ENOENT') {
        snapshot.set(relativeFile, { existed: false });
      }
      // Other read failures are not safe to roll back.
    }
  }
  return snapshot;
}

function collectRollbackFiles(cwd) {
  const out = [];
  const seenDirs = new Set();
  const seenFiles = new Set();
  scanRollbackDir(cwd, cwd, out, seenDirs, seenFiles, 0);
  return out;
}

function scanRollbackDir(dir, cwd, out, seenDirs, seenFiles, depth) {
  if (depth > 10) return;
  let realDir;
  try { realDir = fs.realpathSync(dir); } catch { return; }
  if (seenDirs.has(realDir)) return;
  seenDirs.add(realDir);

  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ROLLBACK_SKIP_DIRS.has(entry.name)) continue;
      scanRollbackDir(path.join(dir, entry.name), cwd, out, seenDirs, seenFiles, depth + 1);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!ROLLBACK_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const absolute = path.join(dir, entry.name);
    if (isGeneratedFile(absolute, { cwd })) continue;
    let realFile;
    try { realFile = fs.realpathSync(absolute); } catch { continue; }
    if (seenFiles.has(realFile)) continue;
    seenFiles.add(realFile);
    const relative = path.relative(cwd, absolute);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) continue;
    out.push(relative);
  }
}

function changedFilesSinceSnapshot(cwd, snapshot, scopeFiles = null) {
  const changed = new Map();
  const scopedFiles = Array.isArray(scopeFiles) && scopeFiles.length > 0
    ? scopeFiles.map((file) => normalizeRollbackPath(cwd, file)).filter(Boolean)
    : null;
  const currentFiles = new Set(scopedFiles || collectRollbackFiles(cwd));
  for (const [relativeFile, before] of snapshot.entries()) {
    if (scopedFiles && !currentFiles.has(relativeFile)) continue;
    const absolute = path.resolve(cwd, relativeFile);
    if (before?.existed === false) {
      if (fs.existsSync(absolute)) changed.set(relativeFile, { file: relativeFile, kind: 'added' });
      continue;
    }
    if (!fs.existsSync(absolute)) {
      changed.set(relativeFile, { file: relativeFile, kind: 'deleted' });
      continue;
    }
    let content;
    try { content = fs.readFileSync(absolute, 'utf-8'); } catch { continue; }
    if (content !== before.content) {
      changed.set(relativeFile, { file: relativeFile, kind: 'modified' });
    }
  }
  for (const relativeFile of currentFiles) {
    if (!snapshot.has(relativeFile)) {
      changed.set(relativeFile, { file: relativeFile, kind: 'unknown' });
    }
  }
  return [...changed.values()];
}

function rollbackChangedFiles(cwd, snapshot, extraFiles = [], scopeFiles = []) {
  const scope = new Set(
    [...(scopeFiles || []), ...(extraFiles || [])]
      .map((file) => normalizeRollbackPath(cwd, file))
      .filter(Boolean),
  );
  const changed = changedFilesSinceSnapshot(cwd, snapshot, [...scope]);
  const byFile = new Map(changed.map((item) => [item.file, item]));
  for (const file of extraFiles || []) {
    const relative = normalizeRollbackPath(cwd, file);
    if (relative && !byFile.has(relative)) {
      byFile.set(relative, { file: relative, kind: snapshot.has(relative) ? 'reported' : 'unknown' });
    }
  }

  const rolledBackFiles = [];
  const rollbackFailures = [];
  for (const item of byFile.values()) {
    if (!scope.has(item.file)) continue;
    const absolute = path.resolve(cwd, item.file);
    const before = snapshot.get(item.file);
    try {
      if (before?.existed !== false && typeof before?.content === 'string') {
        fs.mkdirSync(path.dirname(absolute), { recursive: true });
        fs.writeFileSync(absolute, before.content, 'utf-8');
      } else if (before?.existed === false && item.kind === 'added' && fs.existsSync(absolute)) {
        fs.rmSync(absolute);
      } else {
        rollbackFailures.push({ file: item.file, reason: 'no_snapshot' });
        continue;
      }
      rolledBackFiles.push(item.file);
    } catch (err) {
      rollbackFailures.push({ file: item.file, reason: 'restore_failed', message: err.message || String(err) });
    }
  }
  return { rolledBackFiles, rollbackFailures };
}

function collectApplyOwnedFiles(batch, cwd, extraFiles = []) {
  const files = [];
  for (const entry of batch?.entries || []) {
    for (const op of entry.ops || []) files.push(op.sourceHint?.file);
  }
  for (const candidate of batch?.candidates || []) {
    files.push(candidate.sourceHint?.relativeFile, candidate.sourceHint?.file);
    for (const item of candidate.textMatches || []) files.push(item.file);
    for (const item of candidate.objectKeyMatches || []) files.push(item.file);
    for (const item of candidate.locatorMatches || []) files.push(item.file);
    for (const item of candidate.contextTextMatches || []) files.push(item.file);
  }
  files.push(...(extraFiles || []));
  return uniqueStrings(files)
    .map((file) => normalizeRollbackPath(cwd, file))
    .filter(Boolean);
}

function unreportedChangedFiles(cwd, snapshot, reportedFiles, scopeFiles = []) {
  const reported = new Set(
    (reportedFiles || [])
      .map((file) => normalizeRollbackPath(cwd, file))
      .filter(Boolean),
  );
  const scope = new Set(
    (scopeFiles || [])
      .map((file) => normalizeRollbackPath(cwd, file))
      .filter(Boolean),
  );
  return changedFilesSinceSnapshot(cwd, snapshot, [...scope])
    .map((item) => item.file)
    .filter((file) => scope.has(file))
    .filter((file) => !reported.has(file));
}

function normalizeRollbackPath(cwd, file) {
  return normalizeProjectSourcePath(cwd, file);
}

function verifyEntriesAfterRepair({ batch, appliedEntryIds, files, cwd }) {
  const reportedFiles = uniqueStrings(files || [])
    .map((file) => normalizeRelativeFile(cwd, file))
    .filter(Boolean);
  const entries = (batch.entries || []).filter((entry) => appliedEntryIds.includes(entry.id));
  const verifiedIds = [];
  const failed = [];
  for (const entry of entries) {
    const failures = verifyAppliedEntry({ batch, entry, reportedFiles, cwd });
    if (failures.length === 0) {
      verifiedIds.push(entry.id);
    } else {
      failed.push({
        id: entry.id,
        reason: 'source_verification_failed',
        failures,
        candidates: candidatesForEntry(batch, entry.id),
      });
    }
  }
  return { verifiedIds, failed, reportedFiles };
}

async function repairPostApplyValidation({
  batch,
  cwd,
  pageUrl,
  count,
  provider,
  env,
  timeoutMs,
  applyBatchToSource,
  chatAvailable,
  transactionId,
  appliedEntryIds,
  files,
  failed,
  notes,
  warnings,
  postChecks,
  repairReason = 'post_apply_validation_failed',
  repairFailures = null,
}) {
  const maxAttempts = repairAttemptLimit(env);
  let currentFiles = mergeUniqueStrings(files || []);
  let currentAppliedIds = mergeUniqueStrings(appliedEntryIds || []);
  let currentFailed = Array.isArray(failed) ? failed : [];
  let currentNotes = Array.isArray(notes) ? notes : [];
  let currentWarnings = Array.isArray(warnings) ? warnings : [];
  let currentFailures = Array.isArray(repairFailures) ? repairFailures : (postChecks?.failures || []);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const repair = {
      attempt,
      maxAttempts,
      transactionId: transactionId || null,
      reason: repairReason,
      failures: summarizeRepairFailures(currentFailures),
      files: currentFiles,
      pageUrl,
    };
    let repairResult;
    try {
      repairResult = await runCopyEditBatchAgent(buildRepairBatch(batch, repair), {
        cwd,
        provider,
        env,
        timeoutMs,
        applyBatchToSource,
        chatAvailable,
      });
    } catch (err) {
      currentFailures = [{
        reason: 'repair_agent_failed',
        message: err.message || String(err),
      }];
      continue;
    }

    currentFiles = mergeUniqueStrings(currentFiles, repairResult.files || []);
    currentNotes = [...currentNotes, ...(repairResult.notes || [])];
    currentWarnings = [...currentWarnings, ...(repairResult.warnings || [])];
    currentAppliedIds = mergeUniqueStrings(currentAppliedIds, repairResult.appliedEntryIds || []);
    currentFailed = mergeFailedEntries(
      currentFailed,
      normalizeFailedEntries(batch, repairResult, 'repair_failed'),
    );

    const verified = verifyEntriesAfterRepair({
      batch,
      appliedEntryIds: currentAppliedIds,
      files: currentFiles,
      cwd,
    });
    if (verified.failed.length > 0) {
      currentFailures = verified.failed;
      continue;
    }

    const repairedChecks = runCopyEditPostApplyChecks({ cwd, files: currentFiles });
    currentWarnings = [...currentWarnings, ...(repairedChecks.warnings || [])];
    if (!repairedChecks.ok) {
      currentFailures = repairedChecks.failures || [];
      continue;
    }

    const cleared = clearAppliedEntries(cwd, verified.verifiedIds);
    const counts = countByPage(cwd);
    const verifiedIdSet = new Set(verified.verifiedIds);
    return {
      applied: summarizeAppliedEntries(batch.entries, verified.verifiedIds),
      failed: mergeFailedEntries(currentFailed).filter((item) => !verifiedIdSet.has(item.id)),
      files: currentFiles,
      cleared,
      count,
      pageUrl,
      warnings: currentWarnings,
      notes: currentNotes,
      repair: {
        status: 'repaired',
        attempts: attempt,
        maxAttempts,
        transactionId: transactionId || null,
      },
      ...counts,
    };
  }

  const decisionFailedEntries = currentAppliedIds.length > 0
    ? (batch.entries || [])
        .filter((entry) => currentAppliedIds.includes(entry.id))
        .map((entry) => ({
          id: entry.id,
          reason: repairReason,
          checks: currentFailures,
          candidates: candidatesForEntry(batch, entry.id),
        }))
    : verificationFailuresForEntries(batch, batch.entries || [], repairReason, { checks: currentFailures });
  return {
    applied: [],
    failed: mergeFailedEntries(decisionFailedEntries, currentFailed),
    files: currentFiles,
    cleared: 0,
    count,
    pageUrl,
    warnings: currentWarnings,
    notes: currentNotes,
    reason: 'manual_edit_repair_needs_decision',
    needsManualDecision: true,
    repair: {
      status: 'needs_decision',
      attempts: maxAttempts,
      maxAttempts,
      transactionId: transactionId || null,
      failures: summarizeRepairFailures(currentFailures),
      files: currentFiles,
    },
    ...countByPage(cwd),
  };
}

export async function commitManualEdits({
  cwd = process.cwd(),
  pageUrl = null,
  provider = undefined,
  env = process.env,
  timeoutMs = undefined,
  applyBatchToSource = undefined,
  chatAvailable = undefined,
  repairOnly = false,
  transactionId = null,
  batch: providedBatch = null,
} = {}) {
  try {
    readBufferStrict(cwd);
  } catch (err) {
    return {
      applied: [],
      failed: [],
      files: [],
      cleared: 0,
      count: 0,
      pageUrl,
      reason: 'manual_edit_buffer_invalid',
      message: err.message || String(err),
      ...countByPage(cwd),
    };
  }

  const batch = providedBatch || buildManualEditEvidence({ cwd, pageUrl });
  const count = countOps(batch.entries);
  if (count === 0) {
    return {
      applied: [],
      failed: [],
      files: [],
      cleared: 0,
      count: 0,
      pageUrl,
      reason: 'no_pending_edits',
      ...countByPage(cwd),
    };
  }

  const baseRollbackScope = collectApplyOwnedFiles(batch, cwd);
  const rollbackSnapshot = snapshotRollbackFiles(cwd, baseRollbackScope);
  let result;
  try {
    result = repairOnly
      ? {
          status: 'done',
          appliedEntryIds: allEntryIds(batch),
          failed: [],
          files: collectApplyOwnedFiles(batch, cwd),
          notes: ['repair-only validation pass'],
        }
      : await runCopyEditBatchAgent(batch, {
          cwd,
          provider,
          env,
          timeoutMs,
          applyBatchToSource,
          chatAvailable,
        });
  } catch (err) {
    const rollback = rollbackChangedFiles(cwd, rollbackSnapshot, [], baseRollbackScope);
    return {
      applied: [],
      failed: batch.entries.map((entry) => ({
        id: entry.id,
        reason: err.message || String(err),
        candidates: candidatesForEntry(batch, entry.id),
      })),
      files: [],
      cleared: 0,
      count,
      pageUrl,
      rolledBackFiles: rollback.rolledBackFiles,
      rollbackFailures: rollback.rollbackFailures,
      ...countByPage(cwd),
    };
  }

  if (result.status === 'error') {
    const rollbackScope = collectApplyOwnedFiles(batch, cwd, result.files || []);
    const rollback = rollbackChangedFiles(cwd, rollbackSnapshot, result.files || [], rollbackScope);
    const failed = normalizeFailedEntries(batch, result, result.message || 'AI copy edit failed');
    return {
      applied: [],
      failed: failed.length > 0
        ? failed
        : verificationFailuresForEntries(batch, batch.entries, result.message || 'AI copy edit failed'),
      files: result.files || [],
      cleared: 0,
      count,
      pageUrl,
      notes: result.notes || [],
      rolledBackFiles: rollback.rolledBackFiles,
      rollbackFailures: rollback.rollbackFailures,
      ...countByPage(cwd),
    };
  }

  const reportedAppliedIds = uniqueStrings(result.appliedEntryIds || []);
  const reportedFiles = uniqueStrings(result.files || [])
    .map((file) => normalizeRelativeFile(cwd, file))
    .filter(Boolean);
  const aiFailed = normalizeFailedEntries(batch, result, 'AI copy edit failed');
  const rollbackScope = collectApplyOwnedFiles(batch, cwd, result.files || []);
  const failedIds = new Set(aiFailed.map((item) => item.id).filter(Boolean));
  const conflictingAppliedIds = reportedAppliedIds.filter((id) => failedIds.has(id));

  if (conflictingAppliedIds.length > 0) {
    const rollback = rollbackChangedFiles(cwd, rollbackSnapshot, result.files || [], rollbackScope);
    const conflictingEntries = batch.entries.filter((entry) => conflictingAppliedIds.includes(entry.id));
    return {
      applied: [],
      failed: [
        ...verificationFailuresForEntries(batch, conflictingEntries, 'conflicting_apply_result'),
        ...aiFailed.filter((item) => !conflictingAppliedIds.includes(item.id)),
      ],
      files: result.files || [],
      cleared: 0,
      count,
      pageUrl,
      notes: result.notes || [],
      rolledBackFiles: rollback.rolledBackFiles,
      rollbackFailures: rollback.rollbackFailures,
      ...countByPage(cwd),
    };
  }

  const unreportedFiles = unreportedChangedFiles(cwd, rollbackSnapshot, result.files || [], rollbackScope);
  if (unreportedFiles.length > 0) {
    const rollback = rollbackChangedFiles(cwd, rollbackSnapshot, result.files || [], [...rollbackScope, ...unreportedFiles]);
    return {
      applied: [],
      failed: verificationFailuresForEntries(batch, batch.entries, 'unreported_source_changes', { files: unreportedFiles }),
      files: result.files || [],
      unreportedFiles,
      cleared: 0,
      count,
      pageUrl,
      notes: result.notes || [],
      rolledBackFiles: rollback.rolledBackFiles,
      rollbackFailures: rollback.rollbackFailures,
      ...countByPage(cwd),
    };
  }

  if (result.status === 'done' && reportedAppliedIds.length === 0) {
    const rollback = rollbackChangedFiles(cwd, rollbackSnapshot, result.files || [], rollbackScope);
    return {
      applied: [],
      failed: verificationFailuresForEntries(batch, batch.entries, 'missing_applied_entry_ids'),
      files: result.files || [],
      cleared: 0,
      count,
      pageUrl,
      notes: result.notes || [],
      rolledBackFiles: rollback.rolledBackFiles,
      rollbackFailures: rollback.rollbackFailures,
      ...countByPage(cwd),
    };
  }

  const reportedAppliedEntries = batch.entries.filter((entry) => reportedAppliedIds.includes(entry.id));
  if (reportedAppliedIds.length > 0 && reportedFiles.length === 0) {
    return repairPostApplyValidation({
      batch,
      cwd,
      pageUrl,
      count,
      provider,
      env,
      timeoutMs,
      applyBatchToSource,
      chatAvailable,
      transactionId,
      appliedEntryIds: reportedAppliedIds,
      files: result.files || [],
      failed: aiFailed,
      notes: result.notes || [],
      warnings: result.warnings || [],
      repairReason: 'missing_touched_files',
      repairFailures: verificationFailuresForEntries(batch, reportedAppliedEntries, 'missing_touched_files'),
    });
  }

  const verifiedAppliedIds = [];
  const verificationFailed = [];
  for (const entry of reportedAppliedEntries) {
    const failures = verifyAppliedEntry({ batch, entry, reportedFiles, cwd });
    if (failures.length === 0) {
      verifiedAppliedIds.push(entry.id);
    } else {
      verificationFailed.push({
        id: entry.id,
        reason: 'source_verification_failed',
        failures,
        candidates: candidatesForEntry(batch, entry.id),
      });
    }
  }
  const unreportedEntries = result.status === 'done' || result.status === 'partial'
    ? batch.entries.filter((entry) => !reportedAppliedIds.includes(entry.id) && !aiFailed.some((item) => item.id === entry.id))
    : [];
  const nonRepairFailed = [
    ...verificationFailuresForEntries(batch, unreportedEntries, 'not_reported_applied'),
    ...aiFailed,
  ];
  const failed = [
    ...verificationFailed,
    ...nonRepairFailed,
  ];

  const unappliedEntries = batch.entries.filter((entry) => !reportedAppliedIds.includes(entry.id));
  const leakedUnapplied = findUnappliedEntrySourceChanges({
    batch,
    entries: unappliedEntries,
    reportedFiles,
    cwd,
    rollbackSnapshot,
  });
  if (leakedUnapplied.length > 0) {
    const leakedIds = new Set(leakedUnapplied.map((item) => item.id).filter(Boolean));
    const rolledBackVerified = reportedAppliedEntries
      .filter((entry) => verifiedAppliedIds.includes(entry.id))
      .map((entry) => ({
        id: entry.id,
        reason: 'rolled_back_due_to_failed_entry_source_changed',
        candidates: candidatesForEntry(batch, entry.id),
      }));
    const rollback = rollbackChangedFiles(cwd, rollbackSnapshot, result.files || [], rollbackScope);
    return {
      applied: [],
      failed: [
        ...leakedUnapplied,
        ...failed.filter((item) => !leakedIds.has(item.id)),
        ...rolledBackVerified,
      ],
      files: result.files || [],
      cleared: 0,
      count,
      pageUrl,
      rolledBackFiles: rollback.rolledBackFiles,
      rollbackFailures: rollback.rollbackFailures,
      notes: result.notes || [],
      ...countByPage(cwd),
    };
  }

  if (verificationFailed.length > 0) {
    return repairPostApplyValidation({
      batch,
      cwd,
      pageUrl,
      count,
      provider,
      env,
      timeoutMs,
      applyBatchToSource,
      chatAvailable,
      transactionId,
      appliedEntryIds: reportedAppliedIds,
      files: result.files || [],
      failed: nonRepairFailed,
      notes: result.notes || [],
      warnings: result.warnings || [],
      repairReason: 'source_verification_failed',
      repairFailures: verificationFailed,
    });
  }

  const postChecks = runCopyEditPostApplyChecks({ cwd, files: result.files || [] });
  if (!postChecks.ok) {
    const postCheckEntries = verifiedAppliedIds.length > 0
      ? reportedAppliedEntries.filter((entry) => verifiedAppliedIds.includes(entry.id))
      : batch.entries;
    return repairPostApplyValidation({
      batch,
      cwd,
      pageUrl,
      count,
      provider,
      env,
      timeoutMs,
      applyBatchToSource,
      chatAvailable,
      transactionId,
      appliedEntryIds: verifiedAppliedIds.length > 0
        ? verifiedAppliedIds
        : postCheckEntries.map((entry) => entry.id).filter(Boolean),
      files: result.files || [],
      failed,
      notes: result.notes || [],
      warnings: [...(result.warnings || []), ...(postChecks.warnings || [])],
      postChecks,
    });
  }

  const cleared = clearAppliedEntries(cwd, verifiedAppliedIds);
  const counts = countByPage(cwd);
  return {
    applied: summarizeAppliedEntries(batch.entries, verifiedAppliedIds),
    failed,
    files: result.files || [],
    cleared,
    count,
    pageUrl,
    warnings: [...(result.warnings || []), ...(postChecks.warnings || [])],
    notes: result.notes || [],
    ...counts,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node live-commit-manual-edits.mjs [--page-url=<url>] [--provider=auto|codex|claude|mock]');
    process.exit(0);
  }

  const result = await commitManualEdits({
    cwd: process.cwd(),
    pageUrl: argVal(args, '--page-url'),
    provider: argVal(args, '--provider') || undefined,
    timeoutMs: Number(process.env.IMPECCABLE_LIVE_COPY_AGENT_TIMEOUT_MS || 120000),
  });
  console.log(JSON.stringify(result));
}

if (process.argv[1]?.endsWith('live-commit-manual-edits.mjs')) {
  main().catch((err) => {
    console.error(JSON.stringify({ error: 'commit_failed', message: err.message || String(err) }));
    process.exit(1);
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
