#!/usr/bin/env node
/**
 * scripts/build-contacts-page.mjs — standalone full-screen relationship-
 * intelligence directory at dashboard/contacts.html.
 *
 * Re-uses the deterministic enricher pipeline from scripts/build-dashboard.mjs
 * by reading the already-baked contacts dataset out of the freshly-built
 * dashboard/index.html (via window._CONTACTS_DATA + window._CONTACTS_STATS).
 * If those globals can't be parsed, falls back to re-running the bake from
 * primary sources (data/linkedin/Connections.csv + data/outreach-state.json
 * + data/linkedin/overrides.json + data/contact-enrichment-cache/* + data/
 * contact-photos/*).
 *
 * Output: dashboard/contacts.html — self-contained HTML with embedded CSS +
 * the same ContactCard component used in the main dashboard modal.
 *
 * Run on every dashboard build (chained from build-dashboard.mjs) + on
 * demand when contact enrichment caches change.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// Pull the baked _CONTACTS_DATA from the freshly-built dashboard HTML.
// This avoids duplicating the bake pipeline — single source of truth.
const dashboardHtmlPath = join(REPO_ROOT, 'dashboard/index.html');
if (!existsSync(dashboardHtmlPath)) {
  console.error('[build-contacts-page] dashboard/index.html missing — run `node scripts/build-dashboard.mjs` first');
  process.exit(1);
}
const html = readFileSync(dashboardHtmlPath, 'utf8');

function extractGlobal(varName) {
  // Match: var <varName> = <JSON>;  where JSON can be any length
  const re = new RegExp(`var ${varName}\\s*=\\s*(\\[[\\s\\S]*?\\]|\\{[\\s\\S]*?\\});`, 'm');
  const m = html.match(re);
  if (!m) return null;
  try { return JSON.parse(m[1].replace(/<\\\//g, '</')); } catch (e) { return null; }
}

const contacts = extractGlobal('_CONTACTS_DATA') || [];
const stats = extractGlobal('_CONTACTS_STATS') || {};

if (contacts.length === 0) {
  console.error('[build-contacts-page] no contacts extracted from dashboard/index.html — check the bake pipeline in build-dashboard.mjs');
  process.exit(1);
}

console.log(`[build-contacts-page] extracted ${contacts.length} contacts from baked dashboard`);
console.log(`[build-contacts-page] stats: ${JSON.stringify(stats)}`);

// Build the standalone page. Reuses the same CSS rules from the main dashboard
// by name (.contact-card, .contact-card-photo, etc.) — embedded here so this
// page works standalone if loaded directly.

const cssBlock = `
:root {
  --bg: #0a0a0f; --surface: #11131c; --surface-2: #181b27;
  --text: #fafafa; --text-2: #cbd5e1; --text-3: #94a3b8; --text-4: #6b7280;
  --border: #232737; --blue-fg: #60a5fa; --blue-bg: rgba(96,165,250,0.12); --blue-border: rgba(96,165,250,0.4);
  --green-fg: #86efac; --green-bg: rgba(134,239,172,0.12);
  --amber: #fbbf24; --amber-fg: #f59e0b; --amber-bg: rgba(251,191,36,0.12);
  --radius-sm: 6px; --radius-full: 99px;
  --font-sans: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--font-sans); font-size: 13px; line-height: 1.5; }
.page-shell { max-width: 1600px; margin: 0 auto; padding: 24px 32px; }
.page-header { display: flex; align-items: baseline; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px solid var(--border); margin-bottom: 18px; flex-wrap: wrap; gap: 12px; }
.page-header h1 { margin: 0; font-size: 22px; font-weight: 700; }
.page-header .stats { font-size: 12.5px; color: var(--text-3); display: flex; gap: 14px; flex-wrap: wrap; }
.page-header .stats strong { color: var(--text); font-weight: 700; }
.controls { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
.controls input[type="search"] {
  flex: 1 1 280px; min-width: 220px;
  padding: 8px 12px; background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text); font-size: 13px;
}
.controls input:focus { outline: none; border-color: var(--blue-fg); }
.filter-btn {
  padding: 6px 12px; background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius-full); color: var(--text-2); font-size: 12px; cursor: pointer;
  font-weight: 500;
}
.filter-btn:hover { color: var(--text); }
.filter-btn.active { color: var(--blue-fg); border-color: var(--blue-fg); font-weight: 600; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 14px; }
.meta-line { font-size: 12px; color: var(--text-3); margin-bottom: 12px; }

/* ── Card rules (mirror the main dashboard) ───────────────────────── */
.contact-card {
  display: flex; flex-direction: column; gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: var(--surface-2);
  transition: border-color .12s, background .12s;
}
.contact-card:hover { border-color: var(--text-3); background: var(--surface); }
.contact-card-head { display: flex; gap: 14px; align-items: flex-start; }
.contact-card-avatar { width: 60px; height: 60px; flex-shrink: 0; position: relative; }
.contact-card-photo { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border); }
.contact-card-photo-fallback {
  width: 60px; height: 60px; border-radius: 50%;
  background: linear-gradient(135deg, var(--blue-bg), var(--surface-2));
  color: var(--text-2); font-weight: 700; font-size: 22px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border);
}
.contact-card-identity { flex: 1 1 auto; min-width: 0; }
.contact-card-name { font-size: 14.5px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 3px; }
.contact-card-role { font-size: 13px; color: var(--text-3); }
.contact-card-company { color: var(--text-2); font-weight: 500; }
.contact-card-connected { font-size: 11.5px; color: var(--text-3); margin-top: 4px; }
.contact-card-goals { font-size: 11px; margin-top: 6px; display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }
.contact-card-section-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-4); margin-right: 8px; display: inline-block; }
.contact-card-overlap, .contact-card-others, .contact-card-twodeg {
  font-size: 12.5px; padding: 8px 10px; border-radius: var(--radius-sm);
  background: var(--surface); border: 1px solid var(--border);
}
.contact-card-overlap { border-left: 3px solid var(--green-fg); }
.contact-card-overlap-item { font-weight: 600; color: var(--text); margin-right: 10px; }
.contact-card-others-list { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
.contact-card-other-btn {
  text-align: left; background: none; border: 0; padding: 4px 6px;
  border-radius: var(--radius-sm); cursor: pointer;
  font-size: 12.5px; color: var(--text); display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.contact-card-other-btn:hover { background: var(--surface-2); }
.contact-card-twodeg-count { color: var(--green-fg); font-weight: 600; }
.contact-card-enriched {
  padding: 10px 12px; border-radius: var(--radius-sm);
  background: var(--blue-bg); border-left: 3px solid var(--blue-fg);
  display: flex; flex-direction: column; gap: 6px;
}
.contact-card-enriched p { margin: 4px 0 0; font-size: 12.5px; line-height: 1.5; color: var(--text); }
.contact-card-enrich-pending {
  padding: 8px 10px; border-radius: var(--radius-sm);
  background: var(--surface); border: 1px dashed var(--border);
  display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12px;
}
.contact-card-emails { font-size: 12px; padding: 6px 0; border-top: 1px dashed var(--border); }
.contact-card-email-label { font-weight: 600; color: var(--text-3); margin-right: 4px; }
.contact-card-emails code { background: var(--surface); padding: 1px 5px; border-radius: 3px; font-size: 11.5px; }
.contact-card-actions { display: flex; gap: 6px; flex-wrap: wrap; padding-top: 8px; border-top: 1px solid var(--border); }
.contact-act {
  padding: 5px 10px; border-radius: var(--radius-sm); font-size: 11.5px; font-weight: 600;
  border: 1px solid var(--border); background: var(--surface); color: var(--text-2);
  cursor: pointer; text-decoration: none;
}
.contact-act:hover { color: var(--text); border-color: var(--text-3); }
.contact-act-enrich, .contact-act-photo {
  background: var(--blue-bg); color: var(--blue-fg); border-color: var(--blue-border); font-weight: 600;
}
.contact-act-disabled { opacity: 0.4; cursor: not-allowed; }
.muted-text { color: var(--text-3); }
.pill-tiny {
  display: inline-block; font-size: 10px; font-weight: 600;
  padding: 1px 7px; border-radius: var(--radius-full);
  background: var(--surface-2); border: 1px solid var(--border); color: var(--text-3);
  margin-right: 4px;
}
.pill-tiny.pill-preipo { background: var(--green-bg); color: var(--green-fg); border-color: var(--green-fg); }
.pill-tiny.pill-archetype { background: var(--amber-bg); color: var(--amber); border-color: var(--amber-fg); }
.pill-tiny.pill-outreach { background: var(--blue-bg); color: var(--blue-fg); border-color: var(--blue-fg); }
.contact-card.contact-card-flash { box-shadow: 0 0 0 2px var(--amber-fg); transition: box-shadow 0.6s ease-out; }
`;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Render is duplicated minimally from build-dashboard.mjs — the goal is
// architectural alignment, not DRY. If the schema evolves, both renderers
// update; we keep them in sync via the schema doc.
function renderCard(c) {
  const name = c.name || '';
  const company = c.company || '';
  const position = c.position || '';
  const email = c.email_professional || '';
  const personalEmail = c.email_personal || '';
  const linkedinUrl = c.linkedin_url || '';
  const xHandle = c.x_handle || '';
  const tierBadge = c.tier ? `<span class="pill-tiny">${esc(c.tier)}</span>` : '';
  const outreachBadge = c.in_outreach ? '<span class="pill-tiny pill-outreach">in outreach</span>' : '';
  let photoHtml;
  const initials = (((c.first_name||'')[0] || (name||'?')[0] || '?') + ((c.last_name||'')[0] || ((name||'').split(' ').slice(-1)[0]||'')[0] || '')).toUpperCase();
  if (c.photo_path) {
    photoHtml = `<img class="contact-card-photo" src="${esc(c.photo_path)}" alt="${esc(name)}" loading="lazy" /><div class="contact-card-photo-fallback" style="display:none">${esc(initials)}</div>`;
  } else {
    photoHtml = `<div class="contact-card-photo-fallback">${esc(initials)}</div>`;
  }
  const overlapHtml = (c.overlap_with_mitchell && c.overlap_with_mitchell.length) ?
    `<div class="contact-card-overlap"><span class="contact-card-section-label">↗ Shared employer</span>${c.overlap_with_mitchell.map(o => `<span class="contact-card-overlap-item">${esc(o.company)} <span class="muted-text">(${esc(o.mitchell_years)})</span></span>`).join('')}</div>` : '';
  const othersHtml = (c.others_at_company && c.others_at_company.length) ?
    `<div class="contact-card-others"><span class="contact-card-section-label">Other contacts at ${esc(company)} (${c.others_at_company.length})</span><div class="contact-card-others-list">${c.others_at_company.slice(0,6).map(o => {
      const pill = o.in_outreach ? '<span class="pill-tiny pill-outreach">in outreach</span>' : '';
      const aMatch = o.archetype_match ? '<span class="pill-tiny pill-archetype">★</span>' : '';
      return `<button type="button" class="contact-card-other-btn" onclick="focusById('${esc(o.id)}')">${esc(o.name)} <span class="muted-text">${esc((o.position||'').slice(0,28))}</span> ${aMatch}${pill}</button>`;
    }).join('')}${c.others_at_company.length > 6 ? `<span class="muted-text">+${c.others_at_company.length - 6} more</span>` : ''}</div></div>` : '';
  const twoDegHtml = (c.two_degree_path && c.two_degree_path.candidate_count > 0) ?
    `<div class="contact-card-twodeg"><span class="contact-card-section-label">2nd-degree paths at ${esc(company)}</span><span class="contact-card-twodeg-count">${c.two_degree_path.candidate_count} warm-intro candidates</span></div>` : '';
  let goalHtml = '';
  if (c.goal_alignment) {
    const ga = c.goal_alignment;
    const marks = [];
    if (ga.pre_ipo_match) marks.push('<span class="pill-tiny pill-preipo">pre-IPO</span>');
    if (ga.archetype_match) marks.push('<span class="pill-tiny pill-archetype">archetype-match</span>');
    if (marks.length) goalHtml = `<div class="contact-card-goals">${marks.join('')} <span class="muted-text">alignment ${ga.composite_score}</span></div>`;
  }
  let connectedHtml = '';
  if (c.connected_on || c.position_at_connection) {
    connectedHtml = `<div class="contact-card-connected muted-text">Connected ${c.connected_on ? esc(c.connected_on) : 'date unknown'}${c.position_at_connection ? ' as ' + esc(c.position_at_connection) : ''}</div>`;
  }
  let enrichHtml;
  if (c.enrichment_status === 'complete' && c.outreach_recommendation) {
    enrichHtml = `<div class="contact-card-enriched">${c.outreach_recommendation.positioning ? `<div><span class="contact-card-section-label">Positioning recommendation</span><p>${esc(c.outreach_recommendation.positioning)}</p></div>` : ''}${c.outreach_recommendation.best_channel ? `<div><span class="contact-card-section-label">Best channel</span> ${esc(c.outreach_recommendation.best_channel)}</div>` : ''}${(c.engagement && c.engagement.linkedin_topics) ? `<div><span class="contact-card-section-label">Engages with</span> ${(c.engagement.linkedin_topics||[]).map(t=>`<span class="pill-tiny">${esc(t)}</span>`).join('')}</div>` : ''}${(c.inferred_relationship && c.inferred_relationship.arc) ? `<div><span class="contact-card-section-label">Relationship context</span><p class="muted-text">${esc(c.inferred_relationship.arc)}</p></div>` : ''}</div>`;
  } else {
    enrichHtml = `<div class="contact-card-enrich-pending"><span class="muted-text">Engagement topics, outreach positioning, and inferred relationship context pending LLM enrichment.</span> <button type="button" class="contact-act contact-act-enrich" onclick="enrichNow('${esc(c.id)}')">↻ Enrich now</button></div>`;
  }
  const emailAction = (addr, type) => {
    if (!addr) return `<button class="contact-act contact-act-disabled" disabled>${type} ✉︎</button>`;
    return `<button class="contact-act" onclick="revealEmail(this, '${esc(addr)}')">${type} →</button>`;
  };
  const linkedinAction = linkedinUrl ? `<a class="contact-act" href="${esc(linkedinUrl)}" target="_blank" rel="noopener">LinkedIn →</a>` : '<button class="contact-act contact-act-disabled" disabled>LinkedIn</button>';
  const xAction = xHandle ? `<a class="contact-act" href="https://x.com/${esc(xHandle.replace(/^@/,''))}" target="_blank" rel="noopener">X →</a>` : '<button class="contact-act contact-act-disabled" disabled>X</button>';
  const photoBtn = c.photo_path ? '' : `<button type="button" class="contact-act contact-act-photo" onclick="scrapePhoto('${esc(c.id)}','${esc(linkedinUrl)}')">📸 Photo</button>`;
  return `<div class="contact-card" id="contact-card-${esc(c.id)}">
    <div class="contact-card-head">
      <div class="contact-card-avatar">${photoHtml}</div>
      <div class="contact-card-identity">
        <div class="contact-card-name">${esc(name)} ${tierBadge} ${outreachBadge}</div>
        <div class="contact-card-role">${esc(position || '—')}${company ? ` · <span class="contact-card-company">${esc(company)}</span>` : ''}</div>
        ${connectedHtml}
        ${goalHtml}
      </div>
    </div>
    ${overlapHtml}
    ${othersHtml}
    ${twoDegHtml}
    ${enrichHtml}
    ${email || personalEmail ? `<div class="contact-card-emails">${email ? `<span class="contact-card-email-label">Pro:</span> <code>${esc(email)}</code>` : ''}${personalEmail ? ` <span class="contact-card-email-label">Personal:</span> <code>${esc(personalEmail)}</code>` : ''}</div>` : ''}
    <div class="contact-card-actions">
      ${emailAction(email, 'Pro')}
      ${emailAction(personalEmail, 'Personal')}
      ${linkedinAction}
      ${xAction}
      ${photoBtn}
    </div>
  </div>`;
}

const cardsHtml = contacts.map(renderCard).join('\n');

const statsHtml = `
  <span><strong>${stats.total || contacts.length}</strong> total</span>
  <span><strong>${stats.in_outreach || 0}</strong> in outreach</span>
  <span><strong>${stats.with_email || 0}</strong> with email</span>
  <span><strong>${stats.with_x || 0}</strong> with X</span>
  <span><strong>${stats.with_overlap || 0}</strong> shared employer</span>
  <span><strong>${stats.pre_ipo || 0}</strong> pre-IPO</span>
  <span><strong>${stats.with_photo || 0}</strong> photo</span>
  <span><strong>${stats.enriched || 0}</strong> fully enriched</span>
`;

const out = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Contacts directory — relationship intelligence</title>
  <style>${cssBlock}</style>
</head>
<body>
<div class="page-shell">
  <div class="page-header">
    <h1>Contacts directory <span class="muted-text" style="font-weight:400;font-size:14px;margin-left:8px">relationship intelligence</span></h1>
    <div class="stats">${statsHtml}</div>
  </div>
  <div class="controls">
    <input id="search" type="search" placeholder="Search name, company, role, email…" autocomplete="off" spellcheck="false" />
    <button type="button" class="filter-btn active" data-filter="all">All</button>
    <button type="button" class="filter-btn" data-filter="outreach">In outreach</button>
    <button type="button" class="filter-btn" data-filter="email">Has email</button>
    <button type="button" class="filter-btn" data-filter="x">Has X</button>
    <button type="button" class="filter-btn" data-filter="overlap">Shared employer</button>
    <button type="button" class="filter-btn" data-filter="preipo">Pre-IPO</button>
    <button type="button" class="filter-btn" data-filter="archetype">Archetype match</button>
  </div>
  <div class="meta-line" id="result-meta"></div>
  <div class="grid" id="grid">
    ${cardsHtml}
  </div>
</div>
<script>
const ALL_DATA = ${JSON.stringify(contacts).replace(/<\//g, '<\\/')};
let activeFilter = 'all';
let activeQuery = '';

function applyFilters() {
  const q = (activeQuery || '').trim().toLowerCase();
  const cards = document.querySelectorAll('.contact-card');
  let visible = 0;
  cards.forEach(card => {
    const id = card.id.replace('contact-card-', '');
    const c = ALL_DATA.find(x => x.id === id);
    if (!c) return;
    let show = true;
    if (activeFilter === 'outreach' && !c.in_outreach) show = false;
    if (activeFilter === 'email' && !c.email_professional) show = false;
    if (activeFilter === 'x' && !c.x_handle) show = false;
    if (activeFilter === 'overlap' && (!c.overlap_with_mitchell || c.overlap_with_mitchell.length === 0)) show = false;
    if (activeFilter === 'preipo' && !(c.goal_alignment && c.goal_alignment.pre_ipo_match)) show = false;
    if (activeFilter === 'archetype' && !(c.goal_alignment && c.goal_alignment.archetype_match)) show = false;
    if (q) {
      const hay = (c.name + ' ' + (c.company||'') + ' ' + (c.position||'') + ' ' + (c.email_professional||'') + ' ' + (c.x_handle||'')).toLowerCase();
      if (hay.indexOf(q) === -1) show = false;
    }
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  document.getElementById('result-meta').textContent = visible + ' contact' + (visible === 1 ? '' : 's') + ' visible';
}

document.getElementById('search').addEventListener('input', e => {
  activeQuery = e.target.value;
  applyFilters();
});
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    applyFilters();
  });
});

function focusById(id) {
  const el = document.getElementById('contact-card-' + id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('contact-card-flash');
  setTimeout(() => el.classList.remove('contact-card-flash'), 1600);
}

function enrichNow(id) {
  if (!confirm('Queue this contact for LLM enrichment (~$0.50)?')) return;
  fetch('/api/refresh-cache', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ cache: 'contact_enrichment', key: id, priority: 'user-triggered' }) })
    .then(r => r.ok ? alert('Queued. Reload after ~10 min.') : alert('Failed; check dashboard-server logs.'))
    .catch(e => alert('Network error: ' + e.message));
}

function scrapePhoto(id, linkedinUrl) {
  if (!linkedinUrl) { alert('No LinkedIn URL.'); return; }
  fetch('/api/scrape-photo', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id, linkedin_url: linkedinUrl }) })
    .then(r => r.ok ? alert('Photo scrape queued.') : alert('Failed.'))
    .catch(e => alert('Network error: ' + e.message));
}

function revealEmail(btn, addr) {
  if (!btn.dataset.revealed) {
    const label = document.createElement('div');
    label.style.fontSize = '11px'; label.style.color = 'var(--text-3)'; label.style.marginTop = '4px';
    label.textContent = addr + ' — click again to compose';
    btn.parentNode.appendChild(label);
    btn.dataset.revealed = '1';
    setTimeout(() => { delete btn.dataset.revealed; if (label.parentNode) label.parentNode.removeChild(label); }, 6000);
  } else {
    window.open('https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(addr), '_blank', 'noopener');
    delete btn.dataset.revealed;
  }
}

applyFilters();
</script>
</body>
</html>`;

const outPath = join(REPO_ROOT, 'dashboard/contacts.html');
writeFileSync(outPath, out);
console.log(`[build-contacts-page] wrote ${outPath} (${out.length.toLocaleString()} bytes, ${contacts.length} cards)`);
