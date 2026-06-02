// career-ops dashboard — vanilla JS, no build

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SELECTED_SOURCES_KEY = 'career-ops-selected-sources';
function loadSelectedSources() {
  try {
    const raw = localStorage.getItem(SELECTED_SOURCES_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}
function saveSelectedSources(set) {
  try { localStorage.setItem(SELECTED_SOURCES_KEY, JSON.stringify([...set])); } catch {}
}

const state = {
  scan: null, pipeline: null, applications: null, portals: null, reports: null,
  selectedSources: loadSelectedSources(),
  appsContent: null,
};

function toast(msg, kind = 'ok') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast ${kind}`;
  setTimeout(() => t.classList.add('hidden'), 3000);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function scoreClass(score) {
  const n = parseFloat(String(score).split('/')[0]);
  if (Number.isNaN(n)) return '';
  if (n >= 3.5) return 'score high';
  if (n >= 2.5) return 'score mid';
  return 'score low';
}

function statusBadge(status) {
  const s = String(status || '').toLowerCase();
  let cls = '';
  if (s === 'applied' || s === 'interview' || s === 'offer' || s === 'responded') cls = 'green';
  else if (s === 'evaluated') cls = 'blue';
  else if (s === 'skip' || s === 'rejected' || s === 'discarded') cls = 'red';
  else if (s === 'added') cls = 'green';
  else if (s.startsWith('skipped')) cls = 'red';
  return `<span class="badge ${cls}">${esc(status)}</span>`;
}

// -------------------------------------------------------------------- Tabs
function switchTab(tab) {
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === `tab-${tab}`));
  if (tab === 'overview') renderOverview();
  if (tab === 'picks') renderPicks();
  if (tab === 'pipeline') renderPipeline();
  if (tab === 'applications') renderApplications();
  if (tab === 'generate') renderGenerate();
  if (tab === 'scans') renderScans();
  if (tab === 'sources') renderSources();
}

$$('#tabs button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

// ------------------------------------------------------------ Data loaders
async function load() {
  try {
    const [scan, pipeline, applications, portals, reports] = await Promise.all([
      api('/api/scan-history'),
      api('/api/pipeline'),
      api('/api/applications'),
      api('/api/portals'),
      api('/api/reports').catch(() => ({})),
    ]);
    state.scan = scan;
    state.pipeline = pipeline;
    state.applications = applications;
    state.portals = portals;
    state.reports = reports;
    renderOverview();
  } catch (e) {
    toast('Erreur chargement: ' + e.message, 'err');
  }
}

// --------------------------------------------------------------- Overview
function renderOverview() {
  if (!state.scan || !state.pipeline || !state.applications || !state.portals) return;
  const trackedCount = state.portals.tracked_companies.length;
  const enabledCount = state.portals.tracked_companies.filter(c => c.enabled !== false).length;
  const added = state.scan.byStatus.added || 0;
  const pending = state.pipeline.pendientes.length;
  const processed = state.pipeline.procesadas.length;
  const apps = state.applications.total;
  const byStatus = state.applications.byStatus;
  const applied = (byStatus['Applied'] || 0) + (byStatus['Interview'] || 0) + (byStatus['Offer'] || 0);
  const cards = [
    { label: 'Sources actives', value: `${enabledCount} / ${trackedCount}`, sub: `${trackedCount - enabledCount} disabled` },
    { label: 'Pipeline pendientes', value: pending, sub: `${processed} procesadas` },
    { label: 'Scans (cumul)', value: state.scan.total, sub: `${added} added • ${state.scan.byStatus.skipped_title || 0} skip_title` },
    { label: 'Applications', value: apps, sub: `${applied} actives` },
  ];
  $('#overview-cards').innerHTML = cards.map(c => `
    <div class="card">
      <div class="label">${esc(c.label)}</div>
      <div class="value">${esc(c.value)}</div>
      <div class="sub">${esc(c.sub)}</div>
    </div>
  `).join('');
  // Top companies
  const top = Object.entries(state.scan.byCompany).sort((a, b) => b[1] - a[1]).slice(0, 15);
  $('#top-companies').innerHTML = `<table><thead><tr><th>Entreprise</th><th>Offres scannées</th></tr></thead><tbody>
    ${top.map(([co, n]) => `<tr><td>${esc(co)}</td><td>${n}</td></tr>`).join('')}
  </tbody></table>`;
}

// ----------------------------------------------------------------- Picks
function locationFor(url) {
  if (!state.scan) return '';
  const row = state.scan.rows.find(r => r.url === url);
  return row ? (row.location || '') : '';
}
function reportPathFor(num) {
  if (!num || !state.reports) return null;
  const padded = String(num).padStart(3, '0');
  return state.reports[padded] ? `/reports/${state.reports[padded]}` : null;
}
function rankBadge(i) {
  return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
}
function renderPicks() {
  if (!state.pipeline) return;
  const minScore = parseFloat($('#picks-min-score').value);
  const q = $('#picks-search').value.toLowerCase();
  const all = state.pipeline.procesadas
    .filter(p => p.score)
    .map(p => ({ ...p, scoreNum: parseFloat(String(p.score).split('/')[0]) }))
    .filter(p => !Number.isNaN(p.scoreNum));
  let picks = all
    .filter(p => p.scoreNum >= minScore)
    .filter(p => !q || `${p.company} ${p.title}`.toLowerCase().includes(q))
    .sort((a, b) => b.scoreNum - a.scoreNum);
  $('#picks-count').textContent = `${picks.length} pick(s) • ${all.filter(p => p.scoreNum >= 3.4).length} top-tier global`;
  if (!picks.length) {
    $('#picks-grid').innerHTML = `<div class="muted" style="padding:24px">— aucun pick au seuil ${minScore} —</div>`;
    return;
  }
  $('#picks-grid').innerHTML = picks.map((p, i) => {
    const reportPath = reportPathFor(p.num);
    const loc = locationFor(p.url);
    return `<div class="card pick-card">
      <div class="pick-head">
        <div class="pick-rank">${rankBadge(i)}</div>
        <div class="pick-score ${scoreClass(p.score)}">${esc(p.score)}</div>
        ${p.num ? `<div class="muted small">#${esc(p.num)}</div>` : ''}
      </div>
      <div class="pick-body">
        <div class="pick-company"><strong>${esc(p.company)}</strong></div>
        <div class="pick-role">${esc(p.title)}</div>
        ${loc ? `<div class="muted small">📍 ${esc(loc)}</div>` : ''}
        <div class="pick-actions">
          ${reportPath ? `<a href="${reportPath}" target="_blank" class="primary-link">📄 Rapport complet</a>` : '<span class="muted small">report introuvable</span>'}
          <a href="${esc(p.url)}" target="_blank">🔗 Offre originale</a>
          <span class="muted small">PDF: ${esc(p.pdf)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}
$('#picks-min-score').addEventListener('change', renderPicks);
$('#picks-search').addEventListener('input', renderPicks);

// --------------------------------------------------------------- Pipeline
function renderPipeline() {
  if (!state.pipeline) return;
  const q = $('#pipeline-search').value.toLowerCase();
  const filt = (items) => items.filter(it =>
    !q || it.title.toLowerCase().includes(q) || it.company.toLowerCase().includes(q) || it.url.toLowerCase().includes(q));
  const pending = filt(state.pipeline.pendientes);
  const done = filt(state.pipeline.procesadas);
  $('#pending-count').textContent = pending.length;
  $('#done-count').textContent = done.length;
  $('#pending-table').innerHTML = renderPipelineTable(pending);
  $('#done-table').innerHTML = renderPipelineTable(done);
}
function renderPipelineTable(items) {
  if (!items.length) return `<div class="muted small">— aucune entrée —</div>`;
  return `<table><thead><tr><th>Entreprise</th><th>Titre</th><th>URL</th></tr></thead><tbody>
    ${items.map(it => `<tr>
      <td>${esc(it.company)}</td>
      <td>${esc(it.title)}</td>
      <td><a href="${esc(it.url)}" target="_blank" class="url">${esc(it.url)}</a></td>
    </tr>`).join('')}
  </tbody></table>`;
}
$('#pipeline-search').addEventListener('input', renderPipeline);

// -------------------------------------------------------------- Applications
function renderApplications() {
  if (!state.applications) return;
  // Populate status filter once
  const sel = $('#app-status-filter');
  if (sel.options.length === 1) {
    const statuses = Array.from(new Set(state.applications.rows.map(r => r.status))).filter(Boolean).sort();
    for (const s of statuses) sel.add(new Option(s, s));
  }
  const q = $('#app-search').value.toLowerCase();
  const sFilter = $('#app-status-filter').value;
  const minScore = parseFloat($('#app-min-score').value);
  let rows = state.applications.rows;
  if (q) rows = rows.filter(r => `${r.company} ${r.role} ${r.notes}`.toLowerCase().includes(q));
  if (sFilter) rows = rows.filter(r => r.status === sFilter);
  if (!Number.isNaN(minScore)) {
    rows = rows.filter(r => {
      const n = parseFloat(String(r.score).split('/')[0]);
      return !Number.isNaN(n) && n >= minScore;
    });
  }
  // Sort: most recent first
  rows = [...rows].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  $('#app-table').innerHTML = `<table><thead><tr>
      <th>#</th><th>Date</th><th>Entreprise</th><th>Rôle</th><th>Score</th><th>Statut</th><th>PDF</th><th>Rapport</th><th>Notes</th>
    </tr></thead><tbody>
    ${rows.map(r => `<tr>
      <td>${esc(r.num)}</td>
      <td>${esc(r.date)}</td>
      <td>${esc(r.company)}</td>
      <td>${esc(r.role)}</td>
      <td><span class="${scoreClass(r.score)}">${esc(r.score)}</span></td>
      <td>${statusBadge(r.status)}</td>
      <td>${esc(r.pdf)}</td>
      <td>${parseMdLink(r.report)}</td>
      <td>${esc(r.notes)}</td>
    </tr>`).join('')}
  </tbody></table>`;
}
function parseMdLink(s) {
  const m = String(s || '').match(/\[(.+?)\]\((.+?)\)/);
  if (!m) return esc(s);
  return `<a href="/${esc(m[2])}" target="_blank">${esc(m[1])}</a>`;
}
$('#app-search').addEventListener('input', renderApplications);
$('#app-status-filter').addEventListener('change', renderApplications);
$('#app-min-score').addEventListener('change', renderApplications);

// ----------------------------------------------------------------- Scans
function renderScans() {
  if (!state.scan) return;
  const statusSel = $('#scan-status-filter');
  if (statusSel.options.length === 1) {
    for (const s of Object.keys(state.scan.byStatus).sort()) statusSel.add(new Option(`${s} (${state.scan.byStatus[s]})`, s));
  }
  const portalSel = $('#scan-portal-filter');
  if (portalSel.options.length === 1) {
    const portals = Array.from(new Set(state.scan.rows.map(r => r.portal))).filter(Boolean).sort();
    for (const p of portals) portalSel.add(new Option(p, p));
  }
  const q = $('#scan-search').value.toLowerCase();
  const sFilter = $('#scan-status-filter').value;
  const pFilter = $('#scan-portal-filter').value;
  let rows = state.scan.rows;
  if (q) rows = rows.filter(r => `${r.title} ${r.company} ${r.location}`.toLowerCase().includes(q));
  if (sFilter) rows = rows.filter(r => r.status === sFilter);
  if (pFilter) rows = rows.filter(r => r.portal === pFilter);
  // Most recent first
  rows = [...rows].sort((a, b) => (b.first_seen || '').localeCompare(a.first_seen || ''));
  $('#scan-summary').textContent = `${rows.length} / ${state.scan.total} entrées`;
  const limited = rows.slice(0, 500);
  $('#scan-table').innerHTML = `<table><thead><tr>
      <th>Date</th><th>Entreprise</th><th>Titre</th><th>Location</th><th>Portail</th><th>Statut</th><th>URL</th>
    </tr></thead><tbody>
    ${limited.map(r => `<tr>
      <td>${esc(r.first_seen)}</td>
      <td>${esc(r.company)}</td>
      <td>${esc(r.title)}</td>
      <td class="muted small">${esc(r.location)}</td>
      <td class="muted small">${esc(r.portal)}</td>
      <td>${statusBadge(r.status)}</td>
      <td><a href="${esc(r.url)}" target="_blank" class="url">${esc(r.url).slice(0, 50)}…</a></td>
    </tr>`).join('')}
  </tbody></table>${rows.length > 500 ? `<div class="muted small" style="margin-top:8px">Affichage limité aux 500 premières. Affine les filtres pour voir le reste.</div>` : ''}`;
}
$('#scan-search').addEventListener('input', renderScans);
$('#scan-status-filter').addEventListener('change', renderScans);
$('#scan-portal-filter').addEventListener('change', renderScans);

// ----------------------------------------------------------------- Sources
function renderSources() {
  if (!state.portals) return;
  const q = $('#src-search').value.toLowerCase();
  const stateFilter = $('#src-state-filter').value;
  let rows = state.portals.tracked_companies;
  if (q) rows = rows.filter(c => `${c.name} ${c.notes || ''}`.toLowerCase().includes(q));
  if (stateFilter === 'enabled') rows = rows.filter(c => c.enabled !== false);
  if (stateFilter === 'disabled') rows = rows.filter(c => c.enabled === false);
  rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  // Prune selections that no longer exist (renamed/deleted sources)
  const validNames = new Set(state.portals.tracked_companies.map(c => c.name));
  let pruned = false;
  for (const n of [...state.selectedSources]) {
    if (!validNames.has(n)) { state.selectedSources.delete(n); pruned = true; }
  }
  if (pruned) saveSelectedSources(state.selectedSources);

  const allVisibleSelected = rows.length > 0 && rows.every(c => state.selectedSources.has(c.name));
  $('#src-table').innerHTML = `<table><thead><tr>
      <th><input type="checkbox" id="src-check-all" ${allVisibleSelected ? 'checked' : ''} title="Tout sélectionner (visibles)" /></th>
      <th>Nom</th><th>careers_url</th><th>API / méthode</th><th>Notes</th><th>État</th><th></th>
    </tr></thead><tbody>
    ${rows.map(c => `<tr>
      <td><input type="checkbox" class="src-check" data-name="${esc(c.name)}" ${state.selectedSources.has(c.name) ? 'checked' : ''} ${c.enabled === false ? 'disabled title="source disabled"' : ''} /></td>
      <td><strong>${esc(c.name)}</strong></td>
      <td><a href="${esc(c.careers_url || '#')}" target="_blank" class="url">${esc(c.careers_url || '—').slice(0, 60)}${(c.careers_url || '').length > 60 ? '…' : ''}</a></td>
      <td class="muted small">${esc(c.api || c.scan_method || '—')}</td>
      <td class="muted small">${esc(c.notes || '')}</td>
      <td>${c.enabled === false ? '<span class="badge red">disabled</span>' : '<span class="badge green">enabled</span>'}</td>
      <td class="actions">
        <button data-act="toggle" data-name="${esc(c.name)}">${c.enabled === false ? 'Activer' : 'Désactiver'}</button>
        <button data-act="edit" data-name="${esc(c.name)}">Éditer</button>
        <button class="danger" data-act="del" data-name="${esc(c.name)}">×</button>
      </td>
    </tr>`).join('')}
  </tbody></table>`;
  $$('#src-table button').forEach(b => b.addEventListener('click', onSourceAction));
  $$('#src-table .src-check').forEach(cb => cb.addEventListener('change', onSourceCheck));
  const checkAll = $('#src-check-all');
  if (checkAll) checkAll.addEventListener('change', () => {
    for (const c of rows) {
      if (c.enabled === false) continue;
      if (checkAll.checked) state.selectedSources.add(c.name);
      else state.selectedSources.delete(c.name);
    }
    saveSelectedSources(state.selectedSources);
    renderSources();
  });
  updateSelectionUi();
  renderFiltersReadonly();
}

function onSourceCheck(e) {
  const name = e.currentTarget.dataset.name;
  if (e.currentTarget.checked) state.selectedSources.add(name);
  else state.selectedSources.delete(name);
  saveSelectedSources(state.selectedSources);
  updateSelectionUi();
  // Refresh the "check-all" header state without rebuilding the table
  const checkAll = $('#src-check-all');
  if (checkAll) {
    const boxes = $$('#src-table .src-check').filter(b => !b.disabled);
    checkAll.checked = boxes.length > 0 && boxes.every(b => b.checked);
  }
}

function updateSelectionUi() {
  const n = state.selectedSources.size;
  const btn = $('#src-scan-selected');
  if (btn) {
    btn.textContent = `▶ Scan sélection (${n})`;
    btn.disabled = n === 0 || scanBtn.disabled;
  }
  const clear = $('#src-clear-selection');
  if (clear) clear.disabled = n === 0;
}
function renderFiltersReadonly() {
  const p = state.portals;
  const block = (title, obj) => `<div class="card"><div class="label">${esc(title)}</div><pre>${esc(JSON.stringify(obj, null, 2))}</pre></div>`;
  $('#filters-readonly').innerHTML = [
    p.location_filter && block('location_filter', p.location_filter),
    p.freshness_filter && block('freshness_filter', p.freshness_filter),
    p.remote_filter && block('remote_filter', p.remote_filter),
    p.title_filter && block('title_filter (extraits)', { positive: (p.title_filter.positive || []).slice(0, 12), negative: (p.title_filter.negative || []).slice(0, 12) }),
  ].filter(Boolean).join('');
}
$('#src-search').addEventListener('input', renderSources);
$('#src-state-filter').addEventListener('change', renderSources);

async function onSourceAction(e) {
  const name = e.currentTarget.dataset.name;
  const act = e.currentTarget.dataset.act;
  try {
    if (act === 'toggle') {
      await api(`/api/portals/companies/${encodeURIComponent(name)}/toggle`, { method: 'PATCH' });
      toast(`${name} basculé`);
    } else if (act === 'del') {
      if (!confirm(`Supprimer "${name}" de tracked_companies ?`)) return;
      await api(`/api/portals/companies/${encodeURIComponent(name)}`, { method: 'DELETE' });
      toast(`${name} supprimé`);
    } else if (act === 'edit') {
      const company = state.portals.tracked_companies.find(c => c.name === name);
      openModal(company);
      return;
    }
    state.portals = await api('/api/portals');
    renderSources();
  } catch (err) {
    toast(err.message, 'err');
  }
}

// --------------------------------------------------------------- Generate CV
const FLAG = { en: '🇬🇧', fr: '🇫🇷' };
async function renderGenerate() {
  const host = $('#gen-list');
  if (!state.appsContent) {
    host.innerHTML = `<div class="muted" style="padding:24px">Chargement…</div>`;
    try { state.appsContent = await api('/api/applications-content'); }
    catch (e) { host.innerHTML = `<div class="muted" style="padding:24px">Erreur: ${esc(e.message)}</div>`; return; }
  }
  const items = state.appsContent.items || [];
  if (!items.length) {
    host.innerHTML = `<div class="muted" style="padding:24px">— aucune candidature rédigée (data/applications-content/*.json) —</div>`;
    return;
  }
  host.innerHTML = items.map(it => {
    const reportLink = it.report ? `<a href="/reports/${esc(it.report)}" target="_blank">rapport</a>` : '';
    return `<div class="card gen-card" data-id="${esc(it.id)}">
      <div class="gen-head">
        <div>
          <strong>${esc(it.company)}</strong> — ${esc(it.role)}
          <div class="muted small">${FLAG[it.lang] || ''} ${esc(it.lang.toUpperCase())} · ${esc(it.paper.toUpperCase())} ${reportLink ? '· ' + reportLink : ''}</div>
        </div>
      </div>
      <div class="gen-opts">
        <label class="radio"><input type="radio" name="pages-${esc(it.id)}" value="1" /> CV 1 page</label>
        <label class="radio"><input type="radio" name="pages-${esc(it.id)}" value="2" checked /> CV 2 pages</label>
        <label class="radio"><input type="radio" name="pages-${esc(it.id)}" value="0" /> sans CV</label>
        <label class="checkbox-inline"><input type="checkbox" class="gen-cover" checked /> + cover letter</label>
        <button class="primary gen-btn" data-id="${esc(it.id)}">Générer PDF</button>
      </div>
      <div class="gen-result muted small" data-id="${esc(it.id)}"></div>
    </div>`;
  }).join('');
  $$('.gen-btn').forEach(b => b.addEventListener('click', onGenerate));
}

async function onGenerate(e) {
  const id = e.currentTarget.dataset.id;
  const card = e.currentTarget.closest('.gen-card');
  const pages = Number(card.querySelector(`input[name="pages-${id}"]:checked`)?.value ?? 2);
  const cover = card.querySelector('.gen-cover').checked;
  const resultEl = card.querySelector('.gen-result');
  if (pages === 0 && !cover) { resultEl.innerHTML = `<span class="badge red">coche au moins CV ou cover</span>`; return; }
  e.currentTarget.disabled = true;
  resultEl.innerHTML = 'génération…';
  try {
    const r = await api('/api/generate-pdf', { method: 'POST', body: { id, pages, cover } });
    if (r.locked) {
      resultEl.innerHTML = `<span class="badge red">⚠ PDF ouvert dans un lecteur — ferme-le et réessaie</span>`;
    } else {
      const links = (r.results || []).filter(x => x.pdf).map(x =>
        `<a href="/output/${esc(x.pdf)}" target="_blank">${esc(x.kind)}${x.pages ? ` (${x.pages}p)` : ''}</a>
         <button class="link-btn gen-open" data-file="${esc(x.pdf)}">ouvrir</button>`).join(' &nbsp;·&nbsp; ');
      resultEl.innerHTML = `<span class="badge green">✓ généré</span> ${links}`;
      card.querySelectorAll('.gen-open').forEach(btn => btn.addEventListener('click', onOpenFile));
    }
  } catch (err) {
    resultEl.innerHTML = `<span class="badge red">${esc(err.message)}</span>`;
  } finally {
    e.currentTarget.disabled = false;
  }
}

async function onOpenFile(e) {
  const file = e.currentTarget.dataset.file;
  try { await api('/api/open-file', { method: 'POST', body: { file } }); toast(`Ouverture de ${file}`); }
  catch (err) { toast(err.message, 'err'); }
}

// ------------------------------------------------------------------ Modal
function openModal(company = null) {
  $('#modal-title').textContent = company ? `Éditer — ${company.name}` : 'Ajouter une source';
  $('#f-original-name').value = company?.name || '';
  $('#f-name').value = company?.name || '';
  $('#f-careers_url').value = company?.careers_url || '';
  $('#f-api').value = company?.api || '';
  $('#f-api_provider').value = company?.api_provider || '';
  $('#f-scan_method').value = company?.scan_method || '';
  $('#f-scan_query').value = company?.scan_query || '';
  $('#f-notes').value = company?.notes || '';
  $('#f-enabled').checked = company ? company.enabled !== false : true;
  $('#modal').classList.remove('hidden');
}
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modal-cancel').addEventListener('click', closeModal);
$('#src-add-btn').addEventListener('click', () => openModal(null));
$('#src-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const original = $('#f-original-name').value;
  const payload = {
    name: $('#f-name').value.trim(),
    careers_url: $('#f-careers_url').value.trim() || undefined,
    api: $('#f-api').value.trim() || undefined,
    api_provider: $('#f-api_provider').value || undefined,
    scan_method: $('#f-scan_method').value || undefined,
    scan_query: $('#f-scan_query').value.trim() || undefined,
    notes: $('#f-notes').value.trim() || undefined,
    enabled: $('#f-enabled').checked,
  };
  try {
    if (original) {
      await api(`/api/portals/companies/${encodeURIComponent(original)}`, { method: 'PUT', body: payload });
      toast(`${payload.name} mis à jour`);
    } else {
      await api('/api/portals/companies', { method: 'POST', body: payload });
      toast(`${payload.name} ajouté`);
    }
    closeModal();
    state.portals = await api('/api/portals');
    renderSources();
  } catch (err) { toast(err.message, 'err'); }
});

// --------------------------------------------------------------- Scan trigger
const scanModal = $('#scan-modal');
const scanLog = $('#scan-log');
const scanBtn = $('#run-scan-btn');
const scanState = $('#scan-state');

$('#scan-modal-close').addEventListener('click', () => scanModal.classList.add('hidden'));

async function checkScanStatus() {
  try {
    const s = await api('/api/scan/status');
    if (s.running) {
      scanBtn.disabled = true;
      scanState.textContent = '(scan en cours dans une autre session)';
    } else {
      scanBtn.disabled = false;
      scanState.textContent = '';
    }
    updateSelectionUi();
  } catch {}
}

function appendLog(line) {
  const div = document.createElement('div');
  let cls = '';
  if (/^\[err\]/.test(line)) cls = 'err';
  else if (/^⚠/.test(line)) cls = 'warn';
  else if (/^\s*\+ /.test(line)) cls = 'new';
  else if (/^Results saved|ready →/.test(line)) cls = 'ok';
  if (cls) div.className = cls;
  div.textContent = line;
  scanLog.appendChild(div);
  scanLog.scrollTop = scanLog.scrollHeight;
}

async function launchScan(companies = []) {
  if (scanBtn.disabled) return;
  scanBtn.disabled = true;
  updateSelectionUi();
  scanState.textContent = 'lancement…';
  scanLog.innerHTML = '';
  const title = companies.length
    ? `Scan en cours… (${companies.length} source${companies.length > 1 ? 's' : ''})`
    : 'Scan en cours…';
  $('#scan-modal-title').textContent = title;
  scanModal.classList.remove('hidden');

  let res;
  try {
    res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companies }),
    });
  } catch (e) {
    appendLog(`[fatal] ${e.message}`);
    scanBtn.disabled = false; scanState.textContent = ''; updateSelectionUi();
    return;
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    appendLog(`[err] ${msg}`);
    scanBtn.disabled = false; scanState.textContent = ''; updateSelectionUi();
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  scanState.textContent = 'en cours…';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const evt = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      handleSseEvent(evt);
    }
  }
}

