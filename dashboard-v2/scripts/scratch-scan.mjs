// scanner - check greenhouse, ashby, lever, workable for new jobs

import sql from './db/client.mjs';

const rawUserId = process.env.SCAN_USER_ID || process.argv[2] || 1;
const userId = Number.parseInt(String(rawUserId), 10);
if (!Number.isFinite(userId)) {
  throw new Error(`Invalid SCAN_USER_ID: ${rawUserId}`);
}

function normalizePortalId(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  const noProtocol = raw.replace(/^https?:\/\//, '');
  const host = noProtocol.split('/')[0].replace(/^www\./, '');

  if (raw.includes('naukri.com') || host === 'naukri.com') return 'naukri';
  if (raw.includes('indeed.com') || host.endsWith('indeed.com')) return 'indeed';
  if (raw.includes('japan-dev.com') || host === 'japan-dev.com') return 'japan-dev';
  if (raw.includes('instahyre.com') || host === 'instahyre.com') return 'instahyre';
  if (raw.includes('cutshort.io') || host === 'cutshort.io') return 'cutshort';
  if (raw.includes('linkedin.com') || host === 'linkedin.com') return 'linkedin';
  if (raw.includes('greenhouse.io') || host.endsWith('greenhouse.io')) return 'greenhouse';
  if (raw.includes('lever.co') || host.endsWith('lever.co')) return 'lever';
  if (raw.includes('workday') || host.includes('myworkdayjobs.com')) return 'workday';
  if (raw.includes('successfactors')) return 'successfactors';

  return raw;
}
// Attempt to load distinct profile config
let config = { title_filter: { positive: [], negative: [] }, tracked_companies: [], search_queries: [] };
try {
  const [profile] = await sql`
    SELECT targeting_keywords, resume_context
    FROM user_profiles
    WHERE user_id = ${userId}
  `;
  if (profile?.targeting_keywords) {
     config.title_filter = profile.targeting_keywords;
  }
  const selectedPortals = profile?.resume_context?.search?.portals || [];
  if (selectedPortals.length > 0) {
    const primaryKeyword = (config.title_filter?.positive?.[0] || 'software engineer').toLowerCase();
    const location = profile?.resume_context?.candidate?.location || 'India';
    const normalizedPortals = [...new Set(selectedPortals.map(normalizePortalId).filter(Boolean))];
    config.search_queries = normalizedPortals.map((portal) => ({
      name: `${portal} ${primaryKeyword}`,
      portal,
      query: primaryKeyword,
      location,
      enabled: true,
    }));
  }
} catch(e) {
  // Graceful fallback when DB is unavailable in the current environment.
  // Keep the scan engine alive with an empty config instead of crashing on yaml deps.
  config = { title_filter: { positive: [], negative: [] }, tracked_companies: [], search_queries: [] };
}
const companies = config.tracked_companies || [];

const DISCOVERY_SITE_BY_PORTAL = {
  linkedin: 'linkedin.com/jobs',
  naukri: 'naukri.com',
  indeed: 'indeed.com',
  instahyre: 'instahyre.com',
  flexiple: 'flexiple.com',
  cutshort: 'cutshort.io',
  greenhouse: 'boards.greenhouse.io',
  lever: 'jobs.lever.co',
  'japan-dev': 'japan-dev.com/jobs',
};

function buildDiscoveryQuery(q) {
  const baseQuery = `${q.query || ''} ${q.location || ''}`.trim();
  const site = DISCOVERY_SITE_BY_PORTAL[q.portal];
  if (!site) return baseQuery || q.query || '';
  return `site:${site} ${baseQuery}`.trim();
}

async function discoverJobsWithoutBrowser(query, portalName = 'General') {
  const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const jobs = [];
  const seen = new Set();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'career-ops-scanner/2.0' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.log(`    ⚠ DuckDuckGo returned ${res.status} for ${portalName}`);
      return jobs;
    }
    const html = await res.text();
    const linkRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const rawUrl = match[1];
      const titleHtml = match[2] || '';
      const url = rawUrl.replace(/&amp;/g, '&');
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const title = titleHtml
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!title) continue;
      jobs.push({
        url,
        title,
        company: portalName,
        source: `Discovery - ${portalName}`,
      });
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      console.log(`    ⏱ Timeout searching ${portalName} (15s exceeded)`);
    }
    return jobs;
  }
  return jobs;
}

