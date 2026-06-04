/**
 * career-ops apply queue — SPA
 *
 * Fetches /api/queue, renders 3 lanes, handles keyboard nav, inbox,
 * fill/submit/skip actions, search, threshold, bulk selection, parallel run,
 * and a live activity feed via SSE.
 * Zero model tokens — pure DOM + fetch.
 */

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────

let allRoles   = [];
let settings   = { score_threshold: null };
let query      = '';

// cursor: { laneKey, idx } — which card is highlighted
let cursor     = { laneKey: 'ready', idx: 0 };
let activeId   = null; // ID of the role open in inbox

// Bulk selection
let checkedIds = new Set();

const LANE_ORDER = ['ready', 'needs', 'review'];
const LANE_KEY   = {
  ready:  'ready',
  'needs-input': 'needs',
  'review-carefully': 'review',
};

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadQueue();
  connectActivityFeed();
});

// ── Data ──────────────────────────────────────────────────────────────────────

async function loadQueue() {
  try {
    const res  = await fetch('/api/queue');
    const data = await res.json();
    allRoles = data.roles || [];
    settings = data.settings || {};
    if (settings.score_threshold) {
      document.getElementById('threshold-input').value = settings.score_threshold;
    }
    renderAll(data.stats);
    syncBatchBar();
  } catch (err) {
    console.error('Failed to load queue:', err);
    toast('Failed to load queue — is the server running?', 4000);
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderAll(stats) {
  updateStats(stats);

  const filtered = query
    ? allRoles.filter(r =>
        r.company.toLowerCase().includes(query) ||
        r.title.toLowerCase().includes(query) ||
        (r.location || '').toLowerCase().includes(query))
    : allRoles;

  const laneMap = { ready: [], needs: [], review: [] };
  for (const role of filtered) {
    const k = LANE_KEY[role.lane];
    if (k) laneMap[k].push(role);
  }

  // Sort each lane by score desc
  for (const k of LANE_ORDER) {
    laneMap[k].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  renderLane('ready',  laneMap.ready);
  renderLane('needs',  laneMap.needs);
  renderLane('review', laneMap.review);

  // Update inbox if one is open
  if (activeId) {
    const role = allRoles.find(r => r.id === activeId);
    if (role) renderInbox(role);
  }
}

function updateStats(stats) {
  if (!stats) return;
  document.getElementById('stat-ready').textContent  = stats.ready ?? 0;
  document.getElementById('stat-needs').textContent  = stats.needsInput ?? 0;
  document.getElementById('stat-review').textContent = stats.reviewCarefully ?? 0;
  document.getElementById('stat-new').textContent    = stats.newCount ?? 0;
  document.getElementById('stat-avg').textContent    = stats.avgScore != null ? stats.avgScore + '/5' : '—';
}

function renderLane(laneKey, roles) {
  const container = document.getElementById(`cards-${laneKey}`);
  const countEl   = document.getElementById(`count-${laneKey}`);
  countEl.textContent = roles.length;

  container.innerHTML = '';

  if (roles.length === 0) {
    container.innerHTML = '<p class="lane-empty">No roles</p>';
    return;
  }

  roles.forEach((role, idx) => {
    const card = buildCard(role, laneKey, idx);
    container.appendChild(card);
  });

  syncCursorHighlight();
}

function buildCard(role, laneKey, idx) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id   = role.id;
  card.dataset.lane = laneKey;
  card.dataset.idx  = idx;
  card.tabIndex = -1;

  if (checkedIds.has(role.id)) card.classList.add('checked');

  const scoreClass = scoreColorClass(role.score);

  // Employment type badge
  const typeBadge = role.employment_type === 'full-time'  ? '<span class="badge badge-ft">FT</span>'
                  : role.employment_type === 'part-time'   ? '<span class="badge badge-pt">PT</span>'
                  : role.employment_type === 'ambiguous'   ? '<span class="badge badge-ambig">?</span>'
                  : '';

  // Visa badge
  const visaText = role.visa_answer || '';
  const visaBadge = visaText ? `<span class="badge badge-visa">${esc(visaText)}</span>` : '';

  // Status badge (filled, prefilled, or prepared)
  const statusBadge = role.status === 'filled'   ? '<span class="badge badge-filled">Filled</span>'
                    : role.status === 'prefilled' ? '<span class="badge badge-prefilled">Prefilled</span>'
                    : role.status === 'prepared'  ? '<span class="badge badge-prepared">PDF ready</span>'
                    : '';

  // Eligibility badge
  const eligBadge = role.eligibility === 'cap'    ? '<span class="badge badge-cap">Cap</span>'
                  : role.eligibility === 'blocked' ? '<span class="badge badge-blocked">Blocked</span>'
                  : '';

  // Login-gated badge
  const loginBadge = (role.flags || []).includes('login-required')
    ? '<span class="badge badge-login" title="Portal requires login">🔐 login</span>'
    : '';

  // Documents-required badges
  const kscBadge = (role.flags || []).includes('ksc-required')
    ? '<span class="badge badge-doc" title="Key Selection Criteria required">📋 KSC</span>'
    : '';
  const coverBadge = (role.flags || []).includes('cover-letter-required')
    ? '<span class="badge badge-doc" title="Cover letter required">📄 cover</span>'
    : '';

  // Knockout flag badge
  const koBadge = (role.flags || []).includes('knockout-flag')
    ? '<span class="badge badge-ko" title="Screener/knockout question detected">⛔ screener</span>'
    : '';

  // Extra flags (first 2, excluding well-known ones)
  const HANDLED_FLAGS = new Set([
    'ambiguous-employment', 'large-co-visa-cap', 'pr-citizenship-required',
    'login-required', 'ksc-required', 'cover-letter-required', 'knockout-flag',
    'manual-field',
  ]);
  const extraFlags = (role.flags || [])
    .filter(f => !HANDLED_FLAGS.has(f))
    .slice(0, 2)
    .map(f => `<span class="badge badge-flag">${esc(f)}</span>`)
    .join('');

  // Provenance summary
  const provBadge = role.provenance_summary
    ? `<span class="badge badge-prov" title="Fill provenance">${esc(role.provenance_summary)}</span>`
    : '';

  // Checkbox
  const checkHtml = `<input type="checkbox" class="card-checkbox" data-id="${esc(role.id)}" ${checkedIds.has(role.id) ? 'checked' : ''} aria-label="Select ${esc(role.company)}">`;

  card.innerHTML = `
    <div class="card-check">${checkHtml}</div>
    <div class="card-score-badge ${scoreClass}">${role.score != null ? role.score.toFixed(1) : '—'}</div>
    <div class="card-body">
      <div class="card-title">${esc(role.title)}</div>
      <div class="card-company">${esc(role.company)}${role.location ? ' · ' + esc(role.location) : ''}</div>
      <div class="card-url"><a href="${esc(role.url)}" target="_blank" rel="noopener" class="card-url-link" title="${esc(role.url)}">${esc(truncateUrl(role.url))}</a></div>
      <div class="card-badges">
        ${typeBadge}${visaBadge}${eligBadge}${statusBadge}${loginBadge}${kscBadge}${coverBadge}${koBadge}${extraFlags}
      </div>
      ${provBadge ? `<div class="card-prov">${provBadge}</div>` : ''}
      ${role.requirements_snippet ? `<div class="card-snippet">${esc(role.requirements_snippet.slice(0, 120))}…</div>` : ''}
    </div>`;

  // Checkbox toggle (does not open inbox)
  const chkEl = card.querySelector('.card-checkbox');
  chkEl.addEventListener('change', (e) => {
    e.stopPropagation();
    toggleCheck(role.id, e.target.checked);
  });
  chkEl.addEventListener('click', (e) => e.stopPropagation());

  // Card body click → open inbox
  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-checkbox') || e.target.closest('.card-url-link')) return;
    cursor = { laneKey, idx };
    syncCursorHighlight();
    openInbox(role.id);
  });

  return card;
}

