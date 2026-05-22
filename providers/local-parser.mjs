/**
 * local-parser.mjs — Local executable parser provider for career-ops scanner.
 *
 * Activates when entry.scan_method === 'local_parser' and entry.parser.command
 * + entry.parser.script exist as a local file.
 *
 * Parser contract: print JSON to stdout:
 *   [{ title, url, company?, location? }]
 *   OR { jobs: [...] }
 *   OR { results: [...] }
 *
 * Relative URLs are resolved against entry.careers_url.
 */

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';

function scriptExists(entry) {
  return (
    entry.scan_method === 'local_parser' &&
    entry.parser?.command &&
    entry.parser?.script &&
    existsSync(entry.parser.script)
  );
}

function expandArgs(args, entry) {
  return (args || []).map(a =>
    typeof a === 'string'
      ? a
          .replace('{careers_url}', entry.careers_url || '')
          .replace('{company}', entry.name || '')
      : a,
  );
}

function normalizeUrl(url, base) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

export default {
  id: 'local-parser',

  detect(entry) {
    return scriptExists(entry) ? {} : null;
  },

  async fetch(entry, _ctx) {
    const { command, script, args } = entry.parser;
    const expanded = expandArgs(args, entry);

    const result = spawnSync(command, [script, ...expanded], {
      encoding: 'utf-8',
      timeout: 60_000,
    });

    if (result.status !== 0 || result.error) {
      const msg = result.error?.message || result.stderr?.slice(0, 300) || `exit ${result.status}`;
      throw new Error(`local-parser "${entry.name}": ${msg}`);
    }

    const stdout = result.stdout?.trim();
    if (!stdout) throw new Error(`local-parser "${entry.name}": empty stdout`);

    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new Error(`local-parser "${entry.name}": invalid JSON — ${stdout.slice(0, 100)}`);
    }

    const items = Array.isArray(parsed) ? parsed : (parsed.jobs ?? parsed.results ?? []);

    return items.map(j => ({
      title: j.title || '',
      url: normalizeUrl(j.url, entry.careers_url),
      company: j.company || entry.name,
      location: j.location || '',
    })).filter(j => j.title && j.url);
  },
};