// Check Playwright availability ONCE at startup to avoid 7+ redundant import failures
let playwrightAvailable = null; // null = untested, true/false = tested

async function checkPlaywrightAvailability() {
  if (playwrightAvailable !== null) return playwrightAvailable;
  try {
    await import('playwright');
    playwrightAvailable = true;
    console.log('✓ Playwright runtime detected — full scraper mode enabled.');
  } catch {
    playwrightAvailable = false;
    console.log('ℹ️ Playwright unavailable in this runtime — using DuckDuckGo discovery engine (no browser required).');
  }
  return playwrightAvailable;
}

async function importScraper(moduleName) {
  // Skip all scraper imports if Playwright is unavailable — they all depend on it
  if (!await checkPlaywrightAvailability()) return null;

  const appRoot = process.env.APP_ROOT || '';
  const candidates = [
    appRoot ? `file://${appRoot}/runtime-assets/portals/scrapers/${moduleName}.mjs` : null,
    appRoot ? `file://${appRoot}/portals/scrapers/${moduleName}.mjs` : null,
    new URL(`../../portals/scrapers/${moduleName}.mjs`, import.meta.url),
    new URL(`../portals/scrapers/${moduleName}.mjs`, import.meta.url),
    new URL(`../../../portals/scrapers/${moduleName}.mjs`, import.meta.url),
    `file://${process.cwd()}/portals/scrapers/${moduleName}.mjs`,
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return await import(candidate);
    } catch {
      // try next candidate
    }
  }
  console.warn(`⚠ Scraper module not found: ${moduleName}.mjs`);
  return null;
}

// load already seen urls from db
const seenUrls = new Set();
try {
  const existing = await sql`SELECT url FROM jobs WHERE user_id = ${userId}`;
  existing.forEach(r => seenUrls.add(r.url));
  console.log(`✓ Loaded ${seenUrls.size} existing jobs from database for deduplication.`);
} catch (e) {
  console.warn("⚠ Database not ready for dedup check, proceeding anyway.");
}

// Filter by title keywords from portals.yml
function matchesFilter(title) {
  const t = title.toLowerCase();
  for (const n of (config.title_filter.negative || [])) {
    if (t.includes(n.toLowerCase())) return false;
  }
  for (const p of (config.title_filter.positive || [])) {
    if (t.includes(p.toLowerCase())) return true;
  }
  return false;
}

// result queue
const newJobs = [];      // { url, company, title }
const startTime = Date.now();

function tryAdd(url, company, title, source) {
  if (!url || !title) return 'skip_nodata';
  const cleanUrl = url.split('?')[0];
  if (seenUrls.has(url) || seenUrls.has(cleanUrl)) {
    return 'dup';
  }
  if (!matchesFilter(title)) {
    return 'filtered';
  }
  seenUrls.add(url);
  newJobs.push({ url, canonical_url: cleanUrl, company, title, source });
  return 'added';
}

// counters
const stats = {
  greenhouse: { checked: 0, found: 0, added: 0, errors: 0 },
  ashby:      { checked: 0, found: 0, added: 0, errors: 0 },
  lever:      { checked: 0, found: 0, added: 0, errors: 0 },
  workable:   { checked: 0, found: 0, added: 0, errors: 0 },
  discovery:  { checked: 0, found: 0, added: 0, errors: 0 },
  enterprise: { checked: 0, found: 0, added: 0, errors: 0 },
};

// Greenhouse API
async function scanGreenhouse() {
  const ghCompanies = companies.filter(c => c.api && c.enabled !== false);
  console.log(`\n🌿 Greenhouse API — ${ghCompanies.length} companies`);
  stats.greenhouse.checked = ghCompanies.length;

  for (const comp of ghCompanies) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout per company
      const res = await fetch(comp.api, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) { stats.greenhouse.errors++; continue; }
      const data = await res.json();
      const jobs = data.jobs || [];
      stats.greenhouse.found += jobs.length;

      for (const job of jobs) {
        const url = job.absolute_url;
        const loc = job.location?.name || '';
        const title = loc ? `${job.title} (${loc})` : job.title;
        const result = tryAdd(url, comp.name, title, 'Greenhouse API');
        if (result === 'added') {
          stats.greenhouse.added++;
          process.stdout.write(`  ✓ ${comp.name}: ${job.title}\n`);
        }
      }
    } catch (e) {
      stats.greenhouse.errors++;
      process.stdout.write(`  ✗ ${comp.name}: ${e.message}\n`);
    }
  }
}