function truncateUrl(url = '') {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname.length > 30 ? u.pathname.slice(0, 30) + '…' : u.pathname);
  } catch {
    return url.slice(0, 50);
  }
}

// ── Inbox ─────────────────────────────────────────────────────────────────────

function openInbox(id) {
  activeId = id;
  const role = allRoles.find(r => r.id === id);
  if (!role) return;
  renderInbox(role);
  document.getElementById('inbox').removeAttribute('hidden');
}

function closeInbox() {
  activeId = null;
  document.getElementById('inbox').setAttribute('hidden', '');
}

function renderInbox(role) {
  document.getElementById('inbox-title').textContent = `${role.title} · ${role.company}`;

  const body       = document.getElementById('inbox-body');
  const scoreClass = scoreColorClass(role.score);

  const typeLine = role.employment_type === 'full-time'  ? 'Full-time'
                 : role.employment_type === 'part-time'   ? 'Part-time'
                 : role.employment_type === 'ambiguous'   ? '⚠ Ambiguous (review type)'
                 : '—';

  const visaLine = role.visa_answer
    ? `<span class="badge badge-visa">${esc(role.visa_answer)}</span>`
    : '<span class="badge badge-ambig">No visa answer — review type first</span>';

  const freeTextSections = buildFreeTextSections(role);
  const manualFields     = buildManualFields(role);
  const docSection       = buildDocSection(role);

  const flagsHtml = (role.flags || []).length > 0
    ? `<div class="inbox-section">
        <div class="inbox-section-label">Flags</div>
        <div class="flags-list">${(role.flags || []).map(f => `<span class="badge badge-flag">${esc(f)}</span>`).join('')}</div>
      </div>`
    : '';

  const cvHtml = role.cv_pdf
    ? `<div class="inbox-section">
        <div class="inbox-section-label">Tailored CV PDF</div>
        <div class="inbox-section-value">${esc(role.cv_pdf)}</div>
      </div>`
    : `<div class="inbox-section">
        <div class="inbox-section-value" style="color:var(--overlay0)">CV not yet generated — run <code>/career-ops queue prepare</code></div>
      </div>`;

  const provHtml = role.provenance_summary
    ? `<div class="inbox-section">
        <div class="inbox-section-label">Fill provenance</div>
        <div class="inbox-section-value" style="color:var(--subtext)">${esc(role.provenance_summary)}</div>
      </div>`
    : '';

  const snippetHtml = role.requirements_snippet
    ? `<div class="inbox-section">
        <div class="inbox-section-label">Requirements (from JD)</div>
        <div class="inbox-section-value" style="color:var(--subtext);white-space:pre-wrap">${esc(role.requirements_snippet)}</div>
      </div>`
    : '';

  body.innerHTML = `
    <div class="inbox-meta">
      <span class="inbox-score ${scoreClass}">${role.score != null ? role.score.toFixed(1) + '/5' : '—'}</span>
      <span class="badge ${role.employment_type === 'part-time' ? 'badge-pt' : role.employment_type === 'ambiguous' ? 'badge-ambig' : 'badge-ft'}">${esc(typeLine)}</span>
      <span class="badge badge-flag">${esc(role.size_bucket || 'unknown')}</span>
      ${role.eligibility !== 'ok' ? `<span class="badge badge-${role.eligibility === 'blocked' ? 'blocked' : 'cap'}">${esc(role.eligibility)}</span>` : ''}
      ${role.status === 'filled' ? '<span class="badge badge-filled">Filled ✓</span>' : ''}
      ${role.status === 'prefilled' ? '<span class="badge badge-prefilled">Prefilled</span>' : ''}
    </div>

    ${role.reason ? `<div class="inbox-reason">${esc(role.reason)}</div>` : ''}

    <div class="inbox-url">
      <a href="${esc(role.url)}" target="_blank" rel="noopener">Open posting ↗</a>
      <span class="inbox-url-text">${esc(role.url)}</span>
    </div>

    <div class="inbox-section">
      <div class="inbox-section-label">Visa answer</div>
      <div>${visaLine}</div>
    </div>

    ${flagsHtml}
    ${snippetHtml}
    ${docSection}
    ${freeTextSections}
    ${manualFields}
    ${cvHtml}
    ${provHtml}
  `;

  const note = document.getElementById('inbox-note');
  const submitBtn = document.getElementById('btn-submit');
  const isPrefilled = role.status === 'prefilled';
  submitBtn.disabled = isPrefilled;
  submitBtn.title = isPrefilled
    ? 'Re-open with headed Fill Form and review before marking submitted'
    : 'Mark submitted after manual submission';

  if (role.employment_type === 'ambiguous') {
    note.textContent = '⚠ Employment type is ambiguous — confirm before filling.';
  } else if (role.eligibility === 'blocked') {
    note.textContent = '⛔ Eligibility blocker — confirm manually before applying.';
  } else if ((role.flags || []).includes('knockout-flag')) {
    note.textContent = '⛔ Screener/knockout question detected — answer truthfully in the browser.';
  } else if (isPrefilled) {
    note.textContent = 'Headless pre-fill completed. Click Fill Form to re-open headed, review the live form, then submit manually.';
  } else if ((role.flags || []).includes('login-required')) {
    note.textContent = '🔐 Portal requires login — form-fill will handle registration/login automatically.';
  } else if (!role.cv_pdf) {
    note.textContent = 'Run /career-ops queue prepare to generate a tailored CV.';
  } else if (role.status === 'filled') {
    note.textContent = 'Form filled — review in browser, then submit manually and click Mark Submitted.';
  } else {
    note.textContent = 'Submit only after reviewing the filled form. Never auto-submitted.';
  }
}

