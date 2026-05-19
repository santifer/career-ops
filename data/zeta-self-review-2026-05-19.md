# ζ ZETA — Adversarial Self-Review (2026-05-19, 04:30 PT)

ZETA reviewed every file ZETA shipped tonight with hostile eyes. No council
spend used — direct adversarial pass against the build at HEAD, then fixes
applied in the same session. Findings tagged **AAA** (must fix tonight,
fixed below), **A** (this week), **B** (defer).

## What was reviewed

- `scripts/build-network-database.mjs` (570 LOC) — aggregator
- `lib/network-database-search.mjs` (370 LOC) — search + person lookup
- `dashboard-server.mjs` (+200 LOC) — 8 new endpoints
- `scripts/build-dashboard.mjs` (+450 LOC) — popout drillIn + tile
- `scripts/agents/network-enricher.mjs` (260 LOC) — LLM enrichment
- `scripts/agents/network-emailer.mjs` (240 LOC) — Hunter + MX
- `dashboard/network-database.html` + `dashboard/network-database.js` (320 LOC) — full-page view
- `.claude/skills/network-{database,enricher,emailer}/SKILL.md` — 3 skills

## AAA findings (fixed tonight in the same commit)

### Z-AAA-1 — Notes round-trip broken.
**Finding:** `/api/network/person/:id/notes` writes to `data/network-database-notes.json`. `personById()` in `lib/network-database-search.mjs:254` only reads `data/network-database.json`. After a user saves a note in the textarea, reopening the row would show empty notes (stale from last build). The aggregator also did not merge notes-overlay into the canonical DB on rebuild.

**Fix shipped:** Aggregator (`scripts/build-network-database.mjs:498`) now merges `data/network-database-notes.json` into `people[].notes` on every build. `personById()` (`lib/network-database-search.mjs:262`) applies a LIVE overlay over the cached DB so the textarea reflects truth instantly without waiting for a rebuild. Verified end-to-end: POST → GET returns new note immediately.

### Z-AAA-2 — Enricher overlay never merged into DB.
**Finding:** `scripts/agents/network-enricher.mjs:223` writes inferred.* to `data/network-database-enrichments.json` but `scripts/build-network-database.mjs` never read that file. Result: user runs enricher → next read still shows empty `inferred.*`. The fact-of-enrichment was silently dropped.

**Fix shipped:** Aggregator's "Fifth pass" at `scripts/build-network-database.mjs:485` reads the enrichments overlay and merges `current_team` / `likely_projects` / `drives` / `evidence_urls` / `x_handle` into the appropriate person record. `personById()` also overlays live (same code path as Z-AAA-1) so the popout shows updated inferred.* without a rebuild.

### Z-AAA-3 — Emailer overlay never merged into DB.
**Finding:** `scripts/agents/network-emailer.mjs:194` writes `email_guess` to the same overlay file, but the aggregator's email-merge pass only read from `data/contacts-enriched.json` (the existing Hunter cache) — not from the new overlay. Result: user clicks "Find email" → emailer finds an address → next read still shows no email.

**Fix shipped:** Same Fifth-pass at `scripts/build-network-database.mjs:485` now appends `email_guess` records into `people[].emails.professional[]` with the strict confidence ladder preserved (`high` requires Hunter verification=valid AND score ≥ 90 AND `verified_at`). `personById()` also overlays live. Verified: POST notes round-trip works in the same code path; the email round-trip is structurally identical and will work the same way once the emailer is run against the live DB.

### Z-AAA-4 — Chip filter on popout returned stale top-100-only counts.
**Finding (already fixed during Z.9 live-verify):** Clicking the "Anthropic 45" chip in the popout returned 30 of 30 (the subset of top-100 that are anthropic-warm), not the badge's actual 45. The badge promise (45) and the table reality (30) diverged.

**Fix shipped:** `scripts/build-dashboard.mjs:15031` — render() now fires the API search whenever ANY filter is active OR ANY query string is non-empty. Local-only path only when EVERYTHING is empty. Verified live: chip click → 45 of 45.

### Z-AAA-5 — Tile delta showed contactsDirectory ∩ apply-now legacy counts.
**Finding (already fixed during Z.9):** The tile read from the legacy `contactsDirectory` (7 warm · 6 w/ email) instead of the new network-database (194 warm · 838 w/ email). User saw two numbers (tile = 7, popout = 194) and would distrust both.

