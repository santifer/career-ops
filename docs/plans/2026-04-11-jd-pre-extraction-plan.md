# JD Pre-Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist JD text + metadata to `jds/` during NewGrad scan enrichment so batch workers can Read from disk instead of re-fetching.

**Architecture:** Bridge writes a YAML-frontmatter + description file to `jds/{slug}.txt` when a row passes enrichment threshold. Pipeline.md entries get a `[local:jds/{file}]` tag. Batch runner extracts the tag and passes the path as `{{JD_FILE}}`. Workers Read the file directly, skipping WebFetch and Block D WebSearch.

**Tech Stack:** TypeScript (bridge), Bash (batch-runner), Vitest (tests), `yaml` npm package for safe YAML serialization.

**Design doc:** `docs/plans/2026-04-11-jd-pre-extraction-design.md`

---

### Task 1: Add `yaml` dependency to bridge

**Files:**
- Modify: `bridge/package.json`

**Step 1: Install yaml package**

Run:
```bash
cd /Users/hongxichen/Desktop/career-ops/bridge && npm install yaml
```

Expected: `yaml` appears in `dependencies` in `package.json`.

**Step 2: Verify typecheck still passes**

Run:
```bash
cd /Users/hongxichen/Desktop/career-ops/bridge && npm run typecheck
```

Expected: No errors.

**Step 3: Commit**

```bash
git add bridge/package.json bridge/package-lock.json
git commit -m "chore(bridge): add yaml dependency for safe frontmatter serialization"
```

---

### Task 2: Create `jd-filename.ts` with tests

**Files:**
- Create: `bridge/src/lib/jd-filename.ts`
- Create: `bridge/src/lib/jd-filename.test.ts`

**Step 1: Write the failing tests**

Create `bridge/src/lib/jd-filename.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { jdFilename, stripTrackingParams } from "./jd-filename.js";

describe("stripTrackingParams", () => {
  it("removes utm_* params", () => {
    const url = "https://example.com/job?id=123&utm_source=google&utm_campaign=jobs";
    expect(stripTrackingParams(url)).toBe("https://example.com/job?id=123");
  });

  it("removes ref, source, gh_src, lever-source", () => {
    const url = "https://boards.greenhouse.io/company/jobs/123?ref=newgrad&gh_src=abc&lever-source=def&source=scan";
    expect(stripTrackingParams(url)).toBe("https://boards.greenhouse.io/company/jobs/123");
  });

  it("strips hash fragments", () => {
    const url = "https://example.com/job?id=1#apply";
    expect(stripTrackingParams(url)).toBe("https://example.com/job?id=1");
  });

  it("preserves non-tracking params", () => {
    const url = "https://jobright.ai/jobs/info/abc123?other=keep";
    expect(stripTrackingParams(url)).toBe("https://jobright.ai/jobs/info/abc123?other=keep");
  });

  it("handles URL with no params", () => {
    const url = "https://example.com/jobs/456";
    expect(stripTrackingParams(url)).toBe("https://example.com/jobs/456");
  });
});

describe("jdFilename", () => {
  it("generates slug-hash.txt format", () => {
    const result = jdFilename("ICF", "https://jobright.ai/jobs/info/abc123");
    expect(result).toMatch(/^icf-[a-f0-9]{8}\.txt$/);
  });

  it("normalizes company name to lowercase slug", () => {
    const result = jdFilename("Deutsche Bank", "https://example.com/job/1");
    expect(result).toMatch(/^deutsche-bank-[a-f0-9]{8}\.txt$/);
  });

  it("strips special characters from company name", () => {
    const result = jdFilename("AT&T Inc.", "https://example.com/job/2");
    expect(result).toMatch(/^at-t-inc-[a-f0-9]{8}\.txt$/);
  });

  it("falls back to 'unknown' for non-ASCII-only company names", () => {
    const result = jdFilename("字节跳动", "https://example.com/job/3");
    expect(result).toMatch(/^unknown-[a-f0-9]{8}\.txt$/);
  });

  it("produces same hash regardless of tracking params", () => {
    const a = jdFilename("Test", "https://example.com/job?id=1&utm_source=google");
    const b = jdFilename("Test", "https://example.com/job?id=1");
    expect(a).toBe(b);
  });

  it("produces different hashes for different URLs", () => {
    const a = jdFilename("Test", "https://example.com/job/1");
    const b = jdFilename("Test", "https://example.com/job/2");
    expect(a).not.toBe(b);
  });

  it("is deterministic", () => {
    const a = jdFilename("ICF", "https://jobright.ai/jobs/info/abc123");
    const b = jdFilename("ICF", "https://jobright.ai/jobs/info/abc123");
    expect(a).toBe(b);
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
cd /Users/hongxichen/Desktop/career-ops/bridge && npx vitest run src/lib/jd-filename.test.ts
```

