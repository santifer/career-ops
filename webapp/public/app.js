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
let reportFetchController = null;

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

/** PDF cell: "View PDF" button when a PDF exists, dash otherwise. */
function pdfHtml(app) {
  if (!app.hasPDF) return '<span style="color:var(--text-3)">—</span>';
  return `<button class="pdf-btn" type="button"
    data-report-path="${esc(app.reportPath || '')}"
    aria-label="View PDF for ${esc(app.company)}">View PDF</button>`;
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
  // Recent table has 6 columns, pipeline table has 7 — update each separately
  const recentTbody = document.getElementById('recent-tbody');
  if (recentTbody) recentTbody.innerHTML = `<tr><td colspan="6" class="table-empty">
    <div class="pipeline-empty-icon">⚠️</div>
    <div class="pipeline-empty-text">${esc(msg)}</div>
  </td></tr>`;
  const pipelineTbody = document.getElementById('pipeline-tbody');
  if (pipelineTbody) pipelineTbody.innerHTML = `<tr><td colspan="7" class="table-empty">
    <div class="pipeline-empty-icon">⚠️</div>
    <div class="pipeline-empty-text">${esc(msg)}</div>
  </td></tr>`;
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
  const search   = (document.getElementById('pipeline-search')?.value || '').toLowerCase().trim();
  const status   = document.getElementById('status-filter')?.value || '';
  const scoreMin = parseFloat(document.getElementById('score-filter')?.value || '0') || 0;

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

  // Sort — always driven by currentSort state (column clicks or dropdown)
  apps.sort((a, b) => {
    let aVal, bVal;
    switch (currentSort.key) {
      case 'date':    aVal = a.date    || ''; bVal = b.date    || ''; break;
      case 'number':  aVal = a.number;        bVal = b.number;        break;
      case 'company': aVal = a.company;       bVal = b.company;       break;
      case 'role':    aVal = a.role;          bVal = b.role;          break;
      case 'score':   aVal = a.score;         bVal = b.score;         break;
      case 'status':  aVal = a.status;        bVal = b.status;        break;
      default: return 0;
    }
    const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal) : (aVal - bVal);
    return currentSort.dir === 'desc' ? -cmp : cmp;
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
      <td class="td-pdf">${pdfHtml(a)}</td>
    </tr>`).join('');

  attachRowClickHandlers(tbody);
  attachPdfBtnHandlers(tbody);
}

// Wire up filter controls
['pipeline-search', 'status-filter', 'score-filter'].forEach((id) => {
  document.getElementById(id)?.addEventListener('input', applyFiltersAndRender);
  document.getElementById(id)?.addEventListener('change', applyFiltersAndRender);
});

// Sort dropdown — syncs with currentSort
document.getElementById('sort-select')?.addEventListener('change', (e) => {
  currentSort = parseSortDropdown(e.target.value);
  updateSortIcons();
  applyFiltersAndRender();
});

/** Map dropdown value → { key, dir } */
function parseSortDropdown(val) {
  switch (val) {
    case 'date-asc':   return { key: 'date',    dir: 'asc' };
    case 'score-desc': return { key: 'score',   dir: 'desc' };
    case 'score-asc':  return { key: 'score',   dir: 'asc' };
    case 'company':    return { key: 'company', dir: 'asc' };
    case 'status':     return { key: 'status',  dir: 'asc' };
    default:           return { key: 'date',    dir: 'desc' }; // date-desc
  }
}

/** Column header click → toggle sort on that column. */
function handleColumnSort(key) {
  if (currentSort.key === key) {
    currentSort = { key, dir: currentSort.dir === 'desc' ? 'asc' : 'desc' };
  } else {
    currentSort = { key, dir: 'desc' };
  }
  // Sync the dropdown to the nearest equivalent (best-effort)
  const select = document.getElementById('sort-select');
  if (select) {
    const mapping = { 'date-desc': 'date-desc', 'date-asc': 'date-asc',
      'score-desc': 'score-desc', 'score-asc': 'score-asc',
      'company-asc': 'company', 'status-asc': 'status' };
    select.value = mapping[`${currentSort.key}-${currentSort.dir}`] || 'date-desc';
  }
  updateSortIcons();
  applyFiltersAndRender();
}

/** Refresh the ↕/↑/↓ icons on every sortable column header. */
function updateSortIcons() {
  document.querySelectorAll('thead th[data-sort]').forEach((th) => {
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;
    if (th.dataset.sort === currentSort.key) {
      icon.textContent = currentSort.dir === 'desc' ? '↓' : '↑';
    } else {
      icon.textContent = '↕';
    }
  });
}

// Attach column header click handlers once the DOM is ready.
document.querySelectorAll('thead th[data-sort]').forEach((th) => {
  th.style.cursor = 'pointer';
  th.addEventListener('click', () => handleColumnSort(th.dataset.sort));
});

/** PDF button click — stop propagation (don't open report) then open PDF viewer. */
function attachPdfBtnHandlers(tbody) {
  tbody.querySelectorAll('.pdf-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPDF(btn.dataset.reportPath);
    });
  });
}

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

  // Cancel any in-flight report fetch before starting a new one
  if (reportFetchController) reportFetchController.abort();
  reportFetchController = new AbortController();

  fetch(`/api/report?path=${encodeURIComponent(reportPath)}`, {
    signal: reportFetchController.signal,
  })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(({ content }) => {
      let html;
      if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
        // Parse markdown then sanitize — DOMPurify must be present to render HTML
        const raw = marked.parse(content);
        html = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
      } else {
        // DOMPurify unavailable (CDN failure) — fall back to escaped plain text
        // rather than injecting unsanitized HTML into the page.
        if (typeof marked !== 'undefined') {
          console.warn('DOMPurify not loaded; rendering report as plain text for safety');
        }
        html = `<pre>${esc(content)}</pre>`;
      }
      bodyEl.innerHTML = `<div class="markdown-body">${html}</div>`;
    })
    .catch((err) => {
      if (err.name === 'AbortError') return; // Superseded by a newer request — ignore
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

// ─── PDF viewer ───────────────────────────────────────────────────────────────

async function openPDF(reportPath) {
  const overlay  = document.getElementById('pdf-overlay');
  const iframe   = document.getElementById('pdf-iframe');
  const titleEl  = document.getElementById('pdf-panel-title');
  const errorEl  = document.getElementById('pdf-panel-error');
  if (!overlay || !iframe) return;

  // Reset state
  iframe.src = 'about:blank';
  if (errorEl) errorEl.style.display = 'none';
  if (titleEl) titleEl.textContent = 'Loading PDF…';

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('pdf-panel')?.focus();

  if (!reportPath) {
    if (titleEl) titleEl.textContent = 'PDF';
    if (errorEl) {
      errorEl.textContent = 'No report linked — PDF path unavailable.';
      errorEl.style.display = 'block';
    }
    return;
  }

  try {
    const data = await fetchJSON(`/api/pdf-path?report=${encodeURIComponent(reportPath)}`);
    if (data.pdfPath) {
      const filename = data.pdfPath.split('/').pop();
      if (titleEl) titleEl.textContent = filename;
      iframe.src = `/api/pdf?path=${encodeURIComponent(data.pdfPath)}`;
    } else {
      if (titleEl) titleEl.textContent = 'PDF';
      if (errorEl) {
        errorEl.textContent = 'PDF path not found in report. The report may not have a PDF attached yet.';
        errorEl.style.display = 'block';
      }
    }
  } catch (err) {
    if (titleEl) titleEl.textContent = 'PDF';
    if (errorEl) {
      errorEl.textContent = `Could not load PDF: ${esc(err.message)}`;
      errorEl.style.display = 'block';
    }
  }
}

function closePDF() {
  const overlay = document.getElementById('pdf-overlay');
  if (overlay) overlay.classList.remove('open');
  const iframe = document.getElementById('pdf-iframe');
  if (iframe) iframe.src = 'about:blank'; // Stop any in-progress download
  document.body.style.overflow = '';
}

document.getElementById('close-pdf')?.addEventListener('click', closePDF);

document.getElementById('pdf-overlay')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closePDF();
});

// Escape closes whichever overlay is open (report takes priority if both open)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (document.getElementById('pdf-overlay')?.classList.contains('open')) {
      closePDF();
    } else {
      closeReport();
    }
  }
});

// ─── Pending URLs ─────────────────────────────────────────────────────────────

async function loadPendingURLs() {
  // pendingLoaded is set to true only on success so a failed request can be retried
  const container = document.getElementById('pending-content');
  if (!container) return;

  try {
    const data = await fetchJSON('/api/pipeline');
    pendingLoaded = true; // Only mark loaded once the fetch succeeds
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
