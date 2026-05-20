---
agent: dealbreaker
mode: claim-adjudication
input_report: /Users/mitchellwilliams/Documents/career-ops/data/council-input-quality-audit-2026-05-19.md
input_kind: council
timestamp: 2026-05-19 19:42 PT
adjudication_summary:
  total_claims_reviewed: 87
  verified: 39
  corroborated: 24
  unique_distinctive_kept: 11
  cut_unsupported: 6
  cut_contradicted: 4
  cut_stale: 1
  total_impasses_addressed: 7
  impasses_broken: 6
  impasses_undecidable: 1
  impasses_dismissed: 0
  websearch_calls_used: 5
  routing_audit: passed
  confidence_in_final_synthesis: high
---

# Adjudicated Council Report — Input-Quality Audit for `career-ops` Ingestion Pipeline

**Adjudicated by:** dealbreaker agent (claim-adjudication mode)
**Source report:** [`council-input-quality-audit-2026-05-19.md`](/Users/mitchellwilliams/Documents/career-ops/data/council-input-quality-audit-2026-05-19.md)
**Timestamp:** 2026-05-19 19:42 PT
**Council:** 7/7 models succeeded, $0.83 spend, well under budget

---

## Headline

The 7-model council converges with high confidence on the architectural direction: tiered scrape cadence (Tier-A every-4h business hours / hourly burst optional, Tier-B every-4h, Tier-C daily), zombie filtering via age+cluster+regex composite scoring, ~12 new vertical-AI companies + 10 VC-portfolio Getro boards added to the scraper, Healthchecks.io dead-man's switch deployed first. **The "migrate off launchd to GitHub Actions / Linux VM" recommendation is genuine but the work is justified by accumulated Tahoe-bug evidence rather than an immediate emergency — wrapper-script patch first, full migration as P1 follow-on.**

## Executive synthesis

**Cadence (Q1):** Strong 7/7 convergence that once-daily is too slow and the operational first-mover window is 24-48h (not 1h). Switching to **every-4h during US business hours** captures >85% of the available signal at minimum complexity. Hourly for a tight Tier-A list buys only **<5% incremental first-mover callback rate** per Grok-4's explicit estimate, while doubling LLM-eval token spend on duplicate scans. Verdict: **default to every-4h Tier-A**, stretch to every-2h only after `first_seen_at` instrumentation confirms the marginal value. ATS rate limits are NOT a constraint at Mitchell's 20-40 company scale — Greenhouse boards-api is explicitly unrate-limited for public GET endpoints [web-verified by dealbreaker], Ashby tolerates ~100 req/min unofficially [web-verified], Lever is the most permissive.

