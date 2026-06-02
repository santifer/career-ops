/**
 * career-ops apply queue — SPA
 *
 * Fetches /api/queue, renders 3 lanes, handles keyboard nav, inbox,
 * fill/submit/skip actions, search, and threshold setting.
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

  // Restore selection highlight
  syncCursorHighlight();
}

function buildCard(role, laneKey, idx) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id  = role.id;
  card.dataset.lane = laneKey;
  card.dataset.idx  = idx;
  card.tabIndex = -1; // focusable but not in tab order (we manage focus)

  const scoreClass = scoreColorClass(role.score);

  // Employment type badge
  const typeBadge = role.employment_type === 'full-time'  ? '<span class="badge badge-ft">FT</span>'
                  : role.employment_type === 'part-time'   ? '<span class="badge badge-pt">PT</span>'
                  : role.employment_type === 'ambiguous'   ? '<span class="badge badge-ambig">?</span>'
                  : '';

  // Visa badge (abbreviated)
  const visaText = role.visa_answer
    ? role.visa_answer.replace('485 Temporary Graduate Visa', '485 TGV')
                      .replace('Student Visa', 'Student')
    : '';
  const visaBadge = visaText ? `<span class="badge badge-visa">${esc(visaText)}</span>` : '';

  // Status badge
  const prepBadge = role.status === 'prepared' ? '<span class="badge badge-prepared">PDF ready</span>' : '';

  // Eligibility badge
  const eligBadge = role.eligibility === 'cap'     ? '<span class="badge badge-cap">Cap</span>'
                  : role.eligibility === 'blocked'  ? '<span class="badge badge-blocked">Blocked</span>'
                  : '';

  // Flag badges (show first 2 extra flags)
  const extraFlags = (role.flags || [])
    .filter(f => f !== 'ambiguous-employment' && f !== 'large-co-visa-cap' && f !== 'pr-citizenship-required')
    .slice(0, 2)
    .map(f => `<span class="badge badge-flag">${esc(f)}</span>`)
    .join('');

  card.innerHTML = `
    <div class="card-score-badge ${scoreClass}">${role.score != null ? role.score.toFixed(1) : '—'}</div>
    <div class="card-body">
      <div class="card-title">${esc(role.title)}</div>
      <div class="card-company">${esc(role.company)}${role.location ? ' · ' + esc(role.location) : ''}</div>
      <div class="card-badges">
        ${typeBadge}${visaBadge}${eligBadge}${prepBadge}${extraFlags}
      </div>
    </div>`;

  card.addEventListener('click', () => {
    cursor = { laneKey, idx };
    syncCursorHighlight();
    openInbox(role.id);
  });

  return card;
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

  const body = document.getElementById('inbox-body');
  const scoreClass = scoreColorClass(role.score);

  const typeLine = role.employment_type === 'full-time'  ? 'Full-time'
                 : role.employment_type === 'part-time'   ? 'Part-time'
                 : role.employment_type === 'ambiguous'   ? '⚠ Ambiguous (review type)'
                 : '—';

  const visaLine = role.visa_answer
    ? `<span class="badge badge-visa">${esc(role.visa_answer)}</span>`
    : '<span class="badge badge-ambig">No visa answer — review type first</span>';

  // Free text fields
  const freeTextSections = buildFreeTextSections(role);

  // Manual fields
  const manualFields = buildManualFields(role);

  // Flags
  const flagsHtml = (role.flags || []).length > 0
    ? `<div class="inbox-section">
        <div class="inbox-section-label">Flags</div>
        <div class="flags-list">${(role.flags || []).map(f => `<span class="badge badge-flag">${esc(f)}</span>`).join('')}</div>
      </div>`
    : '';

  // CV PDF
  const cvHtml = role.cv_pdf
    ? `<div class="inbox-section">
        <div class="inbox-section-label">Tailored CV PDF</div>
        <div class="inbox-section-value">${esc(role.cv_pdf)}</div>
      </div>`
    : `<div class="inbox-section">
        <div class="inbox-section-value" style="color:var(--overlay0)">CV not yet generated — run <code>/career-ops queue prepare</code></div>
      </div>`;

  body.innerHTML = `
    <div class="inbox-meta">
      <span class="inbox-score ${scoreClass}">${role.score != null ? role.score.toFixed(1) + '/5' : '—'}</span>
      <span class="badge ${role.employment_type === 'part-time' ? 'badge-pt' : role.employment_type === 'ambiguous' ? 'badge-ambig' : 'badge-ft'}">${esc(typeLine)}</span>
      <span class="badge badge-flag">${esc(role.size_bucket || 'unknown')}</span>
      ${role.eligibility !== 'ok' ? `<span class="badge badge-${role.eligibility === 'blocked' ? 'blocked' : 'cap'}">${esc(role.eligibility)}</span>` : ''}
    </div>

    ${role.reason ? `<div class="inbox-reason">${esc(role.reason)}</div>` : ''}

    <div class="inbox-url">
      <a href="${esc(role.url)}" target="_blank" rel="noopener">Open posting ↗</a>
    </div>

    <div class="inbox-section">
      <div class="inbox-section-label">Visa answer</div>
      <div>${visaLine}</div>
    </div>

    ${flagsHtml}
    ${freeTextSections}
    ${manualFields}
    ${cvHtml}
  `;

  // Update footer note
  const note = document.getElementById('inbox-note');
  if (role.employment_type === 'ambiguous') {
    note.textContent = '⚠ Employment type is ambiguous — confirm before filling.';
  } else if (role.eligibility === 'blocked') {
    note.textContent = '⛔ Eligibility blocker — confirm manually before applying.';
  } else if (!role.cv_pdf) {
    note.textContent = 'Run /career-ops queue prepare to generate a tailored CV.';
  } else {
    note.textContent = 'Submit only after reviewing the filled form. Never auto-submitted.';
  }
}

function buildFreeTextSections(role) {
  if (!role.free_text_fields || role.free_text_fields.length === 0) return '';
  const standards = role.free_text_fields.filter(f => f.kind === 'standard');
  if (standards.length === 0) return '';

  const items = standards.map(f => {
    const draft = role.drafts && role.drafts[f.key];
    const content = draft
      ? `<div class="draft-block">${esc(draft)}</div>`
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
  // Don't intercept when typing in an input
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
    case 'j':
    case 'ArrowDown':
      e.preventDefault();
      moveCursor(1);
      break;
    case 'k':
    case 'ArrowUp':
      e.preventDefault();
      moveCursor(-1);
      break;
    case 'ArrowRight':
    case 'l':
      e.preventDefault();
      moveLane(1);
      break;
    case 'ArrowLeft':
    case 'h':
      e.preventDefault();
      moveLane(-1);
      break;
    case 'Enter':
      e.preventDefault();
      openCurrentCard();
      break;
    case 'Escape':
      closeInbox();
      break;
    case 'f':
      if (activeId) doFill();
      break;
    case 's':
      if (activeId) doDecision('submitted');
      break;
    case 'x':
      if (activeId) doDecision('skipped');
      break;
    case 'r':
      loadQueue();
      break;
    case 'o':
      openCurrentUrl();
      break;
    case '/':
      e.preventDefault();
      document.getElementById('search').focus();
      break;
  }
});

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
  const next = LANE_ORDER[Math.max(0, Math.min(LANE_ORDER.length - 1, laneIdx + delta))];
  const roles = getLaneRoles(next);
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
  const role = roles[cursor.idx];
  if (role) openInbox(role.id);
}

function openCurrentUrl() {
  if (activeId) {
    const role = allRoles.find(r => r.id === activeId);
    if (role?.url) window.open(role.url, '_blank', 'noopener');
    return;
  }
  const roles = getLaneRoles(cursor.laneKey);
  const role = roles[cursor.idx];
  if (role?.url) window.open(role.url, '_blank', 'noopener');
}

function advanceCursor() {
  // After a decision, try to select the next role in the same lane
  const roles = getLaneRoles(cursor.laneKey);
  if (roles.length > 0) {
    cursor.idx = Math.min(cursor.idx, roles.length - 1);
    syncCursorHighlight();
    scrollCursorIntoView();
  } else {
    // Move to next non-empty lane
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

  const searchInput = document.getElementById('search');
  searchInput.addEventListener('input', () => {
    query = searchInput.value.toLowerCase().trim();
    loadQueue(); // reload and filter
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
  if (score >= 4.2) return 'score-high';
  if (score >= 3.8) return 'score-mid';
  if (score >= 3.0) return 'score-low';
  return 'score-very-low';
}
