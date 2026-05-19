// lib/system-health-cleanup.mjs — Reusable cleanup primitives (REVERSIBLE).
//
// epsilon Ε.8 (2026-05-19). The contract is: every cleanup function ARCHIVES
// (move into a dated directory) rather than deletes. Reversal is always
// `mv` to put the file back. The functions return a log of actions taken.

import { existsSync, mkdirSync, renameSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** YYYY-MM-DD in PT (UTC-7). */
function ptDateStamp(now = new Date()) {
  // Construct PT date by offsetting UTC by 7h. Note: this ignores DST. For
  // career-ops's purposes the day boundary doesn't matter exactly — the
  // archive name is human-readable, not load-bearing.
  const ms = now.getTime() - (7 * 3600 * 1000);
  const pt = new Date(ms);
  return pt.toISOString().slice(0, 10);
}

/** Archive reverse-orphan dashboard HTMLs. Returns { archived: [..filenames..], destDir }. */
export function archiveReverseOrphanHtmls(root, reverseOrphans) {
  const dest = join(root, `data/orphan-dashboard-htmls-${ptDateStamp()}`);
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  const archived = [];
  for (const slug of reverseOrphans) {
    const src = join(root, 'dashboard/reports', `${slug}.html`);
    const dst = join(dest, `${slug}.html`);
    if (existsSync(src) && !existsSync(dst)) {
      renameSync(src, dst);
      archived.push(`${slug}.html`);
    }
  }
  return { archived, destDir: dest };
}

/** Archive orphan apply-pack dirs (no tracker reference). Returns log. */
export function archiveOrphanApplyPacks(root, slugList) {
  const dest = join(root, `data/archived-apply-packs-${ptDateStamp()}`);
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  const archived = [];
  for (const slug of slugList) {
    const src = join(root, 'data/apply-packs', slug);
    const dst = join(dest, slug);
    if (existsSync(src) && !existsSync(dst)) {
      renameSync(src, dst);
      archived.push(slug);
    }
  }
  return { archived, destDir: dest };
}

/** Archive stale HM intel JSON (>N days AND tracker row Discarded). */
export function archiveStaleHmIntel(root, staleEntries, trackerText) {
  const dest = join(root, `data/archived-hm-intel-${ptDateStamp()}`);
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  const archived = [];
  for (const { file } of staleEntries) {
    // Only archive if the corresponding tracker row is marked Discarded.
    // Conservative check: extract slug stem, see if "Discarded" appears
    // within ~200 chars of that slug in tracker text. Imperfect; the
    // overnight charter says NEVER delete personal data — so this stays
    // conservative on purpose.
    const stem = file.replace(/\.json$/, '');
    const stemIdx = trackerText.indexOf(stem);
    if (stemIdx < 0) continue;
    const windowText = trackerText.slice(Math.max(0, stemIdx - 200), stemIdx + 200);
    if (!/Discarded/i.test(windowText)) continue;
    const src = join(root, 'data/hm-intel', file);
    const dst = join(dest, file);
    if (existsSync(src) && !existsSync(dst)) {
      renameSync(src, dst);
      archived.push(file);
    }
  }
  return { archived, destDir: dest };
}

/** Sweep /tmp for old career-ops-leaked files. CAUTION: this deletes, not archives.
 *  /tmp is a tmpfs and the rule per overnight charter is /tmp leaks >24h CAN be removed.
 *  We still log every removal. */
export function sweepTmpLeaks(maxAgeDays = 1) {
  // Conservative implementation: only act on files we can identify as ours.
  // Pattern: starts with apply-pack- / cv-tailor- / dealbreaker- / council-tmp-
  // PLUS mtime older than maxAgeDays.
  const removed = [];
  try {
    const entries = readdirSync('/tmp');
    const cutoff = Date.now() - (maxAgeDays * 86400 * 1000);
    const ourPattern = /^(apply-pack-|cv-tailor-|dealbreaker-|council-tmp-|epsilon-dash-clean\.)/;
    for (const name of entries) {
      if (!ourPattern.test(name)) continue;
      const fp = `/tmp/${name}`;
      try {
        const st = statSync(fp);
        if (st.mtimeMs < cutoff) {
          // We do delete /tmp files (they're transient). Comment to record this is the
          // intentional exception to the "never delete personal data" rule — /tmp is not
          // personal data, it's transient agent scratch.
          const fs = require('node:fs');
          fs.unlinkSync(fp);
          removed.push({ file: name, ageDays: Math.round((Date.now() - st.mtimeMs) / 86400000) });
        }
      } catch { /* skip files we can't stat */ }
    }
  } catch { /* /tmp unreadable */ }
  return { removed };
}