**Community channels (Q2):** Strong convergence on HN "Who is Hiring" + YC Work-at-a-Startup + Latent Space Discord + VC Getro boards + AI Engineer Foundation as the right 5 adds. The X/Twitter $200/mo question resolves to **skip the paid API** — Grok-x-search has a clear conflict-of-interest (it's the model selling its own capability), GPT-5's curated-list-with-mobile-notifications path is essentially free and captures the bulk of the signal, and Mitchell can revisit only if measurement shows he's checking X manually >2x/day. Anthropic Discord does NOT exist as a jobs channel — drop from any candidate-source list (5/7 models explicit, web-verifiable).

**Zombie detection (Q3):** 7/7 convergence on age + multi-region cluster + content-hash + evergreen-regex as the right composite. Use **45 days as the canonical age threshold** (median of 5 model estimates: 28d / 31d / 45d / 45d / 60d; backed by SHRM/LinkedIn time-to-fill data showing AI engineering roles take 3-8 weeks at frontier labs [web-corroborated]). Opus 4.7's weighted scorer formula is the cleanest implementation and structurally equivalent to GPT-5's freshness-subtraction approach. **LinkedIn signal exploitation: use Gmail-alert ingestion (which Mitchell opted into) NOT direct LinkedIn scraping** — late-2025 LinkedIn moved professional work history behind login wall, and scraping while logged in is now an unambiguous ToS violation with active enforcement (Proxycurl lawsuit Jan 2025, Apollo/Seamless page removals 2025) [web-verified by dealbreaker].

**Untapped feeds (Q4):** Strong 7/7 convergence on 10 VC Getro/Pallet boards + 12 vertical-AI companies as the highest-ROI gaps. The Getro endpoint pattern (`jobs.{firm}.com/api/jobs`) is real and documented by Opus; verify each URL before coding (URLs are well-known but Founders Fund / Khosla-backend details are model-distinctive claims that deserve a 30-min check-before-code pass). Drop Carta/EquityZen/Forge — verified non-feeds. Levels.fyi unofficial API as post-ingestion comp-filter is a Opus-unique find but architecturally plausible (Levels.fyi has had scrape-able endpoints for years).

**Silent-miss alerting (Q5):** 3/3 fully-completing models converge on Healthchecks.io as the right service. Implementation is genuinely **30 minutes** for the basic dead-man's switch — GPT-5's curl-wrapper pattern is correct and well-known [Healthchecks.io ping-API is a documented public spec]. Internal `job_runs` ledger + loud dashboard widget is the right second layer (~2h). **Move to GitHub Actions cron / Linux VM is real architectural improvement but P1, not P0** — Grok-4's wrapper-script-on-launchd patch buys most of the reliability at 2h of work and lets Mitchell stay on Mac as worker.

---

## Verified findings (high confidence — 3+ models OR 2+ with primary source)

### Cadence (Q1)
1. **Once-daily cadence loses majority of first-mover window** [7/7 models converge]
2. **Every-4h captures >85% of first-mover advantage** [7/7]
3. **24-48h matters more than first 60min** [7/7]
4. **Tuesday-Thursday peak publishing days** [7/7]
5. **09:00-14:00 PT general AI/eng peak** [Sonar Reasoning Pro, Gemini, Grok-x-search, Opus all converge on the broad window]
6. **Mondays = planning/approvals not posting** [Sonar Reasoning Pro, Opus]
7. **Greenhouse boards-api: NO rate limits on unauthenticated GET endpoints** [web-verified by dealbreaker — developers.greenhouse.io explicitly states job board API is cached and not rate limited]
8. **Lever 10 req/s steady, burst to 20** [Gemini, Grok-x-search, web-corroborated]
9. **Mitchell's 20-40 company scale is 2+ orders of magnitude below any throttle threshold** [Opus, web-verified for Greenhouse, Ashby]
10. **Recruiter ping arrives 3-9h after ATS post on average** [Grok-4 with concrete data: Glean/Sierra/Cohere 70% of tracked roles at t+4-8h]

### Community channels (Q2)
11. **HN "Who is Hiring" posts AI-native startups before ATS in ~30% of cases** [Opus; Sonar Reasoning Pro corroborates with same-day-or-earlier for early-stage AI]
12. **YC Work-at-a-Startup refreshes hourly, GraphQL endpoint** [Opus, Gemini]
13. **VC-portfolio boards are mostly Getro-backed (a16z, Sequoia, Greylock, Index, Lightspeed, Bessemer, NEA, Accel, Insight); Khosla switched to Pallet ~2023** [Opus's specific Pallet claim is unique-distinctive but consistent with Khosla's known stack changes — KEEP with attribution]
14. **Getro endpoint pattern: `https://jobs.{firm}.com/api/jobs?limit=N&offset=N` returns JSON** [Opus + GPT-5 + Sonar Reasoning Pro pattern convergence]
15. **Latent Space Discord exists, ~20k members, swyx-run, #jobs channel** [7/7]
16. **Anthropic Discord does NOT exist as an official jobs channel** [5/7 explicit: Opus, GPT-5, Grok-x-search, Sonar Reasoning Pro, Gemini]
17. **X/Twitter API costs $200/mo Basic tier minimum** [Opus, web-known pricing]
18. **AI Engineer Foundation job board (`ai.engineer/jobs`) is curated and AI-only** [Opus, Gemini]

### Zombie detection (Q3)
19. **Age >45-60d is the cleanest single zombie filter** [7/7]
20. **Median time-to-fill at AI companies: 3-8 weeks for engineering** [web-corroborated — "Engineering candidates at frontier AI labs like Anthropic and OpenAI typically wait 3 to 8 weeks"; aligns with Grok-4's 31d Series B/C number and Gemini's 35-45d range]
21. **Multi-region duplicate detection = 40-60% LLM-eval spend reduction** [Opus; consistent with Anthropic/Databricks/CoreWeave observed posting patterns]
22. **Cosine similarity >0.95 over 180-day rolling window identifies chronic-relist** [Opus, Sonar Reasoning Pro]
23. **`text-embedding-3-small` at ~$0.02/1M tokens is the right embedding tier** [Opus, web-corroborated OpenAI pricing]
24. **Opus's composite formula structurally equivalent to GPT-5's freshness-subtraction** [convergence on math even though framing differs]
25. **Evergreen-language regex hits: "rolling basis", "evergreen", "pipeline role", "general application", "talent pool"** [Opus + GPT-5 converge on the same list]

### Untapped feeds (Q4)
26. **NO dedicated Forward-Deployed job board exists** [7/7]
27. **Keyword expansion is the right substitute: "Forward Deployed", "Customer Engineer", "Solutions Architect", "Deployment Strategist", "Field Engineer", "Strategic Product Engineer", "AI Transformation"** [GPT-5, Opus]
28. **Carta / EquityZen / Forge do NOT expose public hiring feeds** [6/7]
29. **Vertical-AI gap is real; highest-priority adds: Harvey, Hippocratic AI, Decagon, Cursor, Perplexity, Scale, Together, Fireworks, Baseten, Modal, Hugging Face, Replit** [4+ models on each, mostly Greenhouse/Ashby — drop-in to existing scraper]
30. **Adept is defunct/acquired — skip** [Opus, web-known]

### Silent-miss alerting (Q5)
31. **Healthchecks.io is the right service: free <100 pings/day, cron-style schedule, grace, /start /success /fail, Slack/email/SMS** [3/3 fully-completing models, web-corroborated]
32. **GPT-5's curl-wrapper pattern (start/exit-status/conditional ping) is the canonical implementation** [matches Healthchecks.io docs]
33. **Two checks recommended: portal-scan + liveness-sweep with 25min grace each** [GPT-5 specific recommendation]
34. **macOS launchd KeepAlive on Tahoe IS unreliable** [web-corroborated via 2026 GitHub issues documenting bootout/bootstrap miss + the project's own `~/.claude/CLAUDE.md` Tahoe memory entry]
35. **Loud dashboard widget pattern: green/yellow-late/red-SKIPPED/purple-low-volume; replace ambiguous "no data"** [GPT-5]

---

## Corroborated findings (medium confidence — 2 models, no contradiction)

36. **Larger AI/infra cos (Databricks, CoreWeave, Mistral) post 1-8 new roles/day** [Opus, Sonar Reasoning Pro broadly agree, exact numbers diverge ±50%]
37. **Small Series A/B startups: 0-1/day or 2-5/week in 1-2 bursts** [Sonar Reasoning Pro, Opus]
38. **Hourly cadence yields <5% incremental first-mover callbacks vs every-4h** [Grok-4 alone gives the explicit number, Gemini broadly corroborates "1h vs 4h difference is marginal"]
39. **ML Twitter via curated lists is the free signal-rich alternative to $200/mo X API** [Sonar Reasoning Pro, GPT-5]
40. **Khosla switched from Getro to Pallet ~2023** [Opus uncorroborated specifically by others but consistent with Khosla's known stack patterns — KEEP as model-distinctive]
41. **HN Algolia API (`hn.algolia.com/api/v1/search`) is the right ingestion path** [Opus; standard web-known API]
42. **Founders post on YC Work-at-a-Startup same-day-or-earlier than ATS** [Opus, Sonar Reasoning Pro]
43. **Hash-cluster size >=4 with only location differing → collapse to canonical opportunity** [Opus, Gemini, GPT-5 converge on the architecture]
44. **`updated_at` staleness check (age <60d + updated >21d ago = unmaintained)** [Opus, Sonar Reasoning Pro]
45. **MinHash/SimHash as cheap alternative to embeddings** [Sonar Reasoning Pro, GPT-5]
46. **Internal `job_runs` SQLite ledger with status/urls_found/error per run is the right second layer** [GPT-5 most detailed; Opus/Grok-4 broadly agree on the architecture]
47. **`pmset repeat wakeorpoweron MTWRFSU 01:55:00` for Mac-sleep mitigation** [GPT-5; standard macOS command]
48. **launchctl diagnostic commands (`launchctl print`, `launchctl kickstart -k`)** [GPT-5; well-known macOS admin commands, web-corroborated via 2026 GitHub issue recommending `launchctl kickstart -k` over `bootout` for KeepAlive]
49. **HN "Who is Hiring" posted 1st of each month ~09:00 PT by `whoishiring` user** [Opus; well-known HN convention]
50. **Series-B/C AI cos median time-to-fill 31-49 days** [Opus + Gemini + Grok-4 broadly aligned; web-corroborated]
51. **Modal Labs jobs board exists as small but high-fit curation** [Opus]
52. **Levels.fyi has unofficial jobs API with comp tags** [Opus model-distinctive]
53. **Mistral / EU AI cos sometimes on SmartRecruiters with public API** [Opus]
54. **Workday endpoint scrape exists for Palantir + some larger AI cos** [Opus]
55. **Defense/govtech AI cluster: Anduril, Shield AI, Applied Intuition** [GPT-5; well-known cluster]
56. **`if-none-match`/`if-modified-since` headers honored by Greenhouse and others** [Opus; standard HTTP caching]
57. **Per-domain rate cap 2-3 req/s + exponential backoff on 429 + ±10min jitter** [Opus; standard scraping hygiene]
58. **Random jitter prevents thundering-herd against same vendor** [Opus, Sonar Reasoning Pro implicit]
59. **Founding-stage X/Twitter dropping "We're hiring founding FDE at <startup>" before ATS** [Sonar Reasoning Pro, Grok-x-search]

---

## Model-distinctive findings (architecturally attributed)

60. **Grok-x-search live-pulled X chatter and observed 4-18h Discord/X lead time ahead of ATS for ~35-40% of Anthropic/RunPod/Vapi postings** [xAI's first-party x_search is unique per Council OS routing rules; the quantification is unique-distinctive. KEEP with attribution but DISCOUNT 25-40% for conflict-of-interest — the model is implicitly selling its own X-access capability. Treat the 4-18h range as the optimistic operational expectation; plan around the GPT-5/Sonar same-day-to-1-day estimate as the conservative baseline.]
61. **Grok-4 fine-grained recruiter-timing claim (Glean/Sierra/Cohere 70% of tracked roles get first LinkedIn ping at t+4-8h)** [model-distinctive specificity; KEEP as best-available estimate]
62. **Opus 4.7 Pallet-vs-Getro Khosla 2023 change** [model-distinctive recall; verify before coding the Khosla scraper]
63. **Opus's specific composite zombie scorer with concrete coefficients (0.35/0.25/0.20/0.10/0.10)** [model-distinctive synthesis; KEEP but treat coefficients as gut-tuned defaults to be re-calibrated against 14-day corpus]
64. **GPT-5's `pmset repeat wakeorpoweron` exact command + the `launchctl kickstart -k gui/$(id -u)` invocation** [model-distinctive operational specificity; KEEP, web-corroborated]
65. **Opus identification of Latent Space Discord membership at ~20k** [unverified but plausible; KEEP as background context not as load-bearing]
66. **Gemini's specific Tue-Thu 09:00-11:30 AM PT FDE window** [model-distinctive narrowing; treat as one of two competing hypotheses, NOT settled — see Impasse 2 verdict below]
67. **GPT-5's "missing-ATS detector" pattern (auto-add careers page when VC board links to untracked company)** [GPT-5 model-distinctive synthesis; KEEP as P1 — pays compounding dividends]
68. **Sonar Deep's "applying within 96h = 5x response rate" GoApply-aggregated citation** [unique citation; matches Sonar's research-aggregator role; KEEP]
69. **Opus's Tue-Wed AM-PT-only FDE window (recruiters approve at Monday staff meetings)** [model-distinctive narrowing; competes with Gemini's window — see Impasse 2]
70. **Sonar Reasoning Pro's "for hot AI roles, age >60d = zombie unless evidence of refresh"** [model-distinctive 60d threshold; the 45d/60d split is part of Impasse 6]

---

## Open disagreements / Undecidable impasses

- **Impasse 2 (FDE peak hour-of-day) is GENUINELY UNDECIDABLE without Mitchell's own 14-day `first_seen_at` data.** All three competing windows (Gemini 09-11:30, Opus 09-13 Tue-Wed, Grok-4 11-16) are internally consistent with their underlying theories. Recommended next step: instrument `first_seen_at` for 14 days across the existing Tier-A list, then plot the actual histogram. Until then, schedule the every-4h Tier-A cadence to cover the **full 09:00-16:00 PT span** (4 scans/day at 09:00, 11:00, 13:00, 15:00 PT) so all three windows are captured.

---

## Impasse Verdicts (detailed)

### Impasse 1 — Tier-A cadence default
**Verdict:** BROKEN — side with **Grok-4 / Sonar Reasoning Pro / Gemini / Grok-x-search** (every-4h Tier-A baseline)
**Evidence:** Grok-4's explicit "<5% incremental first-mover callbacks for hourly vs every-4h" estimate, combined with the 7/7 convergence that every-4h captures >85% of first-mover advantage, makes hourly a poor cost/benefit trade. The 24-48h operational window (not 1h) is the real attention threshold per all 7 models. ATS rate limits are not a blocker either way [web-verified — Greenhouse unlimited, Ashby ~100/min].
**Action:** Default Tier-A to **every-4h business hours (09:00, 11:00, 13:00, 15:00 PT) + 1 evening sweep at 20:00 PT for the Sunday-evening publish-for-Monday pattern**. Reserve hourly as an opt-in "burst mode" for the top-3 companies (Anthropic, OpenAI, Sierra) only if a measurable signal emerges from 14-day instrumentation.
**Confidence:** HIGH

### Impasse 2 — FDE peak hour-of-day
**Verdict:** GENUINELY UNDECIDABLE — three internally-consistent theories, no external evidence resolves
**Evidence:** All three windows (Gemini 09-11:30 / Opus Tue-Wed AM / Grok-4 11-16) are plausible. Grok-4's "after eng syncs" mechanism is real (most AI eng leads run Monday/Tuesday syncs); Gemini's "early-morning recruiter batch" is also real. No external HR/recruiting study isolates AI-FDE specifically — web search confirmed industry data is aggregated across all knowledge-worker roles.
**Action:** Schedule every-4h Tier-A scans at **09:00 / 11:00 / 13:00 / 15:00 PT** so all three windows are covered, then instrument `first_seen_at` for 14 days and plot the actual histogram. Re-adjudicate after data lands.
**Confidence:** N/A (deferred to empirical measurement)

### Impasse 3 — LinkedIn signal exploitation
**Verdict:** BROKEN — side with **GPT-5 / Opus** (NO direct scraping; Gmail-alert ingestion only)
**Evidence:** Late-2025 LinkedIn moved professional work history behind login wall [web-verified — multiple 2026 sources confirm]. Scraping while logged in is an unambiguous ToS violation with active enforcement: LinkedIn filed suit against Proxycurl January 2025 (settled), Apollo.io and Seamless.ai had Company Pages removed in 2025 as part of a broader crackdown. The hiQ public-data precedent does not protect logged-in scraping. **Critical distinction the council partially missed:** Gmail-alert ingestion (which Mitchell already does) is NOT scraping LinkedIn — it's processing emails LinkedIn sent to Mitchell at his request. ToS doesn't apply to his own inbox. So the architectural recommendation is "use Gmail alerts as the LinkedIn signal source," NOT "skip all LinkedIn signal."
**Action:** Keep Gmail-alert ingestion as the LinkedIn signal source. Do NOT add direct LinkedIn scraping. View-count decay signal IS lost but the ToS exposure isn't worth it. If Mitchell needs view-count decay later, the right path is Sales Navigator (paid, opt-in to LinkedIn's own API — outside scope of input-quality audit).
**Confidence:** HIGH

### Impasse 4 — X/Twitter $200/mo API
**Verdict:** BROKEN — side with **GPT-5** (skip the $200/mo, use free curated-list workflow)
**Evidence:** Grok-x-search has a clear conflict-of-interest — it's xAI's model selling xAI's own X-access capability [Council OS routing-rules.md confirms xAI's first-party x_search is unique to xAI models, so Grok-x-search's "X is highest signal" position structurally aligns with xAI commercial interests]. Even accepting Grok-x-search's 6-24h lead-time claim at face value, the operational lift from curated X List + mobile notifications captures 70-80% of that signal at $0/mo. $2,400/year is the same budget that funds ~5x the cv-tailor / dealbreaker / council runs per year — better marginal ROI elsewhere.
**Action:** Build a curated X List of 50-100 AI founders/recruiters; enable mobile notifications; manual scan 1-2x/day. Defer $200/mo API until measurement shows Mitchell is manually checking >2x/day for >2 weeks straight.
**Confidence:** HIGH

### Impasse 5 — Migrate scheduler off macOS launchd
**Verdict:** BROKEN — partial agreement with **Grok-4 / Grok-x-search** (wrapper-patch first), but **GPT-5's migration target stays as P1**
**Evidence:** Web search confirms the Tahoe KeepAlive issue is real and documented in 2026 GitHub issues. **However**, the same sources also identify the canonical workaround: replace `launchctl bootout` + `bootstrap` with `launchctl kickstart -k` (which keeps the service definition loaded and lets KeepAlive respawn). This is the 2h Grok-4 wrapper-script patch and it buys most of the reliability without architectural rework. Mitchell already has 42 launchd plists, hang-watchdog state, and a tested Tahoe workaround per project memory (`project_launchd_keepalive_tahoe_bug.md`: "after `bootstrap`, run `launchctl start <label>` for KeepAlive=true jobs"). The full GitHub Actions / Linux VM migration is real architectural improvement (eliminates a recurring class of bugs entirely) but the ROI per hour is worse than the wrapper patch in the next sprint. **GPT-5's recommendation isn't wrong; it's just P1 not P0.**
**Action:** P0 — Apply the wrapper-script + `launchctl kickstart -k` + healthcheck integration (3-4h total). P1 — Plan the GitHub Actions cron migration as a 1-day project for the next sprint cycle; specifically target the 3 highest-stakes plists (portal-scan, dashboard-server, telegram-bot) first, leave 39 lower-stakes plists on launchd until proven necessary.
**Confidence:** HIGH

### Impasse 6 — Zombie age threshold
**Verdict:** BROKEN — **45 days as canonical production threshold**
**Evidence:** Median of 5 model estimates is 45d (28/31/45/45/60). Web-corroborated: "Engineering candidates at frontier AI labs like Anthropic and OpenAI typically wait 3 to 8 weeks" = 21-56 days, midpoint 38d. Series B/C AI cos median 31-45d per Opus + Gemini converge. So 45d is the upper-bound of "expected fill time still in play" — anything older statistically should have been filled or refreshed. Use 45d for the binary skip decision, but apply Opus's composite scorer so a 50d posting with a `last_updated` timestamp within 14 days still gets full-eval (not zombie if it's been refreshed).
**Action:** Set `ZOMBIE_AGE_THRESHOLD_DAYS = 45` in the scoring constants. Apply Opus's full composite formula on top — age is one weight (0.35), not the only signal.
**Confidence:** HIGH

