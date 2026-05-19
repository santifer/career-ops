# Builder Evolution — 523 commits in last 30d

**Generated:** 2026-05-19T19:20:41.982Z
**Repo:** career-ops · **Branch:** main
**Build streak:** 5 consecutive days with at least one commit

## Headline

- **523** commits across **18** active days
- **+195,617 / −17,135** lines
- **11** distinct areas touched

## APIs / tools / services touched

- **anthropic** — 42 commits this window (first seen: 2026-04-21)
- **launchd** — 33 commits this window (first seen: 2026-04-21)
- **typst** — 15 commits this window (first seen: 2026-04-21)
- **openai** — 14 commits this window (first seen: 2026-04-21)
- **grok** — 12 commits this window (first seen: 2026-04-21)
- **gemini** — 11 commits this window (first seen: 2026-04-21)
- **perplexity** — 7 commits this window (first seen: 2026-04-21)
- **ashby** — 5 commits this window (first seen: 2026-04-21)
- **cloudflare** — 5 commits this window (first seen: 2026-04-21)
- **greenhouse** — 4 commits this window (first seen: 2026-04-21)
- **mcp** — 3 commits this window (first seen: 2026-04-21)
- **pangram** — 3 commits this window (first seen: 2026-04-21)
- **github-actions** — 3 commits this window (first seen: 2026-04-21)
- **playwright** — 3 commits this window (first seen: 2026-04-21)
- **workable** — 2 commits this window (first seen: 2026-04-21)

## Skills demonstrated

- **detector-calibration** — 31 commits this window (first demonstrated: 2026-04-21)
- **postmortem-driven-fix** — 14 commits this window (first demonstrated: 2026-04-21)
- **network-database** — 9 commits this window (first demonstrated: 2026-04-21)
- **apply-pack-polish** — 8 commits this window (first demonstrated: 2026-04-21)
- **tier-routing** — 7 commits this window (first demonstrated: 2026-04-21)
- **cost-tracking** — 5 commits this window (first demonstrated: 2026-04-21)
- **cohesion-fix** — 4 commits this window (first demonstrated: 2026-04-21)
- **voice-corpus** — 4 commits this window (first demonstrated: 2026-04-21)
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

- **failure-mode-doc** — 9 commits this window
- **audit-trail-design** — 6 commits this window
- **cost-discipline** — 6 commits this window
- **instrumentation-first** — 4 commits this window
- **cohesion-driven-ux** — 3 commits this window
- **postmortem-then-fix** — 2 commits this window
- **observability** — 1 commit this window
- **reversible-changes** — 1 commit this window

## Commits by area

### dashboard-ux (166)

