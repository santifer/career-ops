# Scrapling JD Fetcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/yash-resume-pipeline`'s playwright-cli JD fetcher with a Python helper using Scrapling's `StealthyFetcher`, so URLs behind Cloudflare/Akamai stop blocking the pipeline. Plus add 4 GB of host swap so the pipeline doesn't OOM-kill the user's daily Chrome.

**Architecture:** Tiny Python CLI helper (`scrapling_fetch.py`) with two modes — pure-stdlib `--detect-source` for fast unit-testable host detection, and a live-fetch default path that uses Scrapling's `StealthyFetcher` (backed by Patchright, a stealth-patched Playwright fork) to bypass Cloudflare. The orchestrator (`yash-resume-pipeline.mjs`) is unchanged; only mode-doc step 3 swaps out the playwright-cli block. Host swap is one-time manual setup, captured in §Manual Setup.

**Tech Stack:** Python 3.10+, Scrapling 0.3+ installed in a project-local venv at `.venv/` (Ubuntu 24.04 + PEP 668 force venv use; system pip is externally-managed), Patchright Chromium (downloaded by `playwright install chromium`, ~110 MB), Node.js test runner (existing), Linux swapfile (one-time `sudo`).

**Driver spec:** `docs/superpowers/specs/2026-05-08-scrapling-jd-fetcher-design.md` (commit `f186c01`).

---

## Manual Setup (user runs ONCE before Task 1)

These steps require `sudo` and depend on the user's local machine. They cannot be automated by the implementer. **The implementer must verify these are done before starting Task 1** (Task 1 has a check step).

### A. Add 4 GB swap (kills OOM-killer)

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h    # verify swap shows 4Gi
```

### B. Install Scrapling into a project-local venv

Ubuntu 24.04 ships with no system pip and the system Python is externally-managed (PEP 668). Use a project-local venv. If `python3-venv` and `python3-pip` aren't installed:

```bash
sudo apt install -y python3.12-venv python3-pip
```

Then create the venv and install:

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
python3 -m venv .venv
.venv/bin/pip install 'scrapling[fetchers]>=0.3.0'
```

### C. Download Patchright's Chromium (one-time, ~110 MB)

Scrapling 0.4.x uses Patchright (a stealth-patched Playwright fork). It needs its own Chromium build, separate from playwright-cli's:

```bash
.venv/bin/playwright install chromium
```

Verify the install:

```bash
.venv/bin/python3 -c "from scrapling.fetchers import StealthyFetcher; p = StealthyFetcher.fetch('https://example.com', headless=True); print('warmup status:', p.status); print('title:', p.css('title::text').get())"
```

Expected: `warmup status: 200` and `title: Example Domain`.

---

## Task 1: Project hygiene (requirements.txt + .gitignore)

**Files:**
- Create: `requirements.txt`
- Modify: `.gitignore`

- [ ] **Step 1: Verify Manual Setup A is done**

Run: `free -h | grep -i swap`
Expected: a line showing total swap of `4.0Gi` or higher. If it shows `0B`, the user has not run Manual Setup A. **STOP** and remind them.

- [ ] **Step 2: Verify Manual Setup B+C are done**

Run: `.venv/bin/python3 -c "from scrapling.fetchers import StealthyFetcher; print('ok')"`
Expected: prints `ok`. If it prints `ModuleNotFoundError` or the file `.venv/bin/python3` doesn't exist, **STOP** and remind the user to run Manual Setup B+C.

- [ ] **Step 3: Create `requirements.txt`**

Write the file with this single dependency line:

```
scrapling[fetchers]>=0.3.0
```

- [ ] **Step 4: Add Python hygiene patterns to `.gitignore`**

Read `.gitignore` first. Then append a Python section just before the final blank line (or at end of file):

```
# Python
__pycache__/
*.pyc
.venv/
```

- [ ] **Step 5: Commit**

