import 'dotenv/config';
import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'fs';

const POSITIVE = ['community manager','community lead','community director','head of community','vp of community','community builder','community operations','ecosystem manager','ecosystem lead','ambassador','guild','dao','program manager','program lead','head of programs','community program','partnership manager','partnerships lead','head of partnerships','project manager','senior project manager','pmo','delivery manager','engagement manager','web3','blockchain','crypto','defi','nft','token','protocol','decentralized','on-chain','move','layer 1','layer 2','gaming','esports','game community','player experience','content manager','content strategist','communications manager','social media manager','brand manager','localization manager','localization project manager','translation project manager','impact','social impact','ngo','nonprofit','chef de projet','responsable communaute','charge de projet'];
const NEGATIVE = ['intern','internship','junior','entry level','accountant','finance manager','legal','lawyer','data scientist','machine learning','software engineer','backend engineer','frontend engineer','full-stack engineer','full stack engineer','fullstack engineer','blockchain engineer','protocol engineer','smart contract engineer','rust engineer','solidity engineer','rust blockchain engineer','infrastructure engineer','platform engineer','data engineer','ml engineer','ai engineer','site reliability engineer','sre','qa engineer','test engineer','security engineer','embedded engineer','firmware engineer','devops engineer','staff engineer','principal engineer','senior engineer','lead engineer','engineering manager','vp engineering','head of engineering','director of engineering','cto','ios','android','devops','cobol','mainframe','oracle ebs','technical program manager','technical project manager','product manager','director of product','head of product','vp of product','business operations','marketing operations','player support','revenue operations','sales operations','d2c','live ops manager','liveops manager','live service manager','recruiter','talent acquisition','people operations','human resources','designer','design lead','quality assurance','solutions architect','sales executive','account executive','customer success','stage','stagiaire','stagier','alternance','alternant','apprenti','apprentice','apprentissage','bts','bachelor','dut','licence pro','contrat pro','professionnalisation','volontariat','vie ','pfe','tfe','developer relations','devrel','developer advocate','developer evangelist','developer experience','dx engineer','developer marketing','ecosystem growth','head of ecosystem growth','vp ecosystem growth','director of ecosystem growth'];

const TARGETS = [
  { ats:'greenhouse', company:'Aptos Labs', slug:'aptoslabs' },
  { ats:'greenhouse', company:'Near Foundation', slug:'nearfoundation' },
  { ats:'greenhouse', company:'Filecoin Foundation', slug:'filecoinfoundation' },
  { ats:'greenhouse', company:'Scopely', slug:'scopely' },
  { ats:'greenhouse', company:'Startale Labs', slug:'startale' },
  { ats:'greenhouse', company:'Ava Labs (Avalanche)', slug:'avalabs' },
  { ats:'ashby', company:'Mysten Labs (Sui)', slug:'mystenlabs' },
  { ats:'ashby', company:'Polygon Labs', slug:'polygon-labs' },
  { ats:'ashby', company:'Solana Foundation', slug:'Solana Foundation' },
  { ats:'ashby', company:'Chainlink Labs', slug:'chainlink-labs' },
  { ats:'ashby', company:'Sky Mavis (Ronin)', slug:'skymavis' },
  { ats:'ashby', company:'Blast', slug:'blast-io' },
  { ats:'ashby', company:'Hyperliquid Labs', slug:'Hyperliquid Labs' },
  { ats:'ashby', company:'YO Labs', slug:'yolabs' },
  { ats:'lever', company:'Immutable', slug:'immutable' },
  { ats:'lever', company:'Fun (fun.xyz)', slug:'funxyz' }
];

const QUOTES = [
  ['Nobody expects the Spanish Inquisition!',"Monty Python's Flying Circus"],
  ["It's just a flesh wound.",'Monty Python and the Holy Grail'],
  ['We are the knights who say... NI!','Monty Python and the Holy Grail'],
  ['And now for something completely different.',"Monty Python's Flying Circus"],
  ['Always look on the bright side of life.','Life of Brian'],
  ['Tis but a scratch.','Monty Python and the Holy Grail']
];

// Short keywords (<=5 chars) need word boundaries to avoid false positives like
// "ngo" matching "Django" or "stage" matching "messaging"
function hasKeyword(text, kw) {
  if (kw.length <= 5) {
    const re = new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '\\b', 'i');
    return re.test(text);
  }
  return text.toLowerCase().includes(kw);
}
function match(t){
  const x = (t || '');
  if (NEGATIVE.some(n => hasKeyword(x, n))) return false;
  return POSITIVE.some(p => hasKeyword(x, p));
}
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

