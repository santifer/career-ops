---
name: refresh-master
description: |
  Cost-aware refresh orchestrator for every cache the dashboard reads.
  Classifies apply-now rows into priority tiers (A Watch / B Active / C Tracked /
  D Cold) using composite score × pre-IPO equity weighting × status boost.
  Walks every cache, identifies what's stale per tier-cadence, and either
  prints what would refresh (dry-run, default) or fires the refresh handlers
  (when policy.budget.dry_run=false). Enforces $80/day + $2,400/30d caps.

  Designed to run every 6 hours via launchd
  (com.mitchell.career-ops.refresh-master.plist).

  Use when Mitchell says:
    - "refresh the dashboard intel"
    - "what would the refresh orchestrator do right now"
    - "plan the next refresh cycle"
    - "show the refresh queue"
    - "what's the spend window today"
    - "/refresh-master" or "/refresh"

  Use proactively when Mitchell adds or removes rows from apply-now and wants
  to see how the priority tiers re-classified.
---

# refresh-master — Cost-aware refresh orchestrator

## What it does

Single source of truth for every cache the dashboard reads from. Replaces the
ad-hoc mix of "manual scripts + nightly intel-refresh + weekly portal scans"
with a unified orchestrator that:

1. **Classifies every apply-now row** into priority tier A/B/C/D using the
   weighting rules in `config/refresh-policy.yml` (composite score, pre-IPO
   equity boost, status overrides for Interview/Offer)

2. **Walks every cache** (hm-intel, toxicity, positioning, role-enrichment,
   etc.) and checks freshness per the tier's cadence

3. **Builds a refresh queue** sorted by cost-effectiveness

4. **Enforces budget caps** before firing each refresh — daily ($80) +
   monthly ($2,400) hard caps; per-refresh cost cap; per-tier cost cap

5. **Fires refresh handlers** via the existing scripts
   (`scripts/agents/intel-refresh.mjs`, `scripts/enrich-apply-now.mjs`,
   `scripts/hiring-manager-research.mjs`) — does NOT re-implement the
   actual research; just schedules + budgets

6. **Triggers dashboard rebuild** after a batch of cache writes (debounced
   5 min) so refreshed intel surfaces in the UI

## CLI

```bash
# Default — reads policy, dry-run by default
node scripts/refresh-master.mjs

# Always dry-run regardless of policy
node scripts/refresh-master.mjs --plan

# Force real spend, ignores policy dry_run flag (USE WITH CARE)
node scripts/refresh-master.mjs --execute

# Only consider Layer N (1=continuous, 2=Sonnet refresh, 3=deep research)
node scripts/refresh-master.mjs --layer 2

# Just write today's daily report, don't refresh
node scripts/refresh-master.mjs --report
```

## Configuration

All knobs live in `config/refresh-policy.yml`. Edit + save + the next run picks
it up. No code changes required.

Key knobs:
- `budget.dry_run` — **defaults to true**; flip to false to enable real spend
- `budget.daily_cap_usd` — hard ceiling, default $80
- `budget.monthly_cap_usd` — running 30d cap, default $2,400
- `priority_tiers.watch_list_size` — Tier A size, default 5
- `priority_tiers.pre_ipo_equity_weighting` — multiplier for pre-IPO roles, default 1.8
- `layer2_sonnet_refresh.cadence_days` — per-tier refresh interval (A=3d, B=7d, C=14d)
- `layer3_deep_research.scheduled_rotation.one_role_every_n_days` — full Deep Research cadence on Watch list, default 2 days

## Safety

- **Defaults to DRY-RUN** (`budget.dry_run: true` in the policy). No spend until
  Mitchell explicitly flips it.
- Hard daily + monthly budget caps enforced before each refresh fires.
- Per-refresh cost cap; runs exceeding it skip + log + flag.
- Resumable via `data/refresh-master-state.json`.
- Full action log at `data/logs/refresh-master-{date}.log`.

## Launchd cadence

`scripts/launchd/com.mitchell.career-ops.refresh-master.plist` runs at
00:15, 06:15, 12:15, 18:15 PT daily. RunAtLoad is false — only fires on
schedule.

To activate (once Mitchell is ready):
```bash
cp scripts/launchd/com.mitchell.career-ops.refresh-master.plist \
   ~/Library/LaunchAgents/
launchctl load -w \
   ~/Library/LaunchAgents/com.mitchell.career-ops.refresh-master.plist
```

## What's stubbed in Phase 1 (this scaffold)

The orchestrator works end-to-end in dry-run, classifies correctly, walks
caches correctly, builds the refresh queue correctly. What's NOT yet wired:

1. The `--mode delta-sonnet` / `--mode sonnet` / `--row N` flags it passes
   to `intel-refresh.mjs` don't currently exist on that script. Phase 2 work
   wires them in (the underlying refresh handlers need adapters).
2. Layer 3 event triggers (status→Interview, new top-15 row, recruiter
   message) — only the scheduled rotation is wired in Phase 1. Phase 3
   adds the event-trigger hooks.
3. Layer 4 monthly retrospective audit — scaffolded in the policy but the
   actual audit agent isn't built yet. Phase 4.
4. Freshness chips on the dashboard — Phase 5.

Phase 1 (this commit) is the foundation. Subsequent phases extend it without
re-architecture.
