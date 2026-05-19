# ζ ZETA — Run Batch + Process All network-leverage surfacing audit
**2026-05-19, 07:40-08:00 PT · branch overnight-zeta-runbatch-2026-05-19**

## TL;DR (one line)

**Network leverage was structurally missing or broken on three surfaces (drawer, Phase B preview, mid-batch sidebar) AND the referrals agent.** Pre-fix: every `findContactsAtCompany()` call returned `[]` silently because `data/network-graph.json` doesn't exist on disk. Phase B per-company preview had NO network column. Referrals.md drew warm paths from one stale source. **Four AAA fixes shipped, end-to-end live-verified on https://dashboard.careers-ops.com/, with an honest-warmth gate (>18mo stale flag) so the badge can't oversell.**

## Surface-by-surface audit

| # | Surface | File:line | Pre-fix state | Post-fix state | Commit |
|---|---|---|---|---|---|
| 1 | Apply-pack drawer "Warm contacts at this company" card | `scripts/build-dashboard.mjs:3079` | Silently empty — `findContactsAtCompany()` returns `[]` because `data/network-graph.json` doesn't exist on disk. Freshness chip says "graph: not built" perpetually. | Fed by `network-database.json` (fresh today, 2,824 people). Anthropic: 45 contacts. OpenAI: 66 contacts. Honest stale-warmth disclosure ("3 fresh · 42 stale") | `d0463b9` |
| 2 | Process All Phase B per-company preview API | `dashboard-server.mjs:1020` | Returns Score / TTO / Toxicity / Cache / Cost. **No network signal.** Tier decisions cannot factor warm-intro paths. | Returns `network_warm_count` / `network_fresh_count` / `network_stale_count` / `network_first_degree` / `network_source` per row. Source-file disclosed in `schema_note`. | `0f71d27` |
| 3 | Process All Phase B per-company preview UI | `scripts/build-dashboard.mjs:19710` | 6 columns: Include / Co / Score / TTO / Toxicity / Cache / Cost / Actions. **No Network column.** | 9 columns: ... + **Network** column with green "5f · 3d" chip for fresh paths, amber for stale-only, dash for none. Tooltip discloses source-file. | `0f71d27` |
| 4 | Referrals agent (`scripts/agents/referrals.mjs`) input | `scripts/agents/referrals.mjs:119` | Reads ONLY `data/linkedin/2nd-degree/<slug>.json`. Does NOT consult `data/network-database.json` (1st-degree intros) or freshness data. | Reads BOTH sources. Stale paths (>18mo, no recent engagement) are excluded from the LLM prompt entirely. Output diagnostics include `unified_db_fresh_paths` + `unified_db_stale_paths_excluded`. | `c6aa9af` |
| 5 | Mid-batch live sidebar (Run Batch + Process All) | `scripts/build-dashboard.mjs:18828`, `dashboard-server.mjs::batchLive()` | Shows "✅ Company — Role" with **no network signal**. Warm-intro info only available POST-publish (after the apply-pack drawer rebuilds). | Per-row green "🤝 N" badge during the batch when `network_fresh_count > 0`. Decision-actionable mid-run. Tooltip discloses fresh + stale counts honestly. | `72fa756` |
| 6 | LLM prompt internal consistency (referrals) | `scripts/agents/referrals.mjs::userPrompt` | Constraints text said "If recommending a stale path, draft message MUST acknowledge time gap" — but stale paths were excluded from the prompt entirely. Internal contradiction. | Constraints rewritten: stale paths are surfaced as a COUNT (so the model knows they exist) but not as DATA. Cold-outreach fallback explicit. | `3f5fe31` |
| 7 | HTML escaping in live sidebar (defense-in-depth) | `scripts/build-dashboard.mjs:18834` | Pre-existing `(r.company \|\| '')` direct concat into innerHTML. Real risk low (r.company from URL hostname parse), but defense-in-depth still wanted. | Per-row `_esc()` helper applied to company + role in both badge tooltip and the visible line. | `3f5fe31` |

## AAA shipped tonight (commit SHAs)