async function fetchAts(t){
  try {
    if(t.ats==='greenhouse'){
      const r=await fetch('https://boards-api.greenhouse.io/v1/boards/'+t.slug+'/jobs');
      if(!r.ok)return [];
      const j=await r.json();
      return (j.jobs||[]).map(x=>({url:x.absolute_url,title:x.title,company:t.company}));
    }
    if(t.ats==='ashby'){
      const r=await fetch('https://api.ashbyhq.com/posting-api/job-board/'+encodeURIComponent(t.slug));
      if(!r.ok)return [];
      const j=await r.json();
      return (j.jobs||[]).map(x=>({url:x.jobUrl||x.applyUrl,title:x.title,company:t.company}));
    }
    if(t.ats==='lever'){
      const r=await fetch('https://api.lever.co/v0/postings/'+t.slug+'?mode=json');
      if(!r.ok)return [];
      const arr=await r.json();
      return (Array.isArray(arr)?arr:[]).map(x=>({url:x.hostedUrl,title:x.text,company:t.company}));
    }
  } catch(e) { console.error('['+t.company+']',e.message); }
  return [];
}

const UA = { 'User-Agent': 'Mozilla/5.0 career-ops/1.0' };

async function fetchRemoteOK() {
  try {
    const r = await fetch('https://remoteok.com/api', { headers: UA });
    if (!r.ok) return [];
    const j = await r.json();
    // First entry is API metadata (legal/source info), skip it
    return j.filter(x => x.id && x.position).map(x => ({
      url: x.url || ('https://remoteok.com/remote-jobs/' + x.slug),
      title: x.position,
      company: x.company || 'RemoteOK'
    }));
  } catch(e) { console.error('[RemoteOK]', e.message); return []; }
}

async function fetchRemotive() {
  // Remotive supports category filter; pull a few relevant categories
  const cats = ['marketing', 'all-others', 'business', 'product'];
  const all = [];
  for (const cat of cats) {
    try {
      const r = await fetch('https://remotive.com/api/remote-jobs?category=' + cat, { headers: UA });
      if (!r.ok) continue;
      const j = await r.json();
      for (const x of (j.jobs || [])) {
        all.push({ url: x.url, title: x.title, company: x.company_name || 'Remotive' });
      }
    } catch(e) { console.error('[Remotive ' + cat + ']', e.message); }
  }
  return all;
}

const LINKEDIN_BROWSER_UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36' };

