#!/usr/bin/env node
/**
 * career-library-builder.mjs — weekly builder for Mitchell's career super-library.
 *
 * Fired by: scripts/launchd/com.mitchell.career-ops.career-library.plist
 *           (Sunday 04:00 PT — after weekly-intel which runs at 02:00)
 *
 * Goal: build a centralized, structured archive of Mitchell's career portfolio
 * (pre-Google video work, during-Google content/builds, articles showing
 * downstream impact, network engagement data) on local disk and optionally
 * synced to public sites.
 *
 * Pulls from existing source docs:
 *   - data/storytellermitch-rewrites-2026-05-09.md  (11 video entries)
 *   - data/article-digest.md                         (compressed proof points)
 *   - data/video-portfolio-analysis.md
 *   - data/portfolio-analysis-master.md
 *   - data/industry-impact-document.md
 *   - corpus/bylines/                                (journalism-era bylines)
 *
 * Writes:
 *   corpus/career-library/MANIFEST.md                — master index
 *   corpus/career-library/by-platform/{platform}.md  — grouped by platform
 *   corpus/career-library/by-year/{year}.md          — chronological
 *   corpus/career-library/artifacts/{slug}.md        — one file per artifact
 *
 * For each artifact, attempts (best-effort, non-blocking) to fetch updated
 * engagement data via WebFetch — Vimeo oEmbed, YouTube oEmbed, archive.org
 * Wayback snapshots for HuffPost Live URLs.
 *
 * Usage:
 *   node scripts/career-library-builder.mjs                  # full run
 *   node scripts/career-library-builder.mjs --dry-run        # plan only, no writes
 *   node scripts/career-library-builder.mjs --no-fetch       # skip live engagement fetches
 *   node scripts/career-library-builder.mjs --sync           # also push to public github repo (requires GITHUB_LIBRARY_REPO env)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = process.cwd();
const LIB_DIR = join(ROOT, 'corpus/career-library');
const DATE = new Date().toISOString().slice(0, 10);
const DRY_RUN = process.argv.includes('--dry-run');
const NO_FETCH = process.argv.includes('--no-fetch');
const SYNC = process.argv.includes('--sync');

const SOURCES = [
  'data/storytellermitch-rewrites-2026-05-09.md',
  'data/article-digest.md',
  'data/video-portfolio-analysis.md',
  'data/portfolio-analysis-master.md',
  'data/industry-impact-document.md',
];

if (!DRY_RUN) {
  for (const sub of ['', 'by-platform', 'by-year', 'artifacts']) {
    const p = join(LIB_DIR, sub);
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
  }
}

console.log(`[career-library] Building manifest for ${DATE} (dry-run=${DRY_RUN}, fetch=${!NO_FETCH}, sync=${SYNC})`);

// ── Load source docs ──────────────────────────────────────────────
const sourcesContent = {};
for (const s of SOURCES) {
  const path = join(ROOT, s);
  if (existsSync(path)) {
    sourcesContent[s] = readFileSync(path, 'utf-8');
    console.log(`[career-library]  ✓ ${s} (${sourcesContent[s].length} chars)`);
  } else {
    console.log(`[career-library]  ✗ ${s} (not found, skipping)`);
  }
}

// ── Bylines ───────────────────────────────────────────────────────
const bylinesDir = join(ROOT, 'corpus/bylines');
let bylines = [];
if (existsSync(bylinesDir)) {
  bylines = readdirSync(bylinesDir).filter(f => f.endsWith('.md'));
  console.log(`[career-library]  ✓ corpus/bylines/ (${bylines.length} files)`);
}

// ── Build the Claude prompt ───────────────────────────────────────
const PROMPT = `You are the career-library builder for Mitchell Williams. Your job is to extract every distinct portfolio artifact from his existing source files and build a structured, exhaustive archive at /Users/mitchellwilliams/Documents/career-ops/corpus/career-library/.

## Source files to read in full

${SOURCES.map(s => `- /Users/mitchellwilliams/Documents/career-ops/${s}`).join('\n')}
- /Users/mitchellwilliams/Documents/career-ops/cv.md
- /Users/mitchellwilliams/Documents/career-ops/corpus/bylines/ (read every .md file)
- /Users/mitchellwilliams/Documents/career-ops/corpus/projects/ (read every file you find)

## What to extract

For EACH distinct artifact (video segment, article, build, byline, on-air credit, downstream-impact moment, podcast appearance, talk):

- Title + platform + date (YYYY-MM-DD or YYYY-MM)
- One-sentence editorial purpose / what made it matter
- Verbatim on-air credit if present (with timestamp)
- Lead metric (views / households / awards / downstream policy / etc)
- Source URL (Vimeo / YouTube / archive.org / GitHub / publication)
- Tags: platform (AJ+ / HuffPost Live / Fusion / AJE / Google xGE / personal), era (pre-Google / Google / post-Google), archetype (editorial / build / leadership / talk)
- Network: people on-air or attached (host names, guest names, colleague names if known)

## Output structure

Write THREE classes of files:

1. **/corpus/career-library/MANIFEST.md** — master index. Single table with columns: # | Date | Platform | Title | Lead metric | Tags | File link. Sorted newest first. Include a short "Last built: ${DATE}" line at top and a count summary (e.g., "47 artifacts across 6 platforms, 2010-2026").

