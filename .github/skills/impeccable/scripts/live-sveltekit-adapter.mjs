/**
 * SvelteKit live-mode adapter.
 *
 * SvelteKit must not be patched through src/app.html. That file is a document
 * template, not framework-owned component chrome. The adapter keeps SvelteKit
 * work limited to mounting a dev-only shadow host from +layout.svelte; the
 * actual live UI remains the shared plain-DOM browser chrome.
 */

import fs from 'node:fs';
import path from 'node:path';

export const SVELTE_LIVE_ROOT_COMPONENT = 'src/lib/impeccable/ImpeccableLiveRoot.svelte';
export const SVELTE_LAYOUT_MARKER_OPEN = '<!-- impeccable-live-svelte-start -->';
export const SVELTE_LAYOUT_MARKER_CLOSE = '<!-- impeccable-live-svelte-end -->';
export const SVELTE_ROOT_IMPORT = "import ImpeccableLiveRoot from '$lib/impeccable/ImpeccableLiveRoot.svelte';";

export function detectSvelteKitProject(cwd = process.cwd(), config = null) {
  const appHtml = findSvelteKitAppHtml(cwd, config);
  if (!appHtml) return null;
  const hasTemplateMarkers = fileIncludes(path.join(cwd, appHtml), '%sveltekit.body%')
    && fileIncludes(path.join(cwd, appHtml), '%sveltekit.head%');
  if (!hasTemplateMarkers) return null;

  const hasSvelteConfig = fs.existsSync(path.join(cwd, 'svelte.config.js'))
    || fs.existsSync(path.join(cwd, 'svelte.config.mjs'))
    || fs.existsSync(path.join(cwd, 'svelte.config.cjs'))
    || fs.existsSync(path.join(cwd, 'svelte.config.ts'));
  const hasKitPackage = packageHasSvelteKit(cwd);
  if (!hasSvelteConfig && !hasKitPackage) return null;

  return {
    appHtml,
    layoutFile: findSvelteKitLayout(cwd),
    rootComponent: SVELTE_LIVE_ROOT_COMPONENT,
  };
}

export function applySvelteKitLiveAdapter({ cwd = process.cwd(), port, config = null } = {}) {
  if (!Number.isFinite(Number(port))) {
    throw new Error('SvelteKit live adapter requires a numeric port');
  }
  const detected = detectSvelteKitProject(cwd, config);
  if (!detected) return null;

  ensureSvelteLiveRootComponent(cwd, Number(port));

  const layoutRel = detected.layoutFile;
  const layoutAbs = path.join(cwd, layoutRel);
  fs.mkdirSync(path.dirname(layoutAbs), { recursive: true });
  const layoutExisted = fs.existsSync(layoutAbs);
  const before = layoutExisted ? fs.readFileSync(layoutAbs, 'utf-8') : defaultSvelteLayout();
  const after = patchSvelteLayout(before);
  fs.writeFileSync(layoutAbs, after, 'utf-8');

  return {
    file: layoutRel,
    adapter: 'sveltekit',
    inserted: after !== before || !layoutExisted,
    appHtmlUntouched: true,
    rootComponent: SVELTE_LIVE_ROOT_COMPONENT,
  };
}

export function removeSvelteKitLiveAdapter({ cwd = process.cwd(), config = null } = {}) {
  const detected = detectSvelteKitProject(cwd, config);
  if (!detected) return null;

  const layoutAbs = path.join(cwd, detected.layoutFile);
  let removed = false;
  if (fs.existsSync(layoutAbs)) {
    const before = fs.readFileSync(layoutAbs, 'utf-8');
    const after = unpatchSvelteLayout(before);
    if (after !== before) {
      fs.writeFileSync(layoutAbs, after, 'utf-8');
      removed = true;
    }
  }

  const rootAbs = path.join(cwd, SVELTE_LIVE_ROOT_COMPONENT);
  if (fs.existsSync(rootAbs)) {
    fs.rmSync(rootAbs, { force: true });
    removed = true;
  }

  pruneEmptyDir(path.dirname(rootAbs), path.join(cwd, 'src'));

  return {
    file: detected.layoutFile,
    adapter: 'sveltekit',
    removed,
    appHtmlUntouched: true,
    rootComponent: SVELTE_LIVE_ROOT_COMPONENT,
  };
}

export function patchSvelteLayout(content) {
  let out = String(content || '');
  if (!out.includes(SVELTE_ROOT_IMPORT)) {
    const scriptMatch = out.match(/<script(?:\s[^>]*)?>/i);
    if (scriptMatch) {
      const insertAt = scriptMatch.index + scriptMatch[0].length;
      out = out.slice(0, insertAt) + '\n  ' + SVELTE_ROOT_IMPORT + out.slice(insertAt);
    } else {
      out = `<script>\n  ${SVELTE_ROOT_IMPORT}\n</script>\n\n` + out;
    }
  }

  if (!out.includes(SVELTE_LAYOUT_MARKER_OPEN)) {
    const block = `${SVELTE_LAYOUT_MARKER_OPEN}\n<ImpeccableLiveRoot />\n${SVELTE_LAYOUT_MARKER_CLOSE}\n`;
    const renderMatch = out.match(/\{@render\s+children(?:\?\.)?\(\)\s*\}/);
    const slotMatch = out.match(/<slot\s*\/?>/);
    const match = renderMatch || slotMatch;
    if (match) {
      out = out.slice(0, match.index) + block + out.slice(match.index);
    } else {
      out = out.replace(/\s*$/, '\n\n' + block);
    }
  }

  return out;
}