function buildDocSection(role) {
  const items = [];
  if ((role.flags || []).includes('ksc-required')) {
    const criteria = role.ksc_criteria?.length
      ? `<ul class="ksc-list">${role.ksc_criteria.slice(0, 5).map(c => `<li>${esc(c)}</li>`).join('')}</ul>`
      : '<span style="color:var(--overlay0)">Criteria will be extracted during prepare</span>';
    items.push(`<div><div class="inbox-section-label">📋 Key Selection Criteria</div>${criteria}</div>`);
  }
  if ((role.flags || []).includes('cover-letter-required')) {
    const path = role.cover_letter_path
      ? `<div class="inbox-section-value">${esc(role.cover_letter_path)}</div>`
      : '<div style="color:var(--overlay0)">Not yet generated — run /career-ops queue prepare</div>';
    items.push(`<div><div class="inbox-section-label">📄 Cover letter</div>${path}</div>`);
  }
  if (items.length === 0) return '';
  return `<div class="inbox-section">${items.join('')}</div>`;
}

function buildFreeTextSections(role) {
  if (!role.free_text_fields || role.free_text_fields.length === 0) return '';
  const standards = role.free_text_fields.filter(f => f.kind === 'standard');
  if (standards.length === 0) return '';

  const items = standards.map(f => {
    const draft = role.drafts && role.drafts[f.key];
    const content = draft
      ? `<div class="draft-block">${esc(typeof draft === 'object' ? draft.answer : draft)}</div>`
      : `<div class="draft-block"><span class="draft-placeholder">Not yet drafted — run /career-ops queue prepare</span></div>`;
    return `<div><div class="inbox-section-label" style="margin-bottom:4px">${esc(f.label)}</div>${content}</div>`;
  }).join('');

  return `<div class="inbox-section">
    <div class="inbox-section-label">Standard free-text fields</div>
    ${items}
  </div>`;
}

