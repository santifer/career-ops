// Generic Apify provider — runs any Apify actor and maps its dataset items to
// the {title, url, company, location} shape scan.mjs expects. All variation
// (which actor, what input, how to read fields from items) lives in
// portals.yml, not in code.
//
// Usage in portals.yml:
//
//   tracked_companies:
//     - name: "Indeed — VP Engineering (Chicago)"
//       provider: apify
//       actor: misceres/indeed-scraper
//       input:
//         position: "VP of Engineering"
//         location: "Chicago, IL"
//         country: "US"
//         maxItems: 25
//       field_map:
//         title:    [positionName, title]    # array = first non-empty wins
//         url:      url
//         company:  [company, companyName]
//         location: [location, formattedLocation]
//       enabled: true
//
// `field_map` values can be a string (single key), an array of strings (try
// each in order), or a dotted path for nested fields (e.g. "company.name").
// `title` and `url` are required keys; items missing either are dropped.
//
// Optional `description` mapping causes the JD body to be persisted to
// `jds/{slug}-{hash}.md` (with YAML frontmatter for title/company/url/
// scraped/source; `{hash}` is sha1[:10] of the canonical URL so two distinct
// postings sharing the same company+title slug don't collide on one file)
// and the returned record's `url` is replaced with `local:jds/{slug}-{hash}.md`.
// Downstream tools (batch evaluation) read that file directly instead
// of re-fetching the remote URL — eliminates HTTP failures on stale
// job-board links and avoids paying for the same Apify run twice. Original
// remote URL is preserved in the frontmatter and on the returned record as
// `_remote_url`. Add the field like any other:
//
//     field_map:
//       description: [description, descriptionText, descriptionHTML, jobDescription]
//
// If the description field is missing/short for a given item (<50 chars
// after HTML strip), the item falls through to the old behavior — remote
// URL kept, no JD file written.
//
// Optional `defaults` block fills in fields that the actor's output doesn't
// expose at all. Useful for single-tenant sources where every item is from
// the same employer:
//
//     defaults:
//       company: "Mondelez International"
//
// Optional `timeout_ms` overrides the 180s default actor-run timeout. Useful
// for slow scrapers that need a few minutes to walk a large board.
//
// Requires APIFY_TOKEN in the environment. When unset, this entry errors
// cleanly and the rest of the scan continues.

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { hasToken, runActor } from './_apify.mjs';

const JDS_DIR = 'jds';
const MIN_JD_BODY_CHARS = 50;

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// A valid field_map entry is either a single key (`'positionName'`) or an
// ordered list of fallback keys (`['positionName', 'title']`). Any other
// shape (number, object, array containing non-strings) would crash
// `pickField()` with a confusing `path.split is not a function` mid-scan;
// reject those at config-load time with a clear error instead.
export function isFieldSpec(spec) {
  if (typeof spec === 'string') return true;
  if (Array.isArray(spec) && spec.length > 0 && spec.every(s => typeof s === 'string')) return true;
  return false;
}

function pickField(item, spec) {
  const keys = Array.isArray(spec) ? spec : [spec];
  for (const k of keys) {
    const v = getPath(item, k);
    if (v != null && v !== '') return v;
  }
  return '';
}

const ALLOWED_DEFAULT_KEYS = new Set(['title', 'url', 'company', 'location']);

// Actors return URLs from arbitrary external sites — treat them as untrusted.
// Rejecting anything that isn't https keeps `javascript:`, `data:`, `file:`,
// and protocol-downgraded `http:` URLs from ending up clickable in pipeline.md
// or fed into the JD-cache filename hash. Malformed strings throw inside the
// URL constructor and fall through to false.
export function isHttpsUrl(value) {
  try {
    return new URL(String(value)).protocol === 'https:';
  } catch {
    return false;
  }
}

// ── Local-JD writer ────────────────────────────────────────────────

function slugify(text) {
  const slug = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (slug) return slug;
  // Non-Latin titles strip to empty — fall back to a stable short hash so
  // every unique title still gets its own jds/<slug>.md file.
  const hash = createHash('sha1').update(String(text || '')).digest('hex').slice(0, 10);
  return `jd-${hash}`;
}