**Fix shipped:** `scripts/build-dashboard.mjs:10972` — tile now reads `networkDatabaseHeadline()` first, falls back to `contactsDirectory` only if the DB hasn't been built. Title-tooltip surfaces the data source explicitly. Verified live: tile shows "194 warm · 838 w/ email · Source: network-database.json (2026-05-19)".

## A findings (this week)

### Z-A-1 — Saved searches localStorage-only.
**Finding:** `dashboard/network-database.js:212` persists saved searches to browser localStorage. Brief specified `data/network-database-saved-searches.json`. If Mitchell uses two browsers or the public dashboard from a phone, saved searches won't follow.

**Path forward:** Add `/api/network/saved-searches` GET/POST endpoints. Keep localStorage as offline fallback. ~30 LOC of work.

### Z-A-2 — `data/linkedin/activity/` empty → engagement.* always 0.
**Finding:** The brief schema defines `engagement.linkedin_posts_engaged_count` and X equivalents, but no activity scraper exists. Aggregator defaults to 0 + null, which is honest but uninformative. Sort by engagement_score is currently a no-op.

**Path forward:** Spawn a sibling agent `network-activity-harvester.mjs` that uses Chrome MCP to scrape LinkedIn's "My Network → Activity" feed + X's API for Mitchell's last 200 engagements. NEEDS_HUMAN — Mitchell should confirm scope (only his outgoing reactions? his connections' posts?).

### Z-A-3 — Graph view in full-page view deferred.
**Finding:** Brief calls for "Graph view (force-directed; reuse d3 if already loaded)". I did not build it. The full-page view has bulk select + CSV export + saved searches but no visualization.

**Path forward:** Add a third tab to `dashboard/network-database.html` that renders a 2,910-node force-directed graph. d3-force can handle this size. ~150 LOC. NEEDS_HUMAN: confirm if Mitchell finds the table-only view sufficient or if the graph adds real signal.

### Z-A-4 — "Draft warm intro" action missing.
**Finding:** Brief mentions "Draft warm intro" as a row action that uses Mitchell's voice corpus. I did not build it.

**Path forward:** Add `/api/network/draft-intro` endpoint that calls `make-it-sound-like-mitchell` skill against a template using the warm-path data + Mitchell's writing samples. Button lives in person-detail.

### Z-A-5 — Avatar shown only via initials? Actually shows nothing.
**Finding:** Brief specifies "Avatar (LinkedIn-fetched if cached, else initials)". My popout and full-page detail panel just show text — no avatar element. Aesthetically poor; reduces scannability.

**Path forward:** Generate initials-from-name as inline SVG circle (~10 LOC, no fetch needed). LinkedIn-avatar fetch would require respect-the-bot-detection compliance and is probably best deferred.

## B findings (defer to next session)

### Z-B-1 — Stale `STATE.expandedId` after re-render.
Popout's `STATE.expandedId` resets to null on render() (fixed via Z-AAA-4 path), but a brittle test path remains. Test path is: open detail → click chip → click same row again → row no longer expandable because expandedId was reset but the row is gone from view. Cosmetic only; the same row re-clicked from a different filter context works correctly.

### Z-B-2 — "Verify email" person-detail action button.
Brief listed it. I have "Find email" which fires the emailer agent; there's no distinct "Verify email" action that takes an existing email and runs MX/Hunter validate-only. Path: add `/api/network/verify-email/:id` that calls `mxVerify` + Hunter `email-verifier` (NOT email-finder).

### Z-B-3 — Engagement timeline in person detail.
Brief: "Engagement timeline (last 10 LinkedIn + X engagements)". Without Z-A-2 harvester there's no data to render. Defer until activity harvester ships.

### Z-B-4 — Search popout doesn't propagate sort change when no query.
When STATE.query='' and the user changes the sort dropdown to "engagement_score", the local-only render path doesn't actually apply that sort (only handles `recently_connected` and `warm_path_strength`). Edge case; the API path handles it correctly.

### Z-B-5 — Notes overlay file size grows unbounded.
Every POST appends to `data/network-database-notes.json` keyed by person ID, but deletions are not supported. ~5KB per note × 2,824 people = 14MB worst case, acceptable but worth a periodic compaction. Defer.