function buildManualFields(role) {
  if (!role.free_text_fields || role.free_text_fields.length === 0) return '';
  const customs = role.free_text_fields.filter(f => f.kind === 'custom');
  if (customs.length === 0 && !(role.flags || []).includes('manual-field')) return '';

  const items = customs.map(f =>
    `<div class="manual-field-item">
      <div class="field-label">${esc(f.label)}${f.required ? ' *' : ''}</div>
      <div class="field-note">Custom field — fill manually</div>
    </div>`
  ).join('');

  return `<div class="inbox-section">
    <div class="inbox-section-label" style="color:var(--yellow)">⚠ Manual fields (left blank by auto-fill)</div>
    ${items || '<div class="inbox-section-value" style="color:var(--overlay0)">See flags — manual input required</div>'}
  </div>`;
}

// ── Bulk selection ────────────────────────────────────────────────────────────

function toggleCheck(id, checked) {
  if (checked) checkedIds.add(id);
  else          checkedIds.delete(id);
  syncBatchBar();
  // Update card class without full re-render
  const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  if (card) card.classList.toggle('checked', checked);
}

function syncBatchBar() {
  const bar       = document.getElementById('batch-bar');
  const countEl   = document.getElementById('batch-count');
  const n         = checkedIds.size;
  bar.hidden      = n === 0;
  countEl.textContent = `${n} selected`;
}

