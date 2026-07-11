import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { applicationArtifactPaths, ensureApplicationArtifactDirs, writeReuseDecision } from '../application-artifacts.mjs';

const root = mkdtempSync(join(tmpdir(), 'career-ops-application-artifacts-'));
try {
  const paths = applicationArtifactPaths({ reportNum: 7, company: 'Acme AI', role: 'Senior AI Engineer', root });
  if (paths.key === '007-acme-ai-senior-ai-engineer' && paths.cv.pdf.endsWith('/cv/tailored.pdf')) {
    console.log('  ✅ application artifacts use a stable report/company/role bundle');
  } else {
    throw new Error(`unexpected artifact paths: ${JSON.stringify(paths)}`);
  }

  ensureApplicationArtifactDirs(paths);
  if (existsSync(join(paths.root, 'jd')) && existsSync(join(paths.root, 'cv'))) {
    console.log('  ✅ application artifact directories initialize together');
  } else {
    throw new Error('application artifact directories were not created');
  }

  writeReuseDecision(paths, {
    decision: 'reuse-with-edits',
    score: 0.81,
    sourceCv: paths.cv.source,
    currentJd: paths.jd.current,
    previousSource: paths.jd.previous,
    changedSections: ['Summary', 'Skills'],
  });
  const decision = JSON.parse(readFileSync(paths.reuseDecision, 'utf8'));
  if (decision.decision === 'reuse-with-edits' && decision.changed_sections.length === 2) {
    console.log('  ✅ reuse decisions are recorded beside the artifact bundle');
  } else {
    throw new Error(`unexpected reuse decision: ${JSON.stringify(decision)}`);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