```bash
git add requirements.txt .gitignore
git commit -m "$(cat <<'EOF'
chore: add Python project hygiene (requirements.txt + gitignore)

Scaffolds the Python side of the Scrapling JD fetcher per the design spec.
No behavior change yet.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: TDD — source_hint detection (red → green)

**Files:**
- Create: `scrapling_fetch.py` (skeleton with `--detect-source` mode only, no Scrapling import yet)
- Modify: `tests/test-yash-pipeline-smoke.mjs` (add new test section)

The unit-testable part of the helper is host-to-portal mapping. We test it via a `--detect-source` subcommand that uses only stdlib (no Scrapling), so the test runs in CI without a real fetch.

- [ ] **Step 1: Write the failing test**

Open `tests/test-yash-pipeline-smoke.mjs`. Find the `main()` function. Just BEFORE the line `await runFixture(8765, 'lever-sample.html', ...)`, add a new test block:

```javascript
    // === Scrapling helper: source-hint detection (no network) ===
    {
      const HELPER = resolve(ROOT, 'scrapling_fetch.py');
      const cases = [
        ['https://jobs.lever.co/openai/123',                         'lever'],
        ['https://jobs.ashbyhq.com/anthropic/456',                   'ashby'],
        ['https://boards.greenhouse.io/scale/jobs/789',              'greenhouse'],
        ['https://example.workday.com/job/abc',                      'workday'],
        ['https://mogo.applytojob.com/apply/x/y',                    'other'],
      ];
      const PY = resolve(ROOT, '.venv/bin/python3');
      for (const [url, expected] of cases) {
        const out = await execFileP(PY, [HELPER, '--detect-source', url], { cwd: ROOT, timeout: 10000 });
        const obj = JSON.parse(out.stdout.trim());
        if (obj.source_hint === expected) ok(`source_hint(${url}) → ${expected}`);
        else ng(`source_hint(${url}) expected ${expected}, got ${obj.source_hint}`);
      }
    }
```

(Reuse the `ok()`, `ng()`, `execFileP`, `resolve`, and `ROOT` already imported at the top of the file. Do not redeclare.)

- [ ] **Step 2: Run the test, confirm it fails**

```bash
node tests/test-yash-pipeline-smoke.mjs
```

Expected: tests crash with something like `ENOENT: no such file or directory, open '.../scrapling_fetch.py'` or similar (helper doesn't exist yet). This proves the test reaches the new code path.

- [ ] **Step 3: Implement `scrapling_fetch.py` skeleton**

Create the file with ONLY the `--detect-source` path. No Scrapling import yet (that comes in Task 3). This makes the test green without requiring Scrapling on the test runner.

```python
#!/usr/bin/env python3
"""Stealthy JD fetcher for /yash-resume-pipeline. CLI:

  python3 scrapling_fetch.py <url>                     # live fetch (uses Scrapling)
  python3 scrapling_fetch.py --detect-source <url>     # host→portal mapping only (stdlib)
"""
import sys
import json
import urllib.parse


def detect_source(url: str) -> str:
    host = urllib.parse.urlparse(url).hostname or ""
    for h in ("lever", "ashby", "greenhouse", "workday"):
        if h in host:
            return h
    return "other"


def main() -> None:
    if len(sys.argv) >= 3 and sys.argv[1] == "--detect-source":
        print(json.dumps({"source_hint": detect_source(sys.argv[2])}))
        sys.exit(0)

    if len(sys.argv) != 2:
        print(json.dumps({"status": "fail", "error": "usage: scrapling_fetch.py [--detect-source] <url>"}))
        sys.exit(1)

    # Live fetch path (filled in Task 3)
    print(json.dumps({"status": "fail", "error": "live fetch not yet implemented"}))
    sys.exit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the test, confirm it passes**

```bash
node tests/test-yash-pipeline-smoke.mjs
```

Expected: 5 new green lines for `source_hint(...)` cases, plus all existing tests still passing. If any case fails, the bug is in `detect_source()`.