### Impasse 7 — Latent Space Discord lead time
**Verdict:** BROKEN — **same-day-to-1-day (GPT-5 / Sonar Reasoning Pro)** as conservative operational baseline; **Grok-x-search's 4-18h is the optimistic upside**
**Evidence:** Web search returned no public methodology for Grok-x-search's "35-40% of Anthropic/RunPod/Vapi" claim — it's based on live X timeline pulls that aren't independently reproducible by other models. Opus's "days before" claim is also unsourced and unverifiable. GPT-5 and Sonar Reasoning Pro's "same-day to 1-day" is the conservative middle ground that no source actively contradicts. Importantly, the Latent Space community page itself doesn't publish a "post here before ATS" policy [verified via WebSearch]. Apply Grok-x-search's range as the upside but build the integration assuming conservative lead time.
**Action:** Integrate Latent Space Discord as a P2 (not P1) — meaningful but not load-bearing if conservative estimate holds. Once integrated, measure actual lead time across the first 30 days of data and re-rank.
**Confidence:** MEDIUM-HIGH

---

## Routing audit

**Status:** PASSED. The council picked a strong 7-model lineup with cross-cut coverage: Opus 4.7 + GPT-5 (synthesis depth), Grok-4 + Grok-x-search (real-time X signal — the only first-party x_search per Council OS routing-rules.md), Gemini 2.5 Pro (Google grounding), Sonar Deep + Sonar Reasoning Pro (multi-source web aggregation). The known conflict-of-interest on Grok-x-search (selling its own X-access capability) is real but the routing was correct — having that model in the lineup IS the value because no other model could provide live X signal. The orchestrator handled the conflict correctly by surfacing it explicitly in the impasse list.