2. **/corpus/career-library/by-platform/{platform-slug}.md** — one file per platform (aj-plus.md, huffpost-live.md, fusion.md, al-jazeera-english.md, google-xge.md, personal.md). Each file: brief platform context (1 paragraph) + table of artifacts on that platform.

3. **/corpus/career-library/by-year/{year}.md** — one file per year that has artifacts. Same shape as by-platform.

4. **/corpus/career-library/artifacts/{slug}.md** — one file per artifact. Slug format: {YYYY-MM}-{platform}-{short-title}.md (e.g., 2017-09-aj-plus-hurricane-maria.md). Each file: full extracted record with all fields, including links to Vimeo / archive / source.

## Constraints

- Do NOT fabricate metrics, on-air credits, or URLs that aren't in the source files. If a field is unknown, write \`unknown — see {source file}\` instead of guessing.
- Use first-person voice in editorial-purpose lines ("I produced", "I led", "I shipped") since this is Mitchell's library.
- If two source files conflict on a metric, surface both with citations and flag for human review.
- Do not write commentary — this is an archive, not analysis.
${NO_FETCH ? '' : '- For each artifact with a Vimeo or YouTube URL, attempt to WebFetch the oEmbed endpoint to capture current view count if available. If the fetch fails, just write `engagement_fetched: failed` and move on.'}

## After all files are written

Print a short summary to stdout: total artifact count, platform breakdown, any artifacts where critical fields were missing or conflicting. Then print exactly: "Career library built: corpus/career-library/MANIFEST.md".`;

if (DRY_RUN) {
  console.log('\n=== DRY RUN — Prompt that would be sent to Claude ===\n');
  console.log(PROMPT);
  process.exit(0);
}

// ── Spawn Claude ──────────────────────────────────────────────────
const result = spawnSync(
  'claude',
  ['--model', 'claude-opus-4-7', '--dangerously-skip-permissions', '-p', PROMPT],
  { stdio: 'inherit', cwd: ROOT }
);

if (result.status !== 0) {
  console.error(`[career-library] Claude exited with status ${result.status}`);
  process.exit(result.status || 1);
}

console.log(`[career-library] Done. Manifest: ${join(LIB_DIR, 'MANIFEST.md')}`);

// ── Optional: sync to public GitHub repo ──────────────────────────
if (SYNC) {
  const targetRepo = process.env.GITHUB_LIBRARY_REPO;
  if (!targetRepo) {
    console.error('[career-library] --sync requested but GITHUB_LIBRARY_REPO env var not set. Skipping sync.');
  } else {
    console.log(`[career-library] Syncing to ${targetRepo}...`);
    // Lightweight: rsync corpus/career-library/ → a sibling worktree of the target repo, then commit + push.
    // Implementation deferred — first establish the target repo, then wire this.
    console.log('[career-library] Sync not yet implemented. Manifest is local-only for now.');
  }
}
