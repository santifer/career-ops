#!/usr/bin/env node

import { createHash } from 'crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_ROOT = process.cwd();
const INGEST_DIR = 'data/ingest';
export const DEFAULT_INBOX_DIR = `${INGEST_DIR}/inbox`;
const RAW_DIR = `${INGEST_DIR}/raw`;
const PROPOSALS_DIR = `${INGEST_DIR}/proposals`;
const MANIFEST_PATH = `${INGEST_DIR}/manifest.json`;
const TEXT_EXTENSIONS = new Set([
  '.csv',
  '.html',
  '.json',
  '.md',
  '.markdown',
  '.txt',
  '.yaml',
  '.yml',
]);

function toRepoPath(filePath, root) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function todayStamp(date) {
  return date.toISOString().slice(0, 10);
}

function timestampStamp(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function isUrl(input) {
  return /^https?:\/\//i.test(input);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'source';
}

function hashBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sourceText(source) {
  if (source.sourceType === 'url' || TEXT_EXTENSIONS.has(source.extension.toLowerCase())) {
    return {
      text: source.buffer.toString('utf-8'),
      contentExtractStatus: 'text_read',
      reviewNotes: [],
    };
  }

  return {
    text: '',
    contentExtractStatus: 'binary_unparsed',
    reviewNotes: [
      `Text was not extracted from ${source.extension || 'binary'} source; review or parse the raw file before applying.`,
    ],
  };
}

function ensureIngestDirs(root) {
  mkdirSync(path.join(root, DEFAULT_INBOX_DIR), { recursive: true });
  mkdirSync(path.join(root, RAW_DIR), { recursive: true });
  mkdirSync(path.join(root, PROPOSALS_DIR), { recursive: true });
}

function loadManifest(root) {
  const full = path.join(root, MANIFEST_PATH);
  if (!existsSync(full)) {
    return { version: 1, sources: {} };
  }
  return JSON.parse(readFileSync(full, 'utf-8'));
}

function saveManifest(root, manifest) {
  writeFileSync(
    path.join(root, MANIFEST_PATH),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}

function loadProposal(root, proposalPath) {
  if (!proposalPath) return null;
  return JSON.parse(readFileSync(path.join(root, proposalPath), 'utf-8'));
}

function saveProposal(root, proposalPath, proposal) {
  writeFileSync(path.join(root, proposalPath), `${JSON.stringify(proposal, null, 2)}\n`);
}

function proposalNeedsRefresh(proposal) {
  return (
    !proposal ||
    typeof proposal.content_extract_status !== 'string' ||
    !Array.isArray(proposal.review_notes)
  );
}

function resolveLocalInput(input, root) {
  if (input === 'inbox') return path.join(root, DEFAULT_INBOX_DIR);
  return path.isAbsolute(input) ? input : path.resolve(root, input);
}

function listIngestibleFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && !entry.name.startsWith('.') && entry.name !== '.gitkeep')
    .map(entry => path.join(directory, entry.name))
    .sort();
}