function selectAll() {
  const threshold = settings.score_threshold ?? 0;
  for (const role of allRoles) {
    if (role.score != null && role.score >= threshold) {
      checkedIds.add(role.id);
    }
  }
  renderAll(); // re-render to show checkmarks
  syncBatchBar();
}

function clearAll() {
  checkedIds.clear();
  renderAll();
  syncBatchBar();
}

// ── Run ───────────────────────────────────────────────────────────────────────

async function startRun() {
  if (checkedIds.size === 0) { toast('No roles selected', 2000); return; }

  // Show activity panel
  document.getElementById('activity-panel').removeAttribute('hidden');

  const ids = Array.from(checkedIds);
  try {
    const res  = await fetch('/api/run', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ids }),
    });
    const data = await res.json();
    toast(`Run started: ${data.deterministic} headless, ${data.loginGated} headed, ${data.agentPath} agent-path`);
    clearAll();
  } catch {
    toast('Failed to start run — check server logs', 4000);
  }
}

// ── Activity feed (SSE) ───────────────────────────────────────────────────────

let eventSource = null;

function connectActivityFeed() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource('/api/activity');
  eventSource.onmessage = (e) => {
    try {
      const entry = JSON.parse(e.data);
      appendActivityEntry(entry);
    } catch {}
  };
  eventSource.onerror = () => {
    // Reconnect silently — SSE will retry automatically
  };
}

