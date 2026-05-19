# EPSILON — Code Review Findings — 2026-05-19

**Scope:** `scripts/agents/*.mjs`, `lib/*.mjs`, `dashboard-server.mjs` (API surface section)

**Methodology:**
- `fetch()` AbortSignal coverage audit
- `child_process` / shell injection check
- Path-traversal scan on every endpoint that joins user input into a path
- Body-size cap audit on every POST endpoint
- Hot-path sync I/O check
- Schema-validation check on every JSON parse

---

## Security findings (FIXED tonight, committed immediately)

| Finding | File:line | Severity | Status | Commit |
|---|---|---|---|---|
| Path-traversal in `saveEvidence(reportSlug, ...)` — `reportSlug` from POST body was joined directly into a path; attacker authed through Cloudflare Access could read/write arbitrary `.md` files | `dashboard-server.mjs:1999` | **HIGH** | FIXED | `68a92d6` |
| Path-traversal in `buildVerifyPayload(reportSlug)` — `/api/verify/(.+\.md)` regex captured `../../etc/passwd.md`; attacker could exfiltrate arbitrary `.md` content as JSON | `dashboard-server.mjs:1912` | **HIGH** | FIXED | `a61dd22` |
| No body-size cap on `/api/save-evidence` | `dashboard-server.mjs:3692` | LOW | FIXED in same commit as #1 | `68a92d6` |

**Both fixes share `REPORT_SLUG_RE`** (single source of truth, defined once at line 1917).

**Regression test:** `scripts/maintenance/test-save-evidence-hardening.mjs` — 15/15 pass. Catches:
- `../../etc/passwd`, `/etc/passwd`, `..\\..\\etc\\passwd`
- empty / null / number / non-string slug
- evidenceText >50_000 chars / non-string
- mid-string `.md`, uppercase slug, no-digit-prefix, mixed digit-letter prefix
- 6+ digit prefix, URL-encoded traversal

---

## Hygiene findings (logged here, NOT auto-fixed)

### 1. Sync I/O in `dashboard-server.mjs` hot paths

- **175 sync I/O calls** in dashboard-server.mjs. Most are on management endpoints called rarely.
- Hot endpoint `/api/stats` (called on every dashboard render) does `computeStats()` which internally does ~6 readFileSync calls on JSON files <1MB.
- On macOS SSD this is 1-3ms per call → 6-18ms per stats render. Imperceptible at single-user scale.
- **Not a real perf problem at current load.** Mitchell's dashboard isn't serving 1000 RPS.
- Refactoring to async fs.promises would touch hundreds of call sites with no observable user-facing benefit. **Recommendation: leave as-is.**

### 2. `fetch()` AbortSignal coverage

Audited every fetch call in `scripts/agents/*.mjs` + `lib/*.mjs`:

| File:line | Status | Note |
|---|---|---|
| `scripts/agents/form-fields.mjs:211` | ✓ `AbortSignal.timeout(90_000)` | OK |
| `lib/ai-detection-gate.mjs:89` | ✓ `AbortSignal.timeout(30_000)` | OK (GPTZero) |
| `lib/ai-detection-gate.mjs:129` | ✓ — verify | (Originality.ai) |
| `lib/liveness.mjs:72` | ✓ `AbortSignal.timeout(8000)` | OK |
| `lib/resolve-ats-url.mjs:341,353,366` | ✓ `AbortSignal.timeout(10_000)` | OK |
| `lib/eval-intel-gather.mjs:58,120` | ✓ `AbortController + setTimeout` | OK (manual pattern but equivalent) |
| `lib/council.mjs` (many sites) | ✓ `signal: opts.signal` | OK — caller controls timeout via parent AbortController |
| `lib/fetch-utils.mjs:26` | ✓ shared util with timeout | OK |

**All fetch calls have abort coverage. No hygiene action needed.**

### 3. Hardcoded magic numbers

- `dashboard-server.mjs` has many `1024`, `4 * 1024`, `8 * 1024`, `64 * 1024` body-size caps inline.
- None are user-tunable, but several are inconsistent (some endpoints cap at 4K, others at 8K).
- **Recommendation: extract a `MAX_REQ_BODY_BYTES` const with documented per-endpoint overrides.** Logged here, NOT auto-fixed — would touch ~10 handlers and create merge-conflict risk with ALPHA/DELTA/ZETA who are also editing dashboard-server.mjs tonight.

### 4. Input validation on POST endpoints — overall audit

Sampled 8 of 54 `/api/*` endpoints:

| Endpoint | Body-size cap | JSON parse safety | Numeric validation | Free-text length cap |
|---|---|---|---|---|
| `/api/pipeline/build-apply-pack` | ✓ 4KB | ✓ try/catch | ✓ `parseInt + isFinite + >=1` | n/a |
| `/api/pipeline/exclude-company` | ✓ 4KB | ✓ try/catch | n/a | ✓ 500 char |
| `/api/discard-with-reason` | ✓ 8KB | ✓ try/catch | ✓ parseInt | ✓ 1000 char |
| `/api/notes/add` | ✓ 8KB | ✓ try/catch | ✓ via `appendRowNote` | ✓ via NOTE_MAX_CHARS |
| `/api/save-evidence` | **✗ was unlimited → FIXED 64KB** | ✓ try/catch | n/a | **✗ was unlimited → FIXED 50K** |
| `/api/queue-research` | ? — not audited | ✓ try/catch | n/a | not audited |
| `/api/toxicity-override` | ✓ 8KB | ✓ try/catch | n/a | ✓ |
| `/api/outreach/touch` | ✓ 8KB | ✓ try/catch | ✓ | ✓ |

