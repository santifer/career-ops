# Builder Evolution — 605 commits in last 30 days ago

**Generated:** 2026-05-20T00:49:23.235Z
**Repo:** career-ops · **Branch:** main
**Build streak:** 5 consecutive days with at least one commit

## Headline

- **605** commits across **18** active days
- **+221,397 / −17,958** lines
- **11** distinct areas touched

## APIs / tools / services touched

- **anthropic** — 60 commits this window (first seen: 2026-04-21)
- **launchd** — 56 commits this window (first seen: 2026-04-21)
- **openai** — 16 commits this window (first seen: 2026-04-21)
- **grok** — 16 commits this window (first seen: 2026-04-21)
- **typst** — 15 commits this window (first seen: 2026-04-21)
- **perplexity** — 13 commits this window (first seen: 2026-04-21)
- **gemini** — 11 commits this window (first seen: 2026-04-21)
- **mcp** — 7 commits this window (first seen: 2026-04-21)
- **ashby** — 5 commits this window (first seen: 2026-04-21)
- **cloudflare** — 5 commits this window (first seen: 2026-04-21)
- **playwright** — 4 commits this window (first seen: 2026-04-21)
- **telegram** — 4 commits this window (first seen: 2026-05-19)
- **greenhouse** — 4 commits this window (first seen: 2026-04-21)
- **gmail** — 3 commits this window (first seen: 2026-05-19)
- **pangram** — 3 commits this window (first seen: 2026-04-21)
- **github-actions** — 3 commits this window (first seen: 2026-04-21)
- **workable** — 2 commits this window (first seen: 2026-04-21)
- **descript** — 2 commits this window (first seen: 2026-05-19)
- **notion** — 1 commit this window (first seen: 2026-05-19)

## Skills demonstrated

- **detector-calibration** — 34 commits this window (first demonstrated: 2026-04-21)
- **postmortem-driven-fix** — 15 commits this window (first demonstrated: 2026-04-21)
- **network-database** — 10 commits this window (first demonstrated: 2026-04-21)
- **apply-pack-polish** — 9 commits this window (first demonstrated: 2026-04-21)
- **tier-routing** — 7 commits this window (first demonstrated: 2026-04-21)
- **cost-tracking** — 6 commits this window (first demonstrated: 2026-04-21)
- **voice-corpus** — 5 commits this window (first demonstrated: 2026-04-21)
- **cohesion-fix** — 4 commits this window (first demonstrated: 2026-04-21)
- **council-orchestration** — 3 commits this window (first demonstrated: 2026-04-21)
- **dedup-on-append** — 2 commits this window (first demonstrated: 2026-04-21)
- **bug-class-lint** — 1 commit this window (first demonstrated: 2026-04-21)
- **instrumentation-first** — 1 commit this window (first demonstrated: 2026-04-21)
- **drain-loop** — 1 commit this window (first demonstrated: 2026-04-21)
- **persistent-progress-bar** — 1 commit this window (first demonstrated: 2026-04-21)
- **fail-secure** — 1 commit this window (first demonstrated: 2026-04-21)

## Bug classes identified / fixed

- **duplicate-bloat** — 4 commits (first surfaced: 2026-04-21)
- **outer-template-unescape** — 3 commits (first surfaced: 2026-04-21)
- **limit-cap-leakage** — 2 commits (first surfaced: 2026-04-21)
- **frontmatter-cloak** — 1 commit (first surfaced: 2026-04-21)
- **hardcoded-date** — 1 commit (first surfaced: 2026-04-21)

## PM-relevant signals

- **failure-mode-doc** — 14 commits this window
- **cost-discipline** — 9 commits this window
- **instrumentation-first** — 8 commits this window
- **audit-trail-design** — 6 commits this window
- **postmortem-then-fix** — 3 commits this window
- **cohesion-driven-ux** — 3 commits this window
- **reversible-changes** — 2 commits this window
- **observability** — 1 commit this window

## Commits by area

### dashboard-ux (171)

