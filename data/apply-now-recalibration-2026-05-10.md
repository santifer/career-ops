# Apply-Now Recalibration — 2026-05-10

## Why this exists

The overnight pipeline processor finished its 2026-05-09 run. Apply-Now was previously sorted by raw eval score (4.0–5.0). That sort treats a 13-day-old 4.65 the same as a 1-day-old 4.65 — the older posting may already be past final-rounds while the fresher one is open. It also treats public-company RSU upside the same as pre-IPO Series F equity, which inverts Mitchell's stated #1 filter (per memory: pre-IPO + RSU value-at-vest is the primary signal, not raw fit).

This recalibration replaces the flat sort with a four-factor composite (0-100). The factors and weights were specified in the recalibration brief; this doc records every per-row computation so the next session can audit, override, or update.

## Methodology

| Factor | Weight | Source |
|---|---|---|
| **Base Fit** | 40 pts | `(eval_score - 4.0) / 1.0 * 40` (4.0 = 0, 5.0 = 40) |
| **Equity / IPO Upside** | 25 pts | `data/overpay-signals/CURRENT.md` (not yet seeded → fallback per-company knowledge May 2026) |
| **Freshness** | 20 pts | Days since eval date (≤7d=20, 8-14=15, 15-21=10, 22-30=5, 31+=0) |
| **Tier Match** | 15 pts | A2=15, B=12, A1=10, other=5 (per `modes/_profile.md` §1) |

Late-stage warning: if eval > 45 days, posting is likely past final-rounds → flag added.

## Equity stage map (best-knowledge May 2026, fallback while `data/overpay-signals/CURRENT.md` is unseeded)