async function loadSource(input, root) {
  if (isUrl(input)) {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${input}: HTTP ${response.status}`);
    }
    const text = await response.text();
    return {
      buffer: Buffer.from(text, 'utf-8'),
      displayName: input,
      extension: '.md',
      sourceId: `url:${input}`,
      sourceType: 'url',
      sourceUrl: input,
    };
  }

  const absolute = resolveLocalInput(input, root);
  if (!existsSync(absolute)) {
    throw new Error(`Source not found: ${input}`);
  }

  return {
    buffer: readFileSync(absolute),
    displayName: path.basename(absolute),
    extension: path.extname(absolute) || '.txt',
    originalPath: absolute,
    sourceId: `file:${absolute}`,
    sourceType: 'file',
  };
}

function extractClaims(text) {
  return text
    .split(/\n+/)
    .map(line => line.trim().replace(/^[-*]\s+/, ''))
    .filter(line => line.length > 20)
    .filter(line => (
      /\b\d+(?:\.\d+)?\s*(%|hours?|days?|weeks?|months?|people|staff|applications?|reports?)\b/i.test(line) ||
      /\b(delivered|reduced|increased|coordinated|managed|implemented|trained|created|led)\b/i.test(line)
    ))
    .slice(0, 5);
}

export function classifySource({ input, sourceType, text }) {
  const lowerInput = input.toLowerCase();
  const lowerName = isUrl(input) ? lowerInput : path.basename(input).toLowerCase();
  const lower = text.toLowerCase();

  if (
    lower.includes('tracked_companies:') ||
    lower.includes('careers_url:') ||
    lower.includes('title_filter:')
  ) {
    return {
      classification: 'scanner_config',
      target_files: ['portals.yml'],
      recommended_action: 'review_scanner_config',
    };
  }

  if (/\b(role[-_\s]?description|job[-_\s]?description|position[-_\s]?description|vacancy|seek|smartjobs|careers?)\b/i.test(lowerName)) {
    return {
      classification: sourceType === 'url' ? 'job_url' : 'job_description',
      target_files: ['data/pipeline.md', 'jds/'],
      recommended_action: 'review_for_pipeline_intake',
    };
  }

  if (/\b(selection[-_\s]?criteria|cover[-_\s]?letter|writing[-_\s]?sample)\b/i.test(lowerName)) {
    return {
      classification: 'writing_sample',
      target_files: ['writing-samples/'],
      recommended_action: 'review_for_style_calibration',
    };
  }

  if (
    /\b(responsibilities|requirements|qualifications|about the role|apply for this job)\b/i.test(text) ||
    /\b(greenhouse|ashby|lever|workday|seek|smartjobs)\b/i.test(lowerInput)
  ) {
    return {
      classification: sourceType === 'url' ? 'job_url' : 'job_description',
      target_files: ['data/pipeline.md', 'jds/'],
      recommended_action: 'review_for_pipeline_intake',
    };
  }

  if (
    lowerInput.includes('writing-samples') ||
    /\b(selection criteria|cover letter|writing sample|tone|voice)\b/i.test(text)
  ) {
    return {
      classification: 'writing_sample',
      target_files: ['writing-samples/'],
      recommended_action: 'review_for_style_calibration',
    };
  }

  if (
    /\b(target roles?|salary|compensation|timezone|location|deal-?breakers?|archetypes?)\b/i.test(text)
  ) {
    return {
      classification: 'profile_update',
      target_files: ['config/profile.yml', 'modes/_profile.md'],
      recommended_action: 'review_profile_update',
    };
  }

  if (extractClaims(text).length > 0) {
    return {
      classification: 'proof_point',
      target_files: ['article-digest.md'],
      recommended_action: 'review_proof_point',
    };
  }

  return {
    classification: 'unclassified',
    target_files: [],
    recommended_action: 'manual_review',
  };
}

function buildProposal({ input, source, hash, rawPath, now }) {
  const extracted = sourceText(source);
  const classification = classifySource({
    input,
    sourceType: source.sourceType,
    text: extracted.text,
  });

  return {
    source: rawPath,
    source_id: source.sourceId,
    source_type: source.sourceType,
    source_hash: hash,
    ingested_at: now.toISOString(),
    classification: classification.classification,
    target_files: classification.target_files,
    recommended_action: classification.recommended_action,
    content_extract_status: extracted.contentExtractStatus,
    review_notes: extracted.reviewNotes,
    claims: extractClaims(extracted.text),
    conflicts: [],
    requires_user_review: true,
    apply_status: 'not_applied',
  };
}

export async function ingestSource({
  input,
  root = DEFAULT_ROOT,
  now = () => new Date(),
  force = false,
} = {}) {
  if (!input) {
    throw new Error('Usage: node ingest.mjs <path-or-url> [--force]');
  }

  const absoluteRoot = path.resolve(root);
  ensureIngestDirs(absoluteRoot);

  if (!isUrl(input)) {
    const resolvedInput = resolveLocalInput(input, absoluteRoot);
    if (existsSync(resolvedInput) && statSync(resolvedInput).isDirectory()) {
      const files = listIngestibleFiles(resolvedInput);
      const results = [];
      for (const file of files) {
        results.push(await ingestSource({ input: file, root: absoluteRoot, now, force }));
      }
      return {
        status: 'folder_ingested',
        source: toRepoPath(resolvedInput, absoluteRoot),
        source_count: files.length,
        ingested_count: results.filter(result => result.status === 'ingested').length,
        skipped_count: results.filter(result => result.status === 'already_ingested').length,
        results,
      };
    }
  }

  const source = await loadSource(input, absoluteRoot);
  const hash = hashBuffer(source.buffer);
  const manifest = loadManifest(absoluteRoot);
  const existing = manifest.sources[source.sourceId];

  if (!force && existing?.hash === hash) {
    const proposal = loadProposal(absoluteRoot, existing.proposal_path);
    if (proposalNeedsRefresh(proposal) && existing.proposal_path) {
      const date = now();
      const refreshedProposal = buildProposal({
        input,
        source,
        hash,
        rawPath: existing.raw_path,
        now: date,
      });
      saveProposal(absoluteRoot, existing.proposal_path, refreshedProposal);

      manifest.updated_at = date.toISOString();
      manifest.sources[source.sourceId] = {
        ...existing,
        classification: refreshedProposal.classification,
        target_files: refreshedProposal.target_files,
      };
      saveManifest(absoluteRoot, manifest);

      return {
        status: 'already_ingested',
        proposal_refreshed: true,
        source_id: source.sourceId,
        hash,
        raw_path: existing.raw_path,
        proposal_path: existing.proposal_path,
        proposal: refreshedProposal,
      };
    }

    return {
      status: 'already_ingested',
      source_id: source.sourceId,
      hash,
      raw_path: existing.raw_path,
      proposal_path: existing.proposal_path,
      proposal,
    };
  }

  const date = now();
  const baseSlug = slugify(source.sourceType === 'url' ? source.displayName : path.basename(source.displayName, source.extension));
  const suffix = `${todayStamp(date)}-${hash.slice(0, 8)}`;
  const rawFile = `${baseSlug}-${suffix}${source.extension}`;
  const rawFull = path.join(absoluteRoot, RAW_DIR, rawFile);
  const rawPath = toRepoPath(rawFull, absoluteRoot);

  if (source.originalPath) {
    copyFileSync(source.originalPath, rawFull);
  } else {
    writeFileSync(rawFull, source.buffer);
  }

  const proposal = buildProposal({ input, source, hash, rawPath, now: date });
  const proposalFile = `${baseSlug}-${timestampStamp(date)}-${hash.slice(0, 8)}.json`;
  const proposalFull = path.join(absoluteRoot, PROPOSALS_DIR, proposalFile);
  const proposalPath = toRepoPath(proposalFull, absoluteRoot);
  writeFileSync(proposalFull, `${JSON.stringify(proposal, null, 2)}\n`);

  manifest.updated_at = date.toISOString();
  manifest.sources[source.sourceId] = {
    source_id: source.sourceId,
    source_type: source.sourceType,
    source_url: source.sourceUrl,
    original_path: source.originalPath,
    hash,
    ingested_at: date.toISOString(),
    raw_path: rawPath,
    proposal_path: proposalPath,
    classification: proposal.classification,
    target_files: proposal.target_files,
  };
  saveManifest(absoluteRoot, manifest);

  return {
    status: 'ingested',
    source_id: source.sourceId,
    hash,
    raw_path: rawPath,
    proposal_path: proposalPath,
    manifest_path: MANIFEST_PATH,
    proposal,
  };
}

function parseArgs(argv) {
  const args = [...argv];
  const forceIndex = args.indexOf('--force');
  const force = forceIndex !== -1;
  if (force) args.splice(forceIndex, 1);
  return { input: args[0], force };
}

async function main() {
  const { input, force } = parseArgs(process.argv.slice(2));
  const result = await ingestSource({ input, force });
  console.log(JSON.stringify(result, null, 2));
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath === modulePath) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
