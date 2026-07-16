# CLI Bridge — Python Entry Points

**Status:** Pending decision  
**Estimated time:** 1–2h  
**Last updated:** 2026-07-16

## Context

The JS→Python migration is 100% complete (73 scripts ported, 237 tests passing). But **no CLI bridge exists** — users still run `npm run scan` which calls `node scripts/js/scan.mjs`. The Python code is functional but unreachable from the standard workflow.

This plan covers how to make Python the primary runtime while preserving backward compatibility.

---

## Current State

### What exists
- 46 npm scripts in `package.json`, all pointing at `node scripts/js/*.mjs`
- 44 of those 46 have Python equivalents at `python -m scripts.python.<package>.<module>`
- 2 scripts have no Python equivalent: `tracker.mjs` (display-only) and `updater-migration-tests.mjs` (test-only)
- `batch-runner.sh` calls JS directly (lines 651–657)
- `AGENTS.md` Headless section references only JS commands
- No `__main__.py` files exist — all Python CLIs use `python -m` invocation

### What does NOT exist
- No npm scripts pointing at Python
- No shell wrapper scripts
- No `__main__.py` entry points
- No Django management commands wrapping Python scripts
- No mention of Python in AGENTS.md stack description

---

## Options

### Option A — Keep JS, add Python aliases alongside

**How:** Add parallel npm scripts with `:py` suffix pointing at Python modules.

```json
{
  "scan:py": "python -m scripts.python.scanner.scan",
  "merge:py": "python -m scripts.python.tracker.merge_tracker",
  "doctor:py": "python -m scripts.python.admin.doctor"
}
```

**Pros:**
- Zero risk — existing `npm run scan` keeps working
- Users opt-in to Python gradually
- Easy to remove JS scripts later

**Cons:**
- Two commands for the same thing (`scan` vs `scan:py`)
- Users must remember which to use
- JS scripts remain the "default" indefinitely

**Time:** 30 min  
**Best for:** Risk-averse teams, gradual rollout

---

### Option B — Replace JS scripts with Python (recommended)

**How:** Change existing npm scripts to call Python directly. Keep JS files as fallback.

```json
{
  "scan": "python -m scripts.python.scanner.scan",
  "merge": "python -m scripts.python.tracker.merge_tracker"
}
```

**Pros:**
- Single command per operation (no `:py` suffix confusion)
- Python becomes the default immediately
- JS files remain available as manual fallback (`node scripts/js/scan.mjs`)

**Cons:**
- Breaking change if Python has bugs not caught by tests
- Requires Python 3.10+ on user's machine
- `npm run scan` now depends on Python being installed

**Time:** 45 min  
**Best for:** When confidence in Python parity is high (it is — 237 tests, 0 stubs)

---

### Option C — Django management commands

**How:** Wire Python scripts into `backend/manage.py` as Django subcommands.

```bash
python manage.py scan_portals
python manage.py merge_tracker
python manage.py doctor
```

**Pros:**
- Leverages Django's command framework
- Access to Django settings, database, middleware
- Clean separation: CLI tools vs web API

**Cons:**
- Requires Django to be installed and configured
- Overkill for scripts that don't need Django (scanner, tracker utils)
- Ties utility scripts to the backend app
- Longer startup time (Django initialization)

**Time:** 2–3h  
**Best for:** When the Django backend is the primary runtime (not the case today)

---

## Recommendation: Option B + Safety Net

**Primary:** Option B — replace npm scripts with Python calls.  
**Safety net:** Keep JS files in `scripts/js/` as fallback. Add a `--js` flag to critical commands.  
**Prerequisite:** Add `__main__.py` files to all Python packages for cleaner invocation.

### Why Option B?
1. 237 tests pass, 0 stubs — confidence is high
2. Users shouldn't need to know about `:py` suffixes
3. JS files are already committed as fallback
4. The `python -m` invocation is standard Python and works everywhere

---

## Implementation Plan

### Phase 1: Add `__main__.py` entry points (15 min)

Create `__main__.py` in each Python package so users can run:

```bash
python -m scripts.python.scanner        # instead of python -m scripts.python.scanner.scan
python -m scripts.python.tracker        # defaults to merge_tracker
python -m scripts.python.cv             # defaults to generate_pdf
```

**Files to create:**