- `5b83789` fix(toast): use String.fromCharCode(13) for CR — outer template literal was unescaping '\r' source to literal CR byte in built HTML, breakin
- `0152963` ux: defer-banner now names + hyperlinks the higher-scored sibling role(s) per Mitchell ask
- `120da51` fix(process-all): drain loop (phaseBatch wraps batch-runner in while-loop, --limit=1000, max 10 rounds) + dequeue (batch-runner rewrites tri
- `6eb1f2b` fix(ux): role column was rendering at 0px wide — give it an explicit th width + truncate with ellipsis per Mitchell ask
- `45b2d64` fix(cohesion-3): per-company table now covers ALL 187 items (25 unique companies across 3 stages — evaluated/queued/pending) — pipeline.md +
- `1eb6386` ux: fix vertical-character-wrap on narrow viewports + eliminate first-paint widget delay
- `5809969` fix(cohesion-2): Phase A footer + Phase B subtitle/headline/assurance/confirm-button all now name 187 items + full-drain cost — prior surfac
- `94b150d` fix(tier5): String.fromCharCode(10) for newlines in confirm dialog — outer template was unescaping \n into literal newlines and breaking the
- _(+158 more)_

### other (89)

- `d5909b5` needhuman(α): action Mitchell's decisions on apply-pack quality (α.1 intel-refresh launchd + α.2 council cost-tracking + α.3 polish in-fligh
- `93caceb` needhuman(β): action Mitchell's UX decisions (β.1 Discard-vs-Dismiss + β.2 strip pager labels + β.3 restructure workflow)
- `bd5eb4b` δ.NH: merge NEEDS_HUMAN resolution — Pangram wired, corpus 5→27, health plist shipped
- `ad84c30` needhuman(ε): action Mitchell's SRE decisions (ε.1 + ε.2 + ε.3 + ε.NH.1-4)
- `8ee9178` β: Run-Batch + Process All UX audit + 5 fixes (Phase B slice ReferenceError + published_count early stream + cap-warning enrich blurb + hero
- `bd971a8` α: Run-Batch + Process All polish/intel gate audit + fixes
- `0fec500` ζ: Run-Batch + Process All network-leverage surfacing audit
- `1ce2ac4` γ: Run-Batch + Process All cost-decomposition truth audit (calibrated 3 constants, added provenance + SSE truth fixes)
- _(+81 more)_

### data-corpus (86)

- `e4e2aaa` calibrate(δ-followup): wire Pangram into baseline + relax degenerate check + signal-quality endpoint shows Pangram band — signal flips USELE
- `7ab316e` omega(execution-receipt): 4 proposals shipped (cf43767, c3888fe, 3a8ebbf, cec6a3f) + 3 NEEDS_HUMAN follow-ups (polish critic name-alignment 
- `cf43767` omega(proposal-4): create approvals audit trail + ratify ε needhuman + establish needhuman-explicit-approval policy
- `4c30622` wire: third detector Pangram into ai-detection-gate (Mitchell decision delta.2 + delta.NH.3)
- `f113182` recalibrate: detection thresholds vs expanded 26-human+10-AI corpus (Mitchell decision delta.1)
- `5ece633` expand: add 22 Mitchell-authored corpus sample files + 7 AI decoys (Mitchell decision delta.1)
- `668a6cd` orchestrator: final summary for Run-Batch + Process All eval (6 personas + OMEGA, 67 commits, 4 NEEDS-APPROVAL items)
- `d804fee` omega(stewardship): Run-Batch + Process All cross-validation
- _(+78 more)_

### libraries (62)

- `c3888fe` omega(proposal-1): polish chain AbortSignal.timeout via callCouncil opts.timeoutMs override (POLISH_API_TIMEOUT_MS=300_000 default, clamped 
- `61cb975` wire: forward onCostRecord through polish-signals and polish-loop inner callCouncil calls (Mitchell decision α.2)
- `ffb5471` wire: polish-loop council cost-tracking decorator (Mitchell decision α.2)
- `f6fcb4b` expand: voice corpus +22 samples from portfolio stories/cover-letters/story-bank (Mitchell decision delta.1)
- `5a4e26b` calibrate: toxicity source-quality weights vs 17 hm-intel records (Mitchell decision γ.2 + γ.4c)
- `f3d038a` ζ(run-batch AAA-1): wire network-graph.mjs to network-database.json fallback
- `cf72de9` α(self-review): fix 4 bugs found in overnight polish haul
- `02fcaec` truth(γ Γ.12): HIGH-1 full-fix — mute bars on baseline-only completeness
- _(+54 more)_

### scripts (57)

- `ee70c40` add: post-polish-cost-trace-chain.sh — wait for PID 87920, backfill framework, fire fresh polish to exercise α decorator, verify NDJSON trac
- `60c56d9` expand: AI decoys from 3 to 10 in calibrate-baseline.mjs (Mitchell decision delta.1)
- `9de500b` fix(β-runbatch): persist published_count after phaseBatch — Publish stage shows real data
- `8acc6cf` hook: install pre-push system-maintainer --review on dashboard-server.mjs edits (Mitchell decision ε.3)
- `465db97` δ(runbatch): build-apply-orchestrator gate uses gateBlocks (band-aware) not passes
- `4a14714` feat(α): invoke preflight-pack after each polish in Process All (per α Run-Batch eval)
- `e96a961` harden(ε): orphan pipeline-process-state.json cleanup on next-run startup (per ε Run-Batch eval)
- `39e5652` feat(dashboard): tighten hero card + score popout + clickable gaps chip
- _(+49 more)_

### agents (18)

- `7a90c29` integrate: cost-trace emission in apply-pack-polish (Mitchell decision α.2)
- `4acfa5d` δ.NH.2: add weekly detector-health-check runner + Sunday 08:00 PT plist
- `43d12f9` δ(runbatch): linkedin-dm.mjs gate uses gateBlocks (band-aware) not legacy passes
- `a670868` δ(runbatch): why-statement.mjs gate uses gateBlocks (band-aware) not legacy passes
- `519ba3d` δ(runbatch): form-fields.mjs gate uses gateBlocks (band-aware) not legacy passes
- `22ddc8a` pattern: add fallback-to-score + low-data to auditor keywords (Mitchell decision γ.4b)
- `cf2258e` ζ(run-batch AAA-3): wire referrals.mjs to network-database.json (honest-warmth gated)
- `449f1ec` α(apply-pack-polish): full 3-phase polish pipeline (Phase 1 signal harvest + Phase 2 4-round loop + Phase 3 cross-coherence) for 6 artifacts
- _(+10 more)_

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

### pipeline (13)

- `d44e67d` fix(gap-3): dedupe triage-advance.tsv (Mitchell's duplicate-bloat discovery) — triage.mjs::writeAdvance checks URL existence before append (
- `b6c93f4` restore: scan.mjs ashby/lever/workable providers (Mitchell decision ε.2)
- `dcdf85e` restore: scan.mjs greenhouse/ashby/lever/workable providers (Mitchell decision ε.2)
- `3356c4a` harden(ε): AbortSignal.timeout on Anthropic batches API + results-download fetches (per ε Run-Batch eval)
- `4a04f4f` feat(pipeline): implement --companies filtering in Process All
- `a8a3a4a` feat: JD posting date in pipeline.md (posted: field from all 4 ATS types)
- `962f977` fix: appendToPipeline missing date parameter (Fatal: date is not defined)
- `1ef76c3` fix: Workday page limit 100→20 (API caps at 20, limit>20 returns HTTP 400)
- _(+5 more)_

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

### infrastructure (7)

- `af6cf3c` move: telegram-bot plist to scripts/launchd canonical location (Mitchell decision ε.NH.2)
- `699c1c2` fix(launchd): commit cloudflared-staging.plist on-disk fix — sibling instance resolved tunnel collapse by switching --url+run<name> (broken:
- `fa81b4a` infra: 6 recurring-agent launchd plists + cron-run wrapper + OMEGA Ecosystem Steward (spec + agent + skill, human-in-the-loop gated)
- `94ded84` feat(launchd): persistent dashboard-server (:3097) + cloudflared-staging tunnel for the new Cloudflare CSP+HSTS deploy
- `55a6acf` fix(launchd): point dashboard-server.plist at root dashboard-server.mjs (not stale scripts/)
- `780c25e` fix triage Haiku scoring, add signal-monitor for hiring trigger detection
- `8b822c1` post-batch: mark-pipeline-evaluated + post-batch-complete scripts

### tests (1)

- `89eff82` test(toxicity-composite): 9 unit tests locking never-auto-trash invariant + driver shape + score cap
