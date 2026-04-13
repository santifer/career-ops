/**
 * Career Ops Dashboard — Frontend App
 * Vanilla JS, no build step required.
 *
 * Views:  Dashboard | Pipeline | Pending URLs
 * Theme:  Light / Dark (persisted to localStorage)
 * Panel:  Slide-in report viewer (markdown rendered via marked.js)
 */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────

let allApplications = [];
let metrics = null;
let currentSort = { key: 'date', dir: 'desc' };
let currentView = 'dashboard';
let pendingLoaded = false;

// ─── Theme ────────────────────────────────────────────────────────────────────

(function initTheme() {
  const saved = localStorage.getItem('career-ops-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(theme, false);
})();

function applyTheme(theme, save = true) {
  const html = document.documentElement;
  const sun  = document.getElementById('icon-sun');
  const moon = document.getElementById('icon-moon');
  html.className = theme;
  if (sun)  sun.style.display  = theme === 'dark'  ? 'block' : 'none';
  if (moon) moon.style.display = theme === 'light' ? 'block' : 'none';
  if (save) localStorage.setItem('career-ops-theme', theme);
}

document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const isDark = document.documentElement.classList.contains('dark');
  applyTheme(isDark ? 'light' : 'dark');
});

// ─── Navigation ───────────────────────────────────────────────────────────────

document.querySelectorAll('.nav-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const view = tab.dataset.view;
    switchView(view);
  });
});

function switchView(view) {
  currentView = view;

  // Tab active state
  document.querySelectorAll('.nav-tab').forEach((t) => {
    const isActive = t.dataset.view === view;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // View active state
  document.querySelectorAll('.view').forEach((v) => {
    v.classList.toggle('active', v.id === `view-${view}`);
  });

  // Lazy-load pending URLs
  if (view === 'pending' && !pendingLoaded) {
    loadPendingURLs();
  }
}

// Dashboard "view all" link
document.getElementById('view-all-btn')?.addEventListener('click', () => {
  switchView('pipeline');
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format YYYY-MM-DD → Apr 1, 2026 */
function fmtDate(d) {
  if (!d) return '—';
  try {
    const [y, m, day] = d.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m, 10) - 1]} ${parseInt(day, 10)}, ${y}`;
  } catch (_) {
    return d;
  }
}

/** Short date: Apr 1 */
function fmtDateShort(d) {
  if (!d) return '—';
  try {
    const [, m, day] = d.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m, 10) - 1]} ${parseInt(day, 10)}`;
  } catch (_) {
    return d;
  }
}

/** Score → CSS class */
function scoreClass(score) {
  if (!score || score <= 0) return 'none';
  if (score >= 4.5) return 'high';
  if (score >= 4.0) return 'good';
  if (score >= 3.5) return 'mid';
  if (score >= 3.0) return 'low';
  return 'poor';
}

/** Sanitize class name (strip spaces/special chars) */
function statusCls(s) {
  if (!s) return '';
  // Remove anything that's not alpha and capitalize first letter
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/[^a-zA-Z]/g, '');
}

/** Escape HTML */
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** Status badge HTML */
function badgeHtml(status) {
  const cls = statusCls(status);
  return `<span class="status-badge ${cls}">${esc(status)}</span>`;
}

/** Score pill HTML */
function scorePillHtml(app) {
  if (!app.score || app.score <= 0) return '<span class="score-pill none">—</span>';
  return `<span class="score-pill ${scoreClass(app.score)}">${esc(app.scoreRaw)}</span>`;
}

/** PDF indicator */
function pdfHtml(hasPDF) {
  return hasPDF ? '✅' : '<span style="color:var(--text-3)">—</span>';
}

// ─── Data loading ─────────────────────────────────────────────────────────────

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function loadAll() {
  try {
    const [appsData, metricsData] = await Promise.all([
      fetchJSON('/api/applications'),
      fetchJSON('/api/metrics'),
    ]);

    allApplications = appsData.applications || [];
    metrics = metricsData.metrics || {};

    // Show demo badge
    if (appsData.demo) {
      const badge = document.getElementById('demo-badge');
      if (badge) badge.style.display = 'inline-block';
    }

    renderDashboard();
    renderPipeline();
  } catch (err) {
    console.error('Failed to load data:', err);
    showError('Could not reach the Career Ops server. Is it running?');
  }
}