Expected: FAIL — module `./jd-filename.js` not found.

**Step 3: Write the implementation**

Create `bridge/src/lib/jd-filename.ts`:

```typescript
import { createHash } from "node:crypto";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "ref",
  "source",
  "gh_src",
  "lever-source",
]);

/** Strip tracking query params and hash fragments from a URL. */
export function stripTrackingParams(raw: string): string {
  const u = new URL(raw);
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key)) u.searchParams.delete(key);
  }
  u.hash = "";
  return u.toString();
}

/**
 * Deterministic JD filename from company name + URL.
 * Format: `{company-slug}-{url-hash-8}.txt`
 */
export function jdFilename(company: string, url: string): string {
  const slug =
    company
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown";
  const normalized = stripTrackingParams(url);
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 8);
  return `${slug}-${hash}.txt`;
}
```

**Step 4: Run tests to verify they pass**

Run:
```bash
cd /Users/hongxichen/Desktop/career-ops/bridge && npx vitest run src/lib/jd-filename.test.ts
```

Expected: All 12 tests PASS.

**Step 5: Typecheck**

Run:
```bash
cd /Users/hongxichen/Desktop/career-ops/bridge && npm run typecheck
```

Expected: No errors.

**Step 6: Commit**

```bash
git add bridge/src/lib/jd-filename.ts bridge/src/lib/jd-filename.test.ts
git commit -m "feat(bridge): add jdFilename utility with URL normalization and tests"
```

---

### Task 3: Create `writeJdFile()` with tests

**Files:**
- Create: `bridge/src/lib/write-jd-file.ts`
- Create: `bridge/src/lib/write-jd-file.test.ts`

**Step 1: Write the failing tests**

Create `bridge/src/lib/write-jd-file.test.ts`:

```typescript
import { readFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeJdFile } from "./write-jd-file.js";
import { jdFilename } from "./jd-filename.js";

const TEST_DIR = join(tmpdir(), "career-ops-test-jds");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("writeJdFile", () => {
  it("writes frontmatter + description body", () => {
    const result = writeJdFile({
      jdsDir: TEST_DIR,
      company: "ICF",
      role: "Junior Software Engineer",
      url: "https://jobright.ai/jobs/info/abc123",
      description: "This is the full JD description text.",
      location: "Reston, VA",
      salary: "$65,000 - $110,500",
      h1b: "unknown",
      applyUrl: "https://icf.wd5.myworkdayjobs.com/en-US/ICF_Careers/job/123",
    });

    expect(result).not.toBeNull();
    const content = readFileSync(join(TEST_DIR, result!), "utf-8");

    // Check frontmatter fields are quoted
    expect(content).toContain('company: "ICF"');
    expect(content).toContain('role: "Junior Software Engineer"');
    expect(content).toContain('salary: "$65,000 - $110,500"');
    expect(content).toContain('h1b: "unknown"');
    // Check description body follows frontmatter
    expect(content).toContain("---\n\nThis is the full JD description text.");
  });

  it("omits missing optional fields", () => {
    const result = writeJdFile({
      jdsDir: TEST_DIR,
      company: "TestCo",
      role: "SWE",
      url: "https://example.com/job/1",
      description: "A valid description that is long enough.",
    });

    expect(result).not.toBeNull();
    const content = readFileSync(join(TEST_DIR, result!), "utf-8");
    expect(content).not.toContain("salary:");
    expect(content).not.toContain("location:");
    expect(content).not.toContain("h1b:");
    expect(content).not.toContain("applyUrl:");
  });

  it("returns null when description is too short", () => {
    const result = writeJdFile({
      jdsDir: TEST_DIR,
      company: "ShortCo",
      role: "SWE",
      url: "https://example.com/job/2",
      description: "Too short",
    });

    expect(result).toBeNull();
    // No file should have been written
    expect(existsSync(join(TEST_DIR, jdFilename("ShortCo", "https://example.com/job/2")))).toBe(false);
  });

  it("handles special characters in company name and role", () => {
    const result = writeJdFile({
      jdsDir: TEST_DIR,
      company: "C3.ai",
      role: "Engineer: Backend (L3/L4)",
      url: "https://example.com/job/3",
      description: "A".repeat(500),
    });

    expect(result).not.toBeNull();
    const content = readFileSync(join(TEST_DIR, result!), "utf-8");
    expect(content).toContain('company: "C3.ai"');
    expect(content).toContain('role: "Engineer: Backend (L3/L4)"');
  });

  it("filename matches jdFilename utility", () => {
    const url = "https://example.com/job/4";
    const result = writeJdFile({
      jdsDir: TEST_DIR,
      company: "Google",
      role: "SWE",
      url,
      description: "B".repeat(500),
    });

    expect(result).toBe(jdFilename("Google", url));
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
cd /Users/hongxichen/Desktop/career-ops/bridge && npx vitest run src/lib/write-jd-file.test.ts
```