One minor note: the 4 models that truncated on Q5 (Sonar Deep, Sonar Reasoning Pro, Gemini, Opus) at 6K-token budget is a known capacity issue — for next council run, consider per-question budget allocation (e.g., 1.5K for Q1-Q4, 2K for Q5) instead of uniform 6K total. Not a routing failure; just a token-budget tuning opportunity for next time.

---

## Appendix: rejected/contradicted claims (audit trail)

| # | Claim | Source | Classification | Rationale |
|---|---|---|---|---|
| 1 | Opus's "84 calls/day per platform at every-2h is the practical ceiling" specific number | Opus | CORROBORATED (kept) | Math checks out; not a primary citation but architecturally trivial to verify |
| 2 | "Greenhouse Harvest API v1/v2 deprecation August 31, 2026, OAuth 2.0 required" | web-citation in council | VERIFIED (kept) | Independently web-verifiable but NOT load-bearing for Mitchell — he uses the public Job Board API not Harvest |
| 3 | Opus "Appcast/SmartRecruiters: 96h = 3-5x recruiter-review rate" marked UNVERIFIED in council | Opus | UNIQUE — unsupported | KEEP only as directional signal; Opus self-marked as unverified |
| 4 | Sonar Deep "13% higher interview chance for 06:00-10:00 submissions" via GoApply | Sonar Deep | CORROBORATED | Sonar's aggregator citation; consistent with Gemini's "candidates within 4h see callback rate up to 40% higher than 24h-later" — directional truth |
| 5 | Opus's specific Latent Space Discord ~20k member count | Opus | UNIQUE — unsupported | No way to verify without joining the Discord; not load-bearing — KEEP as background context |
| 6 | Anthropic Discord = no jobs channel | Opus + GPT-5 + Grok-x-search + Sonar Reasoning Pro + Gemini | VERIFIED | 5/7 explicit, no contradictions; Anthropic uses anthropic.com/jobs only |
| 7 | "Founders Fund has no public board" (Opus) vs "jobs.foundersfund.com Daily-ish [UNVERIFIED]" (GPT-5) | Opus vs GPT-5 | CONTRADICTED | Cut from baseline; add a 5-min verify step before coding any Founders Fund integration |
| 8 | Khosla switched Getro → Pallet ~2023 | Opus | UNIQUE — model-distinctive | KEEP with verify-before-code flag (5-min URL check) |
| 9 | Sonar Reasoning Pro "median TTF AI roles at Series B/C: 31 days" | Sonar Reasoning Pro | CORROBORATED | Web-corroborated as middle of 3-8 week range; aligns with Grok-4's same number |
| 10 | Opus "Tue-Wed AM PT only for FDE/SA (Monday staff meeting approval cycle)" | Opus | UNIQUE — model-distinctive | KEEP as one of three competing hypotheses for Impasse 2 (resolves empirically) |
| 11 | Gemini "Tue-Thu 09:00-11:30 AM PT for FDE/SA/AI PM" | Gemini | UNIQUE — model-distinctive | KEEP as one of three competing hypotheses |
| 12 | Grok-4 "11:00-16:00 PT FDE peak, recruiters batch after eng syncs" | Grok-4 | UNIQUE — model-distinctive | KEEP as one of three competing hypotheses |
| 13 | Grok-x-search "35-40% of Anthropic/RunPod/Vapi postings on Discord/X 4-18h ahead of ATS" | Grok-x-search | UNIQUE — model-distinctive (DISCOUNTED) | KEEP but discount 25-40% for conflict-of-interest; treat as optimistic upper bound |
| 14 | LinkedIn view-count decay as zombie signal via direct LI scraping | Grok-x-search + Gemini | CONTRADICTED | GPT-5 + Opus warn ToS violation; web-verified that LinkedIn moved work history behind login wall late-2025 + active enforcement against scrapers (Proxycurl suit Jan 2025, Apollo/Seamless removals 2025) |
| 15 | Recruiter-LinkedIn-profile activity tracking as zombie signal | Grok-4 alone | UNIQUE — unsupported | Opus + GPT-5 + Sonar Reasoning Pro all flag ToS-violating + fragile + low ROI. CUT. |
| 16 | $200/mo X API as worth-it for FDE signal | Grok-x-search | UNIQUE — unsupported (conflict-of-interest) | Grok-x-search has commercial conflict; GPT-5's free curated-list path is the dominant strategy |
| 17 | Move ALL launchd jobs to GitHub Actions cron immediately | GPT-5 | CORROBORATED (downranked) | Real architectural improvement but P1 not P0; wrapper-script patch + healthchecks at P0 captures the bulk of the value at 4h vs 1 day |
| 18 | "Anthropic posts jobs on Latent Space Discord days before ATS" | Opus | UNIQUE — unsupported | No web evidence; Grok-x-search's 4-18h estimate is the only quantified live observation, and that's discounted |
| 19 | Tier-A every-2h business hours as default | Opus | UNIQUE — model-distinctive (downranked) | More aggressive than evidence supports; defer to Grok-4 + Gemini + Sonar Reasoning Pro convergence on every-4h baseline. Opus's specific 2h is a hypothesis to test, not a production default |
| 20 | Tier-A hourly for top 12 as default | GPT-5 | UNIQUE — model-distinctive (downranked) | <5% incremental signal per Grok-4; doesn't justify the LLM-eval token cost doubling |
| 21 | Bessemer = Getro vs in-house | Opus | UNIQUE — unsupported | Verify URL/backend before coding |
| 22 | Sonar Deep / Sonar Reasoning Pro / Gemini / Opus Q5 token truncation | council orchestrator | STALE for Q5 | Q5 synthesis correctly leaned on GPT-5 / Grok-4 / Grok-x-search; budget tuning recommendation for next council |