export function unpatchSvelteLayout(content) {
  let out = String(content || '');
  const blockRe = new RegExp(
    '([ \\t]*)' + escapeRegExp(SVELTE_LAYOUT_MARKER_OPEN)
    + '\\n<ImpeccableLiveRoot\\s*/>\\n'
    + escapeRegExp(SVELTE_LAYOUT_MARKER_CLOSE)
    + '\\n?',
    'g',
  );
  out = out.replace(blockRe, '$1');
  out = out.replace(new RegExp('^\\s*' + escapeRegExp(SVELTE_ROOT_IMPORT) + '\\s*\\n?', 'gm'), '');
  out = out.replace(/<script>\s*<\/script>\s*\n?/g, '');
  return out.replace(/\n{3,}/g, '\n\n');
}

export function ensureSvelteLiveRootComponent(cwd, port) {
  const file = path.join(cwd, SVELTE_LIVE_ROOT_COMPONENT);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buildSvelteLiveRootComponent(port), 'utf-8');
  return file;
}

export function buildSvelteLiveRootComponent(port) {
  return `<script>
  import { onMount } from 'svelte';

  const LIVE_URL = 'http://localhost:${Number(port)}/live.js';
  const HOST_ID = 'impeccable-live-root';

  onMount(() => {
    let host = document.querySelector('impeccable-live-root#' + HOST_ID) || document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('impeccable-live-root');
      host.id = HOST_ID;
      document.body.appendChild(host);
    }

    host.dataset.impeccableLiveAdapter = 'sveltekit';
    host.style.setProperty('all', 'initial', 'important');
    host.style.setProperty('display', 'block', 'important');
    host.style.setProperty('position', 'fixed', 'important');
    host.style.setProperty('top', '0', 'important');
    host.style.setProperty('left', '0', 'important');
    host.style.setProperty('width', '0', 'important');
    host.style.setProperty('height', '0', 'important');
    host.style.setProperty('overflow', 'visible', 'important');
    host.style.setProperty('z-index', '2147483000', 'important');
    host.style.setProperty('pointer-events', 'none', 'important');

    const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
    if (!root.querySelector('style[data-impeccable-live-reset]')) {
      const reset = document.createElement('style');
      reset.dataset.impeccableLiveReset = 'true';
      reset.textContent = ':host, :host *, * { box-sizing: border-box; }';
      root.appendChild(reset);
    }

    window.__IMPECCABLE_LIVE_ADAPTER__ = 'sveltekit';
    window.__IMPECCABLE_LIVE_UI_ROOT__ = root;
    window.__IMPECCABLE_LIVE_CHROME_MOUNT__ = {
      adapter: 'sveltekit',
      version: 1,
      host,
      root,
    };

    const script = document.createElement('script');
    script.src = LIVE_URL;
    script.async = true;
    script.dataset.impeccableLiveScript = 'true';
    document.head.appendChild(script);

    return () => {
      script.remove();
      if (window.__IMPECCABLE_LIVE_UI_ROOT__ === root) delete window.__IMPECCABLE_LIVE_UI_ROOT__;
      if (window.__IMPECCABLE_LIVE_CHROME_MOUNT__?.root === root) delete window.__IMPECCABLE_LIVE_CHROME_MOUNT__;
      if (window.__IMPECCABLE_LIVE_ADAPTER__ === 'sveltekit') delete window.__IMPECCABLE_LIVE_ADAPTER__;
    };
  });
</script>
`;
}

function findSvelteKitAppHtml(cwd, config) {
  const files = Array.isArray(config?.files) ? config.files : ['src/app.html'];
  for (const rel of files) {
    if (rel.includes('*')) continue;
    const normalized = rel.split(path.sep).join('/');
    if (!normalized.endsWith('app.html')) continue;
    const abs = path.join(cwd, normalized);
    if (fs.existsSync(abs)) return normalized;
  }
  const fallback = 'src/app.html';
  return fs.existsSync(path.join(cwd, fallback)) ? fallback : null;
}

function findSvelteKitLayout(cwd) {
  const candidates = [
    'src/routes/+layout.svelte',
    'src/routes/(app)/+layout.svelte',
  ];
  for (const rel of candidates) {
    if (fs.existsSync(path.join(cwd, rel))) return rel;
  }
  return 'src/routes/+layout.svelte';
}

function defaultSvelteLayout() {
  return `<script>\n  let { children } = $props();\n</script>\n\n{@render children?.()}\n`;
}

function packageHasSvelteKit(cwd) {
  const file = path.join(cwd, 'package.json');
  if (!fs.existsSync(file)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const deps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
      ...(pkg.peerDependencies || {}),
    };
    return Boolean(deps['@sveltejs/kit'] || deps['@sveltejs/vite-plugin-svelte'] || deps.svelte);
  } catch {
    return false;
  }
}

function fileIncludes(file, text) {
  try {
    return fs.readFileSync(file, 'utf-8').includes(text);
  } catch {
    return false;
  }
}

function pruneEmptyDir(dir, stopDir) {
  let current = dir;
  while (current.startsWith(stopDir) && current !== stopDir) {
    try {
      if (fs.readdirSync(current).length > 0) return;
      fs.rmdirSync(current);
      current = path.dirname(current);
    } catch {
      return;
    }
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
