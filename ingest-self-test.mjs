#!/usr/bin/env node

import assert from 'assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { DEFAULT_INBOX_DIR, ingestSource } from './ingest.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'career-ops-ingest-'));
const now = () => new Date('2026-05-28T10:30:00Z');

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf-8'));
}

const proofSource = path.join(root, 'community-program-proof.md');
writeFileSync(
  proofSource,
  [
    '# Community program proof',
    '',
    'Delivered a new intake workflow that reduced manual follow-up by 35%.',
    'Coordinated stakeholders, documented the process, and trained the team.',
  ].join('\n')
);

const first = await ingestSource({ input: proofSource, root, now });
assert.equal(first.status, 'ingested');
assert.equal(first.proposal.classification, 'proof_point');
assert.deepEqual(first.proposal.target_files, ['article-digest.md']);
assert.equal(first.proposal.requires_user_review, true);
assert.ok(existsSync(path.join(root, first.raw_path)));
assert.ok(existsSync(path.join(root, first.proposal_path)));
assert.ok(existsSync(path.join(root, 'data/ingest/manifest.json')));

const manifest = readJson(path.join(root, 'data/ingest/manifest.json'));
assert.equal(Object.keys(manifest.sources).length, 1);
assert.equal(manifest.sources[first.source_id].hash, first.hash);
assert.equal(manifest.sources[first.source_id].proposal_path, first.proposal_path);

const duplicate = await ingestSource({ input: proofSource, root, now });
assert.equal(duplicate.status, 'already_ingested');
assert.equal(duplicate.hash, first.hash);
assert.equal(duplicate.proposal_path, first.proposal_path);

const scannerSource = path.join(root, 'companies.yml');
writeFileSync(
  scannerSource,
  [
    'tracked_companies:',
    '  - name: Example Council',
    '    careers_url: https://example.test/careers',
  ].join('\n')
);

const scanner = await ingestSource({ input: scannerSource, root, now });
assert.equal(scanner.status, 'ingested');
assert.equal(scanner.proposal.classification, 'scanner_config');
assert.deepEqual(scanner.proposal.target_files, ['portals.yml']);

const proposal = readJson(path.join(root, scanner.proposal_path));
assert.equal(proposal.requires_user_review, true);
assert.deepEqual(proposal.conflicts, []);
assert.ok(Array.isArray(proposal.claims));

const inbox = path.join(root, DEFAULT_INBOX_DIR);
mkdirSync(inbox, { recursive: true });
writeFileSync(
  path.join(inbox, 'selection-criteria.md'),
  [
    '# Selection criteria',
    '',
    'Created a stakeholder register and coordinated 12 community follow-ups.',
  ].join('\n')
);
writeFileSync(
  path.join(inbox, 'new-companies.yml'),
  [
    'tracked_companies:',
    '  - name: Local School',
    '    careers_url: https://example.test/jobs',
  ].join('\n')
);

const inboxRun = await ingestSource({ input: 'inbox', root, now });
assert.equal(inboxRun.status, 'folder_ingested');
assert.equal(inboxRun.source_count, 2);
assert.equal(inboxRun.results.filter(r => r.status === 'ingested').length, 2);
assert.ok(inboxRun.results.every(r => r.proposal_path));

const inboxRepeat = await ingestSource({ input: 'inbox', root, now });
assert.equal(inboxRepeat.status, 'folder_ingested');
assert.equal(inboxRepeat.source_count, 2);
assert.equal(inboxRepeat.results.filter(r => r.status === 'already_ingested').length, 2);

const directFolder = path.join(root, 'loose-drop-folder');
mkdirSync(directFolder, { recursive: true });
writeFileSync(
  path.join(directFolder, 'role-description.md'),
  [
    '# Program Officer',
    '',
    'Responsibilities include community coordination, reporting, and stakeholder engagement.',
  ].join('\n')
);
const directFolderRun = await ingestSource({ input: directFolder, root, now });
assert.equal(directFolderRun.status, 'folder_ingested');
assert.equal(directFolderRun.source_count, 1);
assert.equal(directFolderRun.results[0].proposal.classification, 'job_description');

const binaryRoleDescription = path.join(root, '688711 26 Role Description.docx');
writeFileSync(
  binaryRoleDescription,
  Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0xff, 0x00])
);
const binaryResult = await ingestSource({ input: binaryRoleDescription, root, now });
assert.equal(binaryResult.status, 'ingested');
assert.equal(binaryResult.proposal.classification, 'job_description');
assert.deepEqual(binaryResult.proposal.target_files, ['data/pipeline.md', 'jds/']);
assert.deepEqual(binaryResult.proposal.claims, []);
assert.equal(binaryResult.proposal.content_extract_status, 'binary_unparsed');
assert.ok(binaryResult.proposal.review_notes.some(note => note.includes('not extracted')));

const legacyProposalPath = path.join(root, binaryResult.proposal_path);
writeFileSync(
  legacyProposalPath,
  `${JSON.stringify({
    ...binaryResult.proposal,
    classification: 'proof_point',
    target_files: ['article-digest.md'],
    claims: ['binary garbage coordinated managed implemented'],
    content_extract_status: undefined,
    review_notes: undefined,
  }, null, 2)}\n`
);
const refreshedBinary = await ingestSource({ input: binaryRoleDescription, root, now });
assert.equal(refreshedBinary.status, 'already_ingested');
assert.equal(refreshedBinary.proposal_refreshed, true);
assert.equal(refreshedBinary.proposal.classification, 'job_description');
assert.deepEqual(refreshedBinary.proposal.claims, []);
assert.equal(readJson(legacyProposalPath).content_extract_status, 'binary_unparsed');

console.log('ingest self-test OK');