| Commit | What it ships | Files | Lines changed |
|---|---|---|---|
| `d0463b9` | AAA-1: lib/network-graph.mjs fallback to network-database.json + honest-warmth gating | `lib/network-graph.mjs` | +218 −34 |
| `0f71d27` | AAA-2: Phase B per-company preview Network column | `dashboard-server.mjs`, `scripts/build-dashboard.mjs` | +69 −2 |
| `c6aa9af` | AAA-3: referrals.mjs reads unified DB (honest-warmth gated) | `scripts/agents/referrals.mjs` | +86 −5 |
| `72fa756` | AAA-4: mid-batch warm-intro sidebar badge | `dashboard-server.mjs`, `scripts/build-dashboard.mjs` | +35 −1 |
| `3f5fe31` | Adversarial self-review fixes (HTML escape + LLM prompt consistency) | `scripts/build-dashboard.mjs`, `scripts/agents/referrals.mjs` | +9 −6 |
| `0fec500` | Merge into main (--no-ff) | — | — |
| `1e8f935` | Merge of self-review fixes into main | — | — |

**Push to mitwilli-create:main:** `bd971a8..1e8f935`. Confirmed.

## Live verification (https://dashboard.careers-ops.com/)

API response (`/api/pipeline/per-company-preview` after server restart):

| Company | Warm | Fresh | Stale | 1st-degree | Source |
|---|---|---|---|---|---|
| OpenAI | 66 | **5** | 61 | 3 | network-database.json |
| Anthropic | 45 | **3** | 42 | 0 | network-database.json |
| ElevenLabs | 33 | **1** | 32 | 0 | network-database.json |
| Perplexity | 42 | **1** | 41 | 0 | network-database.json |
| Sierra | 30 | **3** | 27 | 1 | network-database.json |
| Cursor (Anysphere) | 4 | 0 | 4 | 0 | network-database.json |
| Mistral AI | 12 | **2** | 10 | 0 | network-database.json |
| Cohere | 18 | **1** | 17 | 1 | network-database.json |
| Pinecone | 11 | 0 | 11 | 0 | network-database.json |
| Cognition | 17 | **3** | 14 | 0 | network-database.json |

Phase B modal rendered (verified via Chrome MCP DOM inspection):
- Headers: `[Include, Company / top role, Score, TTO, Toxicity, **Network**, Cache, Cost, Actions]`
- First row (OpenAI, score 4.70): Network cell renders `5f · 3d` with `data-state="fresh"` (green chip)
- Tooltip: "5 fresh warm-intro path(s) (connected <18mo) + 61 stale. 3 first-degree direct. Source: network-database.json. Click drawer for full list."

Verification artifact: `data/runbatch-eval-snapshots/zeta/phase-b-network-column-2026-05-19.json`

## Honest-warmth gate: how the dishonesty was caught

Pre-fix, any UI that read warm-path data was at risk of claiming 45 Anthropic contacts when only 3 had been connected within 18 months (the rest were 2024-or-older with zero recent engagement). The gate works at three layers:

1. **Source layer** (`lib/network-graph.mjs::findContactsAtCompany`): every warm-path entry gets `_stale_warmth: true` when `connected_on > 18mo ago`. Surfaced explicitly to consumers.
2. **API layer** (`buildPerCompanyPipelinePreview`): returns `network_fresh_count` and `network_stale_count` as separate fields, so the consumer can render the split honestly.
3. **LLM layer** (`scripts/agents/referrals.mjs`): stale paths are EXCLUDED from the prompt entirely. The model can't write warm-tone outreach to a contact Mitchell hasn't engaged in 2+ years.

Without the gate, Mitchell's polish loop would have approved referrals.md files claiming warm intimacy with people who don't remember him — exactly the kind of "honest signal" failure the brief calls out.

## NEEDS_HUMAN flags

1. **Z-RB-NH-1 — engagement freshness has no signal**. The `data/linkedin/activity/` directory is empty. Every contact has `engagement.linkedin_last_engaged_at: null`. The honest-warmth gate falls back to `connected_on` (date Mitchell connected, not date of last interaction), which is a CONSERVATIVE proxy — a contact connected 6 months ago who's never been engaged is treated as "fresh" but might be cold in practice. **Mitchell decides**: do you want an activity scraper that records your outgoing LinkedIn reactions/comments + their dates? Scope = ZETA-A2 from the overnight self-review, not actioned tonight (judgment call).