| Package | Default module | File |
|---|---|---|
| `scripts/python/scanner/` | `scan` | `scripts/python/scanner/__main__.py` |
| `scripts/python/tracker/` | `merge_tracker` | `scripts/python/tracker/__main__.py` |
| `scripts/python/cv/` | `generate_pdf` | `scripts/python/cv/__main__.py` |
| `scripts/python/evaluation/` | `openai_eval` | `scripts/python/evaluation/__main__.py` |
| `scripts/python/admin/` | `doctor` | `scripts/python/admin/__main__.py` |
| `scripts/python/plugins/` | `cli` | `scripts/python/plugins/__main__.py` |
| `scripts/python/pipeline/` | `browser_extract` | `scripts/python/pipeline/__main__.py` |
| `scripts/python/reply/` | `reply_watch` | `scripts/python/reply/__main__.py` |
| `scripts/python/other/` | `openrouter_runner` | `scripts/python/other/__main__.py` |
| `scripts/python/salary/` | `salary_gap` | `scripts/python/salary/__main__.py` |
| `scripts/python/interview/` | `match_star` | `scripts/python/interview/__main__.py` |
| `scripts/python/export/` | `build_dashboard` | `scripts/python/export/__main__.py` |

Each `__main__.py` will:
1. Parse `sys.argv[1:]` for a subcommand name
2. Dispatch to the correct module's `main()` function
3. Fall back to the package's default module if no subcommand given

**Example — `scripts/python/scanner/__main__.py`:**

```python
"""Allow running: python -m scripts.python.scanner [command] [args...]"""
import sys

COMMANDS = {
    "scan": "scripts.python.scanner.scan",
    "scan-ats-full": "scripts.python.scanner.scan_ats_full",
    "check-liveness": "scripts.python.scanner.check_liveness",
    "classify-tier": "scripts.python.scanner.classify_tier",
}

DEFAULT = "scan"

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else DEFAULT
    if cmd in ("-h", "--help"):
        print(f"Usage: python -m scripts.python.scanner [command]\n\nCommands:\n" +
              "\n".join(f"  {k}" for k in COMMANDS))
        return
    if cmd not in COMMANDS:
        print(f"Unknown command: {cmd}\nCommands: {', '.join(COMMANDS)}", file=sys.stderr)
        sys.exit(1)
    mod = __import__(COMMANDS[cmd], fromlist=["main"])
    remaining = sys.argv[2:] if cmd != DEFAULT else sys.argv[1:]
    sys.exit(mod.main(remaining))

if __name__ == "__main__":
    main()
```

### Phase 2: Update `package.json` scripts (15 min)

Replace JS calls with Python calls. Keep original JS files as fallback.

**Strategy:** For each npm script, replace `node scripts/js/X.mjs` with `python -m scripts.python.Y`.

