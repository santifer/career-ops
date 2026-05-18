/**
 * careerops overlay — logout + URL-paste modal
 *
 * Injected into ttyd's HTML response by the auth proxy.
 *
 * Triggers:
 *   - "[ + add url ]" button (top-right) opens the URL-paste modal
 *   - "[ ⏻ logout ]" button (top-right) clears the session and goes to /login
 *   - Ctrl/Cmd+E opens the modal (when closed)
 *   - Esc closes the modal (when open)
 *   - Backdrop click closes the modal
 *
 * The Ctrl+E shortcut yields to xterm.js by default (xterm captures most
 * Ctrl+letter combinations for the terminal). To make it work consistently,
 * we capture at the window level with `capture: true` and `preventDefault()`.
 */
(function () {
  'use strict';

  if (window.__careeropsOverlayLoaded) return;
  window.__careeropsOverlayLoaded = true;

  const STYLE_HREF = '/_careerops/overlay.css';
  const ENDPOINT_SCRAPE  = '/api/scrape';
  const ENDPOINT_QUEUE   = '/api/queue-url';
  const ENDPOINT_LOGOUT  = '/api/logout';

  // ── Inject stylesheet ───────────────────────────────────────────
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = STYLE_HREF;
  document.head.appendChild(style);

  // ── Build DOM ──────────────────────────────────────────────────
  const root = document.createElement('div');
  root.id = 'careerops-overlay';
  root.innerHTML = `
    <div class="co-corner">
      <button class="co-btn" id="co-add-url" type="button" title="add a job URL to the pipeline (Ctrl/Cmd+E)">
        <span class="co-glyph">+</span>add url
      </button>
      <button class="co-btn co-btn-danger" id="co-logout" type="button" title="end the session and return to the login page">
        <span class="co-glyph">⏻</span>logout
      </button>
    </div>

    <div class="co-modal" id="co-modal" hidden aria-hidden="true" role="dialog" aria-labelledby="co-modal-title">
      <div class="co-modal-backdrop" id="co-backdrop"></div>
      <div class="co-modal-pane" role="document">
        <header class="co-banner">
          <span class="co-banner-label">~/career-ops/jds</span>
          <span class="co-banner-corner" aria-hidden="true"></span>
          <h2 class="co-modal-title" id="co-modal-title">careerops <strong>scrape-jd</strong></h2>
          <p class="co-modal-sub">
            Paste a job posting URL. The scraper container fetches the JD page (Scrapling — anti-bot fingerprinting handled), writes <code>jds/NNN-{slug}.md</code>, and queues the URL in <code>data/pipeline.md</code>. From a <code>claude</code> session in the project root, run <code>/career-ops pipeline</code> to evaluate.
          </p>
        </header>

        <form class="co-form" id="co-form" autocomplete="off" novalidate>
          <div class="co-field">
            <label class="co-label" for="co-url">&gt; url</label>
            <div class="co-input-wrap">
              <input
                class="co-input"
                id="co-url"
                name="url"
                type="url"
                placeholder="https://www.linkedin.com/jobs/view/..."
                autocomplete="url"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                required
              >
            </div>
          </div>

          <div class="co-actions">
            <button class="co-submit" type="submit" id="co-fetch" data-mode="scrape">
              <span id="co-fetch-label">fetch &amp; queue</span>
            </button>
            <label class="co-hint" style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;">
              <input type="checkbox" id="co-queue-only" style="accent-color:#fab387;">
              queue only (skip scrape)
            </label>
            <span class="co-hint">
              <kbd>↵</kbd>submit · <kbd>esc</kbd>close
            </span>
          </div>

          <div class="co-status" id="co-status" role="status" aria-live="polite"></div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const $       = (id) => document.getElementById(id);
  const $modal  = $('co-modal');
  const $form   = $('co-form');
  const $url    = $('co-url');
  const $status = $('co-status');
  const $fetch  = $('co-fetch');
  const $label  = $('co-fetch-label');
  const $queueOnly = $('co-queue-only');

  // ── Modal open/close ───────────────────────────────────────────
  function openModal() {
    if (!$modal.hidden) return;
    $modal.hidden = false;
    $modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      $modal.classList.add('co-visible');
      $url.focus();
      $url.select();
    });
  }
  function closeModal() {
    if ($modal.hidden) return;
    $modal.classList.remove('co-visible');
    $modal.setAttribute('aria-hidden', 'true');
    setStatus(null);
    setTimeout(() => { $modal.hidden = true; }, 220);
  }
  function setStatus(kind, html) {
    $status.className = 'co-status';
    // force reflow so the shake animation re-fires on consecutive errors
    void $status.offsetWidth;
    if (kind && html != null) {
      $status.classList.add(`co-status-${kind}`, 'co-status-visible');
      $status.innerHTML = html;
    } else {
      $status.innerHTML = '';
    }
  }

  // ── Triggers ───────────────────────────────────────────────────
  $('co-add-url').addEventListener('click', openModal);
  $('co-backdrop').addEventListener('click', closeModal);

  $('co-logout').addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await fetch(ENDPOINT_LOGOUT, { method: 'POST', credentials: 'same-origin' });
    } catch { /* ignore — we redirect anyway */ }
    window.location.href = '/login';
  });

  // Ctrl/Cmd + E to open. Capture at window level since xterm.js otherwise
  // swallows Ctrl-letter keys before they bubble up.
  window.addEventListener('keydown', (e) => {
    const isMod = e.ctrlKey || e.metaKey;
    if (isMod && (e.key === 'e' || e.key === 'E') && $modal.hidden) {
      e.preventDefault();
      e.stopPropagation();
      openModal();
    } else if (e.key === 'Escape' && !$modal.hidden) {
      e.preventDefault();
      e.stopPropagation();
      closeModal();
    }
  }, { capture: true });

  // ── Submit ─────────────────────────────────────────────────────
  $form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if ($fetch.disabled) return;

    const url = $url.value.trim();
    if (!/^https?:\/\//i.test(url)) {
      setStatus('error', 'url must start with <code>http://</code> or <code>https://</code>');
      return;
    }

    const queueOnly = $queueOnly.checked;
    const endpoint = queueOnly ? ENDPOINT_QUEUE : ENDPOINT_SCRAPE;
    const verb = queueOnly ? 'queueing' : 'scraping';

    $fetch.disabled = true;
    $label.textContent = `${verb}…`;
    setStatus('pending', queueOnly
      ? `queueing URL to <code>data/pipeline.md</code>…`
      : `fetching JD via Scrapling sidecar… (LinkedIn pages can take 8-15 s)`);

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ url }),
      });
      const data = await resp.json().catch(() => ({}));

      if (resp.ok && data.ok) {
        $fetch.classList.add('co-submit-success');
        $label.textContent = '✓ done';
        const lines = [];
        if (data.title)    lines.push(`<code>title</code> &nbsp; ${escapeHtml(data.title)}`);
        if (data.company)  lines.push(`<code>company</code> &nbsp; ${escapeHtml(data.company)}`);
        if (data.location) lines.push(`<code>location</code> &nbsp; ${escapeHtml(data.location)}`);
        if (data.path)     lines.push(`<code>wrote</code> &nbsp; ${escapeHtml(data.path)}`);
        if (data.queued)   lines.push(`<code>queued</code> &nbsp; ${escapeHtml(data.queued)}`);
        if (data.chars != null) lines.push(`<code>chars</code> &nbsp; ${data.chars}`);
        setStatus('success', lines.length ? lines.join('<br>') : '✓ ok');

        // Reset for another URL after a beat
        setTimeout(() => {
          $url.value = '';
          $fetch.classList.remove('co-submit-success');
          $fetch.disabled = false;
          $label.textContent = queueOnly ? 'queue another' : 'fetch another';
          $url.focus();
        }, 1500);
      } else {
        const err = data.error || `http_${resp.status}`;
        const detail = data.detail || resp.statusText || '';
        setStatus('error', `<code>${escapeHtml(err)}</code> ${escapeHtml(detail)}`);
        $fetch.disabled = false;
        $label.textContent = 'retry';
      }
    } catch (err) {
      setStatus('error', `<code>network</code> ${escapeHtml(err && err.message || 'request failed')}`);
      $fetch.disabled = false;
      $label.textContent = 'retry';
    }
  });

  // Reset success state when user starts typing again
  $url.addEventListener('input', () => {
    if ($fetch.classList.contains('co-submit-success')) {
      $fetch.classList.remove('co-submit-success');
      $label.textContent = $queueOnly.checked ? 'queue' : 'fetch & queue';
    }
  });
  $queueOnly.addEventListener('change', () => {
    if (!$fetch.disabled) {
      $label.textContent = $queueOnly.checked ? 'queue' : 'fetch & queue';
    }
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }
})();
