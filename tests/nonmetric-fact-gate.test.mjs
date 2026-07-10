import { pass, fail } from './helpers.mjs';
import { factClaims, verifyFacts } from '../verify-cv-facts.mjs';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

console.log('\nNon-metric fact gate');

const tmp = mkdtempSync(join(tmpdir(), 'career-ops-nonmetric-facts-'));
try {
  const source = join(tmp, 'cv.md');
  const config = join(tmp, 'cv-facts.json');
  writeFileSync(source, 'Senior Platform Engineer at Acme Labs. Built using React and Docker.');
  writeFileSync(config, JSON.stringify({ allow_metrics: [], allow_facts: [], forbidden_phrases: [] }));

  const claims = factClaims('I worked at Acme Labs as a Senior Platform Engineer, using React and Docker.');
  if (claims.some(claim => claim.kind === 'employer' && claim.value === 'acme labs')
      && claims.some(claim => claim.kind === 'title' && claim.value === 'senior platform engineer')
      && claims.some(claim => claim.kind === 'tool' && claim.value === 'react')) {
    pass('extracts employer, title, and tool claims');
  } else {
    fail(`claim extraction incomplete: ${JSON.stringify(claims)}`);
  }

  const supported = verifyFacts('I worked at Acme Labs as a Senior Platform Engineer, using React and Docker.', {
    sourcePaths: [source], configPath: config,
  });
  if (supported.verdict === 'pass' && supported.unsupportedFacts.length === 0) {
    pass('source-backed non-metric facts pass');
  } else {
    fail(`source-backed non-metric facts blocked: ${JSON.stringify(supported)}`);
  }

  const unsupported = verifyFacts('I worked at Invented Labs as a Principal Platform Engineer, using React and Terraform.', {
    sourcePaths: [source], configPath: config,
  });
  if (unsupported.verdict === 'block'
      && unsupported.unsupportedFacts.some(claim => claim.value === 'invented labs')
      && unsupported.unsupportedFacts.some(claim => claim.value === 'principal platform engineer')
      && unsupported.unsupportedFacts.some(claim => claim.value === 'terraform')) {
    pass('unsupported employer, title, and tool claims block');
  } else {
    fail(`unsupported non-metric facts were not blocked: ${JSON.stringify(unsupported)}`);
  }

  const trailingProse = factClaims('I built this using React and Docker for containerized deployments.');
  if (trailingProse.some(claim => claim.kind === 'tool' && claim.value === 'react')
      && trailingProse.some(claim => claim.kind === 'tool' && claim.value === 'docker')
      && !trailingProse.some(claim => claim.value.includes('containerized deployments'))) {
    pass('tool claims stop before trailing prepositional prose');
  } else {
    fail(`tool claim over-captured trailing prose: ${JSON.stringify(trailingProse)}`);
  }

  const connectorTools = factClaims('I built this using React with Redux in Dify.');
  if (connectorTools.some(claim => claim.kind === 'tool' && claim.value === 'react')
      && connectorTools.some(claim => claim.kind === 'tool' && claim.value === 'redux')
      && connectorTools.some(claim => claim.kind === 'tool' && claim.value === 'dify')) {
    pass('tool claims split across with/in connectors');
  } else {
    fail(`connector-separated tool claims were not extracted: ${JSON.stringify(connectorTools)}`);
  }

  const proseTitle = factClaims('The company was recognized as a Top Employer.');
  if (!proseTitle.some(claim => claim.kind === 'title')) {
    pass('ordinary as prose is not treated as a title claim');
  } else {
    fail(`ordinary prose produced a false title claim: ${JSON.stringify(proseTitle)}`);
  }

  const boundary = verifyFacts('I am using Go and Google Cloud.', {
    sourcePaths: [source], configPath: config,
  });
  if (boundary.unsupportedFacts.some(claim => claim.kind === 'tool' && claim.value === 'go')) {
    pass('fact matching does not accept embedded substrings');
  } else {
    fail(`fact matching accepted an embedded substring: ${JSON.stringify(boundary)}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
