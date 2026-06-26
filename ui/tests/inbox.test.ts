import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parsePipelineInbox, getInboxSummary } from '../lib/inbox';

function makeFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'career-ops-inbox-'));
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'pipeline.md'), [
    '## Pending',
    '',
    '- [ ] https://example.com/jobs/1 | Acme | Senior PM',
    '- [ ] https://example.com/jobs/2 | Acme | Junior PM',
    '- [ ] https://example.com/jobs/3 | Beta Co | Engineer',
    '',
    '## Procesadas',
    '',
    '- [x] https://example.com/jobs/4 | DoneCo | Specialist | Evaluated 2026-06-06 | 4.0/5',
    '',
  ].join('\n'));
  return root;
}

describe('inbox parser', () => {
  let root: string;
  let prevRoot: string | undefined;
  beforeEach(() => {
    root = makeFixture();
    prevRoot = process.env.CAREER_OPS_ROOT;
    process.env.CAREER_OPS_ROOT = root;
  });
  afterEach(() => {
    if (prevRoot === undefined) delete process.env.CAREER_OPS_ROOT;
    else process.env.CAREER_OPS_ROOT = prevRoot;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('parses pending and processed sections', () => {
    const items = parsePipelineInbox();
    const pending = items.filter((i) => i.section === 'pending');
    const processed = items.filter((i) => i.section === 'processed');

    expect(pending).toHaveLength(3);
    expect(processed).toHaveLength(1);

    expect(pending[0].company).toBe('Acme');
    expect(pending[0].role).toBe('Senior PM');
    expect(pending[0].url).toBe('https://example.com/jobs/1');

    expect(processed[0].company).toBe('DoneCo');
    expect(processed[0].outcome).toContain('Evaluated');
    expect(processed[0].processedAt).toBe('2026-06-06');
    expect(processed[0].score).toBe('4.0/5');
  });

  it('summary counts both sections and unique companies', () => {
    const s = getInboxSummary();
    expect(s.pending).toBe(3);
    expect(s.processed).toBe(1);
    expect(s.companies).toBe(3);
  });

  it('returns empty when file missing', () => {
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'career-ops-empty-'));
    fs.mkdirSync(path.join(emptyRoot, 'data'), { recursive: true });
    const prev = process.env.CAREER_OPS_ROOT;
    process.env.CAREER_OPS_ROOT = emptyRoot;
    try {
      expect(parsePipelineInbox()).toEqual([]);
      expect(getInboxSummary()).toEqual({ pending: 0, processed: 0, companies: 0 });
    } finally {
      process.env.CAREER_OPS_ROOT = prev;
      fs.rmSync(emptyRoot, { recursive: true, force: true });
    }
  });
});
