// tests/providers/4dayweek.test.mjs — provider-contract tests for the 4dayweek
// board-wide JSON aggregator (providers/4dayweek.mjs).
import { pass, fail, ROOT } from '../helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { default as fourdayweek } from '../../providers/4dayweek.mjs';
import { normalize4dwJob } from '../../providers/4dayweek.mjs';

console.log('\nProvider — 4dayweek');

try {
  if (fourdayweek.id === '4dayweek') pass('fourdayweek.id is "4dayweek"');
  else fail(`fourdayweek.id is ${JSON.stringify(fourdayweek.id)}`);

  // detect() — explicit provider selection only (board-wide feed)
  const hit = fourdayweek.detect({ name: '4dayweek', provider: '4dayweek' });
  if (hit && hit.url === 'https://4dayweek.io/api/jobs') pass('fourdayweek.detect() resolves provider:4dayweek → feed URL');
  else fail(`fourdayweek.detect() returned ${JSON.stringify(hit)}`);
  if (fourdayweek.detect({ name: 'X' }) === null) pass('fourdayweek.detect() returns null without provider:4dayweek');
  else fail('fourdayweek.detect() should require provider:4dayweek');

  // normalize4dwJob — field mapping, external ATS url kept, postedAt (ms)
  const j = {
    title: '  Senior Go Engineer  ',
    slug: 'abc-123',
    company_name: 'Acme',
    locations: [{ city: 'San Francisco', country: 'USA' }],
    work_arrangement: 'on_site',
    posted: 1643723400
  };
  const n = normalize4dwJob(j, 'Fallback');
  if (n && n.title === 'Senior Go Engineer' && n.company === 'Acme' &&
      n.url === 'https://4dayweek.io/job/abc-123' && n.location === 'San Francisco, USA' &&
      n.postedAt === 1643723400000) {
    pass('normalize4dwJob maps title/company/url/location/postedAt');
  } else {
    fail(`normalize4dwJob => ${JSON.stringify(n)}`);
  }

} catch (e) {
  console.error(e);
}