function appendActivityEntry(entry) {
  const body = document.getElementById('activity-body');

  const icon = {
    started:     '⏳',
    success:     '✅',
    'login-wall':    '🔐',
    'knockout-flag': '⛔',
    failure:     '❌',
    'agent-path':    '🤖',
  }[entry.event] || '·';

  const row = document.createElement('div');
  row.className = `activity-row activity-${entry.event}`;
  row.innerHTML = `
    <span class="activity-icon">${icon}</span>
    <span class="activity-company">${esc(entry.company)} – ${esc(entry.title)}</span>
    <span class="activity-event">${esc(entry.event)}</span>
    ${entry.message ? `<span class="activity-msg">${esc(entry.message)}</span>` : ''}
    <span class="activity-ts">${entry.ts ? new Date(entry.ts).toLocaleTimeString() : ''}</span>
  `;
  body.prepend(row); // newest first

  // Highlight updated card
  if (entry.roleId) {
    const card = document.querySelector(`.card[data-id="${CSS.escape(entry.roleId)}"]`);
    if (card) {
      card.classList.add('activity-flash');
      setTimeout(() => card.classList.remove('activity-flash'), 2000);
    }
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function doFill() {
  if (!activeId) return;
  try {
    const res  = await fetch(`/api/role/${encodeURIComponent(activeId)}/fill`, { method: 'POST' });
    const data = await res.json();
    if (data.method === 'agent') {
      toast(data.message, 6000);
    } else {
      toast('Playwright fill launched — browser opening…');
    }
  } catch {
    toast('Fill request failed — check server logs', 4000);
  }
}

async function doDecision(decision) {
  if (!activeId) return;
  const role = allRoles.find(r => r.id === activeId);
  if (decision === 'submitted' && role?.status === 'prefilled') {
    toast('Re-open with headed Fill Form and review before marking submitted.', 4000);
    return;
  }
  const label = { submitted: 'Submitted', skipped: 'Skipped', reviewed: 'Reviewed' }[decision];
  try {
    const res = await fetch(`/api/role/${encodeURIComponent(activeId)}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    if (!res.ok) { toast('Action failed', 3000); return; }
    toast(`${label} — advancing to next role…`);
    closeInbox();
    await loadQueue();
    advanceCursor();
  } catch {
    toast('Action failed — check server logs', 4000);
  }
}

async function setThreshold() {
  const val = parseFloat(document.getElementById('threshold-input').value);
  if (isNaN(val) || val < 0 || val > 5) { toast('Enter a threshold between 0 and 5'); return; }
  const res  = await fetch('/api/threshold', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: val }),
  });
  const data = await res.json();
  toast(`Threshold set to ${val} — ${data.flipped} role(s) queued for prepare.`);
  await loadQueue();
}

// ── Keyboard ──────────────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    if (e.key === 'Escape') {
      document.activeElement.blur();
      if (document.activeElement.id === 'search') {
        query = '';
        document.getElementById('search').value = '';
        renderAll();
      }
    }
    return;
  }

  switch (e.key) {
    case 'j': case 'ArrowDown':  e.preventDefault(); moveCursor(1);  break;
    case 'k': case 'ArrowUp':    e.preventDefault(); moveCursor(-1); break;
    case 'ArrowRight': case 'l': e.preventDefault(); moveLane(1);    break;
    case 'ArrowLeft':  case 'h': e.preventDefault(); moveLane(-1);   break;
    case 'Enter':                e.preventDefault(); openCurrentCard(); break;
    case ' ':                    e.preventDefault(); toggleCurrentCheck(); break;
    case 'Escape':               closeInbox(); break;
    case 'f':  if (activeId)                doFill();               break;
    case 's':  if (activeId)                doDecision('submitted'); break;
    case 'x':  if (activeId)                doDecision('skipped');  break;
    case 'r':  loadQueue(); break;
    case 'o':  openCurrentUrl(); break;
    case '/':  e.preventDefault(); document.getElementById('search').focus(); break;
  }
});

function toggleCurrentCheck() {
  const roles = getLaneRoles(cursor.laneKey);
  const role  = roles[cursor.idx];
  if (!role) return;
  const checked = !checkedIds.has(role.id);
  toggleCheck(role.id, checked);
  // Update the checkbox in the card
  const chk = document.querySelector(`.card[data-id="${CSS.escape(role.id)}"] .card-checkbox`);
  if (chk) chk.checked = checked;
}

// ── Cursor management ─────────────────────────────────────────────────────────

function getLaneRoles(laneKey) {
  const filtered = query
    ? allRoles.filter(r =>
        r.company.toLowerCase().includes(query) ||
        r.title.toLowerCase().includes(query) ||
        (r.location || '').toLowerCase().includes(query))
    : allRoles;
  const mapped = { ready: [], needs: [], review: [] };
  for (const r of filtered) {
    const k = LANE_KEY[r.lane];
    if (k) mapped[k].push(r);
  }
  for (const k of LANE_ORDER) mapped[k].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return mapped[laneKey] || [];
}

function moveCursor(delta) {
  const roles = getLaneRoles(cursor.laneKey);
  if (roles.length === 0) return;
  cursor.idx = Math.max(0, Math.min(roles.length - 1, cursor.idx + delta));
  syncCursorHighlight();
  scrollCursorIntoView();
}

function moveLane(delta) {
  const laneIdx = LANE_ORDER.indexOf(cursor.laneKey);
  const next    = LANE_ORDER[Math.max(0, Math.min(LANE_ORDER.length - 1, laneIdx + delta))];
  const roles   = getLaneRoles(next);
  cursor = { laneKey: next, idx: Math.min(cursor.idx, Math.max(0, roles.length - 1)) };
  syncCursorHighlight();
  scrollCursorIntoView();
}

function syncCursorHighlight() {
  document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
  const roles = getLaneRoles(cursor.laneKey);
  if (!roles.length) return;
  const role = roles[cursor.idx];
  if (!role) return;
  const card = document.querySelector(`.card[data-id="${CSS.escape(role.id)}"]`);
  if (card) card.classList.add('selected');
}

function scrollCursorIntoView() {
  const roles = getLaneRoles(cursor.laneKey);
  if (!roles.length) return;
  const role = roles[cursor.idx];
  if (!role) return;
  const card = document.querySelector(`.card[data-id="${CSS.escape(role.id)}"]`);
  card?.scrollIntoView({ block: 'nearest' });
}

function openCurrentCard() {
  const roles = getLaneRoles(cursor.laneKey);
  const role  = roles[cursor.idx];
  if (role) openInbox(role.id);
}

function openCurrentUrl() {
  if (activeId) {
    const role = allRoles.find(r => r.id === activeId);
    if (role?.url) window.open(role.url, '_blank', 'noopener');
    return;
  }
  const roles = getLaneRoles(cursor.laneKey);
  const role  = roles[cursor.idx];
  if (role?.url) window.open(role.url, '_blank', 'noopener');
}

function advanceCursor() {
  const roles = getLaneRoles(cursor.laneKey);
  if (roles.length > 0) {
    cursor.idx = Math.min(cursor.idx, roles.length - 1);
    syncCursorHighlight();
    scrollCursorIntoView();
  } else {
    for (const lk of LANE_ORDER) {
      if (getLaneRoles(lk).length > 0) {
        cursor = { laneKey: lk, idx: 0 };
        syncCursorHighlight();
        break;
      }
    }
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

function setupEventListeners() {
  document.getElementById('btn-refresh').addEventListener('click', loadQueue);
  document.getElementById('btn-close-inbox').addEventListener('click', closeInbox);
  document.getElementById('btn-set-threshold').addEventListener('click', setThreshold);
  document.getElementById('threshold-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') setThreshold();
  });

  document.getElementById('btn-fill').addEventListener('click', doFill);
  document.getElementById('btn-submit').addEventListener('click', () => doDecision('submitted'));
  document.getElementById('btn-skip').addEventListener('click', () => doDecision('skipped'));
  document.getElementById('btn-reviewed').addEventListener('click', () => doDecision('reviewed'));

  document.getElementById('btn-select-all').addEventListener('click', selectAll);
  document.getElementById('btn-clear-all').addEventListener('click', clearAll);
  document.getElementById('btn-start-run').addEventListener('click', startRun);
  document.getElementById('btn-close-activity').addEventListener('click', () => {
    document.getElementById('activity-panel').setAttribute('hidden', '');
  });

  const searchInput = document.getElementById('search');
  searchInput.addEventListener('input', () => {
    query = searchInput.value.toLowerCase().trim();
    loadQueue();
  });
}

// ── Toast ─────────────────────────────────────────────────────────────────────

let toastTimer;
function toast(msg, ms = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scoreColorClass(score) {
  if (score == null) return '';
  if (score >= 4.2)  return 'score-high';
  if (score >= 3.8)  return 'score-mid';
  if (score >= 3.0)  return 'score-low';
  return 'score-very-low';
}