function yamlEscape(str) {
  const s = String(str ?? '').replace(/\n/g, ' ').trim();
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// Lightweight HTML → text. Most Apify scrapers return rich HTML in their
// description fields; we don't need a full parser, just enough to make the
// JD readable for downstream snippet extraction and full evaluation.
export function htmlToText(s) {
  const raw = String(s || '');
  if (!raw || !/[<&]/.test(raw)) return raw.trim();
  // Strip script/style first. `\b` requires a word boundary so `<scripty>` is
  // not treated as a script open; `\b[^>]*>` on the close tag tolerates both
  // whitespace (`</script >`) and the parser-tolerated junk-attribute form
  // (`</script\t\n foo>`) that some scrapers emit even though it's invalid HTML.
  let cleaned = raw
    .replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n');
  // Strip remaining tags iteratively: a malformed polyglot like `<<a>b>`
  // leaves a dangling `<` after one pass that the next pass picks up.
  let prev;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(/<[^>]+>/g, '');
  } while (cleaned !== prev);
  return cleaned
    // Decode named/numeric entities; `&amp;` LAST so an input like
    // `&amp;#60;` round-trips to `&#60;` instead of double-decoding to `<`.
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Write `jds/{slug}-{hash}.md` and return its relative path. The URL-derived
// hash ensures two distinct postings that share the same company+title (e.g.
// multiple openings of "Software Engineer" at one large employer) don't
// collide on a single file. If the same posting was already saved, the
// existing file is preserved (first save wins, scan-history dedups the rest).
// Best-effort: any FS failure (disk full, EACCES, EROFS, Windows EBUSY, …)
// returns null so the caller falls back to the remote URL. A single bad-cache
// item should not abort the rest of a multi-source scan.
function saveJd(normalized, descriptionBody, sourceLabel) {
  // Hoisted so the catch block can return the path on EEXIST.
  let relPath = null;
  try {
    mkdirSync(JDS_DIR, { recursive: true });
    const baseSlug = slugify(`${normalized.company}-${normalized.title}`);
    // sha1 over the canonical URL (or company-title fallback when the URL is
    // absent) gives every distinct posting its own cache file deterministically.
    const urlHash = createHash('sha1')
      .update(String(normalized.url || `${normalized.company}-${normalized.title}`))
      .digest('hex')
      .slice(0, 10);
    const slug = `${baseSlug}-${urlHash}`;
    const filename = `${slug}.md`;
    const filepath = join(JDS_DIR, filename);
    relPath = `${JDS_DIR}/${filename}`;
    // Fast-path: already cached. The atomic guard below handles the TOCTOU
    // race where a sibling worker creates the file between this check and
    // the write — scan.mjs runs up to 10 workers in parallel.
    if (existsSync(filepath)) return relPath;

    const today = new Date().toISOString().slice(0, 10);
    const content = `---
title: ${yamlEscape(normalized.title)}
company: ${yamlEscape(normalized.company)}
url: ${yamlEscape(normalized.url)}
location: ${yamlEscape(normalized.location)}
scraped: "${today}"
source: ${sourceLabel}
---

# ${normalized.title} — ${normalized.company}

${descriptionBody}
`;
    // `flag: 'wx'` closes the TOCTOU race with the existsSync check above:
    // the OS atomically fails the open with EEXIST if a sibling worker beat
    // us to the file. We then return the path in the catch (first save wins).
    writeFileSync(filepath, content, { encoding: 'utf-8', flag: 'wx' });
    return relPath;
  } catch (err) {
    if (err?.code === 'EEXIST' && relPath) return relPath;
    console.warn(`apify: JD cache write failed for ${normalized.title} (${err.code || err.name}: ${err.message}); falling back to remote URL`);
    return null;
  }
}

export function normalizeItem(item, fieldMap, defaults) {
  const out = {
    title: String(pickField(item, fieldMap.title) || ''),
    url: String(pickField(item, fieldMap.url) || ''),
    company: fieldMap.company ? String(pickField(item, fieldMap.company) || '') : '',
    location: fieldMap.location ? String(pickField(item, fieldMap.location) || '') : '',
  };
  for (const [k, v] of Object.entries(defaults || {})) {
    if (!ALLOWED_DEFAULT_KEYS.has(k)) continue;
    if (!out[k]) out[k] = String(v);
  }
  return out;
}

export default {
  id: 'apify',

  // No auto-detect — Apify entries must declare provider: apify.
  detect() { return null; },

  async fetch(entry, _ctx) {
    if (!hasToken()) {
      throw new Error('APIFY_TOKEN not set — skip this source or set the token in .env');
    }
    if (!entry.actor) {
      throw new Error(`apify: entry ${entry.name} missing 'actor' (e.g. misceres/indeed-scraper)`);
    }
    if (
      !entry.field_map ||
      !isFieldSpec(entry.field_map.title) ||
      !isFieldSpec(entry.field_map.url) ||
      (entry.field_map.company != null && !isFieldSpec(entry.field_map.company)) ||
      (entry.field_map.location != null && !isFieldSpec(entry.field_map.location)) ||
      (entry.field_map.description != null && !isFieldSpec(entry.field_map.description))
    ) {
      throw new Error(
        `apify: entry ${entry.name} has invalid field_map. ` +
        `Each of title, url, company, location, description must be a string ` +
        `(single key like "positionName") or a non-empty array of strings ` +
        `(fallback list like ["positionName", "title"]). title and url are required.`
      );
    }

    const opts = {};
    if (entry.timeout_ms != null) opts.timeoutMs = entry.timeout_ms;
    const items = await runActor(entry.actor, entry.input || {}, opts);

    const useLocalJd = entry.field_map.description != null;
    // Use the actor slug as the `source:` label in the JD frontmatter
    // (e.g. "misceres/indeed-scraper" → "misceres-indeed-scraper") so it's
    // easy to grep saved JDs by origin later.
    const sourceLabel = String(entry.actor || 'apify').replace(/[^a-z0-9]+/gi, '-').toLowerCase();

    return items
      .map(item => {
        const normalized = normalizeItem(item, entry.field_map, entry.defaults);
        if (!normalized.title || !normalized.url) return null;
        if (!isHttpsUrl(normalized.url)) return null;
        if (!useLocalJd) return normalized;
        const descriptionRaw = pickField(item, entry.field_map.description);
        const descriptionBody = htmlToText(descriptionRaw);
        if (!descriptionBody || descriptionBody.length < MIN_JD_BODY_CHARS) {
          return normalized; // fall through to remote URL when JD is missing/short
        }
        const remoteUrl = normalized.url;
        const jdPath = saveJd(normalized, descriptionBody, sourceLabel);
        if (jdPath === null) return normalized; // FS write failed → keep remote URL
        normalized.url = `local:${jdPath}`;
        normalized._remote_url = remoteUrl;
        return normalized;
      })
      .filter(j => j && j.title && j.url);
  },
};