| Company | Stage | Pts | Reasoning |
|---|---|---|---|
| Anthropic | Pre-IPO Late | 25 | Series F+, ~$61.5B post-money |
| OpenAI | Pre-IPO Late | 25 | PPU structure, $500B-class secondary marks |
| Perplexity | Pre-IPO Late | 25 | Series F at ~$14B |
| ElevenLabs | Pre-IPO Late | 25 | Series D ($500M Feb 2026), $3.3B+ |
| Cursor (Anysphere) | Pre-IPO Late | 25 | Series C, ~$9.9B |
| Mistral AI | Pre-IPO Late | 25 | $14B valuation per JD-disclosed comp |
| Sierra | Pre-IPO Late | 25 | Series C, $10B class |
| Cohere | Pre-IPO Late | 25 | Series D+ at ~$5.5B |
| Synthesia | Pre-IPO Late | 25 | Series D, $2.1B |
| Cognition | Pre-IPO Late | 25 | Series B+ at ~$9.8B |
| Pinecone | Pre-IPO B | 18 | Series B, $750M; Calcalist sale-rumor watchpoint Apr 2026 (per #1559 notes) |

**ACTION ITEM:** Seed `data/overpay-signals/CURRENT.md` with the canonical per-company equity posture so this recalibration can pull from a structured source instead of inline knowledge.

## Per-row composite computation

| Rank | # | Company | Role | Eval | Days | Base | Equity | Fresh | Tier | **Composite** |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1509 | OpenAI | AI Deployment Engineer — Media Partnerships | 4.7 | 3 | 28 | 25 | 20 | 15 (A2) | **88** |
| 2 | 1511 | OpenAI | Onboarding & Enablement Program Manager FDE | 4.65 | 1 | 26 | 25 | 20 | 15 (A2) | **86** |
| 3 | 2050 | Anthropic | Strategic Operations Manager, Claude Marketplace | 4.5 | 1 | 20 | 25 | 20 | 15 (A2) | **80** |
| 4 | 59 | Sierra | Developer Relations Engineer (SF) | 4.55 | 2 | 22 | 25 | 20 | 12 (B) | **79** |
| 5 | 48 | Anthropic | Engineering Editorial Lead | 4.65 | 13 | 26 | 25 | 15 | 12 (B) | **78** |
| 6 | 1520 | Anthropic | Technical Deployment Lead | 4.4 | 3 | 16 | 25 | 20 | 15 (A2) | **76** |
| 7 | 44 | Anthropic | Communications Lead, Claude Code | 4.6 | 13 | 24 | 25 | 15 | 12 (B) | **76** |
| 8 | 840 | Cursor (Anysphere) | Forward Deployed Engineer | 4.5 | 12 | 20 | 25 | 15 | 15 (A2) | **75** |
| 9 | 842 | ElevenLabs | Forward Deployed Engineer - Software Engineer | 4.5 | 12 | 20 | 25 | 15 | 15 (A2) | **75** |
| 10 | 847 | OpenAI | Forward Deployed Engineer (FDE) - Seattle | 4.5 | 9 | 20 | 25 | 15 | 15 (A2) | **75** |
| 11 | 851 | Mistral AI | Senior/Staff AI Developer Advocate | 4.45 | 2 | 18 | 25 | 20 | 12 (B) | **75** |
| 12 | 49 | Perplexity | Executive Communications Manager (Sr Manager, Exec... | 4.55 | 13 | 22 | 25 | 15 | 12 (B) | **74** |
| 13 | 50 | ElevenLabs | Communications Manager | 4.55 | 13 | 22 | 25 | 15 | 12 (B) | **74** |
| 14 | 1 | Anthropic | Communications Manager, Research | 4.55 | 14 | 22 | 25 | 15 | 12 (B) | **74** |
| 15 | 60 | Sierra | Strategic Writer, Communications and Marketing | 4.5 | 13 | 20 | 25 | 15 | 12 (B) | **72** |
| 16 | 863 | Cohere | Applied AI Engineer – Agentic Workflows | 4.4 | 12 | 16 | 25 | 15 | 15 (A2) | **71** |
| 17 | 841 | Synthesia | Solutions Architect | 4.35 | 12 | 14 | 25 | 15 | 15 (A2) | **69** |
| 18 | 858 | Anthropic | Manager, Forward Deployed Engineering | 4.3 | 12 | 12 | 25 | 15 | 15 (A2) | **67** |
| 19 | 853 | Mistral AI | Developer Education Lead | 4.35 | 12 | 14 | 25 | 15 | 12 (B) | **66** |
| 20 | 1506 | Perplexity | Member of Technical Staff (Forward Deployed Engine... | 4.1 | 3 | 4 | 25 | 20 | 15 (A2) | **64** |
| 21 | 1514 | Cognition | AI Enablement Engineer | 4 | 3 | 0 | 25 | 20 | 15 (A2) | **60** |
| 22 | 51 | OpenAI | Research Communications Manager | 4.1 | 13 | 4 | 25 | 15 | 12 (B) | **56** |
| 23 | 854 | Pinecone | Staff Developer Advocate | 4.2 | 12 | 8 | 18 | 15 | 12 (B) | **53** |
| 24 | 53 | OpenAI | Policy Communications Manager | 4 | 13 | 0 | 25 | 15 | 12 (B) | **52** |

## Flagged items

### Posting-staleness flags (notes-derived)

- **#48 Anthropic — Engineering Editorial Lead**: notes reference posting closure or expiration. Verify URL still live before tailoring.
- **#1520 Anthropic — Technical Deployment Lead**: notes reference posting closure or expiration. Verify URL still live before tailoring.
- **#44 Anthropic — Communications Lead, Claude Code**: notes reference posting closure or expiration. Verify URL still live before tailoring.
- **#50 ElevenLabs — Communications Manager**: notes reference posting closure or expiration. Verify URL still live before tailoring.
- **#863 Cohere — Applied AI Engineer – Agentic Workflows**: notes reference posting closure or expiration. Verify URL still live before tailoring.

### Likely-too-late (>45 days)

- None. All eligible roles are within 14 days; oldest eval is 14d old.


### Throttle conflicts

- **Anthropic** (1 active app, company-wide per `modes/_profile.md` §0a): 6 rows in queue (#48 4.65, #44 4.60, #1 4.55, #2050 4.50, #1520 4.40, #858 4.30). Apply ONE: pick #48 (highest base) OR #2050 (freshest + $300-355K disclosed). Defer the other 4.
- **OpenAI** (1-2 active): 5 rows (#1509 88, #1511 86, #847 75, #51 56, #53 52). Apply top two (#1509 + #1511) simultaneously. Defer the rest.
- **Sierra** (3 active DRE-family already per existing playbook): apply #60 Strategic Writer first. Defer #59 DRE-SF.
- **ElevenLabs** (no formal cap, but per existing playbook: Comms first, then ONE FDE max): apply #50 first; if approved, queue #842.

## Methodology notes & caveats

1. **Equity stage map is best-knowledge inline, not data-sourced.** Seed `data/overpay-signals/CURRENT.md` to make this auditable.
2. **Tier classification** uses regex matching against `modes/_profile.md` §1 keywords. "Strategic Operations Manager, Claude Marketplace" classified as A2 (PgM-shape) per row notes.
3. **Freshness reference date** is 2026-05-10. If this script is re-run on a different date, all freshness scores shift — regenerate.
4. **Base fit normalization** caps at 4.0 floor. Roles below 4.0 are excluded from this list entirely (per data contract).
5. **No CURRENT.md found.** Defaults applied: Pre-IPO Late = 25 for the 9 frontier-AI labs in the queue, Pre-IPO B = 18 for Pinecone. No row received the 12pt "Unknown" default.
6. **Time bias.** This pass slightly over-weights freshly-evaluated roles (1-3 days old) over higher-base older roles. Compare ranks 1-3 (composite 80+, all <3d old) vs rank 5 (#48 Anthropic Engineering Editorial Lead, base 26, but 13d old). The freshness penalty is intentional: a 13d-stale top-base role may already be in final rounds.
7. **Score gaps.** Top 3 (88, 86, 80) are well-separated; rows 6-15 cluster between 71-78. Throttle decisions matter more than raw composite within that cluster.

## Next session pickup

- Top apply-now picks for tonight: **#1509 OpenAI AI Deployment Engineer (88)**, **#1511 OpenAI Onboarding & Enablement PgM FDE (86)**, **#2050 Anthropic Strategic Ops Mgr Marketplace (80)**.
- If Anthropic dominates strategic priority, swap #2050 → #48 Engineering Editorial Lead (composite 78, but Tier B exact-match).
- Defer all other Anthropic and OpenAI rows pending throttle resolution.
- Sierra: apply #60 Strategic Writer; defer #59 DRE-SF.
- Build the 3 apply-packs (#1509, #1511, #2050 OR #48) before tonight's session.