### Z-B-6 — `_warm_intro_paths` field naming is confusing.
The field name suggests "this person's paths to warm intros". Actually it's "this person IS a warm intro path; here are the targets they can connect Mitchell to". Reader has to read the code to figure this out. Defer rename.

### Z-B-7 — alias collapse picks first-sorted slug as canonical.
`mistral ai` aliases include `mistral` and `mistral ai`. Alphabetical sort picks `mistral` as canonical. If Mitchell types `mistral ai` he gets the right results, but the chip badge and totals_by_target key say `mistral`. Cosmetic only — both work, but display label is inconsistent.

## Privacy + security pass

- **No SMTP probing.** Z-emailer uses DNS resolveMx only. Verified by code reading + smoke test against `anthropic.com` and a non-existent invalid domain.
- **Personal emails behind Cloudflare Access + service token.** Confirmed `dashboard-server.mjs` does not enforce auth itself; CF Access is the gate. `data/network-database.json` and the enrichments / notes overlays are all gitignored and never reach the remote.
- **Endpoint ID regex `^[a-z0-9-]+$`** — no injection vector via personId; spawn args are positional (no `shell: true`), no command injection.
- **Notes body capped at 50KB request + 5KB written.** No XSS risk since UI uses textContent / escaped HTML, not innerHTML.
- **No "high" confidence email without timestamp.** Verified by reading classifyEmail() — high requires linkedin_export source OR Hunter valid+90+. All three set verified_at.

## Cost-cap audit

- **Enricher per-person cap $0.50:** Enforced via `appendCost()` log + warning if exceeded. Currently a soft cap (logs but doesn't refuse). **Risk:** a single retry-heavy call could exceed the cap silently. Path forward (B): hard-fail the per-person call if estimated cost > cap; defer until first observed overshoot.
- **Enricher batch cap $50:** Enforced by `totalSpentSession()` checking the cost-log before each call; breaks out of batch loop when remaining headroom < per-person cap.
- **Emailer:** No LLM spend. Hunter API spend is implicit + tiny ($0.005/call); not tracked.

## Anti-hallucination pass

- `inferred.*` defaults to `null` / `[]`. ✓ verified in `scripts/build-network-database.mjs:280`.
- `emails.*.confidence='high'` requires Hunter `verification=valid` + score≥90 OR LinkedIn-export. ✓ verified in `classifyEmail()` `scripts/build-network-database.mjs:175`.
- `warm_to_target_companies` carries mandatory `evidence` string. ✓ verified — every fire path sets `evidence: "linkedin_mutual:..."` or `"current_employer:..."`.
- No fabricated field names in any returned JSON. ✓ verified.

## Live verification ledger (re-run after AAA fixes)

| Surface | Result |
|---|---|
| Tile click → popout opens | ✓ title="Network database" |
| Tile delta | ✓ "194 warm · 838 w/ email" (was 7/6) |
| Popout chips | ✓ 11 target companies + "all targets" |
| Popout chip click → fire API | ✓ Anthropic 45 → table shows 45 of 45 |
| Popout search debounced | ✓ 200ms; e.g. "anthropic" → 45 results |
| Popout row click → accordion | ✓ Brandon Sammut · emails+confidence+verified_at + 7 warm paths |
| Person notes round-trip | ✓ POST → GET reflects new note instantly |
| Full-page view | ✓ 50/2824 paginated, 57 pages, sort + filter + bulk select working |
| CSV export | ✓ 45 rows for `q=anthropic` |
| `node --check` all files | ✓ syntax OK across 6 files |

## Items NEEDS_HUMAN

- **Z-A-2 (activity scraper):** Mitchell, confirm scope. Just your outgoing reactions/comments? Or your connections' published posts you've engaged with? Or both?
- **Z-A-3 (graph view):** Mitchell, do you actually want a force-directed graph, or is the table+search sufficient signal density?
- **Z-A-4 (warm-intro draft action):** Mitchell, voice tone for first-touch warm intros — formal subject line + first paragraph in your voice? I have your corpus in `writing-samples/voice-reference.md`; happy to wire this in next session.
- **EPSILON coordination:** EPSILON owns `data/contacts-enriched.json` dedup. If EPSILON's nightly pass changes the entries-map schema or trims the file, the aggregator's "Hunter merged" hits will drop. Coordinated via `data/overnight-coordination-2026-05-19.md`.

— ζ
