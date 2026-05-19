#!/usr/bin/env node
/**
 * scripts/mcp-servers/dashboard-mcp.mjs
 *
 * MCP server that wraps Playwright to drive dashboard.careers-ops.com.
 * Authenticates via Cloudflare Access service token so no interactive login
 * is needed — suitable for headless council/agent use.
 *
 * Auth: CF-Access-Client-Id + CF-Access-Client-Secret headers on every request.
 *
 * Tools exposed:
 *   dashboard_navigate        navigate to a dashboard path
 *   dashboard_render_widget   return HTML + computed CSS for an element
 *   dashboard_click_drill_in  click a trigger and return resulting popout HTML
 *   dashboard_read_popout     read the currently-open popout DOM
 *   dashboard_screenshot      capture screenshot (scoped or full page, ≤2000px)
 *   dashboard_list_widgets    enumerate all widgets on the current page
 *   dashboard_api_fetch       proxy fetch to dashboard API with service-token auth
 *
 * Usage (stdio MCP):
 *   node scripts/mcp-servers/dashboard-mcp.mjs
 *
 * Required env vars (in .env or environment):
 *   DASHBOARD_MCP_SERVICE_TOKEN_ID      CF-Access-Client-Id value
 *   DASHBOARD_MCP_SERVICE_TOKEN_SECRET  CF-Access-Client-Secret value
 *   DASHBOARD_URL                       optional, defaults to https://dashboard.careers-ops.com
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { chromium } from 'playwright';
import { createRequire } from 'module';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env
try {
  const require = createRequire(import.meta.url);
  const dotenv = require('dotenv');
  dotenv.config({ path: join(__dirname, '../../.env'), override: false });
} catch {}

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://dashboard.careers-ops.com';
const CF_CLIENT_ID     = process.env.DASHBOARD_MCP_SERVICE_TOKEN_ID;
const CF_CLIENT_SECRET = process.env.DASHBOARD_MCP_SERVICE_TOKEN_SECRET;

if (!CF_CLIENT_ID || !CF_CLIENT_SECRET) {
  process.stderr.write('ERROR: DASHBOARD_MCP_SERVICE_TOKEN_ID and DASHBOARD_MCP_SERVICE_TOKEN_SECRET must be set in .env\n');
  process.exit(1);
}

// ── Playwright state (lazy-initialised on first tool call) ─────────────────
let _browser = null;
let _page = null;

async function getPage() {
  if (_page && !_page.isClosed()) return _page;
  _browser = await chromium.launch({ headless: true });
  const ctx = await _browser.newContext({
    extraHTTPHeaders: {
      'CF-Access-Client-Id':     CF_CLIENT_ID,
      'CF-Access-Client-Secret': CF_CLIENT_SECRET,
    },
    viewport: { width: 1440, height: 900 },
  });
  _page = await ctx.newPage();
  // Navigate to dashboard root to initialise the session
  await _page.goto(DASHBOARD_URL, { waitUntil: 'networkidle', timeout: 30_000 });
  return _page;
}

async function cleanup() {
  if (_browser) { await _browser.close().catch(() => {}); _browser = null; _page = null; }
}
process.on('exit', cleanup);
process.on('SIGTERM', cleanup);
process.on('SIGINT',  cleanup);

// ── Helpers ────────────────────────────────────────────────────────────────

function clampDim(n, max = 1999) { return Math.min(n, max); }

async function captureScreenshot(page, selector, fullPage) {
  const buf = selector
    ? await page.locator(selector).first().screenshot({ type: 'jpeg', quality: 85 })
    : await page.screenshot({ type: 'jpeg', quality: 85, fullPage: !!fullPage });
  return buf.toString('base64');
}

// ── MCP Server ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name:    'dashboard-mcp',
  version: '1.0.0',
});

// ── Tool: dashboard_navigate ───────────────────────────────────────────────
server.tool(
  'dashboard_navigate',
  'Navigate to a dashboard URL path. path should be a path like "/" or "/reports/042-anthropic-2026-05-18.md". ' +
  'Returns the page title and current URL after navigation.',
  {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'URL path to navigate to (e.g. "/" or "/stories/comms-triage-agent.html")' },
    },
    required: ['path'],
  },
  async ({ path }) => {
    const page = await getPage();
    const url = DASHBOARD_URL.replace(/\/$/, '') + (path.startsWith('/') ? path : '/' + path);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForTimeout(800); // let JS settle
    const title = await page.title();
    return { content: [{ type: 'text', text: `Navigated to: ${url}\nTitle: ${title}` }] };
  }
);

// ── Tool: dashboard_render_widget ──────────────────────────────────────────
server.tool(
  'dashboard_render_widget',
  'Return the rendered inner HTML and key computed CSS properties for a widget. ' +
  'Use a CSS selector or widget ID (e.g. "#sidebar-batch" or ".runway-widget").',
  {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector identifying the widget' },
    },
    required: ['selector'],
  },
  async ({ selector }) => {
    const page = await getPage();
    const result = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      return {
        innerHTML: el.innerHTML.slice(0, 8000),
        display:   cs.display,
        visibility: cs.visibility,
        width:     cs.width,
        height:    cs.height,
        overflow:  cs.overflow,
        rect:      el.getBoundingClientRect().toJSON(),
      };
    }, selector);

    if (!result) {
      return { content: [{ type: 'text', text: `Element not found: ${selector}` }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: dashboard_click_drill_in ─────────────────────────────────────────
server.tool(
  'dashboard_click_drill_in',
  'Click an element (by CSS selector or visible text) and return the resulting popout/modal content. ' +
  'Useful for opening drawer rows, modals, and drill-ins.',
  {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'CSS selector or exact visible text of the element to click' },
    },
    required: ['target'],
  },
  async ({ target }) => {
    const page = await getPage();
    try {
      // Try selector first, then text match
      const el = page.locator(target).first();
      const elByText = page.getByText(target, { exact: true }).first();
      const locator = await el.count() > 0 ? el : elByText;
      await locator.click({ timeout: 5_000 });
      await page.waitForTimeout(600);
    } catch {
      return { content: [{ type: 'text', text: `Could not click: ${target}` }], isError: true };
    }
    // Read any newly-visible modal/popout
    const popout = await page.evaluate(() => {
      const candidates = [
        document.querySelector('[role="dialog"]:not([hidden])'),
        document.querySelector('.modal.visible, .drawer.open, .popout.visible'),
        document.querySelector('[data-popout], [data-drawer]'),
      ].filter(Boolean);
      return candidates[0]?.innerHTML?.slice(0, 6000) || null;
    });
    return {
      content: [{
        type: 'text',
        text: popout
          ? `Popout content after clicking "${target}":\n\n${popout}`
          : `Clicked "${target}" — no visible popout/modal found. Try dashboard_render_widget to inspect page state.`,
      }],
    };
  }
);

// ── Tool: dashboard_read_popout ────────────────────────────────────────────
server.tool(
  'dashboard_read_popout',
  'Read the DOM tree of the currently-open popout or modal. ' +
  'Returns structured text of visible modals, drawers, and popover elements.',
  { type: 'object', properties: {}, required: [] },
  async () => {
    const page = await getPage();
    const result = await page.evaluate(() => {
      const selectors = [
        '[role="dialog"]:not([hidden])',
        '.modal.visible',
        '.drawer.open',
        '[data-popout]',
        '#pipeline-modal.visible',
        '#apply-pack-modal.visible',
        '.drawer-panel.open',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return { selector: sel, html: el.innerHTML.slice(0, 8000) };
      }
      return null;
    });
    if (!result) {
      return { content: [{ type: 'text', text: 'No open popout or modal detected.' }] };
    }
    return { content: [{ type: 'text', text: `Open popout (${result.selector}):\n\n${result.html}` }] };
  }
);

// ── Tool: dashboard_screenshot ─────────────────────────────────────────────
server.tool(
  'dashboard_screenshot',
  'Take a screenshot of the dashboard. Optionally scope to a CSS selector. ' +
  'Always enforces ≤1999px per dimension (Anthropic API limit). ' +
  'Returns base64-encoded JPEG.',
  {
    type: 'object',
    properties: {
      selector:  { type: 'string', description: 'CSS selector to scope screenshot (omit for full page)' },
      full_page: { type: 'boolean', description: 'Capture full scrollable page height (default false)' },
      width:     { type: 'number', description: 'Viewport width (default 1440, max 1999)' },
      height:    { type: 'number', description: 'Viewport height (default 900, max 1999)' },
    },
    required: [],
  },
  async ({ selector, full_page, width = 1440, height = 900 }) => {
    const page = await getPage();
    await page.setViewportSize({
      width:  clampDim(width),
      height: clampDim(height),
    });
    await page.waitForTimeout(300);
    const b64 = await captureScreenshot(page, selector, full_page);
    return {
      content: [{
        type: 'image',
        data: b64,
        mimeType: 'image/jpeg',
      }],
    };
  }
);

// ── Tool: dashboard_list_widgets ───────────────────────────────────────────
server.tool(
  'dashboard_list_widgets',
  'Enumerate every visible widget, panel, and interactive element on the current page. ' +
  'Returns a JSON list of { id, tag, classes, text_preview, rect }.',
  { type: 'object', properties: {}, required: [] },
  async () => {
    const page = await getPage();
    const widgets = await page.evaluate(() => {
      const results = [];
      const seen = new Set();
      // Collect elements with IDs, ARIA roles, or widget classes
      const candidates = document.querySelectorAll(
        '[id], [role="widget"], [role="dialog"], [role="region"], ' +
        '[class*="sidebar"], [class*="widget"], [class*="modal"], [class*="drawer"], ' +
        '[class*="runway"], [class*="batch"], [class*="pipeline"], [class*="panel"]'
      );
      for (const el of candidates) {
        const key = el.id || el.className;
        if (seen.has(key)) continue;
        seen.add(key);
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue; // skip hidden
        results.push({
          id:           el.id || null,
          tag:          el.tagName.toLowerCase(),
          classes:      Array.from(el.classList).join(' '),
          text_preview: el.textContent?.trim().slice(0, 120) || '',
          rect:         { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) },
          aria_role:    el.getAttribute('role') || null,
        });
        if (results.length >= 80) break;
      }
      return results;
    });
    return { content: [{ type: 'text', text: JSON.stringify(widgets, null, 2) }] };
  }
);

// ── Tool: dashboard_api_fetch ──────────────────────────────────────────────
server.tool(
  'dashboard_api_fetch',
  'Fetch a dashboard API endpoint. The service token is automatically attached. ' +
  'endpoint should be a path like "/api/pipeline/preview" or "/api/batch-live".',
  {
    type: 'object',
    properties: {
      endpoint: { type: 'string', description: 'API endpoint path, e.g. "/api/pipeline/preview"' },
      method:   { type: 'string', enum: ['GET', 'POST'], description: 'HTTP method (default GET)' },
      body:     { type: 'object', description: 'Request body for POST requests' },
    },
    required: ['endpoint'],
  },
  async ({ endpoint, method = 'GET', body }) => {
    const url = DASHBOARD_URL.replace(/\/$/, '') + (endpoint.startsWith('/') ? endpoint : '/' + endpoint);
    const init = {
      method,
      headers: {
        'CF-Access-Client-Id':     CF_CLIENT_ID,
        'CF-Access-Client-Secret': CF_CLIENT_SECRET,
        'Content-Type': 'application/json',
      },
    };
    if (body && method === 'POST') init.body = JSON.stringify(body);

    const res = await fetch(url, init);
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }

    return {
      content: [{
        type: 'text',
        text: `${method} ${url}\nStatus: ${res.status}\n\n${
          typeof parsed === 'string' ? parsed.slice(0, 4000) : JSON.stringify(parsed, null, 2).slice(0, 4000)
        }`,
      }],
    };
  }
);

// ── Start server ───────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write(`dashboard-mcp server started (dashboard: ${DASHBOARD_URL})\n`);