function handleSseEvent(raw) {
  const lines = raw.split('\n');
  let event = 'message';
  let dataLines = [];
  for (const l of lines) {
    if (l.startsWith('event: ')) event = l.slice(7);
    else if (l.startsWith('data: ')) dataLines.push(l.slice(6));
  }
  if (dataLines.length === 0) return;
  let data;
  try { data = JSON.parse(dataLines.join('\n')); } catch { data = dataLines.join('\n'); }
  if (event === 'log') {
    appendLog(data);
  } else if (event === 'done') {
    const code = data?.code;
    appendLog(`\n--- scan terminé (exit ${code}) ---`);
    $('#scan-modal-title').textContent = code === 0 ? '✓ Scan terminé' : `✗ Scan échoué (exit ${code})`;
    scanBtn.disabled = false;
    scanState.textContent = '';
    updateSelectionUi();
    if (code === 0) {
      toast('Scan terminé — données rafraîchies');
      load();
    } else {
      toast(`Scan échoué (exit ${code})`, 'err');
    }
  }
}

scanBtn.addEventListener('click', () => launchScan([]));

$('#src-scan-selected').addEventListener('click', () => {
  const companies = [...state.selectedSources];
  if (!companies.length) return;
  launchScan(companies);
});
$('#src-clear-selection').addEventListener('click', () => {
  state.selectedSources.clear();
  saveSelectedSources(state.selectedSources);
  renderSources();
});

checkScanStatus();

// boot
load();