- [ ] **Step 5: Commit**

```bash
git add scrapling_fetch.py tests/test-yash-pipeline-smoke.mjs
git commit -m "$(cat <<'EOF'
feat(fetcher): add scrapling_fetch.py skeleton with --detect-source mode

Pure-stdlib host→portal mapping (lever/ashby/greenhouse/workday/other),
unit-tested in tests/test-yash-pipeline-smoke.mjs. Live fetch path is a
placeholder filled in the next commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Implement live fetch path (Scrapling integration)

**Files:**
- Modify: `scrapling_fetch.py`

This task adds the actual Scrapling-backed fetch. The CI smoke test does NOT exercise this path (it requires Scrapling installed + Patchright Chromium + network). Verification is the live Layer-2 gate in Task 5.

- [ ] **Step 1: Read the current `scrapling_fetch.py`**

(Required by the editing tool before any modifications.)

- [ ] **Step 2: Replace the live-fetch placeholder block**

Locate the comment `# Live fetch path (filled in Task 3)` and the two lines that follow it (the placeholder `print(...)` and `sys.exit(1)`). Replace those three lines with:

```python
    # Live fetch path
    url = sys.argv[1]
    try:
        from scrapling.fetchers import StealthyFetcher  # lazy import (keeps --detect-source stdlib-only)
        page = StealthyFetcher.fetch(
            url,
            headless=True,
            network_idle=True,
            solve_cloudflare=True,
            timeout=90000,
        )
    except ImportError as e:
        print(json.dumps({"status": "fail", "error": f"scrapling not installed: {e}", "url": url}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"status": "fail", "error": f"fetch error: {str(e)[:300]}", "url": url}))
        sys.exit(1)

    if getattr(page, "status", 200) >= 400:
        print(json.dumps({"status": "fail", "error": f"http {page.status}", "url": url}))
        sys.exit(1)

    title = (page.css("title::text").get() or "").strip()
    body = page.get_all_text(strip=True)

    if len(body) < 200:
        print(json.dumps({"status": "fail", "error": "body too short (<200 chars)", "url": url}))
        sys.exit(1)

    print(json.dumps({
        "status": "ok",
        "url": url,
        "title": title,
        "body": body,
        "source_hint": detect_source(url),
    }))
    sys.exit(0)
```

- [ ] **Step 3: Sanity-check that the existing smoke tests still pass**

```bash
node tests/test-yash-pipeline-smoke.mjs
```

