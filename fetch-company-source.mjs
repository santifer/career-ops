#!/usr/bin/env node

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const SOURCES_DIR = path.resolve('sources/company-api');
const DEFAULT_OUT_DIR = path.resolve('data/company-dumps');

function parseArgs(argv) {
  const args = {
    source: 'startup-map-berlin',
    offset: 0,
    limit: null,
    pages: 1,
    region: null,
    sort: null,
    outDir: DEFAULT_OUT_DIR,
    prefix: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--source') args.source = argv[++i] || args.source;
    else if (arg === '--offset') args.offset = Number(argv[++i] || 0);
    else if (arg === '--limit') args.limit = Number(argv[++i] || 0);
    else if (arg === '--pages') args.pages = Number(argv[++i] || 1);
    else if (arg === '--region') args.region = argv[++i] || null;
    else if (arg === '--sort') args.sort = argv[++i] || null;
    else if (arg === '--out-dir') args.outDir = path.resolve(argv[++i] || DEFAULT_OUT_DIR);
    else if (arg === '--prefix') args.prefix = argv[++i] || null;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node fetch-company-source.mjs --source startup-map-berlin --offset 0 --pages 4
  node fetch-company-source.mjs --source startup-map-berlin --offset 800 --pages 8 --limit 25
`);
}

function loadSourceConfig(sourceId) {
  const filePath = path.join(SOURCES_DIR, `${sourceId}.yml`);
  if (!existsSync(filePath)) throw new Error(`Unknown source: ${sourceId}`);
  return yaml.load(readFileSync(filePath, 'utf-8'));
}

function formatDate() {
  return new Date().toISOString().slice(0, 10);
}

function outputPath(outDir, prefix, index, offset) {
  const n = String(index).padStart(2, '0');
  return path.join(outDir, `${formatDate()}-${prefix}-batch-${n}-offset-${offset}.json`);
}

function interpolate(value, vars) {
  if (Array.isArray(value)) return value.map(item => interpolate(item, vars));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, interpolate(v, vars)]));
  }
  if (typeof value !== 'string') return value;

  if (/^\{[a-z_]+\}$/.test(value)) {
    const key = value.slice(1, -1);
    return vars[key];
  }

  return value.replace(/\{([a-z_]+)\}/g, (_, key) => String(vars[key] ?? ''));
}

async function fetchInBrowser(config, request) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      userAgent: config.browser?.user_agent || 'Mozilla/5.0 (compatible; career-ops)',
    });
    await page.goto(config.boot_url, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(2500);
    const result = await page.evaluate(async ({ url, method, headers, body }) => {
      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(body),
      });
      const text = await response.text();
      return { ok: response.ok, status: response.status, text };
    }, request);

    if (!result.ok) throw new Error(`HTTP ${result.status}: ${result.text.slice(0, 400)}`);
    return JSON.parse(result.text);
  } finally {
    await browser.close();
  }
}

async function fetchInHttp(request) {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(request.body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  return await response.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const config = loadSourceConfig(args.source);
  const limit = args.limit || Number(config.defaults?.limit || 25);
  const region = args.region || config.defaults?.region || '';
  const sort = args.sort || config.defaults?.sort || '';
  const prefix = args.prefix || config.defaults?.prefix || config.id || args.source;
  const fieldsCsv = Array.isArray(config.fields) ? config.fields.join(',') : '';

  if (!args.dryRun) mkdirSync(args.outDir, { recursive: true });

  for (let pageIndex = 0; pageIndex < args.pages; pageIndex++) {
    const offset = args.offset + pageIndex * limit;
    const vars = {
      fields_csv: fieldsCsv,
      limit_num: limit,
      offset_num: offset,
      region,
      sort,
    };
    const request = {
      url: config.api?.url,
      method: config.api?.method || 'POST',
      headers: interpolate(config.headers || {}, vars),
      body: interpolate(config.payload || {}, vars),
    };

    const json = config.transport === 'http'
      ? await fetchInHttp(request)
      : await fetchInBrowser(config, request);

    const items = Array.isArray(json?.items) ? json.items.length : 0;
    const total = Number(json?.total || 0);
    const filePath = outputPath(args.outDir, prefix, pageIndex + 1, offset);

    console.log(`source=${args.source} offset=${offset} items=${items} total=${total}`);
    if (!args.dryRun) {
      writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf-8');
      console.log(`wrote ${filePath}`);
    }
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