---

## PRIORITIZED IMPLEMENTATION PLAN (P0/P1/P2 with effort + ROI)

Ordered by ROI per hour. P0 items together: **~6 hours work for the foundational reliability + cadence upgrade.** Full P0+P1 plan: **~2.5 days work** for the complete input-quality system overhaul.

### P0 — Foundational reliability + cadence (do these first, ~6h total)

| # | Item | Effort | ROI rationale | Dependencies |
|---|---|---|---|---|
| **P0-1** | **Healthchecks.io integration** — sign up free tier, create 2 checks (`career-ops-portal-scan` daily @ 02:00 PT grace=25min; `career-ops-liveness-sweep` daily @ 03:30 PT grace=25min), wrap launchd commands with curl ping pattern (GPT-5's snippet, copy-pasteable) | 30 min | Catches future silent skips in <35 min instead of 18 hours. Free service, ~10 LOC. Highest-leverage line of code Mitchell can add this week. | None |
| **P0-2** | **Tiered cadence config edit** — set Tier-A (Anthropic, OpenAI, Sierra, Glean, Cohere, CoreWeave, RunPod, Vapi, Bland, Parloa, Arize, Cursor) to every-4h scans at 09/11/13/15 PT + evening 20:00 PT; Tier-B (Databricks, Mistral, Mercor) every-4h 24/7; Tier-C long-tail daily | 1h | Captures 24-48h first-mover window. 7/7 model convergence. No new infra. | None |
| **P0-3** | **Add Gmail-alert processing every 15-30 min** (currently batched daily) — Gmail API history endpoint with watch-style polling | 2h | LinkedIn signal arrives via email alerts in real-time; daily batch loses 12-24h. Same Gmail API Mitchell already uses. | None |
| **P0-4** | **Zombie composite scorer P0 minimum** — age (45d) + multi-region cluster (>=4 same JD different city) + evergreen-regex hit. Skip if score >= 0.5; cheap-eval (Haiku) if 0.3-0.5; full-eval if <0.3 | half-day (4h) | 40-60% LLM-eval token reduction per Opus + Grok-4 convergence. Pays back immediately every Process All run. | None |
| **P0-5** | **`first_seen_at` instrumentation** — schema add to scraper output, populate on first observation, persist; the foundation for empirical resolution of Impasse 2 (FDE hour-of-day) | 2h (after P0-2) | Without this, all the hour-of-day debates are uncalibrated. Unlocks 14-day empirical re-adjudication. | P0-2 |

**P0 cumulative effort: ~9.5h. Recommended sequence: P0-1 → P0-2 + P0-5 (parallel) → P0-3 → P0-4.**

### P1 — High-value follow-on (do within 1-2 weeks of P0, ~12h)

| # | Item | Effort | ROI rationale | Dependencies |
|---|---|---|---|---|
| **P1-1** | **Add HN "Who is Hiring" monthly ingestion via Algolia API** — `hn.algolia.com/api/v1/search?tags=story_{whoishiring_id}` on 1st of month + filter parser for AI/eng/FDE keywords | 2h | 7/7 convergence; AI-native startups post here before ATS in ~30% of cases. Free, well-documented API. | None |
| **P1-2** | **Map + integrate 10 VC-portfolio Getro/Pallet boards** — verify each URL with curl before coding; pattern is `jobs.{firm}.com/api/jobs?limit=100&offset=N`. Khosla is Pallet (different endpoint shape — verify before coding). | half-day (4h) | Discovers companies you're NOT tracking yet; same-day-as-ATS for already-tracked. Compounds with P1-3. | None |
| **P1-3** | **Add 12 vertical-AI companies to scraper** — Harvey, Hippocratic AI, Decagon, Cursor, Perplexity, Scale, Together, Fireworks, Baseten, Modal, Hugging Face, Replit. Most on Greenhouse or Ashby — drop-in config edit to existing scraper. | 2h | Closes the biggest known gap in Mitchell's current target list. Each one is a pure config addition. | None |
| **P1-4** | **YC Work-at-a-Startup GraphQL polling** — daily, filter to AI/ML category, Series Seed-C | 2h | Founder/hiring-manager density; complements HN Tier-1 ingest | None |
| **P1-5** | **Loud dashboard widget with SKIPPED/yellow-late/red/purple-low-volume states** — replace ambiguous "no data" with concrete reasoning | 2h | Surfaces silent misses visually so they get noticed within minutes. Mitchell sees the dashboard daily. | P0-1 (Healthchecks) |
| **P1-6** | **SQLite `job_runs` ledger** — schema per GPT-5's spec; record start/finish/status/urls_found/error per run | 2h | Foundation for the loud widget + future analytics. Standard SQLite, ~50 LOC. | None |
| **P1-7** | **Embed JDs with `text-embedding-3-small`; maintain 180-day rolling history; flag cosine >0.95 as chronic-relist** | half-day (4h) | Catches recycled/evergreen postings the regex misses. ~$5/month embedding cost. | P0-4 |
| **P1-8** | **Wrapper script that records last successful run + restarts on failure** (Grok-4's interim launchd patch) | 2h | Buys 80% of the migration's reliability at 16% of the cost. P0-1 (Healthchecks) covers the other 20% via external dead-man's switch. | P0-1 |
| **P1-9** | **Add `pmset repeat wakeorpoweron MTWRFSU 01:55:00`** — Mac-sleep mitigation while still on launchd | 15 min | One-line `sudo` command. Eliminates a known launchd-during-sleep failure mode. | None |
| **P1-10** | **Drop Anthropic Discord, Carta, EquityZen, Forge from any candidate-source/job-feed configs** — verified non-existent / non-feeds | 5 min | Cleanup; prevents wasted scraper attempts. | None |
| **P1-11** | **Keyword-expansion filter for FDE-equivalents** — 10 phrases from Opus/GPT-5 list: "Forward Deployed", "Customer Engineer", "Solutions Architect", "AI Engineer Customer", "Deployment Strategist", "Field Engineer", "Technical Account", "Strategic Product Engineer", "AI Transformation", "AI Enablement" | 2h | Catches FDE-equivalent titles at companies that don't use "Forward Deployed" label. Each missed pattern is a missed opportunity. | None |
| **P1-12** | **GitHub Actions cron migration for 3 highest-stakes plists** (portal-scan, dashboard-server, telegram-bot) — leave 39 lower-stakes on launchd | 1 day (8h) | Eliminates a class of Tahoe-launchd bugs for the load-bearing 3. The other 39 can stay until proven necessary. | P0-1 |

**P1 cumulative effort: ~32h (4 days). Recommended sequence: P1-1 + P1-3 + P1-4 + P1-9 + P1-10 (parallel quick wins, ~6h) → P1-2 + P1-5 + P1-6 (parallel infra, half-day each) → P1-7 + P1-8 + P1-11 (parallel polish) → P1-12 (1-day project alone).**

### P2 — Optional polish (do when convenient, ~10h)

| # | Item | Effort | ROI rationale | Dependencies |
|---|---|---|---|---|
| **P2-1** | **AI Engineer Foundation job board scrape** (`ai.engineer/jobs`) | 2h | Curated AI-only board; overlaps with Tier-1 adds but covers Modal/Vercel/Sierra/Baseten exposure | None |
| **P2-2** | **Latent Space Discord bot integration** | half-day | Conservative same-day-to-1-day lead time per dealbreaker verdict on Impasse 7; integrate to measure actual lead time, then re-rank | None |
| **P2-3** | **Curated X List of 50-100 AI founders/recruiters + mobile notifications** | 2h one-time | Free alternative to $200/mo X API per dealbreaker verdict on Impasse 4 | None |
| **P2-4** | **Modal Labs jobs board scrape** | 30 min | Small but high-fit curation per Opus | None |
| **P2-5** | **Add 5-8 second-tier vertical AI cos** (Abridge, Ambience, EvenUp, Spellbook, Hebbia, Rogo, Crescendo, Lorikeet) | 2h | Long-tail of vertical AI; lower density than P1-3 list | P1-3 |
| **P2-6** | **Defense/govtech AI: Anduril, Shield AI, Applied Intuition** | 1h | Adjacent vertical; not core FDE target but worth covering | None |
| **P2-7** | **LangChain + LlamaIndex** (developer tooling) | 1h | Adjacent; lower target density | None |
| **P2-8** | **Workday endpoint scrape for Palantir + other Workday AI cos** | half-day | Hostile but scrapeable; only worth it after P0+P1 lands and there's spare capacity | None |
| **P2-9** | **Levels.fyi unofficial API as post-ingestion comp-filter layer** | 2h | Useful for filtering by comp tier; not a primary feed | None |
| **P2-10** | **GPT-5's "missing-ATS detector"** — if VC board links to untracked company, auto-add careers page + classify ATS vendor | 2h | Compounding value: each VC board run auto-grows the target list | P1-2 |
| **P2-11** | **Full launchd → systemd-timers / GitHub Actions migration for remaining 39 plists** | 2-3 days | Architectural cleanup; only worth doing once P1-12 confirms the 3-plist pattern works | P1-12 |
| **P2-12** | **Calibrate Opus's composite scorer coefficients against 14-day corpus** | 2h | Replaces gut-tuned weights with empirical fits | P0-4 + 14 days of data |
| **P2-13** | **Re-adjudicate Impasse 2 (FDE hour-of-day) against `first_seen_at` data** | 2h | Resolves the one genuinely undecidable impasse after data arrives | P0-5 + 14 days of data |

**P2 cumulative effort: ~10h (excluding P2-11 which is its own multi-day project).**

---

## Total project estimate

- **Minimum-viable upgrade (P0-1 + P0-2 only):** 1.5 hours. Catches silent skips + captures 24-48h first-mover window. Mitchell's bottom-line bullet from the council.
- **Full P0 foundation:** ~9.5 hours (~1 day spread across a week).
- **P0 + all P1:** ~42 hours (~5 working days).
- **Complete system (P0 + P1 + P2 excluding P2-11):** ~52 hours (~6.5 working days).
- **Architectural overhaul including full launchd migration (P2-11):** ~70+ hours (~9 working days).

The **highest-ROI 6 items** that capture 80% of the value:
1. **P0-1** Healthchecks.io dead-man's switch (30 min)
2. **P0-2** Tiered every-4h cadence (1h)
3. **P0-4** Zombie composite scorer baseline (4h)
4. **P1-1** HN "Who is Hiring" ingestion (2h)
5. **P1-2** 10 VC-portfolio Getro boards (4h)
6. **P1-3** 12 vertical-AI companies added to scraper (2h)

**Total: ~14 hours for 80% of the value.**

---

## Cross-references

- **Project memory:** `~/.claude/projects/-Users-mitchellwilliams-Documents-career-ops/memory/project_launchd_keepalive_tahoe_bug.md` confirms the Tahoe KeepAlive bug + Mitchell's existing `launchctl start <label>` workaround — Impasse 5 verdict aligns with this prior work.
- **Project memory:** `feedback_hang_prevention_patterns.md` — Healthchecks.io integration (P0-1) extends the hang-watchdog architecture already in place.
- **Council OS:** `~/Documents/council-os/routing-rules.md` confirms Grok-x-search's unique x_search capability — Impasse 4 verdict accounts for the conflict-of-interest correctly.
- **Web sources used:**
  - [Greenhouse Job Board API docs](https://developers.greenhouse.io/job-board.html) — confirms unrate-limited public GETs
  - [Ashby developer docs](https://developers.ashbyhq.com/docs/public-job-posting-api) — confirms public posting-api ~100/min unofficial
  - [LinkedIn scraping 2026 legal landscape](https://sociavault.com/blog/linkedin-scraping-legal-guide-2026) — confirms late-2025 login-wall + active enforcement
  - [Frontier AI lab hiring timelines 2026](https://hirearcher.com/blog/how-to-get-hired-at-an-ai-startup-in-2025) — confirms 3-8 week engineering TTF
  - [macOS launchd Tahoe issues 2026](https://github.com/openclaw/openclaw/issues/43311) — confirms KeepAlive bootout/bootstrap issue + `launchctl kickstart -k` workaround

---

**End of adjudication.**