// Body check: fetch a LinkedIn job page and look for stage/internship markers in the JD body.
// Returns true if the role is detected as a stage/intern/apprenticeship despite a clean title.
async function isLinkedInStageRole(jobUrl) {
  try {
    const r = await fetch(jobUrl, { headers: LINKEDIN_BROWSER_UA });
    if (!r.ok) return false;
    const html = await r.text();
    // Look for the employment-type criteria block + JD body
    // Common stage indicators in French/English JD bodies
    const stageMarkers = [
      /\bemployment type[^<]{0,40}internship/i,
      /\btype d['e]?\s*contrat[^<]{0,40}stage/i,
      /\bstage\s+de\s+\d/i,                          // "stage de 6 mois"
      /\bdur[ée]e\s+du\s+stage\b/i,                  // "durée du stage"
      /\bconvention\s+de\s+stage\b/i,                // "convention de stage"
      /\bgratification\s+de\s+stage\b/i,             // "gratification de stage"
      /\bindemnit[ée]\s+de\s+stage\b/i,              // "indemnité de stage"
      /\bcontrat\s+d['e]?\s*apprentissage\b/i,       // apprenticeship
      /\bcontrat\s+de\s+professionnalisation\b/i,
      /\balternance\s+de\s+\d/i,                     // "alternance de 12 mois"
      /selon\s+la\s+r[ée]glementation[^<]{0,60}stage/i,  // "selon la réglementation [...] stage"
      /\binternship\s+(position|role|opportunity)\b/i
    ];
    return stageMarkers.some(re => re.test(html));
  } catch(e) {
    return false;  // On error, don't filter (let the title filter decide)
  }
}

async function fetchLinkedIn() {
  const queries = [
    { kw: '"community manager" web3', loc: 'Worldwide' },
    { kw: '"head of community" crypto', loc: 'Worldwide' },
    { kw: '"ecosystem manager" blockchain', loc: 'Worldwide' },
    { kw: '"community manager" gaming', loc: 'European Union' },
    { kw: '"program manager" web3', loc: 'Worldwide' },
    { kw: '"community lead" crypto', loc: 'European Union' },
    { kw: '"community manager"', loc: 'Sophia Antipolis, France' }
  ];
  const all = [];
  for (const q of queries) {
    try {
      const url = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=' + encodeURIComponent(q.kw) + '&location=' + encodeURIComponent(q.loc) + '&f_TPR=r604800&start=0';
      const r = await fetch(url, { headers: LINKEDIN_BROWSER_UA });
      if (!r.ok) continue;
      const html = await r.text();
      // Each card: <a class="base-card__full-link ..."> + <h3 class="base-search-card__title">{title}</h3> + <h4 class="base-search-card__subtitle">...<a>{company}</a></h4>
      const cards = html.split('<div class="base-card');
      for (const card of cards.slice(1)) {
        const cardUrl = (card.match(/<a class="base-card__full-link[^"]*"[^>]*href="([^"?]+)/) || [])[1];
        const title = (card.match(/<h3 class="base-search-card__title"[^>]*>\s*([^<]+?)\s*<\/h3>/) || [])[1];
        const company = (card.match(/<h4 class="base-search-card__subtitle"[\s\S]*?<a[^>]*>\s*([^<]+?)\s*<\/a>/) || [])[1];
        if (cardUrl && title) {
          const cleanUrl = cardUrl.replace(/&amp;/g, '&').split('?')[0];
          // For French LinkedIn results (most stage offenders), do a body-check to filter stages
          // whose title doesn't explicitly say "Stage/Stagiaire/Alternance"
          if (cleanUrl.startsWith('https://fr.linkedin.com/')) {
            const isStage = await isLinkedInStageRole(cleanUrl);
            if (isStage) {
              console.log('  [LinkedIn fr-body-filter] STAGE detected & dropped: ' + title);
              continue;
            }
          }
          all.push({
            url: cleanUrl,
            title: title.replace(/&amp;/g, '&').replace(/&#x27;/g, "'"),
            company: (company || 'LinkedIn').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").trim()
          });
        }
      }
    } catch(e) { console.error('[LinkedIn ' + q.kw + ']', e.message); }
  }
  return all;
}

function decodeHtml(s) {
  return (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchHackerNewsWhoshiring() {
  try {
    // Find latest "Who is hiring?" thread (NOT "who wants to be hired" — different thread)
    const r1 = await fetch('https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5');
    const j1 = await r1.json();
    const thread = (j1.hits || []).find(h => /^Ask HN: Who is hiring\?/i.test(h.title));
    if (!thread) return [];
    const threadId = thread.objectID;
    const all = [];
    for (let page = 0; page < 10; page++) {
      const r2 = await fetch('https://hn.algolia.com/api/v1/search?tags=comment,story_' + threadId + '&hitsPerPage=100&page=' + page);
      const j2 = await r2.json();
      if (!j2.hits || j2.hits.length === 0) break;
      for (const h of j2.hits) {
        // Only top-level comments (direct hiring posts), skip replies
        if (String(h.parent_id) !== String(threadId)) continue;
        const text = decodeHtml(h.comment_text);
        // First "line" before any sentence break — HN posts usually start with: Company | Role | Location | Type
        const head = text.split(/(?<=\|.*?\|.*?\|.*?\|)/)[0] || text.slice(0, 200);
        // Use the segment between the first and second pipe as the role title (typical structure)
        const parts = text.split('|').map(s => s.trim());
        const company = (parts[0] || 'HN').slice(0, 80);
        // Build a clean title from first 2-3 segments
        const title = parts.slice(0, 3).join(' | ').slice(0, 160) || head.slice(0, 160);
        all.push({
          url: 'https://news.ycombinator.com/item?id=' + h.objectID,
          title,
          company
        });
      }
      if (j2.hits.length < 100) break;
    }
    return all;
  } catch(e) { console.error('[HN]', e.message); return []; }
}

async function fetchAdzuna() {
  const APP_ID = process.env.ADZUNA_APP_ID;
  const API_KEY = process.env.ADZUNA_API_KEY;
  if (!APP_ID || !API_KEY) {
    console.log('  (Adzuna skipped: ADZUNA_APP_ID or ADZUNA_API_KEY missing in .env)');
    return [];
  }
  // 7 markets × 3 query types = 21 calls/day = ~630 calls/month (within 1000-call free tier)
  const markets = ['fr', 'gb', 'us', 'de', 'es', 'it', 'ch'];
  const queries = [
    { what: 'community manager web3', what_or: 'community lead' },
    { what: 'ecosystem manager blockchain', what_or: 'developer relations' },
    { what: 'community manager gaming', what_or: 'esports' }
  ];
  const all = [];
  for (const country of markets) {
    for (const q of queries) {
      try {
        const params = new URLSearchParams({
          app_id: APP_ID,
          app_key: API_KEY,
          results_per_page: '20',
          what: q.what,
          what_or: q.what_or || '',
          max_days_old: '7',
          'content-type': 'application/json'
        });
        const url = 'https://api.adzuna.com/v1/api/jobs/' + country + '/search/1?' + params.toString();
        const r = await fetch(url, { headers: UA });
        if (!r.ok) {
          if (r.status === 429) console.error('[Adzuna ' + country + '] rate limited');
          continue;
        }
        const j = await r.json();
        for (const x of (j.results || [])) {
          all.push({
            url: x.redirect_url || x.url,
            title: x.title,
            company: (x.company && x.company.display_name) || 'Adzuna ' + country.toUpperCase()
          });
        }
      } catch(e) { console.error('[Adzuna ' + country + '/' + q.what + ']', e.message); }
    }
  }
  return all;
}

async function fetchWeb3Career() {
  const pages = [
    'https://web3.career/community-manager-jobs',
    'https://web3.career/ecosystem-manager-jobs',
    'https://web3.career/head-of-community-jobs',
    'https://web3.career/marketing-jobs'
  ];
  const all = [];
  for (const url of pages) {
    try {
      const r = await fetch(url, { headers: LINKEDIN_BROWSER_UA });
      if (!r.ok) continue;
      const html = await r.text();
      const links = [...html.matchAll(/<a[^>]+href="\/((?!sitemap|category|blog|company|about|companies|tags|jobs|advertise)[a-z0-9-]+\/(\d+))"/g)];
      const seen = new Set();
      for (const m of links) {
        const path = m[1];
        if (seen.has(path)) continue;
        seen.add(path);
        const slug = path.split('/')[0];
        const title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        all.push({
          url: 'https://web3.career/' + path,
          title,
          company: 'web3.career'
        });
      }
    } catch(e) { console.error('[Web3.career]', e.message); }
  }
  return all;
}

const FEEDS = [
  { id: 'remoteok', label: 'RemoteOK', fetch: fetchRemoteOK },
  { id: 'remotive', label: 'Remotive', fetch: fetchRemotive },
  { id: 'linkedin', label: 'LinkedIn (guest)', fetch: fetchLinkedIn },
  { id: 'hn-whoshiring', label: 'HN Who is Hiring', fetch: fetchHackerNewsWhoshiring },
  { id: 'web3career', label: 'Web3.career', fetch: fetchWeb3Career },
  { id: 'adzuna', label: 'Adzuna (7 markets)', fetch: fetchAdzuna }
];

if (!existsSync('./data/scan-history.tsv')) {
  writeFileSync('./data/scan-history.tsv', 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n');
}
const tsv = readFileSync('./data/scan-history.tsv','utf-8');
const seen = new Set(tsv.trim().split('\n').slice(1).map(l=>l.split('\t')[0]));
const today = new Date().toISOString().slice(0,10);
const newRoles = [];

// Phase 1: ATS APIs (16 known companies)
for (const t of TARGETS) {
  const jobs = await fetchAts(t);
  console.log('['+t.ats+':'+t.company+'] '+jobs.length+' jobs');
  for (const j of jobs) {
    if(!j.url||seen.has(j.url))continue;
    seen.add(j.url);
    const status = match(j.title) ? 'added' : 'skipped_title';
    const portal = '[API:'+t.ats+'/'+t.slug+']';
    appendFileSync('./data/scan-history.tsv',[j.url,today,portal,j.title,t.company,status].join('\t')+'\n');
    if(status==='added'){
      newRoles.push({url:j.url,title:j.title,company:t.company,portal});
      appendFileSync('./data/pipeline.md','- [ ] '+j.url+' | '+t.company+' | '+j.title+'\n');
    }
  }
}

// Phase 2: Public job feeds (RemoteOK, Remotive — broad WebSearch-style coverage)
for (const f of FEEDS) {
  const jobs = await f.fetch();
  console.log('[FEED:'+f.id+'] '+jobs.length+' jobs');
  for (const j of jobs) {
    if(!j.url||seen.has(j.url))continue;
    seen.add(j.url);
    const status = match(j.title) ? 'added' : 'skipped_title';
    const portal = '[FEED:'+f.id+']';
    const company = j.company || f.label;
    appendFileSync('./data/scan-history.tsv',[j.url,today,portal,j.title,company,status].join('\t')+'\n');
    if(status==='added'){
      newRoles.push({url:j.url,title:j.title,company,portal});
      appendFileSync('./data/pipeline.md','- [ ] '+j.url+' | '+company+' | '+j.title+'\n');
    }
  }
}

console.log('\nFound '+newRoles.length+' new roles\n');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || 'career-ops <onboarding@resend.dev>';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
  console.error('Missing RESEND_API_KEY or NOTIFY_EMAIL in .env');
  process.exit(1);
}

function row(r){return '<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;">'+esc(r.company)+'</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">'+esc(r.title)+'</td><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#999;font-size:11px;">'+esc(r.portal)+'</td><td style="padding:8px 12px;border-bottom:1px solid #eee;"><a href="'+r.url+'" style="color:#2563eb;text-decoration:none;">View</a></td></tr>';}
function tbl(rows){return '<table style="width:100%;border-collapse:collapse;margin-top:8px;"><thead><tr style="background:#f3f4f6;"><th style="padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#666;">Company</th><th style="padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#666;">Role</th><th style="padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#666;">Source</th><th style="padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#666;">Link</th></tr></thead><tbody>'+rows+'</tbody></table>';}

const apiHits = newRoles.filter(r=>r.portal.startsWith('[API:'));
const feedHits = newRoles.filter(r=>r.portal.startsWith('[FEED:'));

let subject, html;
if (newRoles.length === 0) {
  const q = QUOTES[Math.floor(Math.random()*QUOTES.length)];
  subject = 'career-ops: no new roles today - ' + today;
  html = '<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;color:#111;max-width:800px;margin:0 auto;padding:24px;">'+
    '<h2>career-ops scan - '+today+'</h2>'+
    '<p style="color:#666;">No new positions today. 16 ATS APIs + 2 public feeds (RemoteOK, Remotive) ran clean.</p>'+
    '<blockquote style="margin:32px 0;padding:18px 24px;border-left:4px solid #2596be;background:#f9f9f9;font-style:italic;font-size:15px;">'+
    '"'+esc(q[0])+'"<br><cite style="display:block;margin-top:10px;font-style:normal;font-size:12px;color:#666;">- '+esc(q[1])+'</cite>'+
    '</blockquote>'+
    '<p style="color:#666;font-size:13px;">And now for something completely different.</p>'+
    '</body></html>';
} else {
  subject = 'career-ops: '+newRoles.length+' new role(s) ('+apiHits.length+' ATS + '+feedHits.length+' feeds) - '+today;
  let body = '<h2>career-ops scan - '+today+'</h2>'+
    '<p style="color:#666;">'+newRoles.length+' new role(s) total &middot; '+apiHits.length+' from direct ATS APIs &middot; '+feedHits.length+' from public job feeds.</p>';
  if (apiHits.length > 0) {
    body += '<h3 style="margin-top:28px;color:#111;font-size:15px;">&#127919; Direct ATS hits ('+apiHits.length+')</h3>'+
      '<p style="color:#666;font-size:12px;margin:0 0 4px 0;">Highest signal: pulled directly from each company Greenhouse / Ashby / Lever endpoint.</p>'+
      tbl(apiHits.map(row).join(''));
  }
  if (feedHits.length > 0) {
    body += '<h3 style="margin-top:28px;color:#111;font-size:15px;">&#127760; Public feeds ('+feedHits.length+')</h3>'+
      '<p style="color:#666;font-size:12px;margin:0 0 4px 0;">Broader discovery: RemoteOK + Remotive aggregator feeds.</p>'+
      tbl(feedHits.map(row).join(''));
  }
  body += '<p style="margin-top:24px;font-size:12px;color:#999;">career-ops daily scan - '+new Date().toISOString()+'</p>';
  html = '<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;color:#111;max-width:980px;margin:0 auto;padding:24px;">'+body+'</body></html>';
}

const res = await fetch('https://api.resend.com/emails', {
  method:'POST',
  headers:{'Authorization':'Bearer '+RESEND_API_KEY,'Content-Type':'application/json'},
  body: JSON.stringify({from:RESEND_FROM,to:[NOTIFY_EMAIL],subject,html})
});
const body = await res.json().catch(()=>({}));
if(!res.ok){console.error('Resend HTTP '+res.status+':',JSON.stringify(body));process.exit(1);}
console.log('Email sent. ID:',body.id||'(no id)','to',NOTIFY_EMAIL);
console.log('\nNew roles:');
newRoles.forEach(r=>console.log('  - '+r.company+' / '+r.title));
