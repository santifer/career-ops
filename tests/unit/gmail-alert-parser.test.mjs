import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalize,
  decodeUrl,
  extractJobUrls,
  extractLinkedInRedirectUrls,
  extractCuratorMentions,
  extractTitleNear,
  platformOf,
  buildTitleFilter,
} from '../../lib/gmail-alert-parser.mjs';

test('canonicalize strips LinkedIn comm prefix + tracking params', () => {
  assert.equal(
    canonicalize('https://www.linkedin.com/comm/jobs/view/4123456789?refId=abc&trackingId=xyz'),
    'https://www.linkedin.com/jobs/view/4123456789'
  );
  assert.equal(
    canonicalize('https://www.linkedin.com/jobs/view/4123456789'),
    'https://www.linkedin.com/jobs/view/4123456789'
  );
});

test('canonicalize keeps Indeed jk parameter', () => {
  assert.equal(
    canonicalize('https://www.indeed.com/viewjob?jk=abc123&from=alerts&t=1'),
    'https://www.indeed.com/viewjob?jk=abc123'
  );
});

test('canonicalize normalizes Greenhouse boards subdomain', () => {
  assert.equal(
    canonicalize('https://boards.greenhouse.io/anthropic/jobs/4567?gh_src=1'),
    'https://job-boards.greenhouse.io/anthropic/jobs/4567'
  );
  assert.equal(
    canonicalize('https://job-boards.greenhouse.io/anthropic/jobs/4567'),
    'https://job-boards.greenhouse.io/anthropic/jobs/4567'
  );
});

test('canonicalize strips query string + fragment for generic URLs', () => {
  assert.equal(
    canonicalize('https://jobs.ashbyhq.com/openai/abc-123?utm=foo#anchor'),
    'https://jobs.ashbyhq.com/openai/abc-123'
  );
});

test('decodeUrl handles HTML entities', () => {
  assert.equal(decodeUrl('https://x.com/?a=1&amp;b=2'), 'https://x.com/?a=1&b=2');
  assert.equal(decodeUrl('https://x.com/path&#x2F;subpath'), 'https://x.com/path/subpath');
});

test('extractJobUrls pulls href + bare URLs from HTML', () => {
  const body = `
    <a href="https://www.linkedin.com/comm/jobs/view/4123456789?refId=abc">View</a>
    See also https://jobs.ashbyhq.com/anthropic/abc-123 and
    <a href="https://job-boards.greenhouse.io/openai/jobs/9999">apply</a>.
    Junk: https://example.com/blog/post
  `;
  const urls = extractJobUrls(body).sort();
  assert.deepEqual(urls, [
    'https://job-boards.greenhouse.io/openai/jobs/9999',
    'https://jobs.ashbyhq.com/anthropic/abc-123',
    'https://www.linkedin.com/jobs/view/4123456789',
  ]);
});

test('extractJobUrls dedupes when same URL appears as href and bare', () => {
  const body = `
    <a href="https://job-boards.greenhouse.io/openai/jobs/9999">View</a>
    Bare URL: https://job-boards.greenhouse.io/openai/jobs/9999
  `;
  const urls = extractJobUrls(body);
  assert.equal(urls.length, 1);
});

test('extractLinkedInRedirectUrls catches lnkd.in shorteners + post URLs', () => {
  const body = `
    <a href="https://lnkd.in/abcDEF12">View</a>
    See post https://www.linkedin.com/posts/noah-greenberg_executive-editorial-lead_at_plaid
  `;
  const urls = extractLinkedInRedirectUrls(body);
  assert.equal(urls.length, 2);
  assert.ok(urls.some(u => u.includes('lnkd.in/abcDEF12')));
  assert.ok(urls.some(u => u.includes('linkedin.com/posts/noah-greenberg')));
});

test('extractCuratorMentions parses "Role @ Company" lines', () => {
  const text = `
Managing Editor @ Coinbase
Editorial Manager @ NVIDIA ($136k - $218k / year)
Executive Editorial Lead @ Plaid ($193k - $268k / year)
- https://lnkd.in/ezZzPrD8
Junk line.
  `;
  const mentions = extractCuratorMentions(text);
  assert.equal(mentions.length, 3);
  assert.equal(mentions[0].role, 'Managing Editor');
  assert.equal(mentions[0].company, 'Coinbase');
  assert.equal(mentions[1].comp, '$136k - $218k / year');
  assert.equal(mentions[2].url, 'https://lnkd.in/ezZzPrD8');
});

test('extractTitleNear surfaces anchor text near URL', () => {
  const body = `<a href="https://job-boards.greenhouse.io/openai/jobs/9999">Forward Deployed Engineer</a>`;
  const title = extractTitleNear(body, 'https://job-boards.greenhouse.io/openai/jobs/9999');
  assert.equal(title, 'Forward Deployed Engineer');
});

test('extractTitleNear falls back to URL slug for /jobs/<slug> URLs', () => {
  // Slug fallback only fires when the URL has a /jobs/ or /view/ segment.
  // For other shapes (Ashby's /<company>/<slug>, ATS direct URLs) it returns
  // "(unknown)" — by design, since the downstream batch evaluator fetches
  // the real JD anyway.
  const body = `Plain text with https://wellfound.com/jobs/forward-deployed-eng inline.`;
  const title = extractTitleNear(body, 'https://wellfound.com/jobs/forward-deployed-eng');
  assert.equal(title, 'forward deployed eng');
});

test('extractTitleNear returns (unknown) for non-/jobs/ URLs without anchor text', () => {
  const body = `Plain text with https://jobs.ashbyhq.com/anthropic/forward-deployed-eng inline.`;
  const title = extractTitleNear(body, 'https://jobs.ashbyhq.com/anthropic/forward-deployed-eng');
  assert.equal(title, '(unknown)');
});

test('platformOf attributes URLs by host', () => {
  assert.equal(platformOf('https://www.linkedin.com/jobs/view/1'), 'LinkedIn');
  assert.equal(platformOf('https://job-boards.greenhouse.io/x/jobs/1'), 'ATS');
  assert.equal(platformOf('https://jobs.ashbyhq.com/x/y'), 'ATS');
  assert.equal(platformOf('https://builtin.com/job/abc'), 'BuiltIn');
  assert.equal(platformOf('https://wellfound.com/jobs/x'), 'Wellfound');
});

test('buildTitleFilter rejects negative keywords', () => {
  const f = buildTitleFilter({ negative: ['intern', 'junior'] });
  assert.equal(f('Senior Software Engineer'), true);
  assert.equal(f('Software Engineering Intern'), false);
  assert.equal(f('Junior Backend Developer'), false);
  assert.equal(f(''), true);  // no title → no negative match → accept
});
