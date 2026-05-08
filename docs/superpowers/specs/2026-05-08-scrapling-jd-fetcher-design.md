# Scrapling JD Fetcher — Design Spec

**Date:** 2026-05-08
**Status:** Approved (5/5 sections)
**Owner:** Yash Anghan
**Driver problem:** `/yash-resume-pipeline` URL #2 (GEI Consultants) blocked by Cloudflare on 2026-05-08; headless playwright-cli stuck >60s on "Just a moment..." interstitial. Manual paste rejected as a fallback. Need a free, account-safe, automated bypass.

---

## 1. Goal

Replace the existing `playwright-cli` JD fetcher in `/yash-resume-pipeline` with a stealth fetcher that bypasses Cloudflare/Akamai/etc. **without** any of:

- Paid scraping APIs (ScraperAPI, ZenRows, Bright Data, etc.)
- Paid LLM API calls per page (browser-use's agent mode)
- The user's authenticated Chrome profile or Google cookies (account-safety risk)
- Manual paste-the-JD as a fallback

Plus: stop the host's RAM pressure from killing the user's daily Chrome browser whenever the pipeline runs.

## 2. Non-goals

- Solving every possible bot-protection vendor with 100% reliability (impossible without paid services).
- Building a scraping QA harness across many sites — out of scope.
- Replacing `playwright-cli` for any other use case in the project; this only touches `/yash-resume-pipeline`'s JD-fetch step.
- Re-architecting the orchestrator (`yash-resume-pipeline.mjs`) — it stays unchanged.
- Modifying `resume-optimization-system-based-on-job-description.md` (V2.0 prompt) or `generate-pdf-latex.mjs` (existing hard rules).

## 3. Tool selection

Three candidates evaluated:

| Repo | Stars | License | Verdict |
|---|---|---|---|
| `browser-use/browser-use` | 92.9K | MIT | **Reject** — agent mode requires LLM API keys (recurring cost); "best stealth" is on their paid cloud only. |
| `LvcidPsyche/auto-browser` | 419 | MIT | **Reject** — README explicitly states "Not the Goal: stealth or anti-bot work". Built for authorized internal workflows. Heavyweight Docker stack. |
| `D4Vinci/Scrapling` | 47.6K | BSD-3 | **Accept** — purpose-built for this exact problem. `StealthyFetcher` claims to "bypass all types of Cloudflare's Turnstile/Interstitial with automation" out of the box. Free, self-hosted, no LLM dependency, no auth required. |

## 4. Architecture

Two isolated changes:

### 4.1 JD fetcher swap

Replace the playwright-cli invocations in mode step 3 of `modes/yash-resume-pipeline.md` with a single shell-out to a Python helper.

```
data/pipeline.md                                      data/yash-resume-runs.log
        │                                                       ▲
        ▼                                                       │
yash-resume-pipeline.mjs ──── shells to ───► scrapling_fetch.py │
                                                    │           │
                                            (Cloudflare bypass) │
                                                    ▼           │
                                            {title, body, hint} │
                                                    │           │
                                                    ▼           │
                              (existing flow: V2.0 → tex → tectonic → pdf)
```

The orchestrator (`yash-resume-pipeline.mjs`) does **not** change. The mode flow downstream of step 3 (parse fields → slugify → dedup → V2.0 → compile → mark) is **identical** to today.

### 4.2 Host swap

Add 4 GB persistent swap via `/etc/fstab` so the OOM-killer stops killing the user's daily Chrome when the pipeline runs. Independent of the fetcher change. One-time manual setup.

## 5. Components

### 5.1 New: `scrapling_fetch.py` (project root)

Single-shot CLI helper. Same shell-out pattern as `generate-pdf-latex.mjs` shelling to `tectonic`.

**Contract:**
- Input: `python3 scrapling_fetch.py <url>` (one argv)
- Output: JSON line on stdout
- Exit codes: `0` on ok, `1` on fail

**Output schema (ok):**
```json
{
  "status": "ok",
  "url": "<the-url>",
  "title": "<page title>",
  "body": "<full innerText, stripped>",
  "source_hint": "lever|ashby|greenhouse|workday|other"
}
```

**Output schema (fail):**
```json
{
  "status": "fail",
  "error": "<short message>",
  "url": "<the-url>"
}
```

**Implementation:**
```python
#!/usr/bin/env python3
"""Single-shot stealthy JD fetcher. CLI: python3 scrapling_fetch.py <url>"""
import sys, json, urllib.parse
from scrapling.fetchers import StealthyFetcher

def detect_source(url):
    host = urllib.parse.urlparse(url).hostname or ""
    for h in ("lever", "ashby", "greenhouse", "workday"):
        if h in host:
            return h
    return "other"

def main():
    if len(sys.argv) != 2:
        print(json.dumps({"status": "fail", "error": "usage: scrapling_fetch.py <url>"}))
        sys.exit(1)
    url = sys.argv[1]
    try:
        page = StealthyFetcher.fetch(
            url,
            headless=True,
            network_idle=True,
            solve_cloudflare=True,
            timeout=90000,
        )
        if page.status >= 400:
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
    except Exception as e:
        print(json.dumps({"status": "fail", "error": str(e)[:500], "url": url}))
        sys.exit(1)

if __name__ == "__main__":
    main()
```

### 5.2 New: `requirements.txt` (project root)

```
scrapling[fetchers]>=0.3.0
```

### 5.3 Updated: `modes/yash-resume-pipeline.md` step 3

The current step-3 playwright-cli block (the four `cd /tmp && playwright-cli ...` lines covering open / eval title / eval body / close) is **removed wholesale** and replaced with:

```markdown
3. **Extract JD via Scrapling** (stealth fetcher with Cloudflare bypass):

   ```bash
   python3 scrapling_fetch.py <url>
   ```

   Parse the JSON output:
   - On `status: "ok"` → use `title`, `body`, `source_hint` to continue.
   - On `status: "fail"`:
     - run `mark-failed --url <url> --reason "scrapling: <error>"`
     - run `log --status fail --url <url> --reason "..."`
     - ask user: continue with next URL? (yes / quit)
```

### 5.4 Updated: `.gitignore`

Add Python hygiene:
```
__pycache__/
*.pyc
.venv/
```

### 5.5 Untouched (explicit)

- `yash-resume-pipeline.mjs` — no changes.
- `generate-pdf-latex.mjs` — no changes.
- `resume-optimization-system-based-on-job-description.md` — no changes (mode hard rule).
- `tests/fixtures/jds/*.html` — no changes; the smoke test continues to verify the orchestrator's parsing and tectonic round-trip against these fixtures.
- All existing memory files — current learnings (tectonic patch, no-.tex-on-disk, resume-logs/) all still apply.

## 6. One-time manual setup

User-driven, three steps, ~5 minutes total. Spec captures the exact commands so they can be replayed.

### Step A — Add 4 GB swap

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h    # verify swap shows 4Gi
```

Persists across reboots via fstab. Bump to `8G` if `free -h` shows >50% utilization during a run.

### Step B — Install Scrapling

```bash
cd /yash-superClaudeHuman/projects/yash-ai-automation-career
pip install --user -r requirements.txt
```

`--user` keeps it under `~/.local/lib/python3.x/`; no sudo, no system pollution. ~30s.

### Step C — Trigger Camoufox download

```bash
python3 -c "from scrapling.fetchers import StealthyFetcher; StealthyFetcher.fetch('https://example.com', headless=True)"
```

First run downloads Camoufox (Scrapling's stealth-patched Firefox, ~150 MB) into `~/.cache/scrapling/`. Subsequent runs are instant.

## 7. Data flow per URL

```
1. orchestrator: next-pending           → URL
2. ask user: yes / skip / quit
3. python3 scrapling_fetch.py <url>     → {status, title, body, source_hint}
4. parse fields (LLM judgment)          → company, role, location, posted_date
5. orchestrator: slugify + check-duplicate
6. write jds/JD_<slug>.md
7. apply V2.0 prompt (in-context, with \ifdefined guards baked in) → LaTeX
8. write /tmp/<slug>.tex (NOT in repo, per memory)
9. orchestrator: compile-resume         → resumes/<slug>.pdf
10. write resume-logs/<slug>.log        (per memory)
11. orchestrator: mark-processed + log
12. report to user; loop
```

Steps 1-2 and 4-12 are unchanged from current behavior. Only step 3 changes.

## 8. Error handling

| Failure | Where | Detection | Action |
|---|---|---|---|
| Scrapling timeout (>90s) | `scrapling_fetch.py` | exception caught | exit 1, JSON `{status:"fail","error":"timeout..."}` |
| HTTP 4xx/5xx | helper | `page.status >= 400` | exit 1 with `error: "http <code>"` |
| Cloudflare solver gave up | helper | exception from `solve_cloudflare=True` | exit 1 with `error: "cloudflare unsolved"` |
| Empty/near-empty body | helper | `len(body) < 200` heuristic | exit 1 with `error: "body too short"` |
| Network/DNS failure | helper | exception caught | exit 1 with the exception message |
| LLM can't parse company/role | mode step 4 | confidence low | ask user once; if can't say, mark-failed |
| V2.0 hard-fail | mode step 7 | no `\documentclass` in output | mark-failed (existing) |
| Tectonic compile fail | orchestrator step 9 | `{status:"fail"}` | mark-failed (existing) |
| 3 consecutive failures | orchestrator | counter | stop loop, prompt user |

All Scrapling failures route to the existing `mark-failed → log fail → ask continue` flow. **No new failure paths introduced** — only the upstream cause of step-3 failures changes.

## 9. Concurrency & resource model

- **One URL at a time** (existing hard rule, unchanged).
- Helper exits per call — no daemon, no persistent browser state.
- Each fetch spawns a fresh Camoufox process → fetches → exits. RAM spike is short (~10s).
- With 4 GB swap on a 7.8 GB box, the user's Chrome survives the spike. Without swap, OOM-killer is the observed failure.

## 10. Testing

### Layer 1 — Helper unit smoke (CI-safe, deterministic)

Add a new section to `tests/test-yash-pipeline-smoke.mjs` (single file, not a sibling — keeps the smoke surface in one place). Three cases:
1. Helper accepts argv URL → emits valid JSON to stdout
2. JSON has required keys: `status`, `url`, `title`, `body`, `source_hint`
3. `source_hint` mapping: lever.co → `lever`, jobs.ashbyhq.com → `ashby`, boards.greenhouse.io → `greenhouse`, *.workday.com → `workday`, anything else → `other`

Runs against the existing local `serveFixtures()` HTTP server (port 8765). Fast, no network, no Cloudflare.

### Layer 2 — Live Cloudflare regression (manual, one-shot)

```bash
python3 scrapling_fetch.py "https://jointeamgei.geiconsultants.com/jobs/17570679-ai-engineer?tm_job=856250&tm_event=view&tm_company=90289&bid=549" \
  | jq '.status, .title, (.body | length)'
```

**Pass criteria:** `status: "ok"`, title contains "AI Engineer" or "GEI", body length > 1000 chars.

If this fails, do not ship. Debug Scrapling's `solve_cloudflare=True` config (timeout, headers, network_idle wait) before declaring done.

### Layer 3 — Full pipeline live test

Resume `/yash-resume-pipeline` from URL #2. Must process cleanly through to `mark-processed` and a real PDF in `resumes/`.

### Out of CI scope

- Layers 2 & 3 are network-dependent against sites we don't control. Stay manual / on-demand.
- Scrapling's robustness across all bot-protection vendors. Not our QA target.
- Swap behavior. Verified by `free -h`, not by code test.

## 11. Account safety analysis

Per the user's hard constraint: **no risk to their Google account, Gmail, IP reputation, or any logged-in profile.**

- Scrapling's `StealthyFetcher` runs Camoufox (a fork of Firefox) in a fresh, ephemeral profile. **It does not read or write `~/.config/google-chrome/`, `~/.mozilla/firefox/`, or any user-profile directory.**
- Each fetch uses a freshly-randomized browser fingerprint and TLS profile. **No persistent identity is shared across runs.**
- No login flows. No cookie reuse from the user's browser. No header forwarding from a logged-in session.
- The only outbound trace is the host's IP — same as `playwright-cli` already does today. No additional IP-reputation surface.
- The bypass technique is technical (TLS fingerprint + JS challenge solving), not identity-based (cookies / accounts).

**Verdict:** account safety profile is **equal to or better than** the current `playwright-cli` setup. Switching does not introduce new account risk.

## 12. Migration & rollback

### Migration

1. User runs setup (§6 Steps A-C).
2. I write `scrapling_fetch.py`, `requirements.txt`, update `.gitignore`.
3. I update `modes/yash-resume-pipeline.md` step 3.
4. I run testing Layer 2 (live Cloudflare regression on URL #2). If pass → Layer 3 (full pipeline). If fail → debug, do not merge.
5. Save memory: "JD fetcher is now Scrapling, not playwright-cli."
6. Pipeline resumes from URL #2.

### Rollback

If Scrapling proves unreliable in production:
- Git revert the mode-doc change → step 3 reverts to `playwright-cli` block.
- `scrapling_fetch.py` and `requirements.txt` can stay (unused = harmless) or be removed.
- Swap stays regardless (orthogonal benefit).
- No data migration; no schema change. Rollback is a single revert + memory update.

## 13. Open questions / deferred

- **Camoufox first-run download size on user's box:** README says ~150 MB. Verify during Step C and document if larger.
- **Per-domain timing tuning:** Some Cloudflare-protected sites need longer `network_idle` waits (Workday is famous for this). If we see latency issues, expose `--timeout` and `--network-idle-wait` flags on the helper. Defer until evidence appears.
- **Scrapling version pinning:** `>=0.3.0` is loose. Pin to a specific minor version after first successful run, to avoid silent breakage from upstream behavior changes. Defer until first run is green.
- **Future: same fetcher for liveness checks?** `check-liveness.mjs` and the broader `auto-pipeline` mode also use playwright/WebFetch. Same Cloudflare problem could surface there. Out of scope for this spec. Track separately.

## 14. Definition of done

1. `scrapling_fetch.py` and `requirements.txt` committed.
2. `modes/yash-resume-pipeline.md` step 3 updated.
3. `.gitignore` updated for Python hygiene.
4. Testing Layer 1 (helper smoke) added to `tests/`, passing in CI.
5. Testing Layer 2 (live GEI Consultants URL) passes manually.
6. Testing Layer 3 (full pipeline on URL #2) produces a real PDF in `resumes/`.
7. Memory updated: future sessions know JD fetcher = Scrapling.
8. Pipeline resumed from URL #2 with no manual intervention beyond the §6 setup steps.
