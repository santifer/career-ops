import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseApplications, parseReport } from '../lib/parser';
import { updateStatus, updateNotes } from '../lib/writer';

function makeFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'career-ops-test-'));
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
  fs.mkdirSync(path.join(root, 'templates'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'applications.md'), [
    '# Applications Tracker',
    '',
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|-------|--------|-----|--------|-------|',
    '| 001 | 2026-06-06 | Arize AI | AI Product Manager | 4.1/5 | Applied | ✅ | [001](../reports/001-arize-ai-2026-06-06.md) | Submitted |',
    '| 002 | 2026-06-06 | Glean | AI Outcomes Manager | 4.7/5 | Evaluated | ❌ | [002](../reports/002-glean-2026-06-06.md) | Internal note |',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'reports', '001-arize-ai-2026-06-06.md'),
    '# Evaluation: Arize AI - AI Product Manager\n\n**Score:** 4.1/5\n**Archetype:** Enterprise AI Product Manager\n**Legitimacy:** High Confidence\n\nBody.');
  fs.writeFileSync(path.join(root, 'templates', 'states.yml'),
    'states:\n  - name: Evaluated\n  - name: Applied\n  - name: Responded\n  - name: Interview\n  - name: Offer\n  - name: Rejected\n  - name: Discarded\n  - name: SKIP\n');
  return root;
}

describe('parser', () => {
  let root: string;
  beforeEach(() => { root = makeFixture(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('parses applications and preserves zero-padded number and original link', () => {
    const apps = parseApplications(root);
    expect(apps).toHaveLength(2);
    expect(apps[0].number).toBe(1);
    expect(apps[0].numberRaw).toBe('001');
    expect(apps[0].reportLink).toBe('[001](../reports/001-arize-ai-2026-06-06.md)');
    expect(apps[0].reportPath).toBe('reports/001-arize-ai-2026-06-06.md');
    expect(apps[1].status).toBe('Evaluated');
  });

  it('parses a report summary', () => {
    const r = parseReport(root, 'reports/001-arize-ai-2026-06-06.md');
    expect(r).not.toBeNull();
    expect(r!.score).toBeCloseTo(4.1);
    expect(r!.archetype).toContain('Enterprise AI');
    expect(r!.legitimacy).toBe('High Confidence');
  });
});

describe('writer round-trip', () => {
  let root: string;
  beforeEach(() => { root = makeFixture(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('updates status and preserves original link format', async () => {
    const updated = await updateStatus(root, 2, 'Responded');
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('Responded');

    const raw = fs.readFileSync(path.join(root, 'data', 'applications.md'), 'utf-8');
    expect(raw).toContain('[002](../reports/002-glean-2026-06-06.md)');
    expect(raw).toContain('| 002 |');
    expect(raw).toContain('| Responded |');
  });

  it('rejects non-canonical status', async () => {
    await expect(updateStatus(root, 2, 'Banana')).rejects.toThrow(/not canonical/);
  });

  it('returns null when number not found', async () => {
    const result = await updateStatus(root, 9999, 'Applied');
    expect(result).toBeNull();
  });

  it('preserves every row that was not edited', async () => {
    const before = parseApplications(root);
    await updateStatus(root, 2, 'Interview');
    const after = parseApplications(root);
    expect(after).toHaveLength(before.length);
    const arize = after.find((a) => a.number === 1)!;
    expect(arize.status).toBe(before.find((b) => b.number === 1)!.status);
    expect(arize.reportLink).toBe(before.find((b) => b.number === 1)!.reportLink);
  });

  it('updates notes column', async () => {
    await updateNotes(root, 1, 'New note text');
    const after = parseApplications(root);
    expect(after.find((a) => a.number === 1)!.notes).toBe('New note text');
  });
});
