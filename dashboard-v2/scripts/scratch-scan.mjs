// scanner - check greenhouse, ashby, lever, workable for new jobs

import sql from './db/client.mjs';

const userId = process.env.SCAN_USER_ID || process.argv[2] || 1;
// Attempt to load distinct profile config
let config = { title_filter: { positive: [], negative: [] }, tracked_companies: [] };
try {
  const [profile] = await sql`SELECT targeting_keywords FROM user_profiles WHERE user_id = ${userId}`;
  if (profile?.targeting_keywords) {
     config.title_filter = profile.targeting_keywords;
  }
} catch(e) {
  // Graceful fallback when DB is unavailable in the current environment.
  // Keep the scan engine alive with an empty config instead of crashing on yaml deps.
  config = { title_filter: { positive: [], negative: [] }, tracked_companies: [], search_queries: [] };
}
const companies = config.tracked_companies || [];

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
  newJobs.push({ url, company, title, source });
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
      const res = await fetch(comp.api);
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
  const enableExtendedScan = process.env.ENABLE_EXTENDED_SCAN === 'true';

  // 1. Direct ATS Scans (Greenhouse, Ashby, Lever, Workable)
  await scanGreenhouse();
  await scanAshby();
  await scanLever();
  await scanWorkable();

  // 2. Dynamic Search Discovery (Naukri, Indeed, LinkedIn, etc.)
  if (enableExtendedScan) {
    console.log('\n🌟 Discovery Phase — Searching all portals from portals.yml');
    try {
      const { scrapeInstahyre }     = await import('../../portals/scrapers/instahyre.mjs');
      const { scrapeFlexiple }      = await import('../../portals/scrapers/flexiple.mjs');
      const { scrapeLinkedIn }      = await import('../../portals/scrapers/linkedin.mjs');
      const { scrapeNaukri }        = await import('../../portals/scrapers/naukri.mjs');
      const { scrapeCutshort }      = await import('../../portals/scrapers/cutshort.mjs');
      const { scrapeIndeed }        = await import('../../portals/scrapers/indeed.mjs');
      const { discoverJobs }        = await import('../../portals/scrapers/discovery.mjs');
      
      // Only process enabled queries
      const queries = (config.search_queries || []).filter(q => q.enabled !== false);
      stats.discovery.checked = queries.length;

      for (const q of queries) {
        console.log(`  🔍 Scanning: ${q.name}...`);
        let results = [];
        try {
          if (q.portal === 'linkedin') {
            results = await scrapeLinkedIn(q.query, q.location || 'India');
          } else if (q.portal === 'instahyre') {
            results = await scrapeInstahyre(q.query, q.locations || ['Pune', 'Bengaluru']);
          } else if (q.portal === 'flexiple') {
            results = await scrapeFlexiple(q.query);
          } else if (q.portal === 'naukri') {
            results = await scrapeNaukri(q.query, q.location || 'India');
          } else if (q.portal === 'cutshort') {
            results = await scrapeCutshort(q.query, q.location || 'india');
          } else if (q.portal === 'indeed') {
            results = await scrapeIndeed(q.query, q.location || 'India');
          } else {
            // Fallback: Use Discovery Engine for generic site: queries (Naukri, Indeed, Glassdoor, etc.)
            results = await discoverJobs(q.query, q.name);
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
    console.log('\n🏢 Enterprise Phase — Scanning Workday & SuccessFactors');
    try {
      const { scrapeWorkday }       = await import('../../portals/scrapers/workday.mjs');
      const { scrapeSuccessFactors} = await import('../../portals/scrapers/successfactors.mjs');

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
           if (target.portal === 'workday') {
             results = await scrapeWorkday(target.name, target.subdomain, 'Software Engineer');
           } else if (target.portal === 'successfactors') {
             results = await scrapeSuccessFactors(target.name, target.portalToken, 'Software Engineer');
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
  } else {
    console.log('\nℹ️ Extended discovery/enterprise scan disabled in this runtime. Set ENABLE_EXTENDED_SCAN=true to enable.');
  }

  const totalAdded   = Object.values(stats).reduce((s, v) => s + v.added, 0);
  const totalChecked = Object.values(stats).reduce((s, v) => s + v.checked, 0);
  const totalFound   = Object.values(stats).reduce((s, v) => s + v.found, 0);

  if (totalAdded > 0) {
    console.log(`\n📦 UPSERTing ${totalAdded} new jobs to PostgreSQL...`);
    for (const job of newJobs) {
      job.user_id = parseInt(userId);
      await sql`
        INSERT INTO jobs ${sql(job, 'url', 'company', 'title', 'source', 'user_id')}
        ON CONFLICT (user_id, url) DO NOTHING
      `;
    }
  }

  // log scan to history
  await sql`
    INSERT INTO scans (portal, jobs_found, duration_ms)
    VALUES ('Multi-Source Scan', ${totalFound}, ${Date.now() - startTime})
  `;

  console.log('\n═══════════════════════════════════════════');
  console.log('  SCAN RESULTS (PERSISTED)');
  console.log('───────────────────────────────────────────');
  console.log(`  Companies checked:     ${totalChecked}`);
  console.log(`  Jobs found (total):    ${totalFound}`);
  console.log(`  NEW jobs added to DB:  ${totalAdded}`);
  console.log('═══════════════════════════════════════════');
  process.exit(0);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
