// tests/providers/ats-ssrf-hardening.test.mjs — moved verbatim from test-all.mjs (#1440).
// _http.mjs defaults to redirect:'follow', so a server-side redirect from any
// of these ATS APIs to an internal address is an SSRF vector. Every other GET
// provider passes redirect:'error'; these two were missing it.
// (workday's redirect:'error' coverage lives in its own "Provider — workday"
// section, checked across every paginated request, not just the first.)
import { pass, fail, ROOT } from '../helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';

console.log('\nProvider — SSRF redirect hardening (lever / ashby)');

try {
  const lever = (await import(pathToFileURL(join(ROOT, 'providers/lever.mjs')).href)).default;
  const ashby = (await import(pathToFileURL(join(ROOT, 'providers/ashby.mjs')).href)).default;

  let leverOpts = null;
  await lever.fetch(
    { name: 'L', careers_url: 'https://jobs.lever.co/example' },
    { transport: 'http', fetchJson: async (_u, opts) => { leverOpts = opts; return []; }, fetchText: async () => '' },
  );
  if (leverOpts && leverOpts.redirect === 'error') pass('lever.fetch() passes redirect:"error"');
  else fail(`lever.fetch() should pass redirect:"error", got ${JSON.stringify(leverOpts)}`);

  let ashbyOpts = null;
  await ashby.fetch(
    { name: 'A', careers_url: 'https://jobs.ashbyhq.com/example' },
    { transport: 'http', fetchJson: async (_u, opts) => { ashbyOpts = opts; return { jobs: [] }; }, fetchText: async () => '' },
  );
  if (ashbyOpts && ashbyOpts.redirect === 'error') pass('ashby.fetch() passes redirect:"error"');
  else fail(`ashby.fetch() should pass redirect:"error", got ${JSON.stringify(ashbyOpts)}`);
} catch (e) {
  fail(`SSRF redirect hardening tests crashed: ${e.message}`);
}