Expected: FAIL — module `./write-jd-file.js` not found.

**Step 3: Write the implementation**

Create `bridge/src/lib/write-jd-file.ts`:

```typescript
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";
import { JD_MIN_CHARS } from "../contracts/jobs.js";
import { jdFilename } from "./jd-filename.js";

export interface WriteJdFileInput {
  /** Absolute path to the jds/ directory. */
  jdsDir: string;
  company: string;
  role: string;
  /** The canonical URL (output of pickPipelineEntryUrl). Used for filename hash. */
  url: string;
  /** Full JD description text. */
  description: string;
  location?: string;
  salary?: string;
  /** "yes" | "no" | "unknown" */
  h1b?: string;
  applyUrl?: string;
}

/**
 * Write a JD file with YAML frontmatter + description body.
 * Returns the filename on success, or null if description is too short.
 */
export function writeJdFile(input: WriteJdFileInput): string | null {
  if (input.description.length < JD_MIN_CHARS) return null;

  const filename = jdFilename(input.company, input.url);

  // Build frontmatter object — omit undefined fields
  const meta: Record<string, string> = {
    company: input.company,
    role: input.role,
  };
  if (input.location) meta.location = input.location;
  if (input.salary) meta.salary = input.salary;
  if (input.h1b) meta.h1b = input.h1b;
  if (input.applyUrl) meta.applyUrl = input.applyUrl;
  meta.source = "newgrad-scan";
  meta.extractedAt = new Date().toISOString();

  // yaml.stringify with forceQuotes ensures all values are double-quoted
  const frontmatter = stringify(meta, { defaultStringType: "QUOTE_DOUBLE" });
  const content = `---\n${frontmatter}---\n\n${input.description}\n`;

  writeFileSync(join(input.jdsDir, filename), content, "utf-8");
  return filename;
}
```

**Step 4: Run tests to verify they pass**

Run:
```bash
cd /Users/hongxichen/Desktop/career-ops/bridge && npx vitest run src/lib/write-jd-file.test.ts
```

Expected: All 5 tests PASS.

**Step 5: Typecheck**

Run:
```bash
cd /Users/hongxichen/Desktop/career-ops/bridge && npm run typecheck
```

Expected: No errors.

**Step 6: Commit**

```bash
git add bridge/src/lib/write-jd-file.ts bridge/src/lib/write-jd-file.test.ts
git commit -m "feat(bridge): add writeJdFile utility for JD pre-extraction with tests"
```

---

### Task 4: Integrate `writeJdFile` into `enrichNewGradRows()`

**Files:**
- Modify: `bridge/src/adapters/claude-pipeline.ts` (lines 575-658)

**Step 1: Add imports at top of file**

At the top of `claude-pipeline.ts`, add after the existing imports (near line 54):

```typescript
import { jdFilename } from "../lib/jd-filename.js";
import { writeJdFile } from "../lib/write-jd-file.js";
```

