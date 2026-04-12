# Design: JD Pre-Extraction at NewGrad Scan Time

**Date:** 2026-04-11
**Status:** Reviewed — ready for implementation

## Problem

Batch evaluation spawns one sub-agent per job URL. Each agent independently
WebFetches the page, parses HTML, extracts JD text, and hunts for metadata
(salary, location, H1B status). This is expensive:

- 19 concurrent agents hit the rate limit; only 1/19 completed successfully.
- Each agent runs 11-20 tool calls, with cumulative context growth per call.
- The extension's NewGrad enrich flow already extracts high-quality JD text
  + structured metadata from the rendered page, then discards it after scoring.

## Decision Summary

| # | Decision | Choice |
|---|----------|--------|
| 1 | Where to persist JD text | Bridge-side, during `enrichNewGradRows()` |
| 2 | How to link pipeline.md ↔ JD file | `[local:jds/{file}]` tag appended to pipeline.md entry |
| 3 | What to store | Structured YAML frontmatter + description body |

## File Format

Path: `jds/{company-slug}-{url-hash-8}.txt`

```yaml
---
company: "ICF"
role: "Junior Software Engineer (Web Developer/Programmer)"
location: "Reston, VA"
salary: "$65,000 - $110,500"
h1b: "unknown"
applyUrl: "https://icf.wd5.myworkdayjobs.com/..."
source: "newgrad-scan"
extractedAt: "2026-04-11T02:30:00Z"
---

(description text, up to 20K characters)
```

### Frontmatter rules

- **All string values are unconditionally double-quoted** to prevent YAML
  parse failures from special characters (`:`, `$`, `&`, `()`, etc.).
  Use Node's `yaml` package in `writeJdFile()` to serialize.
- Missing fields are omitted entirely (not written as `null` or empty string).
- `h1b` field mapping from `NewGradDetail.h1bSponsorLikely`:
  `true` → `"yes"`, `false` → `"no"`, `null/undefined` → `"unknown"`.
- `applyUrl` is the output of `pickPipelineEntryUrl()` — the best external
  ATS URL, not the Jobright detail page URL. This is the same URL used for
  the filename hash.

### Minimum description guard

If `description.length < JD_MIN_CHARS` (already defined in
`contracts/jobs.ts`), skip writing the JD file entirely. The batch worker
will fall back to WebFetch for that entry.

## Filename Generation

```typescript
import { createHash } from "crypto";

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "ref", "source", "gh_src", "lever-source",
]);

function stripTrackingParams(raw: string): string {
  const u = new URL(raw);
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key)) u.searchParams.delete(key);
  }
  u.hash = "";
  return u.toString();
}

function jdFilename(company: string, url: string): string {
  const slug = company
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "unknown";   // fallback for non-ASCII-only company names
  const normalized = stripTrackingParams(url);
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 8);
  return `${slug}-${hash}.txt`;
}
```

- Tracking params (`utm_*`, `ref`, `source`, `gh_src`, `lever-source`) and
  URL hash fragments are stripped before hashing.
- Empty slug (e.g. all-CJK company name) falls back to `"unknown"`.
- Both the bridge (write) and batch runner (lookup) use the same function.

## Pipeline.md Format Change

When the bridge writes a JD file, it appends a `[local:...]` tag to the
pipeline.md entry:

```
- [ ] https://jobright.ai/... — ICF | Junior SWE (via newgrad-scan, score: 7/9) [local:jds/icf-a3f8c2d1.txt]
```

This follows the existing `local:` prefix convention already used elsewhere
in pipeline modes. The batch runner extracts the filename from this tag
instead of computing it independently, eliminating the need for company-name
parsing or cross-platform SHA-256 in Bash.

## Changes Required

