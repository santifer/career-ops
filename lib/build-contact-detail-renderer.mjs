/**
 * lib/build-contact-detail-renderer.mjs — full per-contact detail page renderer.
 *
 * Mounted by GET /contact/:id in dashboard-server.mjs (Phase A.1.1).
 *
 * Reads the baked _CONTACTS_DATA from dashboard/index.html + the
 * data/contact-enrichment-cache/{id}.json sidecar + outreach-state touches
 * + cv.md overlap. Returns a self-contained HTML document that mirrors
 * the contact card from the modal/listing but with full breathing room
 * for relationship history, network graph, online engagement, LLM
 * insights, outreach state, and provenance.
 *
 * Pure function — no fetches, no LLM calls. Just deterministic HTML.
 *
 * Reuses the CSS variables from scripts/build-contacts-page.mjs for
 * visual consistency.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

/**
 * Extract a baked global from the most-recent dashboard build.
 */
function extractGlobal(html, varName) {
  const re = new RegExp(`var\\s+${varName}\\s*=\\s*(\\[[\\s\\S]*?\\]|\\{[\\s\\S]*?\\});`, 'm');
  const m = html.match(re);
  if (!m) return null;
  try { return JSON.parse(m[1].replace(/<\\\//g, '</')); } catch { return null; }
}

/**
 * Load the contact + enrichment + outreach data for a single id.
 *
 * @param {string} contactId — slug id (firstname-lastname-companyslug)
 * @returns {object|null} hydrated contact, or null if not found
 */
export function loadContactForDetail(contactId, opts = {}) {
  const dashboardHtml = opts.dashboardHtmlPath || join(REPO_ROOT, 'dashboard/index.html');
  if (!existsSync(dashboardHtml)) return null;
  const html = readFileSync(dashboardHtml, 'utf8');
  const contacts = extractGlobal(html, '_CONTACTS_DATA') || [];
  const target = contacts.find(c => c.id === contactId);
  if (!target) return null;

  // Hydrate with full enrichment cache (the bake only inlines a subset)
  const enrichmentPath = join(REPO_ROOT, 'data/contact-enrichment-cache', `${contactId}.json`);
  if (existsSync(enrichmentPath)) {
    try {
      const enrichment = JSON.parse(readFileSync(enrichmentPath, 'utf8'));
      target._full_enrichment = enrichment;
    } catch { /* */ }
  }

  // Hydrate with full outreach-state touches (bake only kept last_touch_ts)
  const outreachPath = join(REPO_ROOT, 'data/outreach-state.json');
  if (existsSync(outreachPath)) {
    try {
      const outreach = JSON.parse(readFileSync(outreachPath, 'utf8'));
      const contactName = (target.name || '').toLowerCase().trim();
      const match = (outreach.contacts || []).find(c => (c.name || '').toLowerCase().trim() === contactName);
      if (match) {
        target._touches = match.touches || [];
        target._intel = match.intel || {};
      }
    } catch { /* */ }
  }

  // Hydrate with Mitchell's notes if present (per-contact JSONL)
  const notesPath = join(REPO_ROOT, 'data/contact-notes', `${contactId}.jsonl`);
  if (existsSync(notesPath)) {
    try {
      const raw = readFileSync(notesPath, 'utf8');
      target._notes = raw.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { /* */ }
  }

  return target;
}

const CSS_BLOCK = `
:root {
  --bg: #0a0a0f; --surface: #11131c; --surface-2: #181b27;
  --text: #fafafa; --text-2: #cbd5e1; --text-3: #94a3b8; --text-4: #6b7280;
  --border: #232737; --blue-fg: #60a5fa; --blue-bg: rgba(96,165,250,0.12); --blue-border: rgba(96,165,250,0.4);
  --green-fg: #86efac; --green-bg: rgba(134,239,172,0.12);
  --amber: #fbbf24; --amber-fg: #f59e0b; --amber-bg: rgba(251,191,36,0.12);
  --red-fg: #fca5a5; --red-bg: rgba(252,165,165,0.12);
  --radius-sm: 6px; --radius-full: 99px;
  --font-sans: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--font-sans); font-size: 13px; line-height: 1.55; }
a { color: var(--blue-fg); text-decoration: none; }
a:hover { text-decoration: underline; }
.page-shell { max-width: 1200px; margin: 0 auto; padding: 28px 36px 80px; }
.back-link { display: inline-block; margin-bottom: 16px; color: var(--text-3); font-size: 12px; }
.back-link:hover { color: var(--text); }
.section { margin-bottom: 26px; padding: 16px 18px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-2); }
.section h2 { margin: 0 0 12px; font-size: 13.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3); }
.section h3 { margin: 16px 0 8px; font-size: 13px; font-weight: 700; color: var(--text-2); }
.header-row { display: flex; gap: 22px; align-items: flex-start; }
.header-photo { width: 96px; height: 96px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border); flex-shrink: 0; }
.header-photo-fallback {
  width: 96px; height: 96px; border-radius: 50%;
  background: linear-gradient(135deg, var(--blue-bg), var(--surface-2));
  color: var(--text); font-weight: 700; font-size: 36px;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid var(--border); flex-shrink: 0;
}
.header-name { font-size: 26px; font-weight: 700; color: var(--text); margin: 0 0 4px; }
.header-role { font-size: 14.5px; color: var(--text-2); }
.header-co { color: var(--text); font-weight: 600; }
.header-pills { margin-top: 10px; display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }
.pill { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: var(--radius-full); background: var(--surface-2); border: 1px solid var(--border); color: var(--text-3); }
.pill.preipo { background: var(--green-bg); color: var(--green-fg); border-color: var(--green-fg); }
.pill.outreach { background: var(--blue-bg); color: var(--blue-fg); border-color: var(--blue-fg); }
.pill.archetype { background: var(--amber-bg); color: var(--amber); border-color: var(--amber-fg); }
.pill.tier { background: var(--surface); color: var(--text-2); border-color: var(--text-3); }
.pill.verifier-pass { background: var(--green-bg); color: var(--green-fg); border-color: var(--green-fg); }
.pill.verifier-fail { background: var(--red-bg); color: var(--red-fg); border-color: var(--red-fg); }
.kvp { display: grid; grid-template-columns: 180px 1fr; gap: 6px 16px; font-size: 12.5px; }
.kvp .k { color: var(--text-3); }
.kvp .v { color: var(--text); }
.kvp code { background: var(--surface); padding: 2px 6px; border-radius: 3px; font-size: 11.5px; }
.timeline { margin: 0; padding: 0; list-style: none; }
.timeline li { padding: 8px 0; border-bottom: 1px dashed var(--border); display: grid; grid-template-columns: 130px 1fr; gap: 16px; font-size: 12.5px; }
.timeline li:last-child { border-bottom: 0; }
.timeline .ts { color: var(--text-3); }
.others-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 6px; }
.others-grid a { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); font-size: 12.5px; }
.others-grid a:hover { background: var(--surface-2); text-decoration: none; }
.others-grid .o-pos { color: var(--text-3); font-size: 11px; }
.empty-state { color: var(--text-3); font-style: italic; padding: 6px 0; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; padding-top: 12px; border-top: 1px solid var(--border); margin-top: 14px; }
.action {
  padding: 6px 14px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 600;
  border: 1px solid var(--border); background: var(--surface); color: var(--text-2);
  cursor: pointer; text-decoration: none;
}
.action:hover { color: var(--text); border-color: var(--text-3); text-decoration: none; }
.action.primary { background: var(--blue-bg); color: var(--blue-fg); border-color: var(--blue-border); }
.action.disabled { opacity: 0.4; cursor: not-allowed; }
.provenance { font-family: ui-monospace, monospace; font-size: 11px; color: var(--text-3); white-space: pre-wrap; }
.notes-list { margin: 0; padding: 0; list-style: none; }
.notes-list li { padding: 6px 0; border-bottom: 1px dashed var(--border); font-size: 12.5px; }
.notes-list li .ts { display: block; color: var(--text-3); font-size: 11px; }
.notes-form { margin-top: 10px; display: flex; gap: 8px; }
.notes-form textarea { flex: 1; min-height: 60px; padding: 8px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font: inherit; resize: vertical; }
.refused {
  padding: 8px 10px; border-radius: var(--radius-sm); background: var(--amber-bg);
  border: 1px solid var(--amber-fg); color: var(--amber);
  font-size: 12px; margin: 6px 0;
}
`;

/**
 * Render the full per-contact detail HTML page.
 *
 * @param {object} c — hydrated contact (output of loadContactForDetail)
 * @returns {string} HTML
 */
export function renderContactDetailHtml(c) {
  if (!c) return _render404();

  const initials = (((c.first_name || (c.name || '?')[0] || '?')[0]) + ((c.last_name || ((c.name || '').split(' ').slice(-1)[0] || '?'))[0] || '')).toUpperCase();

  let photoHtml;
  if (c.photo_path) {
    photoHtml = `<img class="header-photo" src="/${esc(c.photo_path)}" alt="${esc(c.name)}" />`;
  } else {
    photoHtml = `<div class="header-photo-fallback">${esc(initials)}</div>`;
  }

  const pillsHtml = [
    c.tier ? `<span class="pill tier">${esc(c.tier)}</span>` : '',
    c.in_outreach ? `<span class="pill outreach">in outreach</span>` : '',
    (c.goal_alignment && c.goal_alignment.pre_ipo_match) ? `<span class="pill preipo">pre-IPO</span>` : '',
    (c.goal_alignment && c.goal_alignment.archetype_match) ? `<span class="pill archetype">archetype-match</span>` : '',
    c.enrichment_verifier_passed ? `<span class="pill verifier-pass">✓ verifier passed</span>` : '',
    (c.enrichment_status === 'complete' && !c.enrichment_verifier_passed) ? `<span class="pill verifier-fail">⚠ verifier flagged</span>` : '',
  ].filter(Boolean).join(' ');

  // ── Identity + Connection
  const identityKvp = `
    <div class="kvp">
      <div class="k">Connected on</div><div class="v">${esc(c.connected_on || '—')}</div>
      <div class="k">Position at connection</div><div class="v">${esc(c.position_at_connection || c.position || '—')}</div>
      <div class="k">LinkedIn</div><div class="v">${c.linkedin_url ? `<a href="${esc(c.linkedin_url)}" target="_blank" rel="noopener">${esc(c.linkedin_url)}</a>` : '<span class="empty-state">not on file</span>'}</div>
      <div class="k">X / Twitter</div><div class="v">${c.x_handle ? `<a href="https://x.com/${esc(c.x_handle.replace(/^@/,''))}" target="_blank" rel="noopener">@${esc(c.x_handle.replace(/^@/,''))}</a>` : '<span class="empty-state">not on file</span>'}</div>
      <div class="k">Professional email</div><div class="v">${c.email_professional ? `<code>${esc(c.email_professional)}</code>` : '<span class="empty-state">not on file</span>'}</div>
      <div class="k">Personal email</div><div class="v">${c.email_personal ? `<code>${esc(c.email_personal)}</code>` : '<span class="empty-state">not on file</span>'}</div>
      <div class="k">Former company</div><div class="v">${c.former_company ? esc(c.former_company) : '<span class="empty-state">—</span>'}</div>
      <div class="k">Override note</div><div class="v">${c.override_note ? esc(c.override_note) : '<span class="empty-state">—</span>'}</div>
    </div>
  `;

  // ── Relationship history
  const overlapHtml = (c.overlap_with_mitchell || []).length > 0
    ? `<h3>Shared employer overlap</h3>
       <ul class="timeline">
         ${(c.overlap_with_mitchell || []).map(o => `<li><span class="ts">${esc(o.mitchell_years || '')}</span><span><strong>${esc(o.company)}</strong> — Mitchell was there</span></li>`).join('')}
       </ul>`
    : '<p class="empty-state">No prior employer overlap with Mitchell</p>';

  const touchesHtml = (c._touches || []).length > 0
    ? `<h3>Outreach touches (${c._touches.length})</h3>
       <ul class="timeline">
         ${(c._touches || []).slice().reverse().slice(0, 30).map(t => `
           <li>
             <span class="ts">${esc(t.ts ? t.ts.slice(0, 10) : '?')}</span>
             <span><strong>${esc(t.channel || 'unknown')}</strong> · ${esc(t.kind || '')} ${t.summary ? '— ' + esc(t.summary).slice(0, 200) : ''}</span>
           </li>
         `).join('')}
       </ul>`
    : '<p class="empty-state">No outreach touches recorded yet</p>';

  // ── Network graph (full, not 12-capped like the card)
  const othersHtml = (c.others_at_company || []).length > 0
    ? `<h3>Other contacts at ${esc(c.company)} (${c.others_at_company.length})</h3>
       <div class="others-grid">
         ${c.others_at_company.map(o => `<a href="/contact/${esc(o.id)}"><span>${esc(o.name)}</span><span class="o-pos">${esc((o.position || '').slice(0, 40))}</span>${o.in_outreach ? '<span class="pill outreach">in outreach</span>' : ''}${o.archetype_match ? '<span class="pill archetype">★</span>' : ''}</a>`).join('')}
       </div>`
    : '<p class="empty-state">No other directory contacts at this company</p>';

  const twoDegHtml = (c.two_degree_path && c.two_degree_path.candidate_count > 0)
    ? `<h3>Second-degree intro paths into ${esc(c.two_degree_path.company || c.company)}</h3>
       <p>Mitchell can reach <strong>${c.two_degree_path.candidate_count}</strong> people at this company through ${esc(c.name)} as a warm-intro pivot.</p>`
    : '';

  // ── Online engagement (post-enrichment)
  const fullEnrich = c._full_enrichment || {};
  const engagement = c.engagement || fullEnrich.engagement || {};
  let engagementHtml = '';
  if (engagement.linkedin_topics || engagement.x_topics || engagement.recent_engaged_posts) {
    engagementHtml = `
      <h3>Online engagement (last 90d)</h3>
      ${engagement.linkedin_topics ? `<p><strong>LinkedIn topics:</strong> ${(engagement.linkedin_topics || []).map(t => `<span class="pill">${esc(t)}</span>`).join(' ')}</p>` : ''}
      ${engagement.linkedin_last_active ? `<p><strong>LinkedIn last active:</strong> ${esc(engagement.linkedin_last_active)}</p>` : ''}
      ${engagement.x_topics ? `<p><strong>X topics:</strong> ${(engagement.x_topics || []).map(t => `<span class="pill">${esc(t)}</span>`).join(' ')}</p>` : ''}
      ${engagement.x_last_active ? `<p><strong>X last active:</strong> ${esc(engagement.x_last_active)}</p>` : ''}
      ${(engagement.recent_engaged_posts || []).length > 0 ? `<ul class="timeline">${(engagement.recent_engaged_posts || []).map(p => `<li><span class="ts">${esc((p.ts || '').slice(0, 10))}</span><span><a href="${esc(p.url || '#')}" target="_blank" rel="noopener">${esc((p.summary || p.url || '').slice(0, 240))}</a></span></li>`).join('')}</ul>` : ''}
    `;
  } else {
    engagementHtml = `<p class="empty-state">Engagement signal not yet enriched. <button class="action" onclick="enrichNow('${esc(c.id)}')">↻ Enrich now</button></p>`;
  }

  // ── LLM insights
  const outreach = c.outreach_recommendation || fullEnrich.outreach_recommendation || {};
  const inferred = c.inferred_relationship || fullEnrich.inferred_relationship || {};
  let insightsHtml = '';
  if (outreach.positioning || outreach.suggested_opening_lines || inferred.arc) {
    insightsHtml = `
      ${outreach.positioning ? `<h3>Positioning recommendation</h3><p>${esc(outreach.positioning)}</p>` : ''}
      ${outreach.best_channel ? `<h3>Best channel</h3><p>${esc(outreach.best_channel)}</p>` : ''}
      ${(outreach.suggested_opening_lines || []).length > 0 ? `<h3>Suggested opening lines</h3><ul>${(outreach.suggested_opening_lines || []).map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
      ${inferred.arc ? `<h3>Relationship arc</h3><p>${esc(inferred.arc)}</p>` : ''}
      ${inferred.why_we_might_connect_now ? `<h3>Why now</h3><p>${esc(inferred.why_we_might_connect_now)}</p>` : ''}
    `;
  } else {
    insightsHtml = `<p class="empty-state">LLM insights pending. <button class="action primary" onclick="enrichNow('${esc(c.id)}')">↻ Enrich now</button></p>`;
  }
  if (fullEnrich.no_data_reason || fullEnrich.refused) {
    insightsHtml += `<div class="refused">⚠ ${esc(fullEnrich.no_data_reason || 'Insufficient signal — manual research needed')}</div>`;
  }

  // ── Outreach state (recommended next action)
  const lastTouch = (c._touches && c._touches.length > 0) ? c._touches[c._touches.length - 1] : null;
  const outreachStateHtml = `
    <div class="kvp">
      <div class="k">Status</div><div class="v">${esc(c.outreach_status || (c.in_outreach ? 'sent (no reply)' : 'not engaged'))}</div>
      <div class="k">Last touch</div><div class="v">${lastTouch ? esc((lastTouch.ts || '').slice(0, 16)) + ' — ' + esc(lastTouch.kind || lastTouch.channel || '') : '<span class="empty-state">—</span>'}</div>
      <div class="k">Next touch due</div><div class="v">${c.next_touch_due ? esc(c.next_touch_due) : '<span class="empty-state">—</span>'}</div>
      <div class="k">Recommended action</div><div class="v">${esc((outreach.recommended_next_action || (c.in_outreach ? 'follow up after 7d if no reply' : 'open thread per positioning recommendation')))}</div>
    </div>
  `;

  // ── Provenance
  let provenanceHtml = '';
  if (fullEnrich.sources || fullEnrich.retrieved_at || fullEnrich.model || fullEnrich.verifier_passed !== undefined) {
    const lines = [
      `sources: ${JSON.stringify(fullEnrich.sources || [])}`,
      `retrieved_at: ${fullEnrich.retrieved_at || 'unknown'}`,
      `model: ${fullEnrich.model || 'unknown'}`,
      `verifier_passed: ${fullEnrich.verifier_passed === true ? 'true' : fullEnrich.verifier_passed === false ? 'false' : 'unknown'}`,
      `priority_score_at_write: ${fullEnrich.priority_score_at_write ?? 'n/a'}`,
      `diff_summary: ${fullEnrich.diff_summary || 'n/a'}`,
    ];
    provenanceHtml = `<pre class="provenance">${esc(lines.join('\n'))}</pre>`;
  } else {
    provenanceHtml = '<p class="empty-state">Provenance fields populate after first enrichment</p>';
  }

  // ── Notes
  const notesHtml = `
    ${(c._notes || []).length > 0
      ? `<ul class="notes-list">${(c._notes || []).slice().reverse().map(n => `<li><span class="ts">${esc((n.ts || '').slice(0, 16))}</span>${esc(n.text || '')}</li>`).join('')}</ul>`
      : '<p class="empty-state">No notes yet</p>'}
    <div class="notes-form">
      <textarea id="note-text" placeholder="Add a note (saved to data/contact-notes/${esc(c.id)}.jsonl)…"></textarea>
      <button class="action primary" onclick="addNote('${esc(c.id)}')">Save note</button>
    </div>
  `;

  const actionsHtml = `
    <div class="actions">
      <button class="action primary" onclick="enrichNow('${esc(c.id)}')">↻ Enrich now (~$0.50)</button>
      ${c.photo_path ? '' : `<button class="action" onclick="scrapePhoto('${esc(c.id)}','${esc(c.linkedin_url || '')}')">📸 Scrape photo</button>`}
      ${c.linkedin_url ? `<a class="action" href="${esc(c.linkedin_url)}" target="_blank" rel="noopener">Open LinkedIn →</a>` : '<span class="action disabled">LinkedIn</span>'}
      ${c.email_professional ? `<a class="action" href="https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(c.email_professional)}" target="_blank" rel="noopener">Compose email →</a>` : '<span class="action disabled">Compose email</span>'}
      <button class="action" onclick="draftOutreach('${esc(c.id)}')">Draft outreach (Mitchell voice)</button>
      <button class="action" onclick="markStale('${esc(c.id)}')">Mark stale</button>
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(c.name)} — relationship intel</title>
  <style>${CSS_BLOCK}</style>
</head>
<body>
<div class="page-shell">
  <a class="back-link" href="/contacts.html">← Back to contacts directory</a>

  <div class="section">
    <div class="header-row">
      ${photoHtml}
      <div style="flex:1">
        <h1 class="header-name">${esc(c.name)}</h1>
        <div class="header-role">${esc(c.position || '—')}${c.company ? ` · <span class="header-co">${esc(c.company)}</span>` : ''}</div>
        <div class="header-pills">${pillsHtml}</div>
      </div>
    </div>
    ${actionsHtml}
  </div>

  <div class="section">
    <h2>Identity &amp; Connection</h2>
    ${identityKvp}
  </div>

  <div class="section">
    <h2>Relationship history</h2>
    ${overlapHtml}
    ${touchesHtml}
  </div>

  <div class="section">
    <h2>Network graph</h2>
    ${othersHtml}
    ${twoDegHtml}
  </div>

  <div class="section">
    <h2>Online engagement</h2>
    ${engagementHtml}
  </div>

  <div class="section">
    <h2>LLM insights — outreach positioning</h2>
    ${insightsHtml}
  </div>

  <div class="section">
    <h2>Outreach state</h2>
    ${outreachStateHtml}
  </div>

  <div class="section">
    <h2>Notes</h2>
    ${notesHtml}
  </div>

  <div class="section">
    <h2>Provenance</h2>
    ${provenanceHtml}
  </div>
</div>
<script>
function enrichNow(id) {
  if (!confirm('Queue this contact for LLM enrichment (~$0.50)?')) return;
  fetch('/api/refresh-cache', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ cache: 'contact_enrichment', key: id, priority: 'user-triggered' }) })
    .then(r => r.ok ? alert('Queued. Refresh page after ~10 min.') : alert('Failed; check dashboard-server logs.'))
    .catch(e => alert('Network error: ' + e.message));
}
function scrapePhoto(id, linkedinUrl) {
  if (!linkedinUrl) { alert('No LinkedIn URL on file.'); return; }
  fetch('/api/scrape-photo', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id, linkedin_url: linkedinUrl }) })
    .then(r => r.ok ? alert('Photo scrape queued.') : alert('Failed.'))
    .catch(e => alert('Network error: ' + e.message));
}
function addNote(id) {
  var ta = document.getElementById('note-text');
  var text = (ta && ta.value || '').trim();
  if (!text) { alert('Note is empty'); return; }
  fetch('/api/contact/' + encodeURIComponent(id) + '/notes', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ text }) })
    .then(r => r.ok ? location.reload() : alert('Failed to save note'))
    .catch(e => alert('Network error: ' + e.message));
}
function draftOutreach(id) {
  alert('Drafting flow coming via /api/contact/' + id + '/draft (Phase B+ when LLM enrichment is complete)');
}
function markStale(id) {
  if (!confirm('Mark this contact as stale (drops from priority queue until manual re-add)?')) return;
  fetch('/api/refresh-cache', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ cache: 'contact_enrichment', key: id, priority: 'stale' }) })
    .then(r => r.ok ? alert('Marked stale.') : alert('Failed.'))
    .catch(e => alert('Network error: ' + e.message));
}
</script>
</body>
</html>`;
}

function _render404() {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Contact not found</title>
<style>body{background:#0a0a0f;color:#fafafa;font-family:-apple-system,sans-serif;margin:0;padding:48px;}h1{margin:0 0 12px;}a{color:#60a5fa;}</style>
</head><body>
<h1>Contact not found</h1>
<p>This id doesn't exist in the baked contacts directory. <a href="/contacts.html">← Back to directory</a></p>
</body></html>`;
}

// CLI smoke test
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const idIdx = argv.indexOf('--id');
  if (idIdx < 0) {
    console.error('Usage: node lib/build-contact-detail-renderer.mjs --id <contact-id>');
    process.exit(1);
  }
  const id = argv[idIdx + 1];
  const c = loadContactForDetail(id);
  if (!c) {
    console.error(`Contact ${id} not found in baked _CONTACTS_DATA`);
    process.exit(2);
  }
  const html = renderContactDetailHtml(c);
  process.stdout.write(html);
}
