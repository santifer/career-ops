// tests/auto-triage-markers.test.mjs — guards the Gate B marker list in
// .github/workflows/auto-triage-scan-output.yml (#1805).
//
// The workflow auto-closes third parties' personal scan dumps so a candidate's
// name and live ATS URLs don't sit on the public tracker. #1791 slipped through
// because no marker covered the `## Automated Weekly Scan` body header or the
// `🔍 Scan results — …` title shape. This test extracts the live regexes from
// the workflow and replays the acceptance matrix: the scan-dump family must
// trip a marker, and legitimate human scanner issues must stay open.
import { pass, fail, ROOT } from './helpers.mjs';
import { readFileSync } from 'fs';
import { join } from 'path';

console.log('\nauto-triage-scan-output.yml — Gate B markers (#1805)');
try {
  const wf = readFileSync(
    join(ROOT, '.github/workflows/auto-triage-scan-output.yml'),
    'utf-8',
  );

  // Pull the `const markers = [ … ];` block and parse each regex literal out of
  // it, so this test checks the regexes the workflow actually ships — not a
  // hand-copied duplicate that could drift.
  const block = wf.match(/const markers = \[([\s\S]*?)\];/);
  if (!block) throw new Error('could not locate the markers array in the workflow');

  const markers = [];
  for (const rawLine of block[1].split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('/') || line.startsWith('//')) continue; // skip blanks + comments
    const m = line.match(/^(\/.*\/)([a-z]*),?\s*(?:\/\/.*)?$/);
    if (!m) throw new Error(`unparseable marker line: ${line}`);
    markers.push(new RegExp(m[1].slice(1, -1), m[2]));
  }

  if (markers.length === 14) {
    pass(`extracted all 14 Gate B markers from the workflow`);
  } else {
    fail(`expected 14 markers, extracted ${markers.length}`);
  }

  // The two markers #1805 adds — assert they survive in the shipped list so a
  // future edit can't silently drop them (they're the whole fix).
  const hasHeaderMarker = markers.some((re) => /#\{1,6\}/.test(re.source) && /Automated/.test(re.source));
  const hasEmojiMarker = markers.some((re) => re.source.includes('🔍') && /Scan/.test(re.source));
  if (hasHeaderMarker) pass('header-anchored `## Automated <adj> Scan` marker present');
  else fail('missing the header-anchored Automated-scan marker (#1805)');
  if (hasEmojiMarker) pass('emoji-led title `🔍 … Scan` marker present');
  else fail('missing the emoji-led scan-title marker (#1805)');

  // Mirror the workflow: hay is title + "\n" + body, matched with .some().
  const matches = (title, body) => {
    const hay = `${title || ''}\n${body || ''}`;
    return markers.some((re) => re.test(hay));
  };

  // Scan-dump family — each MUST trip a marker (would get auto-closed).
  const shouldClose = [
    ['#1791 title', '🔍 Scan results — 2026-07-01 — 5 new leads', ''],
    ['#1791 body header', 'weekly automation', '## Automated Weekly Scan — 2026-07-01\n\n| Company | Role | URL |\n|--|--|--|'],
    ['#1153 title', '🔍 Scan 2026-05-01 — 16 new remote opportunities', ''],
    ['#1128 title', '🔍 Scan 2026-04-01 — 14 offres détectées', ''],
    ['#1168 title', '🤖 Automated scan blocked — onboarding required', ''],
  ];
  for (const [label, title, body] of shouldClose) {
    if (matches(title, body)) pass(`trips a marker: ${label}`);
    else fail(`missed a scan-dump that should close: ${label} — ${title || body}`);
  }

  // Legitimate human issues about the scanner — each MUST stay open (no marker),
  // including the adversarial interposed-adjective titles called out in #1805.
  const shouldStayOpen = [
    ['feat commit-style title', 'feat(scan): add new provider', ''],
    ['doc drift', 'scan.md drift', ''],
    ['improvement request', 'improve weekly scan', ''],
    ['unrelated CI', 'Automated tests failing', ''],
    ['interposed-adjective human title', 'Automated Weekly Scan improvements', ''],
    ['RFC opt-in', 'RFC: make the Automated Weekly Scan opt-in', ''],
    ['numeric-tail human title', 'Add 3 new leads sources to portals.yml', ''],
    ['different-emoji, not scan', '🔎 Search UX improvements', ''],
  ];
  for (const [label, title, body] of shouldStayOpen) {
    if (!matches(title, body)) pass(`stays open (no marker): ${label}`);
    else fail(`false positive — would wrongly close: ${label} — ${title || body}`);
  }
} catch (e) {
  fail(`auto-triage marker tests crashed: ${e.message}`);
}