| npm script | Before (JS) | After (Python) |
|---|---|---|
| `scan` | `node scripts/js/scan.mjs` | `python -m scripts.python.scanner.scan` |
| `scan:full` | `node scripts/js/scan-ats-full.mjs` | `python -m scripts.python.scanner.scan_ats_full` |
| `doctor` | `node scripts/js/doctor.mjs` | `python -m scripts.python.admin.doctor` |
| `merge` | `node scripts/js/merge-tracker.mjs` | `python -m scripts.python.tracker.merge_tracker` |
| `dedup` | `node scripts/js/dedup-tracker.mjs` | `python -m scripts.python.tracker.dedup_tracker` |
| `verify` | `node scripts/js/verify-pipeline.mjs` | `python -m scripts.python.tracker.verify_pipeline` |
| `normalize` | `node scripts/js/normalize-statuses.mjs` | `python -m scripts.python.tracker.normalize_statuses` |
| `pdf` | `node scripts/js/generate-pdf.mjs` | `python -m scripts.python.cv.generate_pdf` |
| `cover-letter` | `node scripts/js/generate-cover-letter.mjs --payload` | `python -m scripts.python.cv.generate_cover_letter --payload` |
| `cv:verify-facts` | `node scripts/js/verify-cv-facts.mjs` | `python -m scripts.python.cv.verify_cv_facts` |
| `sync-check` | `node scripts/js/cv-sync-check.mjs` | `python -m scripts.python.admin.cv_sync_check` |
| `update:check` | `node scripts/js/update-system.mjs check` | `python -m scripts.python.admin.update_system check` |
| `update` | `node scripts/js/update-system.mjs apply` | `python -m scripts.python.admin.update_system apply` |
| `rollback` | `node scripts/js/update-system.mjs rollback` | `python -m scripts.python.admin.update_system rollback` |
| `liveness` | `node scripts/js/check-liveness.mjs` | `python -m scripts.python.scanner.check_liveness` |
| `extract` | `node scripts/js/browser-extract.mjs` | `python -m scripts.python.pipeline.browser_extract` |
| `validate:portals` | `node scripts/js/validate-portals.mjs` | `python -m scripts.python.admin.validate_portals` |
| `verify:portals` | `node scripts/js/verify-portals.mjs` | `python -m scripts.python.admin.verify_portals` |
| `find` | `node scripts/js/find.mjs` | `python -m scripts.python.tracker.find` |
| `patterns` | `node scripts/js/analyze-patterns.mjs` | `python -m scripts.python.admin.analyze_patterns` |
| `upskill` | `node scripts/js/upskill.mjs` | `python -m scripts.python.admin.upskill` |
| `add` | `node scripts/js/add-entry.mjs` | `python -m scripts.python.tracker.add_entry` |
| `reposts` | `node scripts/js/detect-reposts.mjs` | `python -m scripts.python.tracker.detect_reposts` |
| `invite-match` | `node scripts/js/invite-match.mjs` | `python -m scripts.python.tracker.invite_match` |
| `paste-reply` | `node scripts/js/paste-reply.mjs` | `python -m scripts.python.reply.paste_reply` |
| `gemini:eval` | `node scripts/js/gemini-eval.mjs` | `python -m scripts.python.evaluation.gemini_eval` |
| `ollama:eval` | `node scripts/js/ollama-eval.mjs` | `python -m scripts.python.evaluation.ollama_eval` |
| `openai:eval` | `node scripts/js/openai-eval.mjs` | `python -m scripts.python.evaluation.openai_eval` |
| `openai:tailor` | `node scripts/js/openai-tailor.mjs` | `python -m scripts.python.evaluation.openai_tailor` |
| `eval:golden` | `node scripts/js/eval-golden.mjs` | `python -m scripts.python.evaluation.eval_golden` |
| `star` | `node scripts/js/match-star.mjs` | `python -m scripts.python.interview.match_star` |
| `archive` | `node scripts/js/archive-posting.mjs` | `python -m scripts.python.other.archive_posting` |
| `prepare:application` | `node scripts/js/prepare-application.mjs` | `python -m scripts.python.other.prepare_application` |
| `build:dashboard` | `node scripts/js/build-dashboard.mjs` | `python -m scripts.python.export.build_dashboard` |
| `manifesto` | `node scripts/js/manifesto.mjs` | `python -m scripts.python.admin.manifesto` |
| `img-to-pdf` | `node scripts/js/img-to-pdf.mjs` | `python -m scripts.python.other.img_to_pdf` |
| `or` | `node scripts/js/openrouter-runner.mjs` | `python -m scripts.python.other.openrouter_runner` |
| `or:scan` | `node scripts/js/openrouter-runner.mjs scan` | `python -m scripts.python.other.openrouter_runner scan` |
| `or:pipeline` | `node scripts/js/openrouter-runner.mjs pipeline` | `python -m scripts.python.other.openrouter_runner pipeline` |
| `or:eval` | `node scripts/js/openrouter-runner.mjs evaluate` | `python -m scripts.python.other.openrouter_runner evaluate` |
| `or:apply` | `node scripts/js/openrouter-runner.mjs apply` | `python -m scripts.python.other.openrouter_runner apply` |
| `reconcile` | `node scripts/js/reconcile-pipeline.mjs` | `python -m scripts.python.tracker.reconcile_pipeline` |

**Unchanged scripts** (no Python equivalent or N/A):
- `tracker` → keep JS (`node scripts/js/tracker.mjs`) — display-only, no Python port
- `update:test` → keep JS (`node scripts/js/updater-migration-tests.mjs`) — test-only
- `serve:dashboard` → keep Go (`cd dashboard && go run . --path ..`)
- `postinstall` → keep Playwright (`npx playwright install chromium --with-deps`)

### Phase 3: Update `batch-runner.sh` (5 min)

Replace JS calls with Python calls:

```bash
# Before (lines 651-657):
node "$PROJECT_DIR/merge-tracker.mjs"
node "$PROJECT_DIR/reconcile-pipeline.mjs"

# After:
python -m scripts.python.tracker.merge_tracker
python -m scripts.python.tracker.reconcile_pipeline
```

### Phase 4: Update `AGENTS.md` (10 min)

