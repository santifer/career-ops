// tests/vc-portfolios-yc-pagination.test.mjs — fetchYCCompanies must walk every
// page the YC API reports, not stop after page 1.
//
// The API caps its page size (~30 today) and ignores per_page=1000, so the old
// "stop when a page returns fewer than 1000 companies" heuristic bailed after
// the first page and only ever saw the newest batch (issue #2525). These tests
// serve small paginated batches through a stubbed global.fetch and assert the
// walk follows the API's own totalPages / nextPage signal.

import { pass, fail, ROOT } from './helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';

console.log('\nvc-portfolios — YC pagination (issue #2525)');

const mod = await import(pathToFileURL(join(ROOT, 'seeds/vc-portfolios.mjs')).href);
const { fetchYCCompanies } = mod;

const realFetch = global.fetch;

// Install a fake global.fetch that serves `pages` (an array of company arrays),
// one array per page, with the pagination metadata the real API returns.
// Records which page numbers were requested.
function installYCFetch(pages, { totalPages = true, nextPage = false } = {}) {
  const requested = [];
  global.fetch = async (url) => {
    const page = Number(new URL(url).searchParams.get('page'));
    requested.push(page);
    const companies = pages[page - 1] || [];
    const body = { companies, page };
    if (totalPages) body.totalPages = pages.length;
    if (nextPage) body.nextPage = page < pages.length ? `page=${page + 1}` : null;
    return { ok: true, async json() { return body; }, async text() { return ''; } };
  };
  return requested;
}

const co = (name) => ({ name, slug: name.toLowerCase() });
const THREE_PAGES = [
  [co('Alpha'), co('Beta')],
  [co('Gamma'), co('Delta')],
  [co('Epsilon')],
];

try {
  // Core regression: small batches (< 1000) across 3 pages must all be walked.
  {
    const requested = installYCFetch(THREE_PAGES, { totalPages: true });
    const out = await fetchYCCompanies();
    const slugs = out.map((c) => c.slug).sort();
    if (slugs.length === 5 && requested.join(',') === '1,2,3') {
      pass('walks all pages reported by totalPages (5 companies over pages 1,2,3)');
    } else {
      fail(`expected 5 companies over pages 1,2,3, got ${slugs.length} over pages ${requested.join(',')}`);
    }
  }

  // Falls back to nextPage when the API omits totalPages.
  {
    const requested = installYCFetch(THREE_PAGES, { totalPages: false, nextPage: true });
    const out = await fetchYCCompanies();
    if (out.length === 5 && requested.join(',') === '1,2,3') {
      pass('follows nextPage when totalPages is absent');
    } else {
      fail(`nextPage walk got ${out.length} companies over pages ${requested.join(',')}`);
    }
  }

  // Dedupes by slug across pages.
  {
    const dupPages = [[co('Alpha'), co('Beta')], [co('Alpha'), co('Gamma')]];
    installYCFetch(dupPages, { totalPages: true });
    const out = await fetchYCCompanies();
    const slugs = out.map((c) => c.slug).sort();
    if (slugs.join(',') === 'alpha,beta,gamma') {
      pass('dedupes companies by slug across pages');
    } else {
      fail(`expected alpha,beta,gamma got ${slugs.join(',')}`);
    }
  }

  // maxPages is honoured as a safety cap.
  {
    const requested = installYCFetch(THREE_PAGES, { totalPages: true });
    const out = await fetchYCCompanies({ maxPages: 2 });
    if (out.length === 4 && requested.join(',') === '1,2') {
      pass('stops at the maxPages safety cap');
    } else {
      fail(`maxPages:2 got ${out.length} companies over pages ${requested.join(',')}`);
    }
  }
} finally {
  global.fetch = realFetch;
}