function showError(msg) {
  document.getElementById('dashboard-subtitle').textContent = msg;
  ['recent-tbody', 'pipeline-tbody'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<tr><td colspan="7" class="table-empty">
      <div class="pipeline-empty-icon">⚠️</div>
      <div class="pipeline-empty-text">${esc(msg)}</div>
    </td></tr>`;
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function renderDashboard() {
  if (!metrics) return;

  // Subtitle
  const subtitle = document.getElementById('dashboard-subtitle');
  const n = allApplications.length;
  subtitle.textContent = `Tracking ${n} application${n !== 1 ? 's' : ''} across your job search.`;

  // Stats
  setText('stat-total',       metrics.total);
  setText('stat-applied',     metrics.applied);
  setText('stat-interviews',  metrics.interviews);
  setText('stat-offers',      metrics.offers);
  setText('stat-avg',         metrics.avgScore ? `${metrics.avgScore}/5` : '—');
  setText('stat-top-score',   metrics.topScore ? `top: ${metrics.topScore}/5` : 'top: —');
  setText('stat-pdf',         metrics.withPDF);
  setText('stat-actionable',  `≥4.0: ${metrics.actionable}`);

  // Rates
  setText('rate-response',    `${metrics.responseRate}%`);
  setText('rate-interview',   `${metrics.interviewRate}%`);
  setText('rate-offer',       `${metrics.offerRate}%`);

  // Status chart
  renderStatusChart();

  // Score chart
  renderScoreChart();

  // Recent (last 10, sorted by date desc)
  const recent = [...allApplications]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 10);
  renderRecentTable(recent);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '—';
}

function renderStatusChart() {
  const container = document.getElementById('status-chart');
  if (!container || !metrics) return;

  const STATUS_ORDER = ['Evaluated','Applied','Responded','Interview','Offer','Rejected','Discarded','SKIP'];
  const byStatus = metrics.byStatus || {};
  const total = metrics.total || 1;

  const rows = STATUS_ORDER
    .filter((s) => byStatus[s] > 0)
    .map((s) => ({ label: s, count: byStatus[s], pct: Math.round((byStatus[s] / total) * 100) }));

  if (rows.length === 0) {
    container.innerHTML = '<p style="color:var(--text-3);font-size:14px">No data</p>';
    return;
  }

  const max = Math.max(...rows.map((r) => r.count), 1);
  container.innerHTML = rows.map((r) => {
    const fillPct = Math.max((r.count / max) * 100, 2);
    const cls = `s-${r.label.toLowerCase()}`;
    return `
      <div class="bar-row">
        <span class="bar-label">${esc(r.label)}</span>
        <div class="bar-track" role="progressbar" aria-valuenow="${r.count}" aria-valuemax="${max}">
          <div class="bar-fill ${cls}" style="width:${fillPct}%"></div>
        </div>
        <span class="bar-count">${r.count}</span>
      </div>`;
  }).join('');
}

function renderScoreChart() {
  const container = document.getElementById('score-chart');
  if (!container || !metrics) return;

  const buckets = metrics.scoreBuckets || [];
  if (buckets.every((b) => b.count === 0)) {
    container.innerHTML = '<p style="color:var(--text-3);font-size:14px">No scored applications yet</p>';
    return;
  }

  const max = Math.max(...buckets.map((b) => b.count), 1);
  const SCORE_CLS = ['score-high','score-good','score-mid','score-low','score-poor'];
  container.innerHTML = buckets.map((b, i) => {
    const fillPct = b.count > 0 ? Math.max((b.count / max) * 100, 2) : 0;
    return `
      <div class="bar-row">
        <span class="bar-label">${esc(b.label)}</span>
        <div class="bar-track" role="progressbar" aria-valuenow="${b.count}" aria-valuemax="${max}">
          <div class="bar-fill ${SCORE_CLS[i]}" style="width:${fillPct}%"></div>
        </div>
        <span class="bar-count">${b.count}</span>
      </div>`;
  }).join('');
}

function renderRecentTable(apps) {
  const tbody = document.getElementById('recent-tbody');
  if (!tbody) return;

  if (apps.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">
      <div class="pipeline-empty">
        <div class="pipeline-empty-icon">📋</div>
        <div class="pipeline-empty-text">No applications yet. Start scanning job portals!</div>
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = apps.map((a) => `
    <tr data-app="${esc(JSON.stringify({number:a.number,company:a.company,role:a.role,status:a.status,score:a.score,scoreRaw:a.scoreRaw,hasPDF:a.hasPDF,reportPath:a.reportPath}))}"
        tabindex="0" role="button" aria-label="View ${esc(a.company)} evaluation">
      <td class="td-date">${esc(a.number)}</td>
      <td class="td-company">${esc(a.company)}</td>
      <td class="td-role">${esc(a.role)}</td>
      <td>${scorePillHtml(a)}</td>
      <td>${badgeHtml(a.status)}</td>
      <td class="td-date">${fmtDateShort(a.date)}</td>
    </tr>`).join('');

  attachRowClickHandlers(tbody);
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

let filteredApps = [];

function renderPipeline() {
  applyFiltersAndRender();

  // Footer
  const footer = document.getElementById('pipeline-footer');
  if (footer) footer.style.display = 'flex';
}

function applyFiltersAndRender() {
  const search = (document.getElementById('pipeline-search')?.value || '').toLowerCase().trim();
  const status = document.getElementById('status-filter')?.value || '';
  const scoreMin = parseFloat(document.getElementById('score-filter')?.value || '0') || 0;
  const sort = document.getElementById('sort-select')?.value || 'date-desc';

  let apps = [...allApplications];

  // Search
  if (search) {
    apps = apps.filter((a) =>
      a.company.toLowerCase().includes(search) ||
      a.role.toLowerCase().includes(search) ||
      (a.notes || '').toLowerCase().includes(search)
    );
  }

  // Status
  if (status) {
    apps = apps.filter((a) => a.status === status);
  }

  // Score
  if (scoreMin > 0) {
    apps = apps.filter((a) => a.score >= scoreMin);
  }

  // Sort
  apps.sort((a, b) => {
    switch (sort) {
      case 'date-desc': return (b.date || '').localeCompare(a.date || '');
      case 'date-asc':  return (a.date || '').localeCompare(b.date || '');
      case 'score-desc': return b.score - a.score;
      case 'score-asc':  return a.score - b.score;
      case 'company':   return a.company.localeCompare(b.company);
      case 'status':    return a.status.localeCompare(b.status);
      default: return 0;
    }
  });

  filteredApps = apps;

  // Result count
  const countEl = document.getElementById('result-count');
  if (countEl) countEl.textContent = `${apps.length} job${apps.length !== 1 ? 's' : ''}`;

  renderPipelineTable(apps);

  // Footer text
  const withReport = apps.filter((a) => a.reportPath).length;
  setText('pipeline-count-text', `${apps.length} application${apps.length !== 1 ? 's' : ''}`);
  setText('pipeline-has-report-text', `${withReport} with report`);
}

function renderPipelineTable(apps) {
  const tbody = document.getElementById('pipeline-tbody');
  if (!tbody) return;

  if (apps.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7">
      <div class="pipeline-empty">
        <div class="pipeline-empty-icon">🔍</div>
        <div class="pipeline-empty-text">No applications match your filters.</div>
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = apps.map((a) => `
    <tr data-report-path="${esc(a.reportPath || '')}"
        data-company="${esc(a.company)}"
        data-role="${esc(a.role)}"
        data-status="${esc(a.status)}"
        data-score-raw="${esc(a.scoreRaw)}"
        tabindex="0" role="button" aria-label="Open ${esc(a.company)} evaluation report">
      <td class="td-date">${esc(a.number)}</td>
      <td class="td-date">${fmtDateShort(a.date)}</td>
      <td class="td-company">${esc(a.company)}</td>
      <td class="td-role">${esc(a.role)}</td>
      <td>${scorePillHtml(a)}</td>
      <td>${badgeHtml(a.status)}</td>
      <td class="td-pdf">${pdfHtml(a.hasPDF)}</td>
    </tr>`).join('');

  attachRowClickHandlers(tbody);
}

// Wire up filter controls
['pipeline-search', 'status-filter', 'score-filter', 'sort-select'].forEach((id) => {
  document.getElementById(id)?.addEventListener('input', applyFiltersAndRender);
  document.getElementById(id)?.addEventListener('change', applyFiltersAndRender);
});

// ─── Row click → Report panel ─────────────────────────────────────────────────

function attachRowClickHandlers(tbody) {
  tbody.querySelectorAll('tr[data-report-path], tr[data-app]').forEach((row) => {
    const open = () => openReport(row);
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
}

function openReport(row) {
  const overlay = document.getElementById('modal-overlay');
  const panel   = document.getElementById('report-panel');

  // Extract data
  let company, role, status, scoreRaw, reportPath;

  if (row.dataset.app) {
    // Recent table row (inline JSON)
    try {
      const d = JSON.parse(row.dataset.app);
      company    = d.company;
      role       = d.role;
      status     = d.status;
      scoreRaw   = d.scoreRaw;
      reportPath = d.reportPath;
    } catch (_) {}
  } else {
    company    = row.dataset.company;
    role       = row.dataset.role;
    status     = row.dataset.status;
    scoreRaw   = row.dataset.scoreRaw;
    reportPath = row.dataset.reportPath;
  }

  // Header
  document.getElementById('report-company').textContent = company || '—';
  document.getElementById('report-role').textContent    = role || '';
  const metaEl = document.getElementById('report-meta');
  if (metaEl) {
    metaEl.innerHTML = [
      status   ? badgeHtml(status) : '',
      scoreRaw ? `<span class="score-pill ${scoreClass(parseFloat(scoreRaw))}">${esc(scoreRaw)}</span>` : '',
    ].filter(Boolean).join('');
  }

  // Show overlay
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  panel.focus();

  // Fetch and render report
  const bodyEl = document.getElementById('report-body');
  if (!reportPath) {
    bodyEl.innerHTML = `
      <div class="report-no-path">
        <div class="report-no-path-icon">📄</div>
        <div class="report-no-path-text">
          No evaluation report file linked for this application.
        </div>
      </div>`;
    return;
  }

  bodyEl.innerHTML = '<div class="report-loading">Loading evaluation report…</div>';

  fetch(`/api/report?path=${encodeURIComponent(reportPath)}`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(({ content }) => {
      const html = typeof marked !== 'undefined'
        ? marked.parse(content)
        : `<pre>${esc(content)}</pre>`;
      bodyEl.innerHTML = `<div class="markdown-body">${html}</div>`;
    })
    .catch((err) => {
      bodyEl.innerHTML = `
        <div class="report-no-path">
          <div class="report-no-path-icon">⚠️</div>
          <div class="report-no-path-text">Could not load report: ${esc(err.message)}</div>
        </div>`;
    });
}

function closeReport() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

document.getElementById('close-report')?.addEventListener('click', closeReport);

document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
  // Close when clicking the backdrop (not the panel itself)
  if (e.target === e.currentTarget) closeReport();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeReport();
});

// ─── Pending URLs ─────────────────────────────────────────────────────────────

async function loadPendingURLs() {
  pendingLoaded = true;
  const container = document.getElementById('pending-content');
  if (!container) return;

  try {
    const data = await fetchJSON('/api/pipeline');
    const urls = data.urls || [];

    if (urls.length === 0) {
      container.innerHTML = `
        <div class="pipeline-urls">
          <div class="pipeline-empty">
            <div class="pipeline-empty-icon">✅</div>
            <div class="pipeline-empty-text">
              ${data.demo
                ? 'No pipeline.md found. Run <code>npm run scan</code> to populate it.'
                : 'Pipeline is empty — all URLs have been evaluated!'}
            </div>
          </div>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="pipeline-header">
        <span style="font-size:14px;color:var(--text-3)">${urls.length} pending URL${urls.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="pipeline-urls">
        ${urls.map((url, i) => `
          <div class="pipeline-url-row">
            <div class="pipeline-url-num">${i + 1}</div>
            <a href="${esc(url)}" class="pipeline-url-link" target="_blank"
               rel="noopener noreferrer" title="${esc(url)}">${esc(url)}</a>
          </div>`).join('')}
      </div>`;
  } catch (err) {
    container.innerHTML = `
      <div class="pipeline-empty">
        <div class="pipeline-empty-icon">⚠️</div>
        <div class="pipeline-empty-text">Failed to load pipeline: ${esc(err.message)}</div>
      </div>`;
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

loadAll();
