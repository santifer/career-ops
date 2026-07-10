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
    console.log('  ✅ extracts employer, title, and tool claims');
  } else {
    console.error(`  ❌ claim extraction incomplete: ${JSON.stringify(claims)}`);
    process.exitCode = 1;
  }

  const supported = verifyFacts('I worked at Acme Labs as a Senior Platform Engineer, using React and Docker.', {
    sourcePaths: [source], configPath: config,
  });
  if (supported.verdict === 'pass' && supported.unsupportedFacts.length === 0) {
    console.log('  ✅ source-backed non-metric facts pass');
  } else {
    console.error(`  ❌ source-backed non-metric facts blocked: ${JSON.stringify(supported)}`);
    process.exitCode = 1;
  }

  const unsupported = verifyFacts('I worked at Invented Labs as a Principal Platform Engineer, using React and Terraform.', {
    sourcePaths: [source], configPath: config,
  });
  if (unsupported.verdict === 'block'
      && unsupported.unsupportedFacts.some(claim => claim.value === 'invented labs')
      && unsupported.unsupportedFacts.some(claim => claim.value === 'principal platform engineer')
      && unsupported.unsupportedFacts.some(claim => claim.value === 'terraform')) {
    console.log('  ✅ unsupported employer, title, and tool claims block');
  } else {
    console.error(`  ❌ unsupported non-metric facts were not blocked: ${JSON.stringify(unsupported)}`);
    process.exitCode = 1;
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
