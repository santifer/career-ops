# EPSILON — Maintenance Log — 2026-05-19

**All actions reversible. Every move has an archive. Nothing deleted.**

---

## Ε.2 actions

### 2026-05-18 23:55 PT — Archived 7 reverse-orphan dashboard HTMLs

Source: `dashboard/reports/*.html` files that had no matching `reports/*.md`. Discovered in Ε.1 via diff of basename sets.

Destination: `data/orphan-dashboard-htmls-2026-05-19/`

Files moved (verify by name; HTML preserved byte-for-byte):
- `2151-mistral-ai-senior-staff-devrel-2026-05-16.html`
- `2152-databricks-sr-2026-05-16.html`
- `2153-deepgram-senior-devrel-2026-05-16.html`
- `2154-llamaindex-ai-content-engineer-2026-05-16.html`
- `2155-anthropic-anthropic-ai-native-2026-05-16.html`
- `536-nvidia-senior-devrel-ai-security-2026-05-07.html`
- `539-nvidia-2026-05-07.html`

**Reversal command (if Mitchell wants any back):**

```bash
mv data/orphan-dashboard-htmls-2026-05-19/<filename>.html dashboard/reports/<filename>.html
```

Hypothesis on origin: prior builds emitted these HTMLs with filenames that differed from the source `.md` (e.g., `2152-databricks-sr-2026-05-16` is too short — the real report filename would have included the role slug). When `scripts/build-dashboard.mjs` was re-run with corrected slug logic, the new HTMLs landed under different filenames and the old ones stayed. No data lost — these are derivative renderings; the canonical `.md` reports they were derived from no longer exist by that exact slug. **Post-archive count: 1097 dashboard HTMLs ↔ 1097 reports md.** Match.

### 2026-05-18 23:55 PT — Archived `apply-packs/000-unknown-unknown/` placeholder

Source: `data/apply-packs/000-unknown-unknown/`
Destination: `data/archived-apply-packs-2026-05-19/000-unknown-unknown/`

This was a generic auto-triage placeholder with no matching tracker row, no real company, and no real role. Archived not deleted — Mitchell may want to inspect what triggered the placeholder generator.

**Reversal command:**
```bash
mv data/archived-apply-packs-2026-05-19/000-unknown-unknown data/apply-packs/000-unknown-unknown
```

### Not actioned (clean by audit)

| Pattern | Status | Why no action |
|---|---|---|
| Duplicate applications.md rows | 0 dupes found | `node dedup-tracker.mjs` would no-op |
| Orphaned `reports/*.md` (no html) | 0 found | Every `.md` already has matching `.html` |
| Stale `hm-intel/*.json` (>30d AND Discarded) | 0 found | All 17 intel files <30d old |
| `/tmp/` leaked files >24h | 0 found | Nothing matched `*career-ops* / *claude* / *agent* / *cv-tailor* / *dealbreaker* / *council*` |
| 4 apply-packs missing tracker rows (842, 851, 854, 863) | DO NOT ARCHIVE | These are forward-built packs from very recent triage (2026-05-15+); the tracker rows will land via the next `merge-tracker.mjs` run. Removing them prematurely would lose work. |

### NEEDS_HUMAN action items (not auto-fixed)

1. **dashboard-server flap** (`launchctl bootout` + `bootstrap` to clear stale `LimitLoadToSessionType=Aqua` job). Reasoning in `data/epsilon-system-health-2026-05-19.md` §1a. Non-reversible system-state operation; per Decision-Maximization + Anti-Hallucination charters, EPSILON's overnight authority does not extend to launchd bootstrap rewrites without Mitchell's choice of timing.

2. **telegram-bot flap** (same `EX_CONFIG (78)` pattern; not in `scripts/launchd/`, lives in `~/Library/LaunchAgents/` directly). Mitchell may want this off entirely.

3. **AGENTS.md / CLAUDE.md "17 plists" drift correction.** Both files claim 17 launchd plists exist; actual count is 19 in `scripts/launchd/`. Correction landing in Ε.3 commit as part of code review pass — single-line edit per file, no semantic change.

---

## Audit trail

This file is committable (`data/epsilon-*.md` is not in `.gitignore`). The two archive directories `data/orphan-dashboard-htmls-2026-05-19/` and `data/archived-apply-packs-2026-05-19/` contain personal data (gitignored — they will live on disk only). The link between the two is THIS file.
