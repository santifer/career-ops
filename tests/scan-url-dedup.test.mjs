// tests/scan-url-dedup.test.mjs — urlDedupKey() must ignore volatile tracking
// parameters without ever collapsing two distinct postings onto one key.
//
// StepStone regenerates its `rltr` parameter on every request, so an exact-match
// URL dedup treated the same posting as new on each scan (one posting was stored
// under four URLs across four scans, and every re-add flowed into the pipeline).
import { pass, fail, ROOT } from './helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';

console.log('\nscan.mjs — urlDedupKey() ignores tracking params, preserves identity');
try {
  const { urlDedupKey } = await import(pathToFileURL(join(ROOT, 'scan.mjs')).href);

  // The reported bug: one StepStone posting, two scans, two `rltr` values.
  const SS = 'https://www.stepstone.de/stellenangebote--AI-Engineer-Berlin-Acme--12345-inline.html';
  const a = urlDedupKey(`${SS}?rltr=23_23_25_seorl_a_0_0_0_0_1_0`);
  const b = urlDedupKey(`${SS}?rltr=42_17_25_seorl_r_0_0_0_0_1_0`);
  if (a === b && a === SS) pass('urlDedupKey collapses StepStone rltr variants onto the bare URL');
  else fail(`urlDedupKey rltr = ${JSON.stringify({ a, b })}`);

  // utm_* are analytics only.
  const utm = urlDedupKey('https://jobs.example.com/j/7?utm_source=x&utm_medium=y&utm_campaign=z');
  if (utm === 'https://jobs.example.com/j/7') pass('urlDedupKey strips utm_* parameters');
  else fail(`urlDedupKey utm = ${utm}`);

  // Identity-bearing params MUST survive: collapsing two real postings would
  // silently hide a job, which is worse than re-adding a duplicate.
  const gh1 = urlDedupKey('https://boards.greenhouse.io/acme/jobs/1?gh_jid=1');
  const gh2 = urlDedupKey('https://boards.greenhouse.io/acme/jobs/1?gh_jid=2');
  if (gh1 !== gh2) pass('urlDedupKey keeps identity params (gh_jid) distinct');
  else fail(`urlDedupKey collapsed distinct gh_jid postings onto ${gh1}`);

  // A tracking param must not take a real one with it.
  const mixed = urlDedupKey('https://jobs.example.com/j?gh_jid=9&rltr=abc&utm_source=feed');
  if (mixed === 'https://jobs.example.com/j?gh_jid=9') pass('urlDedupKey drops only tracking params from a mixed query');
  else fail(`urlDedupKey mixed query = ${mixed}`);

  // Untracked URLs must keep matching what is already in scan-history.
  const plain = 'https://jobs.ashbyhq.com/acme/abc-123';
  if (urlDedupKey(plain) === plain) pass('urlDedupKey leaves a tracking-free URL unchanged');
  else fail(`urlDedupKey plain = ${urlDedupKey(plain)}`);

  // pipeline.md supports `local:jds/foo.md`. `local:` is a valid URL scheme, so this
  // parses and round-trips unchanged rather than hitting the catch — either way the
  // key must equal the input, or a local JD would be re-added on every scan.
  const local = 'local:jds/acme-ai-engineer.md';
  if (urlDedupKey(local) === local) pass('urlDedupKey round-trips local: pipeline entries unchanged');
  else fail(`urlDedupKey local = ${urlDedupKey(local)}`);

  // A genuinely unparseable value (no scheme) is what the catch actually handles.
  const bare = 'jds/acme-ai-engineer.md';
  if (urlDedupKey(bare) === bare) pass('urlDedupKey passes through scheme-less values unchanged');
  else fail(`urlDedupKey scheme-less = ${urlDedupKey(bare)}`);

  if (urlDedupKey('') === '' && urlDedupKey(null) === '' && urlDedupKey(undefined) === '') {
    pass('urlDedupKey handles empty/nullish input');
  } else {
    fail('urlDedupKey should return "" for empty/nullish input');
  }
} catch (err) {
  fail(`scan.mjs urlDedupKey tests crashed: ${err && err.message}`);
}