| File | Change |
|------|--------|
| `bridge/src/lib/jd-filename.ts` | New file. Exports `jdFilename()` and `stripTrackingParams()`. |
| `bridge/src/adapters/claude-pipeline.ts` | In `enrichNewGradRows()`: after a row passes threshold, call `writeJdFile(row)` to persist frontmatter + description to `jds/`. Append `[local:jds/{file}]` to the pipeline.md entry. Skip writing if description is shorter than `JD_MIN_CHARS`. |
| `batch/batch-prompt.md` | Paso 1: try `Read {{JD_FILE}}` first; parse frontmatter for metadata. Fall back to WebFetch → WebSearch. Block D: skip WebSearch when frontmatter has salary + location. |
| `batch/batch-runner.sh` | In `process_offer`: extract `[local:...]` tag from the pipeline/batch-input entry and pass as `{{JD_FILE}}`. If no tag, pass empty (worker falls back to WebFetch). |

## Data Flow (After)

```
Extension (enrich phase)
  │ extractNewGradDetail() → description (≤20K) + parseJobrightData()
  │ POST /v1/newgrad-scan/enrich-stream { rows: EnrichedRow[] }
  ↓
Bridge: enrichNewGradRows()
  │ row passes threshold?
  │ description.length >= JD_MIN_CHARS?
  ├─ YES → write jds/{company-slug}-{url-hash-8}.txt (YAML-serialized)
  │        append to pipeline.md with [local:jds/{file}] tag
  └─ NO  → append to pipeline.md without tag (or skip entirely)

Later: batch run
  │ batch-runner.sh reads batch-input.tsv
  │ extracts [local:...] tag per entry → {{JD_FILE}}
  ↓
Worker (claude -p)
  │ Read {{JD_FILE}} (if exists)
  │   → frontmatter: company, salary, h1b, location, applyUrl
  │   → body: JD description text
  │ Skip WebFetch, skip Block D WebSearch
  │ Proceed directly to A-G evaluation
  │
  │ (if no JD file: WebFetch → WebSearch → error)
```

## Batch Worker Consumption (Paso 1 Rewrite)

```
1. If {{JD_FILE}} points to an existing file, Read it directly.
   - If it has YAML frontmatter (---...---), parse fields and use as
     role metadata (company, location, salary, h1b, applyUrl).
   - Text after frontmatter is the JD description.
   - If h1b is "no" or "unknown" and candidate requires sponsorship,
     flag as possible hard blocker in Block B.
2. If file does not exist or {{JD_FILE}} is empty, WebFetch from {{URL}}.
3. If WebFetch fails, WebSearch "{company} {role} job posting".
4. If all fail, report error and terminate.
```

Block D addendum:
```
If the JD frontmatter already includes salary and location, use those
directly. Only WebSearch if critical information for the score is missing.
```

## Estimated Token Savings Per Worker

| Step | Before | After |
|------|--------|-------|
| WebFetch HTML | 1 tool call + large HTML context | Skipped |
| Parse JD from HTML | LLM extracts from raw HTML | Read pre-extracted text |
| Block D WebSearch | 1-2 searches for salary/company | Skipped (frontmatter) |
| Block G WebSearch | Possible company news search | Unchanged |

Conservative estimate: **3-5 fewer tool calls per worker**. With cumulative
context growth, later calls are disproportionately expensive, so the real
savings are higher than linear.

## Backward Compatibility

- Batch workers that don't find a JD file fall back to WebFetch (existing behavior).
- The `jds/` directory already exists in the project structure (currently empty).
- No changes to the extension's content scripts.
- Pipeline.md entries without `[local:...]` tags work exactly as before.

## Maintenance

- **JD file cleanup:** Files older than 30 days can be safely pruned.
  Add `find jds/ -mtime +30 -delete` to `batch-runner.sh` startup, or
  run manually.
- **Dry-run diagnostics:** When `batch-runner.sh --dry-run` is active,
  report JD file hit rate (how many entries have pre-extracted JDs vs
  how many will need WebFetch).

## Not In Scope

- Changing the extension's extraction limits (10K generic / 20K newgrad).
- Moving the extraction logic into a shared Node module (deferred — can be
  done later if non-newgrad URLs also need pre-extraction).
- Reducing batch concurrency (orthogonal optimization).
- A `JdStore` abstraction (warranted when non-newgrad sources are added).