**Step 2: Modify the pipeline entry building block (around line 620-635)**

Currently the code builds a `PipelineEntry` like:

```typescript
const entryUrl = pickPipelineEntryUrl(enriched.detail, enriched.row);
```

After the `entryUrl` assignment (around line 623), add JD file writing:

```typescript
// Write pre-extracted JD to jds/ for batch consumption
const jdsDir = join(config.repoRoot, "jds");
mkdirSync(jdsDir, { recursive: true });

const h1bValue = enriched.detail.h1bSponsorLikely === true
  ? "yes"
  : enriched.detail.h1bSponsorLikely === false
    ? "no"
    : "unknown";

const jdFile = writeJdFile({
  jdsDir,
  company: enriched.detail.company || enriched.row.company,
  role: enriched.detail.title || enriched.row.title,
  url: entryUrl,
  description: enriched.detail.description,
  location: enriched.detail.location || undefined,
  salary: enriched.detail.salaryRange || undefined,
  h1b: h1bValue,
  applyUrl: enriched.detail.applyNowUrl || undefined,
});
```

**Step 3: Modify the pipeline.md line format (around line 649-652)**

Change the entry line builder from:

```typescript
const lines = entries.map(
  (e) =>
    `- [ ] ${e.url} — ${e.company} | ${e.role} (via newgrad-scan, score: ${e.score}/${maxScore})`,
);
```

To include the `[local:...]` tag. This requires storing the JD filename alongside each entry. Modify the `PipelineEntry` push (around line 635) to also store the JD filename:

Add a parallel array or augment the entry. The cleanest approach: store `jdFile` on a Map keyed by entry URL, then use it during line building.

Before the loop (around line 588), add:

```typescript
const jdFileMap = new Map<string, string>();
```

After the `writeJdFile` call, add:

```typescript
if (jdFile) {
  jdFileMap.set(entryUrl, jdFile);
}
```

Then change the line builder to:

```typescript
const lines = entries.map((e) => {
  const tag = jdFileMap.get(e.url);
  const base = `- [ ] ${e.url} — ${e.company} | ${e.role} (via newgrad-scan, score: ${e.score}/${maxScore})`;
  return tag ? `${base} [local:jds/${tag}]` : base;
});
```

**Step 4: Typecheck**

Run:
```bash
cd /Users/hongxichen/Desktop/career-ops/bridge && npm run typecheck
```

Expected: No errors.

**Step 5: Run all tests**

Run:
```bash
cd /Users/hongxichen/Desktop/career-ops/bridge && npx vitest run
```

Expected: All tests PASS.

**Step 6: Commit**

```bash
git add bridge/src/adapters/claude-pipeline.ts
git commit -m "feat(bridge): write JD files to jds/ during newgrad enrichment"
```

---

### Task 5: Update `batch-runner.sh` to extract `[local:...]` tag

**Files:**
- Modify: `batch/batch-runner.sh` (lines 305-348)

**Step 1: Modify `process_offer` to extract JD file from notes**

In `process_offer()`, change line 316 from:

```bash
local jd_file="/tmp/batch-jd-${id}.txt"
```

To:

```bash
# Extract [local:jds/...] tag from notes if present
local jd_file=""
if [[ "$notes" =~ \[local:([^]]+)\] ]]; then
  jd_file="${PROJECT_DIR}/${BASH_REMATCH[1]}"
fi
# Fall back to empty tmp path if no pre-extracted JD
if [[ -z "$jd_file" || ! -f "$jd_file" ]]; then
  jd_file="/tmp/batch-jd-${id}.txt"
fi
```

This extracts the `[local:jds/icf-a3f8c2d1.txt]` tag from the `notes` column of `batch-input.tsv`, resolves it to an absolute path, and falls back to the old temp-file path if no tag is present or the file doesn't exist.

**Note:** When `batch-input.tsv` is populated from `pipeline.md`, the `notes` column should carry the `[local:...]` tag. The tag format in pipeline.md is at the end of the line, so it naturally ends up in the notes field when parsed.

**Step 2: Verify syntax**

Run:
```bash
bash -n /Users/hongxichen/Desktop/career-ops/batch/batch-runner.sh
```