1. **Stack section** — add Python to the tech stack description:
   ```
   - Python 3.10+ (scripts/python/ — primary runtime), Node.js (scripts/js/ — fallback), Playwright, YAML, HTML/CSS, Markdown
   ```

2. **Headless/Batch section** — add Python equivalents:
   ```
   | Report number reservation | `python -m scripts.python.tracker.reserve_report_num --count N` |
   | Tracker merge | `python -m scripts.python.tracker.merge_tracker` |
   ```

3. **Update Check section** — the `node scripts/js/update-system.mjs check` call should become:
   ```
   python -m scripts.python.admin.update_system check
   ```

### Phase 5: Add fallback npm scripts (5 min)

Add JS fallback scripts for users who don't have Python installed:

```json
{
  "scan:js": "node scripts/js/scan.mjs",
  "merge:js": "node scripts/js/merge-tracker.mjs",
  "doctor:js": "node scripts/js/doctor.mjs"
}
```

This is optional — can be added later if needed.

### Phase 6: Test (15 min)

1. Run `npm run scan -- --dry-run` — verify Python scanner executes
2. Run `npm run doctor` — verify Python doctor runs
3. Run `npm run merge -- --dry-run` — verify Python merger runs
4. Run `npm run verify` — verify pipeline check runs
5. Run `npm run pdf -- --help` — verify PDF generator runs
6. Run `python -m scripts.python.scanner --help` — verify `__main__.py` dispatch works
7. Run full test suite: `python -m pytest scripts/python/tests -q`

---

## Risk Mitigation

### What could break?
1. **Python not installed** — `npm run scan` fails with `python: command not found`
2. **Missing Python dependencies** — `pip install -r requirements.txt` needed
3. **Argument format differences** — JS and Python CLIs may have slightly different flags
4. **Path resolution** — Python's `PROJECT_ROOT` detection may differ from JS's `import.meta.url`

### Mitigations
1. Add a precheck in `package.json` `pre` scripts that verifies Python is available
2. `pyproject.toml` already lists dependencies — add `pip install -e .` to `postinstall`
3. Argument formats are already aligned (both use argparse with same flags)
4. Python uses `Path(__file__).resolve().parents[N]` — tested and working

### Rollback
If Python scripts fail in production:
1. Revert `package.json` changes: `git checkout HEAD~1 package.json`
2. JS files remain in `scripts/js/` — users can call them directly
3. No data loss — Python scripts write to the same files as JS

---

## Files Modified

| File | Change |
|---|---|
| `scripts/python/scanner/__main__.py` | **NEW** — package entry point |
| `scripts/python/tracker/__main__.py` | **NEW** — package entry point |
| `scripts/python/cv/__main__.py` | **NEW** — package entry point |
| `scripts/python/evaluation/__main__.py` | **NEW** — package entry point |
| `scripts/python/admin/__main__.py` | **NEW** — package entry point |
| `scripts/python/plugins/__main__.py` | **NEW** — package entry point |
| `scripts/python/pipeline/__main__.py` | **NEW** — package entry point |
| `scripts/python/reply/__main__.py` | **NEW** — package entry point |
| `scripts/python/other/__main__.py` | **NEW** — package entry point |
| `scripts/python/salary/__main__.py` | **NEW** — package entry point |
| `scripts/python/interview/__main__.py` | **NEW** — package entry point |
| `scripts/python/export/__main__.py` | **NEW** — package entry point |
| `package.json` | **MODIFIED** — 42 scripts point to Python |
| `batch-runner.sh` | **MODIFIED** — JS → Python calls |
| `AGENTS.md` | **MODIFIED** — add Python to stack, headless section |

---

## Success Criteria

- [ ] `npm run scan -- --dry-run` executes Python scanner
- [ ] `npm run doctor` executes Python doctor
- [ ] `npm run merge -- --dry-run` executes Python merger
- [ ] `python -m scripts.python.scanner --help` shows scanner commands
- [ ] All 237 tests still pass
- [ ] JS fallback scripts still work (`node scripts/js/scan.mjs`)
- [ ] No changes to data files (tracker, reports, pipeline)

---

## Next Steps After CLI Bridge

1. **Push** — the 20 existing commits + bridge changes
2. **End-to-end validation** — run scanner against real portals
3. **Parallel fetch** — add `asyncio` to scanner for performance
4. **Remove JS scripts** — once Python is proven stable, delete `scripts/js/` (future session)