- `1092536` fix(hang-prevention): Pattern 9 + /api/hang-watchdog/status endpoint
- `1974bfb` feat(hang-watchdog): surface in System Health modal
- `24cdb7f` feat(phase-A.1): 4 relationship-intelligence endpoints — GET /contact/:id renders detail page + POST /api/refresh-cache + /api/scrape-photo 
- `a83e2d7` fix(contacts): apply data/linkedin/overrides.json no_longer_at / now_at / notes to the contactsDirectory bake — Rita Kumar removed from Open
- `6628db5` ux(layout): move Trends panel to bottom of page per Mitchell — Trends now renders after comp-analytics (last panel before </main>). Section 
- `5b83789` fix(toast): use String.fromCharCode(13) for CR — outer template literal was unescaping '\r' source to literal CR byte in built HTML, breakin
- `0152963` ux: defer-banner now names + hyperlinks the higher-scored sibling role(s) per Mitchell ask
- `120da51` fix(process-all): drain loop (phaseBatch wraps batch-runner in while-loop, --limit=1000, max 10 rounds) + dequeue (batch-runner rewrites tri
- _(+163 more)_

### data-corpus (107)

- `c78d61d` feat(health-column): resolve all 4 follow-ups (queue regenerator, prompt refinement, validator audit, doc clarification)
- `7982cfa` fix(health-column): backfill 7 missing role-enrichment rows + pipeline durability (liveness check, regression test, launchd plist)
- `66bbfee` doc(opt-5): correct Phase B cost narrative — sigma fixed 1000x cost-calc bug (real cost was ~$0.10/contact not $97). Phase B' pivot still co
- `95e061c` doc(opt-5): executive synthesis (action-led, Concise Facts 7 honored) — 3 moves this week + top-10 reranked + Phase B' pivot rationale
- `b0fc1c8` fix(bravo): Recent Evaluations parity with Apply Now — Phase A.10
- `cc88bdd` doc(phase-G): final synthesis — 10/12 A-series shipped, Phase B halted with NEEDS_HUMAN pivot, Phase H deferred, Day-30 audit on autopilot
- `0498597` doc(autonomous-resume): final report + MCP PDF leak investigation
- `a1fac6a` doc(sigma): NEEDS_HUMAN report — 7 blockers found across 5 --full attempts, $344 sunk cost, 2 critical bugs unfixed (test-gate baseline-comp
- _(+99 more)_

### other (101)

- `cb000c4` feat(builder-evo): collapse 4 stat chips into click-triggered shared drawer
- `b4bcfbc` Merge branch 'sigma/audit-2026-05-19-1531'
- `cf25e7b` feat(enrich-apply-now): wire cache-write-validator in soft-fail telemetry mode (symmetric gating, observation window)
- `5ed8224` fix(role_enrichment): recalibrate minCitationsPer100Tokens 1.0 → 0.2 per validator audit (0/31 → 30/31 pass)
- `8ce2a72` chore: overnight haul leftovers — gitignore health-column-coverage.json, refresh-cache-registry handles backfilled bf{num} role-enrichment r
- `8b700ed` feat(opt-2): add 4 Mitchell-specific signals to priority scorer — excellence_threshold_met + vision_arc_match + clear_action_unlock + authen
- `a039b84` feat(opt-1): rewrite contact detail renderer for second-brain alignment — TONIGHT'S MOVE + WHY NOW + DRAFT DM + CONFIDENCE BAND + UNCERTAINT
- `d5371a6` fix(phase-B): HALT contact enrichment after $97/contact cost overrun (162x budget) — set daily_count=0, document the NEEDS_HUMAN pivot decis
- _(+93 more)_

### libraries (76)

- `189ab81` fix(opt-7): enforce Mitchell's kill list — replace em-dashes with commas/parens in DM fallback bodies + why-now sentence (greeting/sign-off 
- `8e83ffa` fix(council): cost calculator units bug — rates table was per-1K when published prices are per-1M (1000x inflated reports); add HIGH_COST_WA
- `0c2e373` feat(phase-A.6): refresh-master per-contact handler — scoring + auto-pause gates + top-50/day picker + in-process dispatch + removes 2026-05
- `31b9c36` feat(phase-A.5): per-contact detail page renderer — full schema sections + outreach state + provenance + notes (mounted by /contact/:id in A
- `7573e90` fix(refresh-master): guard inspectCacheForRow against per-contact-scope caches that have no keyFromRow function
- `cb30550` fix(refresh-master): lower positioning cache citation density floor from 0.5 to 0.15 — craft work, not research-heavy
- `41cd21a` refresh-master(phase 4): OMEGA learning loop — provider performance + outcome correlation + reroute proposals + re-eval lottery + voice corp
- `c43f34d` refresh-master(phase 3): Layer-3 anti-hallucination — event watcher + adversarial second-pass + refuse-to-commit + pre-IPO equity allowlist 
- _(+68 more)_

### scripts (63)

- `63c30a6` feat(phase-B'): batch Sonnet synthesis script — processes /tmp/scrapes/*.json into data/contact-enrichment-cache/{id}.json (29/30 success at
- `d8819d6` feat(phase-B'): Chrome-MCP pivot top-5 enrichment + harden setup-auth to wait for li_at cookie + scrape main-profile Activity preview (Linke
- `67563b3` feat(opt-4): Phase B' pivot — Playwright authenticated scrape + single Sonnet synthesis call per contact ($0.05/contact = $5/100 vs failed P
- `7db873a` fix(lint): replace 11 hardcoded /Users/mitchellwilliams paths with relative derivations
- `ea0a319` feat(phase-B): top-100 priority enrichment batch script — scoring + per-contact 3-way council + resumable state recording +  cost cap
- `fee78a7` fix(refresh-master): bootstrap dotenv at orchestrator startup so adapters see PERPLEXITY/XAI/ANTHROPIC keys
- `ee70c40` add: post-polish-cost-trace-chain.sh — wait for PID 87920, backfill framework, fire fresh polish to exercise α decorator, verify NDJSON trac
- `60c56d9` expand: AI decoys from 3 to 10 in calibrate-baseline.mjs (Mitchell decision delta.1)
- _(+55 more)_

### agents (26)

- `2816334` feat(sigma): Blockers 5+6+7 — test-gate baseline comparison, cost caps, worktree isolation with last-instance push
- `e843fa1` feat(opt-3): voice-overhaul contact enrichment prompt — grounded in second-brain (4w3/INTJ-T architecture + Activator+Futuristic+VIA values 
- `a1c9d67` feat(phase-A.7): network-enricher --contact mode writes rich contact_enrichment schema with 3-way council (Perplexity+Sonnet+Grok-X) + cross
- `afd134e` feat(sigma): --skip-baseline-test flag to record but not block on pre-existing lint failures
- `0bafec9` fix(sigma): preflight off-by-one — porcelain leading-space stripped by .trim() corrupted slice(3) index
- `48c2e69` fix(sigma+council): relax SIGMA preflight to tolerate launchd-rewritten state files; explicit dotenv path + override:true in run-council
- `10e7710` feat(phase-A.0): timeout-harden every unguarded fetch + 5min ceilings on polish chain — diagnoses + prevents 2h41m row-044 hang
- `8ed50b4` feat(sigma): debug + system-hardening agent with auto-implementing fixes — 1,116 lines, syntax-clean, full 7-model council per finding, atom
- _(+18 more)_

### infrastructure (22)

- `5b62e69` sigma(hard-ld-d7a88b9d): com.mitchell.career-ops.gamma-truth-audit.plist: 1 hygiene issue(s)
- `7ff7f36` sigma(hard-ld-96301d50): com.mitchell.career-ops.detector-health.plist: 1 hygiene issue(s)
- `c6ec874` sigma(hard-ld-46398eac): com.mitchell.career-ops.delta-full-recalibration.plist: 1 hygiene issue(s)
- `2bc15d2` sigma(hard-ld-f747125d): com.mitchell.career-ops.delta-ats-watch.plist: 1 hygiene issue(s)
- `1ee69d2` sigma(hard-ld-9e09e18a): com.mitchell.career-ops.dashboard-server.plist: 1 hygiene issue(s)
- `f840166` sigma(hard-ld-fd616655): com.mitchell.career-ops.contact-enrichment-audit.plist: 1 hygiene issue(s)
- `997613f` sigma(hard-ld-81170cc7): com.mitchell.career-ops.company-pulse.plist: 1 hygiene issue(s)
- `1016e74` sigma(hard-ld-8dc6a510): com.mitchell.career-ops.community-scan.plist: 1 hygiene issue(s)
- _(+14 more)_

### documentation (15)

- `5a4c1e3` lint(build-dashboard): post-build JS-parse sanity check + AGENTS.md doc for outer-template-unescape bug class — audited entire codebase, zer
- `70c640f` policy(ui): mandatory Chrome MCP verification on UI fixes + hook enforcement
- `72e284a` α(quality-first): document Decision-Maximization Policy in AGENTS.md so future agents inherit the quality > speed > cost preference
- `8d5a52d` epsilon(Ε.3): code-review findings doc + AGENTS.md drift fix (17→19 launchd plists, with 12 currently loaded). Security fixes already commit
- `42164d0` feat(audit-trail): Phase 2 Items M + L + V — cv.md audit-trail doc + heartbeat CV link + pre-flight CV freshness
- `a151f97` docs(readme): replace inherited README with fork-specific landing page (#14)
- `32eba8b` docs: CLAUDE.md session notes 2026-05-09 (Workday fix + source expansion)
- `2fe3da7` docs: session notes 2026-05-09 — freshness triage + source cleanup
- _(+7 more)_

### pipeline (14)

- `6dc4917` fix(gap-4): batch-runner dequeues URLs with terminal fetch failures (HTTP 4xx, 'no longer accepting' patterns) even when nothing was submitt
- `d44e67d` fix(gap-3): dedupe triage-advance.tsv (Mitchell's duplicate-bloat discovery) — triage.mjs::writeAdvance checks URL existence before append (
- `b6c93f4` restore: scan.mjs ashby/lever/workable providers (Mitchell decision ε.2)
- `dcdf85e` restore: scan.mjs greenhouse/ashby/lever/workable providers (Mitchell decision ε.2)
- `3356c4a` harden(ε): AbortSignal.timeout on Anthropic batches API + results-download fetches (per ε Run-Batch eval)
- `4a04f4f` feat(pipeline): implement --companies filtering in Process All
- `a8a3a4a` feat: JD posting date in pipeline.md (posted: field from all 4 ATS types)
- `962f977` fix: appendToPipeline missing date parameter (Fatal: date is not defined)
- _(+6 more)_

### postmortems (9)

- `b13eca2` postmortem(manual rewrite): Process All — 4 confirmed gaps + Fix 1/2/3 spec ready for implementation
- `e20d1c9` postmortem: Process All run proc-mpcxwf1d-437113 — 4 confirmed gaps (LIMIT cap, pipeline.md not checked off, triage-advance not dequeued, dr
- `2aa4476` postmortem: Process All run proc-mpcxwf1d-437113 — full drain audit + recommended stronger fix
- `d006a3c` synthesis: NEEDS_HUMAN resolution sweep summary — all 6 personas merged, 22 shipped + 4 declined + 1 in-flight + 3 NEEDS_HUMAN-AGAIN
- `a8b3702` report(α): NEEDS_HUMAN resolution + cv-scope polish framework (decisions α.1 done + α.2 shipped + α.3 in-flight)
- `3df16f9` report(β): NEEDS_HUMAN resolution — β.1 Discard/Dismiss + β.2 pager labels + β.3 tonight-pick workflow
- `376bcb2` docs(ε): needhuman resolution report 2026-05-19 — all 7 Mitchell decisions actioned
- `c51b00c` epsilon(post-scope): record Mitchell's NEEDS_HUMAN decisions + morning command sequence. A (staging plist) + B (nohup wrapper bootstrap) RES
- _(+1 more)_

### tests (1)

- `89eff82` test(toxicity-composite): 9 unit tests locking never-auto-trash invariant + driver shape + score cap
