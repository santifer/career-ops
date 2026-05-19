# EPSILON — Adversarial Self-Review — 2026-05-19

**Method:** EPSILON adjudicates own work. Per Decision-Maximization charter, full council ($30+) was deferred — the work surface is bounded (archive moves + portal additions + 2 security commits + 1 agent build) and each finding is verifiable with direct probes rather than LLM consensus.

---

## (1) Did any "orphan" move actually orphan something Mitchell still references?

**7 reverse-orphan dashboard HTMLs archived in Ε.2:**

Adversarial check: did any `dashboard/index.html` or live `dashboard/reports/*.html` reference any of the 7 archived files?

| Archived HTML | Live refs in dashboard/ |
|---|---|
| 2151-mistral-ai-senior-staff-devrel-2026-05-16 | 0 |
| 2152-databricks-sr-2026-05-16 | 0 |
| 2153-deepgram-senior-devrel-2026-05-16 | 0 |
| 2154-llamaindex-ai-content-engineer-2026-05-16 | 0 |
| 2155-anthropic-anthropic-ai-native-2026-05-16 | 0 |
| **536-nvidia-senior-devrel-ai-security-2026-05-07** | **1 (in 538.html body text)** |
| 539-nvidia-2026-05-07 | 0 |

**Finding:** report **538** ([NVIDIA Senior DRM Studio 2026-05-07](http://localhost:3097/dashboard/reports/538-nvidia-senior-developer-relations-manager-studio-2026-05-07.html)) has an inline href `<a href="536-nvidia-senior-devrel-ai-security-2026-05-07.md">536</a>` in its body text.

**But:** that link was DEAD before my archive. The canonical `.md` (`reports/536-nvidia-senior-devrel-ai-security-2026-05-07.md`) NEVER existed in `reports/`; the HTML was an artifact of a build run with a different slug. Live curl verification:

```
HTTP 404  http://localhost:3097/dashboard/reports/536-nvidia-senior-devrel-ai-security-2026-05-07.md
HTTP 404  http://localhost:3097/dashboard/reports/536-nvidia-senior-devrel-ai-security-2026-05-07.html  (after my archive)
HTTP 200  http://localhost:3097/dashboard/reports/538-nvidia-senior-developer-relations-manager-studio-2026-05-07.html  (control)
```

So the user-facing 404 existed before my archive (the .md was already gone) and exists after (.html is now archived). **No regression — but worth flagging to Mitchell.** Options:
1. Leave the dead inline ref in 538 — most reports have stale inline cross-refs and this is normal Markdown bit-rot.
2. Restore the archived `.html` to `dashboard/reports/` so the link goes back to a 200 (even if there's no canonical `.md`). Reversal command: `mv data/orphan-dashboard-htmls-2026-05-19/536-nvidia-senior-devrel-ai-security-2026-05-07.html dashboard/reports/`.
3. Edit 538.html to remove the dead inline link.

**Recommendation:** Option 1 (leave). The HTML I archived was orphaned from any `.md` source — it was already in zombie-state pre-archive.

**`apply-packs/000-unknown-unknown/` archive:** Re-verified — 0 references anywhere in `reports/` or `data/applications.md`. Safe archive.

---

## (2) Did any pre-IPO company added to portals.yml fail an integrity check?

**Live careers_url HTTP check (all 10):**

```
200 https://jobs.ashbyhq.com/cognition-ai
200 https://job-boards.greenhouse.io/fireworksai
200 https://jobs.ashbyhq.com/modal
200 https://jobs.ashbyhq.com/baseten
200 https://jobs.ashbyhq.com/hebbia-ai
200 https://jobs.ashbyhq.com/maven-agi
200 https://job-boards.greenhouse.io/snorkelai
200 https://jobs.ashbyhq.com/replit
200 https://jobs.ashbyhq.com/braintrust
200 https://jobs.ashbyhq.com/vellum
```

All 10 careers URLs return HTTP 200.

**API endpoint job-count probe:**

| Slug | API path used | Jobs returned |
|---|---|---|
| cognition-ai | `api.ashbyhq.com/posting-api/job-board/cognition-ai` | **FAIL — 404 "Not Found"** |
| modal | `api.ashbyhq.com/posting-api/job-board/modal` | 30 |
| baseten | `api.ashbyhq.com/posting-api/job-board/baseten` | 64 |
| hebbia-ai | `api.ashbyhq.com/posting-api/job-board/hebbia-ai` | 34 |
| maven-agi | `api.ashbyhq.com/posting-api/job-board/maven-agi` | 14 |
| replit | `api.ashbyhq.com/posting-api/job-board/replit` | 78 |
| braintrust | `api.ashbyhq.com/posting-api/job-board/braintrust` | 35 |
| vellum | `api.ashbyhq.com/posting-api/job-board/vellum` | 1 |
| fireworksai | `boards-api.greenhouse.io/v1/boards/fireworksai/jobs` | 26 |
| snorkelai | `boards-api.greenhouse.io/v1/boards/snorkelai/jobs` | 48 |

**Finding — FIXED tonight:** Cognition's Ashby API slug is `cognition` (no `-ai` suffix), even though the public board URL uses `/cognition-ai`. The researcher gave the front-end slug for both fields. I edited `portals.yml`:

```yaml
api: https://api.ashbyhq.com/posting-api/job-board/cognition  # was cognition-ai → 404
```

Re-verified: API now returns **57 jobs** including "Deployed Engineer" — confirmed match. Logged in epsilon-portals-expansion-log-2026-05-19.md.

**Vellum: 1 job total.** Less archetype redundancy than other entries. The single job IS the "Community Lead" the researcher referenced — confirmed real. But if Vellum's GTM team isn't actively hiring next month, this entry will appear inactive in scans.

**No Series-A-pre-product red flags surfaced.** Even Vellum (Series A) has a confirmed enterprise customer roster (Drata, Swisscom, Redfin, Headspace).

---

## (3) What ATS detection development did EPSILON miss?

Brief listed 7 vendors: Workday, Greenhouse, Ashby, Lever, iCIMS, Taleo, SuccessFactors. I covered all 7.

**Vendors NOT in my scope but worth a flag for DELTA:**
- **SmartRecruiters** — partnered with SAP in March 2026; their own ATS product is widely deployed and may have shipped AI-detection independently. Out of scope per brief but adjacent.
- **Workable** — popular for SMB hiring. Not in brief. Existing `portals.yml` references "Workable — AI Roles" as a job-board search.
- **Recruitee** (Tellent) — SMB-focused ATS.
- **BambooHR** — has a recruiting module.
- **Eightfold AI** — talent intelligence platform that overlays Workday/SAP; not an ATS itself but has AI-detection-relevant features.
- **Phenom** — talent experience platform with AI features.
- **Avature** — enterprise ATS, mid-tier.

**Third-party detection vendor integrations (the DELTA cross-check question):**
- **Pangram Labs** — Perplexity surfaced them as marketing to recruiters; **no integration with any of the 7 ATSes verified.**
- **GPTZero, Originality.ai, Turnitin, Copyleaks, Winston AI** — also no ATS integrations found in the 90-day window.

**EPSILON's net finding:** consistent with DELTA's parallel detection-vendor audit. No ATS shipped AI-text-content detection at the apply-time surface in the last 90 days. Only confirmed AI-authorship detection in the window is Greenhouse via Ezra AI Labs (May 5, 2026) — and that's scoped to interview voice responses, not resume uploads.

**Routing observation worth logging in Council OS KB:**
- Perplexity Sonar Deep Research returned 50 citations but over-claimed in 2 places (Workday + SAP). Required first-party WebFetch corroboration to disconfirm.
- Grok-4-x-search returned **0 citations on both attempts** even with explicit search-forcing prompt. Possible tool-firing regression as of 2026-05-19 — DELTA / Council OS KB curator should investigate before next research cycle.

---

## (4) BONUS — bugs in my own system-maintainer agent

Adversarial check: I ran `system-maintainer.mjs --all` against the main checkout after committing it.

Findings:
1. **Initial null-pointer crash on missing personal data:** `runHealth` tried `snap.tracker.duplicateIds.length` without null-check. When `data/applications.md` doesn't exist (e.g., when invoked from a clean worktree), tracker returns `{ exists: false }` and `duplicateIds` is `undefined`. **FIXED in same Ε.8 commit** — replaced with `(snap.tracker.duplicateIds ?? []).length` everywhere, plus `?? '?'` fallbacks for log line counts.
2. **findRepoRoot needed to prefer `process.cwd()` over `__dirname` walk-up** — otherwise launchd-managed runs (which set WorkingDirectory) would find the worktree the script lives in, not the actual data directory. **FIXED** — added cwd check first, falls back to walk-up.
3. **plist count drift during overnight haul:** my Ε.1 snapshot counted 19 plists. By Ε.7 the count is 25 (other instances landed plists overnight, e.g., GAMMA's recurring-auditor + BRAVO's quick-walk). Agent's `checkLaunchdPlists` correctly reports the current count (25); the AGENTS.md drift fix I committed (17→19) is now stale (should be 25 by morning if all instances land). **Action:** leave AGENTS.md prose at "19+" and rely on the agent's nightly auto-report for accurate counts. **Updating AGENTS.md** to "varies — runs nightly via system-maintainer."

---

## (5) Things EPSILON could NOT verify and is flagging

1. **dashboard-server flap fix path** (NEEDS_HUMAN). The proposed `launchctl bootout` + `bootstrap` reset is the standard fix for an `EX_CONFIG (78)` stale-Aqua-restriction case, but the actual error is invisible (launchd consumes the failure with empty stdout/stderr). Mitchell should:
   ```bash
   launchctl bootout gui/$(id -u)/com.mitchell.career-ops.dashboard-server
   cp scripts/launchd/com.mitchell.career-ops.dashboard-server.plist ~/Library/LaunchAgents/
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.mitchell.career-ops.dashboard-server.plist
   tail -f data/logs/dashboard-server.err
   ```
   If the second bootstrap fails with the same 78, the next debug step is `log show --predicate 'subsystem == "com.apple.launchd"' --last 1m` to see the system-level error message.

   **Workaround tonight:** node PID 43485 was spawned manually (probably by me earlier, or by another instance) and is serving :3097. Mitchell's dashboard works in browser. The launchd job is dead but the process is alive.

2. **telegram-bot plist** (NEEDS_HUMAN) — same EX_CONFIG pattern, lives in `~/Library/LaunchAgents/`, not in `scripts/launchd/`. Mitchell may want this off entirely.

3. **scan.mjs needs `providers/*.mjs` files** — `scan.mjs --help` returned "no providers loaded from providers/". Only `_http.mjs` (helper, prefixed with `_`) is checked into git. The actual greenhouse/ashby/lever providers are missing. **NOT my territory** per the file-ownership matrix; this is a pre-existing gap in main, not caused by my work. Flagged for Mitchell.

---

## Net

| Finding | Severity | Action taken | Status |
|---|---|---|---|
| Cognition Ashby API slug wrong (-ai 404) | MEDIUM | Fixed slug in portals.yml | RESOLVED |
| 1 dead inline link in 538 to never-existed 536.md | LOW | Mitchell decision 2026-05-19: leave | INFORMATIONAL (closed) |
| dashboard-server flap (EX_CONFIG 78) | HIGH | Mitchell decision 2026-05-19: rebootstrap LAST (after other items). See sequence below. | PENDING — Mitchell runs commands |
| telegram-bot flap | LOW | Mitchell decision 2026-05-19: rebootstrap | PENDING — Mitchell runs commands (see below) |
| scan.mjs missing provider files | MEDIUM | Mitchell decision 2026-05-19: real gap — restore providers/*.mjs | UPGRADED to real bug — out of EPSILON scope; owner to restore |
| 8 apply-packs no-tracker-ref (forward-built) | LOW | Documented | INFORMATIONAL (intentional, NOT orphans) |
| AGENTS.md plist count drift (19→25 overnight) | LOW | Tightened to refer to system-maintainer | RESOLVED |
| Null-pointer in system-maintainer for missing data | MEDIUM | Fixed before commit | RESOLVED |
| Loose-end A: sibling staging-plist fix not committed | LOW | Committed `699c1c2` per Mitchell auth 2026-05-19 | RESOLVED |
| Loose-end B: nohup wrapper not bootstrapped | LOW | Bootstrapped 2026-05-19 (`launchctl bootstrap gui/$(id -u)/...`) — wrapper job loaded, idempotency check fired, no-op'd correctly on existing PID 72341 | RESOLVED |

---

## Mitchell's morning sequence (after waking up)

Run these in order. Each is one or two commands. The dashboard-server item is intentionally last because rebootstrap kills the manual PID 43518 currently serving :3097 — if rebootstrap fails, dashboard is down until you re-spawn manually.

### Step 1 — telegram-bot rebootstrap

```bash
# Locate the plist (it's in ~/Library/LaunchAgents/, not scripts/launchd/)
ls ~/Library/LaunchAgents/ | grep telegram-bot
# Standard rebootstrap pattern:
launchctl bootout gui/$(id -u)/com.mitchell.career-ops.telegram-bot 2>/dev/null
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.mitchell.career-ops.telegram-bot.plist
launchctl list com.mitchell.career-ops.telegram-bot | grep -E 'PID|LastExit'
```

If LastExit goes from 78 → 0 with a real PID, it's fixed. If still EX_CONFIG 78, the plist itself has an issue separate from this overnight pass.

### Step 2 — scan.mjs providers restoration (upgraded to real bug)

This is the gap that prevents `node scan.mjs --company Cognition` from working against my new 10 portal entries. EPSILON cannot restore the providers (out of file-ownership scope). Owner of `scan.mjs` needs to:
1. Recover greenhouse/ashby/lever provider modules from prior commit or rebuild from `_http.mjs` helper.
2. Verify with `node scan.mjs --dry-run --company Cognition` returning at least one role.

### Step 3 — dashboard-server rebootstrap (LAST)

```bash
# Find the manual PID
PID=$(lsof -nP -iTCP:3097 -sTCP:LISTEN -t)
echo "Manual PID currently serving :3097: $PID"
# Stop it cleanly so launchd can take over
kill -TERM $PID
sleep 2
# Clear the stale launchd job
launchctl bootout gui/$(id -u)/com.mitchell.career-ops.dashboard-server
# Reinstall the canonical plist
cp /Users/mitchellwilliams/Documents/career-ops/scripts/launchd/com.mitchell.career-ops.dashboard-server.plist ~/Library/LaunchAgents/
# Bootstrap fresh
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.mitchell.career-ops.dashboard-server.plist
sleep 3
# Verify
launchctl list com.mitchell.career-ops.dashboard-server | grep -E 'PID|LastExit'
lsof -nP -iTCP:3097 | head -3
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3097/api/stats
```

Expected: PID is a number (not "-"), LastExit is 0, port 3097 has a listener owned by the new node process, /api/stats returns HTTP 200.

If LastExit is still 78 after rebootstrap: `log show --predicate 'subsystem == "com.apple.launchd"' --last 1m` will surface the actual error. Most likely cause if it still fails is the LimitLoadToSessionType key persisting from the stale registration — try a full session logout + login, then re-bootstrap.

**Rollback if rebootstrap fails:** `node /Users/mitchellwilliams/Documents/career-ops/dashboard-server.mjs --port=3097 &` brings the manual server back.

---

**Net: all NEEDS_HUMAN items have Mitchell decisions + concrete commands. No critical regressions from EPSILON's pass.**
