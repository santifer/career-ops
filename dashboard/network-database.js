/**
 * dashboard/network-database.js (ZETA 2026-05-19)
 *
 * Full-page advanced view for the network database. Features the popout
 * doesn't have: bulk select + bulk enrich/email + CSV export + saved
 * searches + degree filter + columns toggle.
 *
 * Backs onto:
 *   GET  /api/network/headline           — counts, totals_by_target, last_run
 *   GET  /api/network/search?q=…&…      — paginated hits
 *   GET  /api/network/person/:id        — full record + 2nd-degree paths
 *   POST /api/network/enrich/:id        — kick off enricher
 *   POST /api/network/find-email/:id    — kick off emailer
 *   POST /api/network/build             — full rebuild
 *   GET  /api/network/export?…           — CSV
 *
 * Saved searches persist client-side in localStorage AND server-side at
 * /api/network/saved-searches (if endpoint exists) — for now localStorage only.
 */

(function () {
  'use strict';

  const STATE = {
    query: '',
    filters: {},
    sort: 'warm_path_strength',
    page: 1,
    pageSize: 50,
    total: 0,
    lastFetchAt: 0,
    selected: new Set(),
    rows: [],
    headline: null,
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function cssSafe(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, '_'); }

  function confBadge(c) {
    const cls = c === 'high' ? 'conf-high' : (c === 'medium' ? 'conf-medium' : 'conf-low');
    return `<span class="conf-badge ${cls}">${esc(c)}</span>`;
  }

  function topEmailFor(p) {
    if (!p) return null;
    if (p.top_email) return p.top_email;
    const profs = (p.emails && p.emails.professional) || [];
    if (!profs.length) return null;
    const order = { high: 3, medium: 2, low: 1 };
    return profs.slice().sort((a, b) => (order[b.confidence] || 0) - (order[a.confidence] || 0))[0];
  }

  function renderRow(p) {
    const sel = STATE.selected.has(p.id);
    const deg = p.degree === 1 ? '1st' : (p.degree === 2 ? '2nd' : esc(String(p.degree || '?')));
    const warm = (p.warm_to_target_companies || []).slice(0, 5).map(w => `<span class="pill" title="${esc(w.evidence || '')}">${esc(w.company_slug)}</span>`).join('');
    const moreWarm = (p.warm_to_target_companies || []).length > 5 ? `<span class="small">+${p.warm_to_target_companies.length - 5}</span>` : '';
    const email = topEmailFor(p);
    const emailCell = email
      ? `<span style="font-family:ui-monospace,monospace;font-size:11.5px">${esc(email.email)}</span>${confBadge(email.confidence || 'low')}`
      : '<span class="small">—</span>';
    const name = `<a href="${esc(p.linkedin_url || '#')}" target="_blank" rel="noopener" data-stop>${esc(p.full_name)}</a>${p.x_url ? ` <a href="${esc(p.x_url)}" target="_blank" rel="noopener" data-stop class="small">𝕏</a>` : ''}`;
    const company = esc(p.current_company || '') + (p.current_role ? `<br><span class="small">${esc(p.current_role)}</span>` : '');
    return `<tr data-id="${esc(p.id)}">
      <td class="checkbox-cell"><input type="checkbox" data-sel="${esc(p.id)}" ${sel ? 'checked' : ''}></td>
      <td>${name}</td>
      <td>${company}</td>
      <td class="small">${deg}</td>
      <td>${warm || '<span class="small">—</span>'} ${moreWarm}</td>
      <td>${emailCell}</td>
      <td class="small">${esc(p.connected_on || '')}</td>
      <td class="actions-cell small">▾</td>
    </tr>`;
  }

  async function fetchHeadline() {
    try {
      const r = await fetch('/api/network/headline');
      if (!r.ok) return null;
      const j = await r.json();
      STATE.headline = j;
      return j;
    } catch (_) { return null; }
  }

  function renderHeadline() {
    const h = STATE.headline;
    const meta = $('#head-meta');
    if (!meta) return;
    if (!h || !h.ok) {
      meta.textContent = 'database not built — POST /api/network/build to build it';
      return;
    }
    const totals = h.headline || {};
    const lastRun = h.last_run ? new Date(h.last_run) : null;
    const lastLabel = lastRun ? `last built ${lastRun.toISOString().slice(0, 10)}` : '';
    meta.textContent = `${totals.total_connections || 0} connections · ${totals.warm_to_apply_now_targets || 0} warm · ${totals.with_verified_or_medium_email || 0} w/ email · ${lastLabel}`;
    // Chips
    const chips = $('#chip-row');
    if (!chips) return;
    const totalsByTarget = h.totals_by_target || {};
    const keys = Object.keys(totalsByTarget).sort((a, b) => (totalsByTarget[b].second || 0) - (totalsByTarget[a].second || 0));
    chips.innerHTML = keys.map(slug => {
      const t = totalsByTarget[slug];
      const active = STATE.filters.target_company === slug;
      return `<button class="chip ${active ? 'active' : ''}" data-chip="${esc(slug)}">${esc(t.display || slug)} <strong>${t.second || 0}</strong> <span class="small">${t.with_email || 0} w/✉</span></button>`;
    }).join('') + ` <button class="chip" data-chip="">all targets</button>`;
  }

  function readUi() {
    STATE.query = ($('#search') && $('#search').value) || '';
    STATE.sort = ($('#sort') && $('#sort').value) || 'warm_path_strength';
    if ($('#flt-has-email').checked) STATE.filters.has_email = 'true'; else delete STATE.filters.has_email;
    if ($('#flt-1st').checked) STATE.filters.degree = 1; else delete STATE.filters.degree;
  }

  async function fetchSearch() {
    readUi();
    const params = new URLSearchParams({
      q: STATE.query,
      page: STATE.page,
      pageSize: STATE.pageSize,
      sort: STATE.sort,
    });
    for (const k in STATE.filters) {
      params.append(`filters[${k}]`, STATE.filters[k]);
    }
    const fetchAt = STATE.lastFetchAt = Date.now();
    const r = await fetch(`/api/network/search?${params}`);
    const j = await r.json();
    if (fetchAt !== STATE.lastFetchAt) return; // outraced
    STATE.rows = j.hits || [];
    STATE.total = j.total || 0;
    render();
  }

  function render() {
    const tbody = $('#tbody');
    if (!tbody) return;
    if (!STATE.rows.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No matches.</td></tr>`;
    } else {
      tbody.innerHTML = STATE.rows.map(renderRow).join('');
    }
    $('#stats').textContent = `${STATE.rows.length} of ${STATE.total} shown (page ${STATE.page})`;
    const pages = Math.max(1, Math.ceil(STATE.total / STATE.pageSize));
    $('#pager').innerHTML = pages > 1
      ? `<button data-page-dir="-1" ${STATE.page <= 1 ? 'disabled' : ''}>‹ Prev</button>
         <span>Page ${STATE.page} of ${pages}</span>
         <button data-page-dir="1" ${STATE.page >= pages ? 'disabled' : ''}>Next ›</button>
         <span class="small">· ${STATE.total} total · ${STATE.selected.size} selected</span>`
      : `<span class="small">${STATE.total} total · ${STATE.selected.size} selected</span>`;
    updateBulkButtons();
  }

  function updateBulkButtons() {
    const has = STATE.selected.size > 0;
    $('#bulk-enrich').disabled = !has;
    $('#bulk-email').disabled = !has;
  }

  // ── Person detail panel ──────────────────────────────────────────────────
  async function openDetail(id) {
    const pane = $('#detail-pane');
    const body = $('#detail-body');
    pane.classList.add('open');
    pane.setAttribute('aria-hidden', 'false');
    body.innerHTML = 'Loading…';
    try {
      const r = await fetch(`/api/network/person/${encodeURIComponent(id)}`);
      const j = await r.json();
      if (!j.ok) { body.textContent = j.error || 'failed'; return; }
      renderDetail(body, j.person);
    } catch (e) { body.textContent = 'Error: ' + e.message; }
  }
  function renderDetail(container, p) {
    const x = esc;
    const emails = (p.emails && p.emails.professional) || [];
    const emailRows = emails.length ? emails.map(e => {
      const dt = e.verified_at ? ` · verified ${x(String(e.verified_at).slice(0, 10))}` : '';
      return `<div style="font-family:ui-monospace,monospace;font-size:12px;margin:2px 0">
        ${x(e.email)}${confBadge(e.confidence || 'low')}
        <span class="small" style="margin-left:6px">${x(e.source || '')}${dt}</span>
      </div>`;
    }).join('') : `<div class="small">no email on file · <button data-find-email="${x(p.id)}">find email</button></div>`;

    const paths = (p._warm_intro_paths || []).map(w => {
      const via = w.intro_path ? `<strong>${x(w.intro_path.via_name || '?')}</strong>` : '';
      const to = w.target_name ? `<a href="${x(w.target_url || '#')}" target="_blank" rel="noopener">${x(w.target_name)}</a>` : x(w.company_slug);
      return `<li>${via} → ${to} <span class="small">(${x(w.target_company_slug)})</span> <span class="small">[${x(w.evidence || '')}]</span></li>`;
    }).join('');
    const pathsHtml = paths ? `<h3 style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-4);margin:12px 0 6px">Warm-intro paths</h3><ul style="margin:0;padding-left:18px">${paths}</ul>` : '';

    const inf = p.inferred || {};
    let infHtml;
    if (inf.current_team || (inf.likely_projects && inf.likely_projects.length) || (inf.drives && inf.drives.length)) {
      const evidenceLinks = (inf.evidence_urls || []).slice(0, 6).map(u => {
        let host = '';
        try { host = new URL(u, window.location.href).hostname; } catch (_) { host = u.slice(0, 30); }
        return `<a href="${x(u)}" target="_blank" rel="noopener" class="small">[${x(host)}]</a>`;
      }).join(' ');
      infHtml = `<div style="margin:12px 0;padding:10px;background:var(--surface-2);border-radius:8px;border:1px solid var(--border)">
        <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-4);margin:0 0 6px">Inferred</h3>
        ${inf.current_team ? `<div><span class="small">team:</span> ${x(inf.current_team)}</div>` : ''}
        ${(inf.likely_projects || []).length ? `<div style="margin-top:4px"><span class="small">projects:</span> ${(inf.likely_projects).map(x).join(', ')}</div>` : ''}
        ${(inf.drives || []).length ? `<div style="margin-top:4px"><span class="small">drives:</span> ${(inf.drives).map(x).join(', ')}</div>` : ''}
        ${evidenceLinks ? `<div style="margin-top:6px;font-size:11px;color:var(--text-4)">sources: ${evidenceLinks}</div>` : ''}
      </div>`;
    } else {
      infHtml = `<div style="margin:12px 0;padding:10px;background:var(--surface-2);border-radius:8px;border:1px dashed var(--border);font-size:12px;color:var(--text-4)">
        No inferred data yet. <button data-enrich="${x(p.id)}">Run enricher</button>
      </div>`;
    }

    const linkRow = []
      .concat(p.linkedin_url ? [`<a href="${x(p.linkedin_url)}" target="_blank" rel="noopener" class="small">LinkedIn ↗</a>`] : [])
      .concat(p.x_url ? [`<a href="${x(p.x_url)}" target="_blank" rel="noopener" class="small">𝕏 ↗</a>`] : [])
      .join(' &nbsp;·&nbsp; ');

    container.innerHTML = `
      <h2 style="margin:0 0 4px;font-size:18px">${x(p.full_name)}</h2>
      <div class="small" style="margin-bottom:8px">${x(p.current_company || '')} ${p.current_role ? '· ' + x(p.current_role) : ''}</div>
      <div style="margin-bottom:14px">${linkRow}</div>
      <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-4);margin:12px 0 6px">Emails</h3>
      ${emailRows}
      ${pathsHtml}
      ${infHtml}
      <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-4);margin:12px 0 6px">Notes</h3>
      <textarea data-notes="${x(p.id)}" placeholder="Notes…" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--surface-2);color:var(--text);font:inherit;min-height:80px">${x(p.notes || '')}</textarea>
      <div style="margin-top:14px;display:flex;gap:8px">
        <button data-find-email="${x(p.id)}">Find email</button>
        <button data-enrich="${x(p.id)}">Run enricher</button>
        <span style="flex:1"></span>
        <span class="small">id: ${x(p.id)}</span>
      </div>
    `;

    container.querySelectorAll('[data-enrich]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Run LLM enricher for this person? (~$0.05 spend)')) return;
        btn.disabled = true;
        try {
          const r = await fetch(`/api/network/enrich/${encodeURIComponent(p.id)}`, { method: 'POST' });
          const j = await r.json();
          alert('enricher started · job ' + (j.jobId || '?'));
        } catch (e) { alert(e.message); }
        btn.disabled = false;
      });
    });
    container.querySelectorAll('[data-find-email]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const r = await fetch(`/api/network/find-email/${encodeURIComponent(p.id)}`, { method: 'POST' });
          const j = await r.json();
          alert('email-finder started · job ' + (j.jobId || '?'));
        } catch (e) { alert(e.message); }
        btn.disabled = false;
      });
    });
    const notes = container.querySelector('[data-notes]');
    if (notes) {
      notes.addEventListener('blur', () => {
        fetch(`/api/network/person/${encodeURIComponent(p.id)}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: notes.value }),
        }).catch(() => {});
      });
    }
  }

  // ── Saved searches (localStorage for tonight; could promote to server later) ──
  function readSaved() {
    try { return JSON.parse(localStorage.getItem('zeta_saved_searches') || '[]'); }
    catch (_) { return []; }
  }
  function writeSaved(arr) {
    localStorage.setItem('zeta_saved_searches', JSON.stringify(arr));
  }
  function openSavedPicker() {
    const saved = readSaved();
    const labelOpts = saved.map((s, i) => `${i + 1}. ${s.name} (${s.query || '—'})`).join('\n');
    const action = prompt(
      `Saved searches:\n${labelOpts || '(none)'}\n\nEnter:\n  • a number to load\n  • "save NAME" to save current\n  • "del N" to delete N\n  • (blank) to cancel`,
      ''
    );
    if (!action) return;
    if (action.startsWith('save ')) {
      const name = action.slice(5).trim();
      if (!name) return alert('name required');
      saved.push({ name, query: STATE.query, filters: { ...STATE.filters }, sort: STATE.sort });
      writeSaved(saved);
      alert('saved');
      return;
    }
    if (action.startsWith('del ')) {
      const n = parseInt(action.slice(4), 10);
      if (isNaN(n) || n < 1 || n > saved.length) return alert('bad index');
      saved.splice(n - 1, 1);
      writeSaved(saved);
      alert('deleted');
      return;
    }
    const idx = parseInt(action, 10);
    if (!isNaN(idx) && idx >= 1 && idx <= saved.length) {
      const s = saved[idx - 1];
      $('#search').value = s.query || '';
      $('#sort').value = s.sort || 'warm_path_strength';
      $('#flt-has-email').checked = s.filters?.has_email === 'true';
      $('#flt-1st').checked = !!s.filters?.degree;
      STATE.filters = { ...(s.filters || {}) };
      STATE.page = 1;
      fetchSearch();
    }
  }

  // ── Bulk actions ────────────────────────────────────────────────────────
  async function bulkAction(kind) {
    const ids = Array.from(STATE.selected);
    if (!ids.length) return;
    if (!confirm(`${kind === 'enrich' ? 'Enrich' : 'Find email for'} ${ids.length} selected? (rate-limited; will queue jobs sequentially)`)) return;
    const endpoint = kind === 'enrich' ? '/api/network/enrich' : '/api/network/find-email';
    let ok = 0, fail = 0;
    for (const id of ids) {
      try {
        await fetch(`${endpoint}/${encodeURIComponent(id)}`, { method: 'POST' });
        ok++;
      } catch (_) { fail++; }
    }
    alert(`Queued ${ok} jobs · ${fail} failed.\nWatch logs in batch/logs/network-${kind === 'enrich' ? 'enrich' : 'email'}-*.log`);
  }

  // ── Events ──────────────────────────────────────────────────────────────
  let debounce = null;
  $('#search').addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { STATE.page = 1; fetchSearch(); }, 200);
  });
  ['sort', 'flt-has-email', 'flt-1st'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { STATE.page = 1; fetchSearch(); });
  });
  $('#chip-row').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-chip]');
    if (!btn) return;
    const slug = btn.getAttribute('data-chip');
    if (slug) STATE.filters.target_company = slug;
    else delete STATE.filters.target_company;
    STATE.page = 1;
    renderHeadline();
    fetchSearch();
  });
  $('#pager').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page-dir]');
    if (!btn || btn.disabled) return;
    STATE.page = Math.max(1, STATE.page + Number(btn.getAttribute('data-page-dir')));
    fetchSearch();
  });
  $('#tbody').addEventListener('click', (e) => {
    if (e.target.closest('[data-stop]')) { e.stopPropagation(); return; }
    const cb = e.target.closest('[data-sel]');
    if (cb) {
      const id = cb.getAttribute('data-sel');
      if (cb.checked) STATE.selected.add(id);
      else STATE.selected.delete(id);
      updateBulkButtons();
      e.stopPropagation();
      return;
    }
    const row = e.target.closest('tr[data-id]');
    if (row) openDetail(row.getAttribute('data-id'));
  });
  $('#select-all').addEventListener('change', (e) => {
    STATE.rows.forEach(p => {
      if (e.target.checked) STATE.selected.add(p.id);
      else STATE.selected.delete(p.id);
    });
    render();
  });
  $('#bulk-enrich').addEventListener('click', () => bulkAction('enrich'));
  $('#bulk-email').addEventListener('click', () => bulkAction('email'));
  $('#export-csv').addEventListener('click', () => {
    readUi();
    const params = new URLSearchParams({ q: STATE.query, sort: STATE.sort });
    for (const k in STATE.filters) params.append(`filters[${k}]`, STATE.filters[k]);
    window.open(`/api/network/export?${params}`, '_blank');
  });
  $('#open-saved').addEventListener('click', openSavedPicker);
  $('#detail-close').addEventListener('click', () => {
    const pane = $('#detail-pane');
    pane.classList.remove('open');
    pane.setAttribute('aria-hidden', 'true');
  });

  // ── Boot ────────────────────────────────────────────────────────────────
  fetchHeadline().then(renderHeadline);
  fetchSearch();
})();