Expected: No syntax errors.

**Step 3: Commit**

```bash
git add batch/batch-runner.sh
git commit -m "feat(batch): extract [local:jds/...] tag for pre-extracted JD files"
```

---

### Task 6: Update `batch-prompt.md` Paso 1 and Block D

**Files:**
- Modify: `batch/batch-prompt.md` (lines 44-48 for Paso 1, lines 119-124 for Block D)

**Step 1: Rewrite Paso 1 (lines 44-48)**

Replace:

```markdown
### Paso 1 — Obtener JD

1. Lee el archivo JD en `{{JD_FILE}}`
2. Si el archivo está vacío o no existe, intenta obtener el JD desde `{{URL}}` con WebFetch
3. Si ambos fallan, reporta error y termina
```

With:

```markdown
### Paso 1 — Obtener JD

1. Lee el archivo JD en `{{JD_FILE}}`
   - Si el archivo tiene frontmatter YAML (delimitado por `---`), parsea los campos
     como metadata del rol: `company`, `role`, `location`, `salary`, `h1b`, `applyUrl`.
   - El texto después del segundo `---` es la descripción del JD. Úsalo como JD completo.
   - Si `h1b` es `"no"` o `"unknown"` y el candidato requiere visa sponsorship,
     marca como posible hard blocker para Bloque B.
   - **Ventaja:** Este archivo ya contiene el JD pre-extraído. NO necesitas WebFetch ni WebSearch.
2. Si `{{JD_FILE}}` no existe o está vacío, intenta obtener el JD desde `{{URL}}` con WebFetch.
3. Si WebFetch falla, intenta WebSearch `"{company} {role} job posting"`.
4. Si todo falla, reporta error y termina.
```

**Step 2: Add frontmatter-aware note to Block D (around line 119-124)**

After the existing Block D header and before the WebSearch instruction, add:

```markdown
**Si el frontmatter del JD (Paso 1) ya incluye `salary` y `location`, usa esos datos directamente.** Solo haz WebSearch si falta información crítica para calcular el score de comp.
```

**Step 3: Commit**

```bash
git add batch/batch-prompt.md
git commit -m "feat(batch): update batch-prompt to consume pre-extracted JD files with frontmatter"
```

---

### Task 7: Add dry-run JD hit-rate diagnostic

**Files:**
- Modify: `batch/batch-runner.sh`

**Step 1: Find the dry-run block**

Look for the `--dry-run` handling in `batch-runner.sh` (around lines 523-531).

**Step 2: Add JD file check to dry-run output**

After the existing dry-run listing, add a JD hit-rate summary:

```bash
# In the dry-run block, after listing pending offers:
local jd_hits=0
local jd_misses=0
for i in "${!pending_ids[@]}"; do
  local n="${pending_notes[$i]}"
  if [[ "$n" =~ \[local:([^]]+)\] ]] && [[ -f "${PROJECT_DIR}/${BASH_REMATCH[1]}" ]]; then
    ((jd_hits++))
  else
    ((jd_misses++))
  fi
done
echo ""
echo "JD pre-extraction: $jd_hits/$pending_count cached, $jd_misses will WebFetch"
```

**Step 3: Verify syntax**

Run:
```bash
bash -n /Users/hongxichen/Desktop/career-ops/batch/batch-runner.sh
```

Expected: No syntax errors.

**Step 4: Commit**

```bash
git add batch/batch-runner.sh
git commit -m "feat(batch): show JD pre-extraction hit rate in dry-run output"
```

---

### Task 8: Manual integration test

**Step 1: Verify end-to-end with a real scan**

This task is manual — run a newgrad scan through the extension and verify:

1. After enrichment, `jds/` directory contains `.txt` files with YAML frontmatter
2. `data/pipeline.md` entries have `[local:jds/{file}]` tags
3. A frontmatter file opens correctly and has properly quoted YAML
4. `batch-runner.sh --dry-run` reports the JD hit rate

**Step 2: Verify batch worker consumption**

Create a test `batch-input.tsv` with one entry that has a `[local:...]` tag in the notes column. Run `batch-runner.sh --dry-run` and confirm it resolves the JD file path.

**Step 3: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: integration test fixups for JD pre-extraction"
```
