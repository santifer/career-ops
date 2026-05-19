# γ GAMMA — Data Truth & Narrative Audit
## 2026-05-19 (overnight, autonomous)

**Auditor:** Senior data engineer + investigative analyst persona. I trace every computed number on the dashboard back to its source. I refuse to surface a metric without provenance. I treat the dashboard as a witness on the stand — if it can't cite, it doesn't count.

**Scope:** 22 computed metrics surfaced on https://dashboard.careers-ops.com/ . Mapped end-to-end from compute function → API surface → dashboard render. No metric exempt; no fabrication.

**Methodology:**
1. Read 18 lib/*.mjs files end-to-end (each ≤ 515 lines).
2. Read dashboard-server.mjs ranges around every `function compute*` and `/api/*` numeric endpoint.
3. Grepped scripts/build-dashboard.mjs (26,716 lines) for metric labels and lib references.
4. Cross-checked tooltip claims ("Computed by lib/X.mjs") against actual file presence and function locations.
5. Cross-checked hardcoded dates and constants against today's date (2026-05-18).
6. Cross-checked silent-fallback behavior on missing source data.

**Inventory artifact:** `data/gamma-metric-inventory-2026-05-19.json` (22 metric records + false-attribution table + hardcoded-date table + silent-fallback table + stale-cache table).

---

## CRITICAL findings (3) — ship a fix tonight

### CRIT-1. Runway widget tooltip lies about source + formula
**File:** `scripts/build-dashboard.mjs:19782-19784`
**Current behavior:** the rationale block under "Runway calculation" states:

> Runway = (touches over last 30d ÷ weekly touch budget) + buffer weeks. Computed by `lib/recruiter-pipeline-density.mjs`. Healthy ≥ 5 active conversations + ≥ 10 touches/7d. [View source →](https://github.com/mitwilli-create/career-ops/blob/main/lib/recruiter-pipeline-density.mjs)

**Three lies in one block:**
1. The file `lib/recruiter-pipeline-density.mjs` does NOT exist. Verified via `ls lib/recruiter-pipeline-density.mjs` — `No such file or directory`. The compute is actually in `dashboard-server.mjs:381 computeRecruiterPipelineDensity`.
2. The GitHub "View source" link points at the same non-existent path — 404 for any user who clicks.
3. The runway formula description is invented. Reading `dashboard-server.mjs:438-444`, runway is a static input (`RUNWAY_WEEKS_DEFAULT = parseInt(process.env.RUNWAY_WEEKS || '12')`), not a touches-derived calculation. The 12-week constant is the entire "runway" value.

**Why it matters:** Mitchell makes decisions ON the runway widget. The tooltip exists to give him a "check the math" path. The path is a lie three times over.

**Truth-preserving fix:** rewrite the rationale block to cite `dashboard-server.mjs computeRecruiterPipelineDensity` (no fake lib file), link to a real source line, and accurately describe the health-verdict logic (the runway weeks are an input, not a computation; the metric is pipeline density assessed against runway).

**Effort:** 15 min. Edit one text block in `scripts/build-dashboard.mjs`.

---

### CRIT-2. Hardcoded "Today is 2026-05-17 PT" in 3 LLM prompts
**Files:**
- `lib/strategy-ceiling.mjs:119`
- `lib/wealth-lens.mjs:164`
- `lib/wealth-lens.mjs:348`

**Current behavior:** each of these prompts begins or includes the literal string `Today is 2026-05-17 PT.` — frozen at the date the prompt was written. Today is 2026-05-18; tomorrow it'll be 2026-05-19. Every LLM call from now on receives a wrong-by-N-days date anchor.

**Why it matters:** strategy-ceiling actions, wealth-lens framing, and comp-benchmarking all use "in the last X months / recent / now" reasoning. The model's internal sense of recency is wrong, by however many days have elapsed since the literal was written.

**Truth-preserving fix:** replace literal with `Today is ${new Date().toISOString().slice(0,10)} PT.` in each location.

**Effort:** 5 min. Three find-and-replace edits.

---

### CRIT-3. Strategy ceiling degraded fallback ships fake lift percentages
**File:** `lib/strategy-ceiling.mjs:278-313`

**Current behavior:** on 2 LLM attempts failing (parse error, schema error, or network), `computeStrategyCeiling` returns a "degraded" object with `_degraded: true` AND ships 3 hardcoded generic actions with fabricated `expected_lift_pct` values: 10%, 8%, 15%. These are cached on disk for ~1 hour. The render at `renderStrategyCard` does show a 1-line orange warning ("⚠ LLM unavailable — showing fallback actions") BUT keeps showing the +10%, +8%, +15% numbers in the actions list as if they were real lift estimates.

**Why it matters:** a user glancing at the strategy card sees three "+X% lift" badges next to action items. The badges are not real estimates — they're stub values picked for generic palatability. This is the textbook "demo data leaking into production" smell.

**Truth-preserving fix:** when `_degraded:true`, the renderer should suppress the `+X%` lift badge entirely and replace it with a `—` placeholder + tooltip "lift estimate unavailable; LLM did not respond". Better yet: change the degraded fallback to surface a single action "Manual review required — LLM unavailable. Run `node lib/strategy-ceiling.mjs --refresh` to retry." with no fabricated lift numbers at all.

**Effort:** 25 min. Edit fallback object + render function.

---

## HIGH findings (5) — ship tonight or NEEDS_HUMAN

### HIGH-1. Alignment-scorer silently returns three zeros when report missing
**File:** `lib/alignment-scorer.mjs:188-191`

**Current behavior:** when `reportPath` is missing or doesn't exist on disk, returns `{ alignment: 0, interview: 0, hmNoticing: 0, breakdown: { error: 'report missing' } }`. The dashboard render walks the three numbers into the bars (`scripts/build-dashboard.mjs:2713`) and shows three 0% bars with no indication that the underlying report is missing.

**Why it matters:** Mitchell makes apply/skip decisions on these bars. Three confident 0% bars look like "this is a bad fit." The truth is "we don't know — the source report is missing."

**Truth-preserving fix:** add an `unavailable: true` field + `unavailable_reason: 'report missing'` to the result. Update the renderer (`scripts/build-dashboard.mjs` around line 2713) to render a "data unavailable" muted chip in place of the bar when `unavailable=true`.

**Effort:** 30 min. Two file edits.

---

### HIGH-2. Wealth-ranking skill-portability default is the MAX (10/10)
**File:** `lib/wealth-ranking.mjs:347`

**Current behavior:**
```js
return { points: 10, why: 'AI-native default (10/10, no per-vertical signal)', hasData: false };
```

When no `data/skill-portability.json` seed exists for a slug AND no `intel.skill_portability_score` exists in the intel cache, the function returns the MAX possible score (10/10) with `hasData: false`. This is an OPTIMISTIC default — the composite wealth score is inflated by up to 10 points for any company missing portability data.

**Why it matters:** wealth ranking tile drives Mitchell's "where to fight" decisions. Optimistic defaults skew the ranking toward companies with missing data. A company with 4 of 5 drivers having data + 1 missing gets a free 10 points; a company with full data covering all 5 drivers can lose by 10 points despite being more thoroughly evaluated.

**Truth-preserving fix:** change default to the MEDIAN of the populated data (or 5/10) and surface `hasData: false` per-driver more prominently in the render. Better: rescale the composite to ignore missing-data drivers and present `score / max-achievable` with a "5 of 5 drivers populated" subtitle. For tonight, the conservative fix is to drop the default from 10 to 5 and add a confidence-band reduction proportional to the count of `hasData=false` drivers.

**Effort:** 20 min. One file edit + composite re-fit.

---

### HIGH-3. Network-graph in-process cache never expires
**File:** `lib/network-graph.mjs:19`

**Current behavior:** `let _cache = null;` plus `loadNetworkGraph()` populates `_cache` on first read and never invalidates. In `scripts/build-dashboard.mjs` this is fine — the build process is short-lived. But in `dashboard-server.mjs` (long-running launchd process), the cache pins to the version of `data/network-graph.json` that existed when the server started. Any subsequent `scan-network.mjs` regeneration is silently ignored until the server restarts.

**Why it matters:** the network graph is a primary input to "warm path" surfaces — the LinkedIn Network sidebar widget, the "find a referral" CTAs in the drawer, the network-graph drill-in. If Mitchell refreshes the graph (via `node scripts/scan-network.mjs` or the dashboard's refresh button), the server keeps serving stale data with no warning.

**Truth-preserving fix:** add file mtime check inside `loadNetworkGraph()`. If `statSync(GRAPH_PATH).mtimeMs > _cacheMtime`, re-read.

**Effort:** 15 min. One file edit.

---

### HIGH-4. HM-noticing referral-path bonus is silent +0/+15 with no graduation
**File:** `lib/alignment-scorer.mjs:160-165`

**Current behavior:** `hasReferralPath` is a boolean passed in from the caller. If true, adds 15 to the HM-noticing percentage. If false (or unset — defaults to false), adds 0. There's no graduation by `network-graph.mjs`'s actual signal strength (direct contact > one_hop > no_path).

**Why it matters:** HM-noticing claims to model "chance the HM sees you." A second-degree connection is genuinely weaker signal than a direct contact, but the formula treats them as the same boolean. A loud false signal at the false-positive end (one weak LinkedIn 2nd connection → +15 just like a strong 1st-degree direct path), or a loud false negative when caller omits the flag.

**Truth-preserving fix:** accept `referralStrength: 0|1|2` (or `'none'|'one_hop'|'direct'`) instead of boolean. Map to +0/+8/+15.

**Effort:** 20 min. Two file edits (lib + caller in build-dashboard).

---

### HIGH-5. Toxicity confidence band uses driver count, not source quality
**File:** `lib/toxicity-composite.mjs:412-416`

**Current behavior:** confidence = `high` (≥3 drivers), `med` (2 drivers), `low` (≤1 driver). Doesn't account for source quality. A single intel-cache driver from council-of-models (7-LLM consensus on layoff_recent) is `low`. Two noisy regex matches in hm-intel narrative text are `med`. The most-trustworthy single-source datum is dismissed; the noisiest pair is elevated.

**Why it matters:** Mitchell tunes apply/skip on toxicity confidence. Mis-calibrated confidence = mis-calibrated trust.

**Truth-preserving fix:** weight drivers by source-rank (the same `sourceRank` function already used for deduping in `dedupDrivers`). A driver from intel-cache (rank 4) counts as 2 toward confidence; hm-intel (rank 3) counts as 1.5; applications.md (rank 2) counts as 1; discard-reasons (rank 1) counts as 0.5. Confidence: `high ≥ 3.0 weighted`, `med ≥ 1.5`, `low otherwise`.

**Effort:** 15 min. One file edit.

---

## MEDIUM findings (8)

### MED-1. Toxicity composite — no per-source freshness check
**File:** `lib/toxicity-composite.mjs:103-114`

**Current behavior:** Reads newest intel-*.json by lexicographic filename sort. If newest is 90 days old, drivers still inherit the data with no staleness warning.

**Fix:** Add `source_age_days` field per driver. UI can render "stale: 47d old" chip alongside the driver evidence.

**Effort:** 20 min.

---

### MED-2. Wealth ranking — no `last_computed_at` field
**File:** `lib/wealth-ranking.mjs:404-411`

**Current behavior:** ranked entries have `slug, displayName, score, drivers, hasPartialData` — no timestamp.

**Fix:** Add `computed_at: new Date().toISOString()` to each entry + the aggregate object that gets baked into `window._waveCB.wealthRanking` at build time.

**Effort:** 10 min.

---

### MED-3. Interview-likelihood formula has uncited heuristic constants
**File:** `lib/alignment-scorer.mjs:128-143`

**Constants:** `BASE_INTERVIEW_RATE = 12`, `(score - 3) × 12`, archetype bonuses `+10/+5/+3`, prior-outcome adjustments `+8/-8`. None reference a calibration source.

**Fix:** Move constants to a single `lib/alignment-calibration.json` keyed entries with a `calibrated_from: <signal source>` field. Even if calibration is "Mitchell's eyeball estimate 2026-05-17," at least it's cited.

**Effort:** 30 min. AA-tier (not AAA).

---

### MED-4. Next-moves hardcoded deadline default (`2026-09-30`)
**File:** `lib/next-moves.mjs:55`

**Current behavior:** If `i.profile.deadline_iso` missing, falls back to literal `2026-09-30`. Mitchell's actual deadline may have moved.

**Fix:** Read deadline from `config/profile.yml` `runway.deadline_iso` field. If missing, surface `deadline_unavailable: true` instead of defaulting.

**Effort:** 20 min.

---

### MED-5. TTO COMPANY_SPECIFIC table baked in source
**File:** `lib/tto-estimator.mjs:58-74`

**Current behavior:** 15-company hardcoded table with notes like "as of 2026-05." Cycle times rot. No external source.

**Fix:** Move to `data/tto-defaults.json` with `source_url` + `recorded_at` per entry. Compose with overrides JSON instead of in-code constants.

**Effort:** 45 min. AA-tier.

---

### MED-6. Wealth-lens LLM cache — no UI surface of cache age
**File:** `lib/wealth-lens.mjs` + `scripts/build-dashboard.mjs:14338`

**Current behavior:** the wealth-lens chip shows "via lib/wealth-lens.mjs" but no cache age. Users can't tell if they're looking at a fresh comp analysis or a 5-day-old cached one.

**Fix:** Surface cached_at relative ("2 days ago") next to the wealth-lens render.

**Effort:** 20 min.

---

### MED-7. Industry-gap seed table — no freshness anywhere
**File:** `lib/industry-gap.mjs` + `scripts/build-dashboard.mjs:4105`

**Current behavior:** 12-row static table; no updated_at, no source citations per row. Surfaces a ranking on the dashboard that looks data-driven.

**Fix:** Add `source: <url-or-doc>` and `last_reviewed: <date>` to each SEED_TABLE row. Surface the youngest source date as the table's freshness label.

**Effort:** 30 min. AA-tier.

---

### MED-8. Days-since-last-touch — silent null when contacts file empty
**File:** `dashboard-server.mjs:464`

**Current behavior:** `velocity.days_since_last_touch` is null if no touches found. UI renders as `—` or blank.

**Fix:** Distinguish "contacts file has 0 contacts" (alarming) from "contacts present but no touches yet" (different alarming). Surface counts separately.

**Effort:** 15 min.

---

## LOW findings (4)

### LOW-1. Funnel-completion lacks `computed_at`
**File:** `lib/funnel-completion.mjs:detectFunnelGap`

**Fix:** add `computed_at: new Date().toISOString()` to result. 5 min.

---

### LOW-2. Staleness-nudge `fresh` band masks "no data at all"
**File:** `lib/staleness-nudge.mjs`

**Current behavior:** rows with NO recorded touch return "fresh" instead of "unknown." Misleads.

**Fix:** add `state: 'fresh'|'aging'|'stale'|'no-signal'` band; "no-signal" rows render a muted "no touches recorded yet" chip.

**Effort:** 20 min.

---

### LOW-3. Equity-calculator anchors hardcoded ($175K floor, $250-320K target)
**File:** `lib/equity-calculator.mjs:5,197`

**Current behavior:** "Per calibration brief 2026-05-16: $175K floor base, $250-320K target TC" — frozen as inline note.

**Fix:** Read from `config/profile.yml` if present; fall back to current values with `source: 'calibration brief 2026-05-16'` as the per-render attribution.

**Effort:** 20 min.

---

### LOW-4. Apps-per-week target_applications_for_offer default = 25
**File:** `lib/next-moves.mjs:89`

**Current behavior:** `i.profile.target_applications_for_offer || 25`. Magic number with no source.

**Fix:** Move to `config/profile.yml`. If missing, omit `apps_per_week_required` from the result rather than computing on a hardcoded 25.

**Effort:** 10 min.

---

## Recommendations summary

| Tier | Finding | File:line | Effort |
|---|---|---|---|
| AAA | CRIT-1: Runway tooltip lies | `scripts/build-dashboard.mjs:19782` | 15m |
| AAA | CRIT-2: Hardcoded dates in 3 LLM prompts | `lib/strategy-ceiling.mjs:119`, `lib/wealth-lens.mjs:164,348` | 5m |
| AAA | CRIT-3: Strategy-ceiling fake lift % in degraded fallback | `lib/strategy-ceiling.mjs:278-313` | 25m |
| AAA | HIGH-1: Alignment-scorer silent zeros | `lib/alignment-scorer.mjs:188-191` | 30m |
| AAA | HIGH-2: Wealth-ranking skill-portability default = MAX | `lib/wealth-ranking.mjs:347` | 20m |
| AAA | HIGH-3: Network-graph stale in-process cache | `lib/network-graph.mjs:19` | 15m |
| AA  | HIGH-4: HM-noticing referral-path graduation | `lib/alignment-scorer.mjs:160-165` | 20m |
| AA  | HIGH-5: Toxicity confidence uses driver count not quality | `lib/toxicity-composite.mjs:412-416` | 15m |
| AA  | MED-2: Wealth-ranking last_computed_at | `lib/wealth-ranking.mjs:404-411` | 10m |
| AA  | MED-1: Toxicity per-source freshness | `lib/toxicity-composite.mjs:103-114` | 20m |
| A   | MED-3,4,5,6,7,8: heuristic constants, deadline, TTO table, cache age, industry-gap freshness, days-since contacts | various | 2-3h cumulative |
| B   | LOW-1,2,3,4: minor field adds, profile.yml migrations | various | 1h cumulative |

**Decision-Maximization Policy applied:** every AAA + AA gets shipped tonight. A-tier deferred to backlog with rationale (heuristic-constant cleanup is high-effort, low-incremental-truth-gain compared to shipping the six AAAs). B-tier deferred (low impact).

## Coordination note

The dashboard render edits required for HIGH-1 (alignment silent zeros) and CRIT-1 (runway tooltip) touch `scripts/build-dashboard.mjs`. The coordination doc says β BRAVO owns dashboard surface edits but specifically defers to GAMMA on metric-narrow edits — these qualify (narrow, mechanical, render-fix-for-a-metric not a UX redesign). Both edits posted to coordination doc below.

The cv.md / data/applications.md staging notes — these are gitignored personal-data files. The worktree at `../career-ops-gamma-2026-05-19` does NOT have them. Any runtime smoke-test that depends on cv.md or applications.md must run from the main worktree post-merge, not from the gamma worktree.
