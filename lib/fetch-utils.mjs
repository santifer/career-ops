import { readFileSync, existsSync } from 'node:fs';

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

// Shared file-read cache. Module-level so it persists across calls within a session.
const _fileCache = new Map();
export function readCached(filePath) {
  if (!_fileCache.has(filePath)) {
    _fileCache.set(filePath, existsSync(filePath) ? readFileSync(filePath, 'utf8') : null);
  }
  return _fileCache.get(filePath);
}

// Shared HTTP fetch with AbortSignal.timeout — covers both fetch() and body read.
// Returns { ok, status, text, finalUrl, headers } so callers can branch without
// reimplementing the AbortController/timer dance.
export async function fetchWithTimeout(url, opts = {}, timeoutMs = 15_000) {
  const { headers: userHeaders = {}, ...rest } = opts;
  const headers = {
    'User-Agent': DEFAULT_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    ...userHeaders,
  };
  const signal = AbortSignal.timeout(timeoutMs);
  const res = await fetch(url, { ...rest, signal, headers });
  const text = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    text,
    finalUrl: res.url || url,
    headers: res.headers,
    res,
  };
}

// Concurrency pool — items processed with at most `limit` concurrent calls.
// `onBatchDone(batchResults, doneCount, totalCount)` fires after each pool-sized wave.
// Uses Promise.all (not allSettled) so an unhandled rejection short-circuits — callers
// that want fault tolerance should catch inside `fn`.
export async function poolMap(items, fn, limit = 5, onBatchDone = null) {
  const results = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    if (onBatchDone) onBatchDone(batchResults, results.length, items.length);
  }
  return results;
}