Expected: all `source_hint(...)` cases still pass (the new code is below the early-return for `--detect-source`, so it doesn't affect them).

- [ ] **Step 4: Verify the helper module imports cleanly**

```bash
.venv/bin/python3 -c "import scrapling_fetch; print('ok')" 2>&1
```

Run from project root. Expected: `ok` (the lazy import inside `main()` means the module-level import doesn't pull in Scrapling).

- [ ] **Step 5: Commit**

```bash
git add scrapling_fetch.py
git commit -m "$(cat <<'EOF'
feat(fetcher): add live Scrapling fetch path with Cloudflare bypass

StealthyFetcher.fetch with solve_cloudflare=True, 90s timeout, lazy
import so the --detect-source path stays stdlib-only. Failure paths
emit JSON {status:"fail",error,url} with exit 1, matching the existing
mark-failed contract used by the orchestrator.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update mode doc step 3

**Files:**
- Modify: `modes/yash-resume-pipeline.md`

Replace the entire playwright-cli block in step 3 with the Scrapling invocation. Per the spec §5.3.

- [ ] **Step 1: Read the current mode doc**

Run: `cat modes/yash-resume-pipeline.md`. Confirm step 3 contains the playwright-cli block:

```
3. **Extract JD via Playwright** (in `/tmp` to avoid `.playwright-cli/` polluting the repo):

   ```bash
   cd /tmp
   playwright-cli open <url> --browser=chromium
   playwright-cli eval "() => document.title"
   playwright-cli eval "() => document.body.innerText"
   playwright-cli close
   ```

   On any tool error (timeout, 404, login wall, expired posting):
   - run `mark-failed --url <url> --reason "playwright: <short-error>"`
   - run `log --status fail --url <url> --reason "..."`
   - ask user: continue with next URL? (yes / quit)
```

- [ ] **Step 2: Replace step 3 wholesale**

Use Edit to replace the block above with:

```
3. **Extract JD via Scrapling** (stealth fetcher, bypasses Cloudflare/Akamai):

   ```bash
   .venv/bin/python3 scrapling_fetch.py <url>
   ```

   Returns JSON on stdout, exit 0 on ok / exit 1 on fail.

   - On `status: "ok"` → use `title`, `body`, and `source_hint` from the JSON to continue.
   - On `status: "fail"`:
     - run `mark-failed --url <url> --reason "scrapling: <error from JSON>"`
     - run `log --status fail --url <url> --reason "scrapling: <error from JSON>"`
     - ask user: continue with next URL? (yes / quit)

   The `source_hint` field already provides the portal mapping (lever / ashby / greenhouse / workday / other) so step 4's "Use the URL host as a portal hint" instruction is satisfied automatically — just propagate the hint.
```

- [ ] **Step 3: Verify the rest of the mode is untouched**

Run: `git diff modes/yash-resume-pipeline.md`. Expected: only step 3 changed; steps 1, 2, 4-13 and the Stop conditions / Hard rules sections all unchanged.

- [ ] **Step 4: Commit**

```bash
git add modes/yash-resume-pipeline.md
git commit -m "$(cat <<'EOF'
feat(mode): switch yash-resume-pipeline step 3 to Scrapling helper

Replaces the playwright-cli block with .venv/bin/python3 scrapling_fetch.py <url>.
Same JSON contract for downstream steps (title/body/source_hint). Failure
flow unchanged — still routes through mark-failed → log fail → ask user.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Layer-2 live test (Cloudflare regression on URL #2)

**Files:** none (verification gate only)

This is the gate that proves Scrapling actually solves the problem we set out to solve. **If this fails, do not proceed to Task 6.** Debug `solve_cloudflare`, timeout, or fetch options before continuing.

- [ ] **Step 1: Run helper against URL #2 (the GEI Consultants Cloudflare wall)**

```bash
.venv/bin/python3 scrapling_fetch.py "https://jointeamgei.geiconsultants.com/jobs/17570679-ai-engineer?tm_job=856250&tm_event=view&tm_company=90289&bid=549" \
  > /tmp/url2-fetch.json 2> /tmp/url2-fetch.err
echo "exit: $?"
cat /tmp/url2-fetch.err
jq '.status, .title, (.body | length), .source_hint' /tmp/url2-fetch.json
```

Expected:
- `exit: 0`
- `.status` is `"ok"`
- `.title` contains `"AI Engineer"` (case-insensitive) or the company name `"GEI"`
- `.body` length is `> 1000`
- `.source_hint` is `"other"` (geiconsultants.com isn't lever/ashby/greenhouse/workday)

- [ ] **Step 2: If failure, debug; if success, proceed**

If `.status` is `"fail"`:
- Read `.error` field. Common causes:
  - `cloudflare unsolved` → bump `timeout` from 90000 to 180000 in `scrapling_fetch.py:Step 2 of Task 3`. Re-test.
  - `timeout` → same as above.
  - `body too short` → likely a redirect to a login wall. URL might be expired; mark this URL `Discarded` and move on.
  - `ImportError` → Manual Setup B incomplete; re-run `.venv/bin/pip install -r requirements.txt`.
- After any change, re-run Step 1.
- If three retries fail with different errors, **stop and report to the user**. Do not declare success.

If `.status` is `"ok"` with the expected content, proceed to Task 6.

- [ ] **Step 3: No commit (no code change)**

Verification gate only.

---

## Task 6: Save memory + finalize

**Files:**
- Create: memory file under `/home/yash/.claude/projects/-yash-superClaudeHuman-projects-yash-ai-automation-career/memory/`
- Modify: `MEMORY.md` (memory index)

- [ ] **Step 1: Create memory note about the fetcher swap**

Write to `/home/yash/.claude/projects/-yash-superClaudeHuman-projects-yash-ai-automation-career/memory/project_yash_resume_pipeline_scrapling_fetcher.md`:

```markdown
---
name: yash-resume-pipeline JD fetcher is Scrapling, not playwright-cli
description: Step 3 of /yash-resume-pipeline shells to .venv/bin/python3 scrapling_fetch.py <url>. Bypasses Cloudflare automatically. Free, account-safe, no LLM API needed.
type: project
---

As of 2026-05-08, the JD-extraction step of `/yash-resume-pipeline` uses `scrapling_fetch.py` (Python helper, Scrapling's `StealthyFetcher`) — NOT `playwright-cli`. Driver: URL #2 (GEI Consultants) was blocked by Cloudflare on 2026-05-08; Scrapling's `solve_cloudflare=True` mode handles it.

**Contract (called from mode step 3):**
```bash
.venv/bin/python3 scrapling_fetch.py <url>
```
- exit 0 + `{status:"ok", url, title, body, source_hint}` on success
- exit 1 + `{status:"fail", error, url}` on any failure

`source_hint` is one of `lever | ashby | greenhouse | workday | other` (stdlib host detection).

**Key properties:**
- Free, self-hosted, no LLM API required.
- Account-safe — Patchright Chromium with fresh fingerprint per fetch, does NOT touch user's Chrome profile or cookies.
- Failure flow unchanged from before — still routes through `mark-failed` → `log fail` → ask user.

**If a future URL fails:** check `error` in the JSON. Common cases: `cloudflare unsolved` (raise timeout), `body too short` (likely login wall, mark Discarded), `ImportError` (Scrapling not installed — see requirements.txt + manual setup in design spec).

**Do NOT revert to playwright-cli** unless explicitly asked. The spec at `docs/superpowers/specs/2026-05-08-scrapling-jd-fetcher-design.md` documents the rollback path if needed.
```

- [ ] **Step 2: Add the new memory to `MEMORY.md`**

Read `/home/yash/.claude/projects/-yash-superClaudeHuman-projects-yash-ai-automation-career/memory/MEMORY.md`. Append a new line (preserving existing entries):

```
- [yash-resume-pipeline JD fetcher is Scrapling](project_yash_resume_pipeline_scrapling_fetcher.md) — step 3 shells to .venv/bin/python3 scrapling_fetch.py <url>; bypasses Cloudflare via Patchright; free, account-safe.
```

- [ ] **Step 3: No git commit**

Memory files live in `~/.claude/projects/.../memory/` (outside the repo). Nothing in this task modifies repo files. The plan document itself is committed separately, before execution begins.

---

## Task 7: Resume URL #2 in the live pipeline (Layer-3 verification)

**Files:** none (live run)

This is the user-facing payoff — the actual reason for all the previous work.

- [ ] **Step 1: Confirm URL #2 is back in the pending queue**

Run: `node yash-resume-pipeline.mjs next-pending`
Expected: returns the GEI Consultants URL with `status: "ok"` (it was returned to pending when we marked it failed earlier; verify before proceeding).

If `next-pending` returns a different URL, the queue order has changed — proceed with whatever URL it returns; the test value is the same.

- [ ] **Step 2: Run the pipeline mode loop for that one URL**

Follow `modes/yash-resume-pipeline.md` steps 2 → 12 (extract via Scrapling, parse fields, slugify, dedup, write JD .md, apply V2.0 with `\ifdefined` guards, write .tex to `/tmp`, compile, write sidecar to `resume-logs/`, mark-processed, log).

Per memory rules:
- `.tex` file goes to `/tmp/<slug>.tex`, NOT `resumes/`.
- `.log` sidecar goes to `resume-logs/<slug>.log`, NOT `resumes/`.
- LaTeX template includes `\ifdefined\pdfgentounicode\input{glyphtounicode}\fi` and `\ifdefined\pdfgentounicode\pdfgentounicode=1\fi` guards (tectonic XeTeX patch).

- [ ] **Step 3: Verify final on-disk artifacts**

```bash
ls -la jds/JD_*GEI*_2026-05-08.md \
       resumes/*GEI*_Resume_2026-05-08.pdf \
       resume-logs/*GEI*_Resume_2026-05-08.log 2>&1
```

Expected:
- A new `jds/JD_<GEI-company>_<role>_Yash_Anghan_2026-05-08.md` file
- A new `resumes/<...>.pdf` of size > 20 KB
- A new `resume-logs/<...>.log` containing `score:`, `deficiencies:`, `status:`
- NO `.tex` file in `resumes/` (per memory rule)

- [ ] **Step 4: Verify the orchestrator's tracker**

```bash
grep -A2 'Procesadas' data/pipeline.md
tail -3 data/yash-resume-runs.log
```

Expected:
- `data/pipeline.md` `## Procesadas` section has a new line ending with `Score X/100` for the GEI URL
- `data/yash-resume-runs.log` has a JSONL line with `"status":"ok"` for the GEI URL

- [ ] **Step 5: No commit (no code change in this task)**

The artifacts produced by this task (JD .md, PDF, sidecar .log, pipeline.md mutations) are all gitignored or are user-data updates. Nothing to commit. The pipeline state itself is the deliverable.

---

## Self-Review

Spec coverage check:
- §3 (tool selection) → captured in plan header + Task 3 Scrapling import.
- §4 (architecture) → Task 4 (mode doc swap) implements the only mjs-side touch.
- §5 (components) → Task 1 (requirements + gitignore), Task 2 (helper skeleton + tests), Task 3 (live fetch).
- §6 (manual setup) → captured in §Manual Setup at top of plan + Task 1 verification steps.
- §7 (data flow) → preserved by Task 4 mode-doc rewrite.
- §8 (error handling) → Task 3 fetch path + Task 5 debug branch.
- §9 (concurrency) → unchanged from existing pipeline; nothing to do.
- §10 (testing) → Layer 1 = Task 2; Layer 2 = Task 5; Layer 3 = Task 7.
- §11 (account safety) → no implementation needed; Task 6 memory note records the property.
- §12 (migration/rollback) → captured in Task 6 memory note.
- §14 (definition of done) → all 8 items mapped to tasks above.

Placeholder scan: no TBD/TODO/`<placeholder>` patterns found. All code blocks are concrete; all commands have expected output described.

Type/name consistency: helper exposes `detect_source(url) -> str`; tests, live-fetch path, and memory note all reference the same name. JSON keys (`status`, `error`, `url`, `title`, `body`, `source_hint`) consistent across Task 2 (skeleton fail JSON), Task 3 (success/fail JSON), Task 4 (mode doc consumption), Task 6 (memory note), Task 5 (verification jq calls). Exit codes (0 on ok, 1 on fail) consistent everywhere.

---

## Definition of Done

- [ ] Manual Setup A, B, C completed by the user
- [ ] Tasks 1-4 committed (4 commits in `main` history)
- [ ] Task 5 (Layer-2 live test) passes for URL #2
- [ ] Task 6 memory note exists and is referenced in `MEMORY.md`
- [ ] Task 7 produces a real GEI Consultants PDF in `resumes/` and a sidecar in `resume-logs/`
- [ ] `data/pipeline.md` has GEI URL in `## Procesadas` section
- [ ] `data/yash-resume-runs.log` has a fresh `ok` line for the GEI URL