2. **Z-RB-NH-2 — scan-network.mjs not run tonight**. `data/network-graph.json` is missing. The fallback to `network-database.json` works (this is exactly what AAA-1 ships) but the legacy graph format had per-person `evidence_sources` arrays that the gap-checker (`lib/network-graph.mjs::checkGap`) consults. My shape-conversion sets `evidence_sources: []` for all DB-derived people, which means `checkGap()` for gap patterns that depend on evidence-source matching will return less-rich answers. **Mitchell decides**: should ZETA add scan-network.mjs to nightly launchd so both sources coexist, or is the unified DB sufficient and we deprecate network-graph.json? Two paths forward, both require Mitchell's preference.

3. **Z-RB-NH-3 — `apply-pack/<row>/referrals.md` files not regenerated**. The 13 existing apply-packs with referrals.md were generated before AAA-3 shipped. They include only the 2nd-degree paths, NOT the unified-DB 1st-degree intros. **Mitchell decides**: do you want me to re-run referrals.mjs across the existing 13 packs to refresh them with the richer signal? Cost: ~$0.50 × 13 = $6.50, no judgment risk since AAA-3 only adds fresh paths and excludes stale ones.

## Adversarial self-review findings (already shipped — fixed tonight)

| # | Finding | Fix | Commit |
|---|---|---|---|
| Z-ADV-1 | Sidebar batch-recent items concatenated `r.company` + `r.role` into innerHTML without escape | Added per-row `_esc()` helper | `3f5fe31` |
| Z-ADV-2 | Per-row `findContactsAtCompany()` in batchLive() — cost audit | Benchmark: 0.22ms/call, 110ms for 500 rows. Well under 2-sec SSE tick budget. No change required. Documented inline. | (no fix needed) |
| Z-ADV-3 | LLM prompt in referrals.mjs had internal contradiction — claimed stale paths required time-gap acknowledgment, but stale paths were excluded from prompt | Rewrote constraints to match actual prompt shape | `3f5fe31` |

## Anti-PII pass

- **No emails, phones, or full-contact records** in any of the 4 surfaces my code added to (Phase B preview API, Phase B preview UI, mid-batch sidebar badge, drawer network card). Verified via grep + DOM inspection.
- The renderNetworkCard render path emits only `name + role + company + relationship-type` (same as pre-fix).
- The Phase B preview row carries only counts + slug + company-display-name.
- Contact details continue to live behind the existing network-leverage drillIn, which is Cloudflare-Access-gated.

## Anti-hallucination pass

- All warm-path data flows verbatim from `data/network-database.json` (the ζ.1 source built by overnight ZETA work) or `data/linkedin/2nd-degree/<slug>.json` (the existing scrape). No LLM-fabricated names.
- `connected_on` age is computed at runtime from the DB field, not invented.
- `_stale_warmth` flag is deterministic: `connected_on < (now − 18 × 30 × 86_400_000)`. Easy to audit.
- Tooltips disclose the source file by name so the user can audit the data flow.

## Coordination

Signed kickoff in `data/overnight-coordination-2026-05-19.md` (ζ section). Heads-up flags sent to ALPHA / BRAVO / GAMMA. No file collisions detected. Two small ranges in `scripts/build-dashboard.mjs` touched (`:3079` drawer, `:19710` Phase B table, `:18834` sidebar) — disjoint from γ's ranges (`:19778-19790` runway tooltip, `:2687-2745` alignment bars) and from β's ranges. Merge succeeded with ort strategy auto-merge on the second pass.

## Final verdict

**SHIPPED.** 4 AAA fixes + adversarial self-review fixes, live-verified on https://dashboard.careers-ops.com/. The Phase B per-company preview now has honest network signal. The drawer surfaces real warm contacts (was silently empty). The referrals agent has 5-10x richer input data with honest staleness gating. The mid-batch sidebar shows decision-actionable badges DURING the batch run. Three NEEDS_HUMAN flags surfaced for Mitchell's judgment.

— ζ Run-Batch, 2026-05-19