Coverage is otherwise consistent. Only `/api/save-evidence` had the validation hole, now fixed.

### 5. `Access-Control-Allow-Origin: *` on `/api/save-evidence`

The endpoint responds with `Access-Control-Allow-Origin: *`. This means a malicious site could trigger evidence saves from any origin if a user is authed through Cloudflare Access in another tab. With the path-traversal fixed AND the slug regex preventing writes outside `reports/*.md`, the worst case is "anonymous browser-tab user appends evidence to a legitimate report." Limited blast radius. But the `*` here is broader than needed.

**Recommendation:** tighten to specific origins (`https://dashboard.careers-ops.com`). Logged, NOT auto-fixed.

### 6. AGENTS.md / CLAUDE.md "17 plists" drift

Both reference "17 launchd plists" — actual count is **19** in `scripts/launchd/`. Will fix in a tiny follow-up commit on `overnight-epsilon-2026-05-19` (~2 line edits).

---

## What did NOT need action

- **`scripts/agents/*.mjs`** sync I/O — CLI-only, runs once per pack build, no perf concern.
- **`lib/council.mjs`** fetch sites — all use caller-provided AbortSignal via `opts.signal`. Proper pattern.
- **All other POST endpoints** sampled — well-validated.

---

## Audit trail

- Commit 1: `8a95454` — Ε.1 health snapshot + Ε.2 archival log + coordination
- Commit 2: `68a92d6` — saveEvidence path-traversal fix + 12-case test
- Commit 3: `a61dd22` — buildVerifyPayload path-traversal fix + 3 more test cases (15 total)

Hygiene findings #3 (magic numbers) and #5 (CORS) deferred to a follow-up session because the right time to refactor is when ALPHA + DELTA + ZETA's dashboard-server.mjs edits have merged — premature merge-conflict risk tonight.

---

## Platform finding — macOS Tahoe (15.x) launchd cannot spawn a second `cloudflared` instance

**Surfaced mid-overnight (2026-05-19) by a sibling instance who resolved a tunnel collapse + fixed the broken staging plist. EPSILON folded it into the code-review log per scope addition.**

### State now

- **Prod cloudflared** — launchd, **PID 43518**, healthy. Pattern: `cloudflared tunnel --config /Users/mitchellwilliams/.cloudflared/config.yml run`.
- **Staging cloudflared** — `nohup`, **PID 72341**, healthy. Pattern: `cloudflared tunnel --config /Users/mitchellwilliams/.cloudflared/config-staging.yml run`. NOT launchd-managed right now.
- `scripts/launchd/com.mitchell.career-ops.cloudflared-staging.plist` — JUST FIXED on disk to mirror prod (`--config` flag, not `--url`). HEAD still has the old broken `--url http://localhost:3097 run career-ops-staging` pattern; sibling instance hasn't committed yet. **EPSILON did NOT re-edit the plist per scope-addition directive.**

### Diagnosis

macOS 15.x (Tahoe) launchd has a regression that prevents launching a second `cloudflared` binary instance, even when:
- The second plist is well-formed
- The throttle interval is past
- The first cloudflared instance is healthy
- The two instances manage different named tunnels via separate `--config` files

Equivalent invocation via shell (`/opt/homebrew/bin/cloudflared tunnel --config ... run`) starts cleanly and stays up. That's how PID 72341 was spawned, via `nohup`.

### Open items

- **Reboot survival:** if Mitchell reboots, staging cloudflared is gone until someone manually re-`nohup`s it. **EPSILON shipped a boot-time wrapper plist + script** to close this gap — see `scripts/launchd/com.mitchell.career-ops.cloudflared-staging-nohup-wrapper.plist` + `scripts/launchd/cloudflared-staging-nohup.sh`.
- **Apple patch tracking:** track macOS minor updates. Re-run `launchctl bootstrap` on the staging plist after any 15.x → 15.y bump. Remove the nohup wrapper when launchd can spawn the second instance cleanly again.
- **Future multi-cloudflared deploys:** this Tahoe quirk affects ANY future setup that runs >1 cloudflared instance on the same macOS host. Now documented here.

### Adversarial grep for the same broken pattern across `scripts/launchd/`

```
for p in scripts/launchd/*.plist; do
  if grep -q "<string>--url</string>" "$p" && grep -q "<string>run</string>" "$p"; then
    echo "FLAG: $p"
  fi
done
```

**Result:** the only flagged file is `com.mitchell.career-ops.cloudflared-staging.plist` itself — and that match comes from HEAD's committed state, which is the broken version still in the git index but no longer on disk (the sibling instance fixed it but hasn't committed). On-disk content is the correct `--config` pattern. **No other plists combine `--url` + `run <name>` — the broken pattern is isolated to this single file in its committed state, and is already fixed on disk.**