// ... scanAshby, scanLever, scanWorkable remain functionally the same, omitted for brevity but integrated
// (I will keep them in the final replacement content)
async function scanAshby() {
  const ashbyCompanies = companies.filter(c => c.careers_url?.includes('jobs.ashbyhq.com') && !c.api && c.enabled !== false);
  console.log(`\n🔷 Ashby API — ${ashbyCompanies.length} companies`);
  stats.ashby.checked = ashbyCompanies.length;
  for (const comp of ashbyCompanies) {
    try {
      const slug = comp.careers_url.replace('https://jobs.ashbyhq.com/', '').split('/')[0].split('?')[0];
      const apiUrl = `https://jobs.ashbyhq.com/${slug}/api/jobs`;
      const res = await fetch(apiUrl, { headers: { 'User-Agent': 'career-ops-scanner/2.0' } });
      if (!res.ok) { stats.ashby.errors++; continue; }
      const data = await res.json();
      const jobs = data.jobs || [];
      stats.ashby.found += jobs.length;
      for (const job of jobs) {
        const url = job.applicationLink || `https://jobs.ashbyhq.com/${slug}/${job.id}`;
        const loc = job.locationName || (job.isRemote ? 'Remote' : '');
        const title = loc ? `${job.title} (${loc})` : job.title;
        const result = tryAdd(url, comp.name, title, 'Ashby API');
        if (result === 'added') { stats.ashby.added++; process.stdout.write(`  ✓ ${comp.name}: ${job.title}\n`); }
      }
    } catch (e) { stats.ashby.errors++; process.stdout.write(`  ✗ ${comp.name}: ${e.message}\n`); }
  }
}

async function scanLever() {
  const leverCompanies = companies.filter(c => c.careers_url?.includes('jobs.lever.co') && c.enabled !== false);
  console.log(`\n🔶 Lever API — ${leverCompanies.length} companies`);
  stats.lever.checked = leverCompanies.length;
  for (const comp of leverCompanies) {
    try {
      const slug = comp.careers_url.replace('https://jobs.lever.co/', '').split('/')[0].split('?')[0];
      const apiUrl = `https://api.lever.co/v0/postings/${slug}?mode=json&limit=250`;
      const res = await fetch(apiUrl, { headers: { 'User-Agent': 'career-ops-scanner/2.0' } });
      if (!res.ok) { stats.lever.errors++; continue; }
      const jobs = await res.json();
      if (!Array.isArray(jobs)) { stats.lever.errors++; continue; }
      stats.lever.found += jobs.length;
      for (const job of jobs) {
        const url = job.hostedUrl;
        const loc = job.categories?.location || job.workplaceType || '';
        const title = loc ? `${job.text} (${loc})` : job.text;
        const result = tryAdd(url, comp.name, title, 'Lever API');
        if (result === 'added') { stats.lever.added++; process.stdout.write(`  ✓ ${comp.name}: ${job.text}\n`); }
      }
    } catch (e) { stats.lever.errors++; process.stdout.write(`  ✗ ${comp.name}: ${e.message}\n`); }
  }
}

async function scanWorkable() {
  const workableCompanies = companies.filter(c => c.careers_url?.includes('apply.workable.com') && c.enabled !== false);
  console.log(`\n🔵 Workable API — ${workableCompanies.length} companies`);
  stats.workable.checked = workableCompanies.length;
  for (const comp of workableCompanies) {
    try {
      const slug = comp.careers_url.replace('https://apply.workable.com/', '').split('/')[0].split('?')[0];
      const apiUrl = `https://apply.workable.com/api/v3/accounts/${slug}/jobs`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'career-ops-scanner/2.0' },
        body: JSON.stringify({ query: '', location: [], remote: [], employment: [], limit: 100 })
      });
      if (!res.ok) { stats.workable.errors++; continue; }
      const data = await res.json();
      const jobs = data.results || [];
      stats.workable.found += jobs.length;
      for (const job of jobs) {
        const url = `https://apply.workable.com/${slug}/j/${job.shortcode}`;
        const loc = job.location?.locationStr || (job.remote ? 'Remote' : '');
        const title = loc ? `${job.title} (${loc})` : job.title;
        const result = tryAdd(url, comp.name, title, 'Workable API');
        if (result === 'added') { stats.workable.added++; process.stdout.write(`  ✓ ${comp.name}: ${job.title}\n`); }
      }
    } catch (e) { stats.workable.errors++; process.stdout.write(`  ✗ ${comp.name}: ${e.message}\n`); }
  }
}

// main run
async function run() {
  console.log('═══════════════════════════════════════════');
  console.log('  career-ops — Multi-Source (DB PERSISTENT)');
  console.log('  Sources: Greenhouse · Ashby · Lever · Workable');
  console.log('═══════════════════════════════════════════');

  // Global timeout - force exit after 4 minutes to prevent hanging
  const GLOBAL_TIMEOUT_MS = 4 * 60 * 1000;
  const startTime = Date.now();
  const timeoutId = setTimeout(() => {
    console.log('\n⏱ GLOBAL TIMEOUT: Scan running too long, forcing exit...');
    console.log(`   Runtime: ${(Date.now() - startTime) / 1000}s`);
    process.exit(0);
  }, GLOBAL_TIMEOUT_MS);

  // Heartbeat to show scan is still alive
  const heartbeat = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`  ♥ Still scanning... (${elapsed}s elapsed)`);
  }, 30000); // Every 30 seconds

  const enableExtendedScan = process.env.ENABLE_EXTENDED_SCAN === 'true';
  const hasUserSearchQueries = Array.isArray(config.search_queries) && config.search_queries.length > 0;
  const shouldRunDiscovery = enableExtendedScan || hasUserSearchQueries;

  try {
    // 1. Direct ATS Scans (Greenhouse, Ashby, Lever, Workable)
    console.log('\n▶ Phase 1: ATS Scans (30s timeout each)...');
    await scanGreenhouse();
    await scanAshby();
    await scanLever();
    await scanWorkable();

  // 2. Dynamic Search Discovery (Naukri, Indeed, LinkedIn, etc.)
  if (shouldRunDiscovery) {
    console.log('\n🌟 Discovery Phase — Searching all portals from portals.yml');
    try {
      const instahyreMod = await importScraper('instahyre');
      const flexipleMod = await importScraper('flexiple');
      const linkedInMod = await importScraper('linkedin');
      const naukriMod = await importScraper('naukri');
      const cutshortMod = await importScraper('cutshort');
      const indeedMod = await importScraper('indeed');
      const discoveryMod = await importScraper('discovery');
      const scrapeInstahyre = instahyreMod?.scrapeInstahyre;
      const scrapeFlexiple = flexipleMod?.scrapeFlexiple;
      const scrapeLinkedIn = linkedInMod?.scrapeLinkedIn;
      const scrapeNaukri = naukriMod?.scrapeNaukri;
      const scrapeCutshort = cutshortMod?.scrapeCutshort;
      const scrapeIndeed = indeedMod?.scrapeIndeed;
      const discoverJobs = discoveryMod?.discoverJobs;
      
      // Only process enabled queries
      const queries = (config.search_queries || []).filter(q => q.enabled !== false);
      stats.discovery.checked = queries.length;

      for (const q of queries) {
        console.log(`  🔍 Scanning: ${q.name}...`);
        let results = [];
        try {
          if (q.portal === 'linkedin' && scrapeLinkedIn) {
            results = await scrapeLinkedIn(q.query, q.location || 'India');
          } else if (q.portal === 'instahyre' && scrapeInstahyre) {
            results = await scrapeInstahyre(q.query, q.locations || ['Pune', 'Bengaluru']);
          } else if (q.portal === 'flexiple' && scrapeFlexiple) {
            results = await scrapeFlexiple(q.query);
          } else if (q.portal === 'naukri' && scrapeNaukri) {
            results = await scrapeNaukri(q.query, q.location || 'India');
          } else if (q.portal === 'cutshort' && scrapeCutshort) {
            results = await scrapeCutshort(q.query, q.location || 'india');
          } else if (q.portal === 'indeed' && scrapeIndeed) {
            results = await scrapeIndeed(q.query, q.location || 'India');
          } else if (discoverJobs) {
            // Fallback: Use Discovery Engine for generic site: queries (Naukri, Indeed, Glassdoor, etc.)
            results = await discoverJobs(buildDiscoveryQuery(q), q.name);
          } else {
            // Browser-free discovery (DuckDuckGo search) — primary path in serverless
            results = await discoverJobsWithoutBrowser(buildDiscoveryQuery(q), q.name);
          }
          
          stats.discovery.found += results.length;
          results.forEach(j => {
            const res = tryAdd(j.url, j.company, j.title, j.source);
            if (res === 'added') stats.discovery.added++;
          });
        } catch (err) {
          console.error(`  ✗ Error scanning ${q.name}:`, err.message);
          stats.discovery.errors++;
        }
      }
    } catch (e) {
      console.error(`  ✗ Discovery Phase Error: ${e.message}`);
    }

    // 3. Enterprise Portal Scans (Workday, SuccessFactors)
    if (enableExtendedScan) {
      console.log('\n🏢 Enterprise Phase — Scanning Workday & SuccessFactors');
      try {
        const workdayMod = await importScraper('workday');
        const successFactorsMod = await importScraper('successfactors');
        const scrapeWorkday = workdayMod?.scrapeWorkday;
        const scrapeSuccessFactors = successFactorsMod?.scrapeSuccessFactors;

        // This is where you would iterate through specific enterprise entries if added to tracked_companies
        // For now, I'll add a few known targets to ensure they are checked
        const enterpriseTargets = [
          { name: 'Siemens', subdomain: 'siemens', portal: 'workday' },
          { name: 'AMD', subdomain: 'amd', portal: 'workday' },
          { name: 'SAP', portalToken: 'sap', portal: 'successfactors' }
        ];

        for (const target of enterpriseTargets) {
           console.log(`  🏢 Checking Enterprise: ${target.name}...`);
           let results = [];
           try {
             if (target.portal === 'workday' && scrapeWorkday) {
               results = await scrapeWorkday(target.name, target.subdomain, 'Software Engineer');
             } else if (target.portal === 'successfactors' && scrapeSuccessFactors) {
               results = await scrapeSuccessFactors(target.name, target.portalToken, 'Software Engineer');
             } else {
               continue;
             }
             
             stats.enterprise.found += results.length;
             results.forEach(j => {
               const res = tryAdd(j.url, j.company, j.title, j.source);
               if (res === 'added') stats.enterprise.added++;
             });
           } catch (err) {
             console.error(`  ✗ Error scanning enterprise ${target.name}:`, err.message);
             stats.enterprise.errors++;
           }
        }
      } catch (e) {
        console.error(`  ✗ Enterprise Phase Error: ${e.message}`);
      }
    }
  } else {
    console.log('\nℹ️ No user search queries configured yet. Add portals in Settings or set ENABLE_EXTENDED_SCAN=true for full extended scan.');
  }

  const totalAdded   = Object.values(stats).reduce((s, v) => s + v.added, 0);
  const totalChecked = Object.values(stats).reduce((s, v) => s + v.checked, 0);
  const totalFound   = Object.values(stats).reduce((s, v) => s + v.found, 0);

  if (totalAdded > 0) {
    console.log(`\n📦 UPSERTing ${totalAdded} new jobs to PostgreSQL...`);
    try {
      await sql`
        ALTER TABLE jobs
          ADD COLUMN IF NOT EXISTS canonical_url TEXT,
          ADD COLUMN IF NOT EXISTS jd_text TEXT;
      `;
    } catch {
      // ignore
    }
    for (const job of newJobs) {
      await sql`
        INSERT INTO jobs (url, canonical_url, company, title, source, user_id)
        VALUES (${job.url}, ${job.canonical_url || job.url?.split?.('?')?.[0] || job.url}, ${job.company}, ${job.title}, ${job.source}, ${userId})
        ON CONFLICT (user_id, url) DO NOTHING
      `;
    }
  }

  // log scan to history
  await sql`
    INSERT INTO scans (portal, jobs_found, duration_ms, user_id)
    VALUES ('Multi-Source Scan', ${totalFound}, ${Date.now() - startTime}, ${userId})
  `;

  } finally {
    clearTimeout(timeoutId);
    clearInterval(heartbeat);
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('  SCAN RESULTS (PERSISTED)');
  console.log('───────────────────────────────────────────');
  console.log(`  Companies checked:     ${totalChecked}`);
  console.log(`  Jobs found (total):    ${totalFound}`);
  console.log(`  NEW jobs added to DB:  ${totalAdded}`);
  console.log(`  Total runtime:         ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log('═══════════════════════════════════════════');
  process.exit(0);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
