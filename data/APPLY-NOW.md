# Apply-Now Master Index — 2026-05-10 (recalibrated)

**This is the doc you open first when sitting down to build application materials.**

Multi-factor composite Priority Score (0-100) replaces flat eval-score sort. Composite = Base Fit (40) + Equity/IPO Upside (25) + Freshness (20) + Tier Match (15). See `data/apply-now-recalibration-2026-05-10.md` for methodology.

**Source of truth:** `data/applications.md` (canonical tracker)
**Last refreshed:** 2026-05-10 (recalibration: composite scoring, equity/IPO upside, freshness penalty)
**Total apply-now rows (Evaluated/Responded ≥ 4.0):** 24
**Reference date for freshness:** 2026-05-10
**Equity stage source:** company-stage best-knowledge (May 2026); `data/overpay-signals/CURRENT.md` not yet seeded — fall back to canonical pre-IPO posture per company.

---

## How to use this index tonight

1. Read top to bottom — composite score is the apply-priority signal, not the raw eval score.
2. Click into the **Report** link — read Block A through G (≤ 5 min).
3. Open `data/HOW-TO-APPLY.md` for the per-app build workflow (~60-70 min/app).
4. Run `data/pre-flight-checklist.md` before submitting.
5. Mark row Applied via `✅ Mark Applied` button in heartbeat email OR `node scripts/mark-applied.mjs --row={N}`.

---

## Composite Priority Ranking — Top 24

Sort by composite descending. Throttle and freshness flags surfaced inline.

| # | Company | Role | Composite | Base | Equity | Fresh | Tier | Action |
|---|---------|------|-----------|------|--------|-------|------|--------|
| 1 | OpenAI | AI Deployment Engineer — Media Partnerships (#1509, 4.7/5) | **88** | 28 | 25 | 20 (3d) | 15 (A2) | TOP OF QUEUE — highest composite. A2 FDE × Media Partnerships exact-archetype match. Apply first under OpenAI's 1-2 active limit. |
| 2 | OpenAI | Onboarding & Enablement Program Manager FDE (#1511, 4.65/5) | **86** | 26 | 25 | 20 (1d) | 15 (A2) | PAIRED with #1509 (OpenAI 1-2 active limit). FDE Onboarding & Enablement — A2 PgM exact-archetype match, fresh (1d), 4.65 base. Apply second. |
| 3 | Anthropic | Strategic Operations Manager, Claude Marketplace (#2050, 4.5/5) | **80** | 20 | 25 | 20 (1d) | 15 (A2) | FRESH high-confidence A2-PgM Anthropic role (1 day old, $300-355K disclosed). Per §0a 1-active-app rule: this OR #48 — apply one, defer the rest. |
| 4 | Sierra | Developer Relations Engineer (SF) (#59, 4.55/5) | **79** | 22 | 25 | 20 (2d) | 12 (B) | SIERRA THROTTLED — already 3 active DRE-family touches (London/SF/NYC sibling). Apply ONLY if London resolves first; otherwise lead with #60 (distinct function = Strategic Writer). |
| 5 | Anthropic | Engineering Editorial Lead (#48, 4.65/5) | **78** | 26 | 25 | 15 (13d) | 12 (B) | ANTHROPIC LEAD CANDIDATE — highest Anthropic-shape composite (Tier B Engineering Editorial Lead, exact archetype match). Per §0a 1-active-app rule: pick THIS or #2050; defer the rest. |
| 6 | Anthropic | Technical Deployment Lead (#1520, 4.4/5) | **76** | 16 | 25 | 20 (3d) | 15 (A2) | DEFER — link expired 2026-05-08 (Greenhouse 404). Anthropic throttle: prefer fresher #2050 or higher-score #48. Re-eval only if active equivalent confirmed. |
| 7 | Anthropic | Communications Lead, Claude Code (#44, 4.6/5) | **76** | 24 | 25 | 15 (13d) | 12 (B) | DEFER under Anthropic 1-active-app rule. Apply only if #48 (higher composite) is closed/rejected first. |
| 8 | Cursor (Anysphere) | Forward Deployed Engineer (#840, 4.5/5) | **75** | 20 | 25 | 15 (12d) | 15 (A2) | Cursor FDE — A2 exact-match; Series C late-stage. 12-day staleness — verify Ashby URL live. |
| 9 | ElevenLabs | Forward Deployed Engineer - Software Engineer (#842, 4.5/5) | **75** | 20 | 25 | 15 (12d) | 15 (A2) | FDE-SE — apply ONLY after Comms Mgr #50 (sequencing rule per existing APPLY-NOW). One FDE variant max. |
| 10 | OpenAI | Forward Deployed Engineer (FDE) - Seattle (#847, 4.5/5) | **75** | 20 | 25 | 15 (9d) | 15 (A2) | DEFER — OpenAI throttle bound by #1509 + #1511. Re-queue if either resolves and FDE Seattle still open. |
| 11 | Mistral AI | Senior/Staff AI Developer Advocate (#851, 4.45/5) | **75** | 18 | 25 | 20 (2d) | 12 (B) | FRESH 2-day-old Sr/Staff Dev Advocate — Tier B AI-native. No formal Mistral throttle. Apply early in week. |
| 12 | Perplexity | Executive Communications Manager (Sr Manager, Exec Comms) (#49, 4.55/5) | **74** | 22 | 25 | 15 (13d) | 12 (B) | Exec Comms Manager — Tier B exact-match, 13-day staleness. Verify URL still live before tailoring. |
| 13 | ElevenLabs | Communications Manager (#50, 4.55/5) | **74** | 22 | 25 | 15 (13d) | 12 (B) | Comms Manager — primary Tier B ElevenLabs surface. Apply first per existing playbook (cleaner CV math than FDE). |
| 14 | Anthropic | Communications Manager, Research (#1, 4.55/5) | **74** | 22 | 25 | 15 (14d) | 12 (B) | DEFER under Anthropic 1-active-app rule. Strong corpus-leading shape but lower freshness than #2050. Re-queue after #48/#2050 resolve. |
| 15 | Sierra | Strategic Writer, Communications and Marketing (#60, 4.5/5) | **72** | 20 | 25 | 15 (13d) | 12 (B) | SIERRA-COMPATIBLE — Strategic Writer is distinct function from DRE family, not subject to throttle. Apply this BEFORE the DRE roles re-open. |
| 16 | Cohere | Applied AI Engineer – Agentic Workflows (#863, 4.4/5) | **71** | 16 | 25 | 15 (12d) | 15 (A2) | Cohere Applied AI Eng (Agentic Workflows) — only Cohere surface clearing 4.0 floor. Verify Ashby URL live. |
| 17 | Synthesia | Solutions Architect (#841, 4.35/5) | **69** | 14 | 25 | 15 (12d) | 15 (A2) | Synthesia SA — Tier A2; verify Greenhouse URL live (12d stale). |
| 18 | Anthropic | Manager, Forward Deployed Engineering (#858, 4.3/5) | **67** | 12 | 25 | 15 (12d) | 15 (A2) | DEFER under Anthropic 1-active-app rule. Manager-track FDE — lower base + secondary archetype. Skip in favor of #48/#2050. |
| 19 | Mistral AI | Developer Education Lead (#853, 4.35/5) | **66** | 14 | 25 | 15 (12d) | 12 (B) | Developer Education Lead — Tier B exact-match. Apply alongside or after #851; verify both still open via Lever before tailoring. |
| 20 | Perplexity | Member of Technical Staff (Forward Deployed Engineer, Applied AI) (#1506, 4.1/5) | **64** | 4 | 25 | 20 (3d) | 15 (A2) | MoTS FDE Applied AI — apply after Anthropic queue resolves (per row notes). Python soft-gap is screening risk. |
| 21 | Cognition | AI Enablement Engineer (#1514, 4/5) | **60** | 0 | 25 | 20 (3d) | 15 (A2) | Cognition AI Enablement Eng — at 4.0 apply floor (base = 0). Apply only if Cognition is high personal interest. |
| 22 | OpenAI | Research Communications Manager (#51, 4.1/5) | **56** | 4 | 25 | 15 (13d) | 12 (B) | DEFER under OpenAI 1-2 active limit. Comms surface lower than FDE pair; re-queue only after #1509/#1511 resolve. |
| 23 | Pinecone | Staff Developer Advocate (#854, 4.2/5) | **53** | 8 | 18 | 15 (12d) | 12 (B) | Pinecone Dev Advocate — Series B (only non-Late-stage in queue, equity score 18). Watch Calcalist sale-rumor; consider deferring until equity event clarifies. |
| 24 | OpenAI | Policy Communications Manager (#53, 4/5) | **52** | 0 | 25 | 15 (13d) | 12 (B) | DEFER under OpenAI 1-2 active limit. Lowest composite of OpenAI surfaces. Re-queue only after higher-scoring OpenAI roles resolve. |

---

## Per-row tactical reasoning

### 1. #1509 OpenAI — AI Deployment Engineer — Media Partnerships
- **Composite:** 88 (Base 28 + Equity 25 + Fresh 20 + Tier 15)
- **Eval:** 4.7/5 | 2026-05-07 (3d old) | A2 archetype | Pre-IPO Late (PPU structure, $500B class)
- **Report:** [581](reports/581-openai-ai-deployment-engineer-media-partnerships-2026-05-07.md)
- **Action:** TOP OF QUEUE — highest composite. A2 FDE × Media Partnerships exact-archetype match. Apply first under OpenAI's 1-2 active limit.
- **Flags:** OPENAI 1-2 active limit

### 2. #1511 OpenAI — Onboarding & Enablement Program Manager FDE
- **Composite:** 86 (Base 26 + Equity 25 + Fresh 20 + Tier 15)
- **Eval:** 4.65/5 | 2026-05-09 (1d old) | A2 archetype | Pre-IPO Late (PPU structure, $500B class)
- **Report:** [1173](reports/1173-openai-onboarding-enablement-fde-2026-05-09.md)
- **Action:** PAIRED with #1509 (OpenAI 1-2 active limit). FDE Onboarding & Enablement — A2 PgM exact-archetype match, fresh (1d), 4.65 base. Apply second.
- **Flags:** OPENAI 1-2 active limit

### 3. #2050 Anthropic — Strategic Operations Manager, Claude Marketplace
- **Composite:** 80 (Base 20 + Equity 25 + Fresh 20 + Tier 15)
- **Eval:** 4.5/5 | 2026-05-09 (1d old) | A2 archetype | Pre-IPO Late ($61.5B Series F+)
- **Report:** [1172](reports/1172-anthropic-strategic-ops-marketplace-2026-05-09.md)
- **Action:** FRESH high-confidence A2-PgM Anthropic role (1 day old, $300-355K disclosed). Per §0a 1-active-app rule: this OR #48 — apply one, defer the rest.
- **Flags:** ANTHROPIC §0a 1-active-app cap

### 4. #59 Sierra — Developer Relations Engineer (SF)
- **Composite:** 79 (Base 22 + Equity 25 + Fresh 20 + Tier 12)
- **Eval:** 4.55/5 | 2026-05-08 (2d old) | B archetype | Pre-IPO Late (Series C, $10B class)
- **Report:** [1142](reports/1142-sierra-developer-relations-engineer-sf-2026-05-08.md)
- **Action:** SIERRA THROTTLED — already 3 active DRE-family touches (London/SF/NYC sibling). Apply ONLY if London resolves first; otherwise lead with #60 (distinct function = Strategic Writer).
- **Flags:** SIERRA 3 active DRE-family touches

### 5. #48 Anthropic — Engineering Editorial Lead
- **Composite:** 78 (Base 26 + Equity 25 + Fresh 15 + Tier 12)
- **Eval:** 4.65/5 | 2026-04-27 (13d old) | B archetype | Pre-IPO Late ($61.5B Series F+)
- **Report:** [047](reports/047-anthropic-engineering-editorial-lead-2026-04-27.md)
- **Action:** ANTHROPIC LEAD CANDIDATE — highest Anthropic-shape composite (Tier B Engineering Editorial Lead, exact archetype match). Per §0a 1-active-app rule: pick THIS or #2050; defer the rest.
- **Flags:** ⚠️ posting-staleness flagged in notes; ANTHROPIC §0a 1-active-app cap

### 6. #1520 Anthropic — Technical Deployment Lead
- **Composite:** 76 (Base 16 + Equity 25 + Fresh 20 + Tier 15)
- **Eval:** 4.4/5 | 2026-05-07 (3d old) | A2 archetype | Pre-IPO Late ($61.5B Series F+)
- **Report:** [612](reports/612-anthropic-technical-deployment-lead-2026-05-07.md)
- **Action:** DEFER — link expired 2026-05-08 (Greenhouse 404). Anthropic throttle: prefer fresher #2050 or higher-score #48. Re-eval only if active equivalent confirmed.
- **Flags:** ⚠️ posting-staleness flagged in notes; ANTHROPIC §0a 1-active-app cap

### 7. #44 Anthropic — Communications Lead, Claude Code
- **Composite:** 76 (Base 24 + Equity 25 + Fresh 15 + Tier 12)
- **Eval:** 4.6/5 | 2026-04-27 (13d old) | B archetype | Pre-IPO Late ($61.5B Series F+)
- **Report:** [044](reports/044-anthropic-comms-lead-claude-code-2026-04-27.md)
- **Action:** DEFER under Anthropic 1-active-app rule. Apply only if #48 (higher composite) is closed/rejected first.
- **Flags:** ⚠️ posting-staleness flagged in notes; ANTHROPIC §0a 1-active-app cap

### 8. #840 Cursor (Anysphere) — Forward Deployed Engineer
- **Composite:** 75 (Base 20 + Equity 25 + Fresh 15 + Tier 15)
- **Eval:** 4.5/5 | 2026-04-28 (12d old) | A2 archetype | Pre-IPO Late (Series C, ~$9.9B)
- **Report:** [091](reports/091-cursor-2026-04-28.md)
- **Action:** Cursor FDE — A2 exact-match; Series C late-stage. 12-day staleness — verify Ashby URL live.

### 9. #842 ElevenLabs — Forward Deployed Engineer - Software Engineer
- **Composite:** 75 (Base 20 + Equity 25 + Fresh 15 + Tier 15)
- **Eval:** 4.5/5 | 2026-04-28 (12d old) | A2 archetype | Pre-IPO Late (Series D, $3.3B+)
- **Report:** [093](reports/093-elevenlabs-forward-deployed-engineer-software-engineer-2026-04-28.md)
- **Action:** FDE-SE — apply ONLY after Comms Mgr #50 (sequencing rule per existing APPLY-NOW). One FDE variant max.

### 10. #847 OpenAI — Forward Deployed Engineer (FDE) - Seattle
- **Composite:** 75 (Base 20 + Equity 25 + Fresh 15 + Tier 15)
- **Eval:** 4.5/5 | 2026-05-01 (9d old) | A2 archetype | Pre-IPO Late (PPU structure, $500B class)
- **Report:** [248](reports/248-openai-fde-seattle-2026-05-01.md)
- **Action:** DEFER — OpenAI throttle bound by #1509 + #1511. Re-queue if either resolves and FDE Seattle still open.
- **Flags:** OPENAI 1-2 active limit

### 11. #851 Mistral AI — Senior/Staff AI Developer Advocate
- **Composite:** 75 (Base 18 + Equity 25 + Fresh 20 + Tier 12)
- **Eval:** 4.45/5 | 2026-05-08 (2d old) | B archetype | Pre-IPO Late ($14B)
- **Report:** [1140](reports/1140-mistral-2026-05-08.md)
- **Action:** FRESH 2-day-old Sr/Staff Dev Advocate — Tier B AI-native. No formal Mistral throttle. Apply early in week.

### 12. #49 Perplexity — Executive Communications Manager (Sr Manager, Exec Comms)
- **Composite:** 74 (Base 22 + Equity 25 + Fresh 15 + Tier 12)
- **Eval:** 4.55/5 | 2026-04-27 (13d old) | B archetype | Pre-IPO Late (Series F, ~$14B)
- **Report:** [048](reports/048-perplexity-exec-comms-manager-2026-04-27.md)
- **Action:** Exec Comms Manager — Tier B exact-match, 13-day staleness. Verify URL still live before tailoring.

### 13. #50 ElevenLabs — Communications Manager
- **Composite:** 74 (Base 22 + Equity 25 + Fresh 15 + Tier 12)
- **Eval:** 4.55/5 | 2026-04-27 (13d old) | B archetype | Pre-IPO Late (Series D, $3.3B+)
- **Report:** [049](reports/049-elevenlabs-communications-manager-2026-04-27.md)
- **Action:** Comms Manager — primary Tier B ElevenLabs surface. Apply first per existing playbook (cleaner CV math than FDE).
- **Flags:** ⚠️ posting-staleness flagged in notes

### 14. #1 Anthropic — Communications Manager, Research
- **Composite:** 74 (Base 22 + Equity 25 + Fresh 15 + Tier 12)
- **Eval:** 4.55/5 | 2026-04-26 (14d old) | B archetype | Pre-IPO Late ($61.5B Series F+)
- **Report:** [2](reports/002-anthropic-2026-04-26.md)
- **Action:** DEFER under Anthropic 1-active-app rule. Strong corpus-leading shape but lower freshness than #2050. Re-queue after #48/#2050 resolve.
- **Flags:** ANTHROPIC §0a 1-active-app cap

### 15. #60 Sierra — Strategic Writer, Communications and Marketing
- **Composite:** 72 (Base 20 + Equity 25 + Fresh 15 + Tier 12)
- **Eval:** 4.5/5 | 2026-04-27 (13d old) | B archetype | Pre-IPO Late (Series C, $10B class)
- **Report:** [060](reports/060-sierra-strategic-writer-comms-marketing-2026-04-27.md)
- **Action:** SIERRA-COMPATIBLE — Strategic Writer is distinct function from DRE family, not subject to throttle. Apply this BEFORE the DRE roles re-open.
- **Flags:** SIERRA 3 active DRE-family touches

### 16. #863 Cohere — Applied AI Engineer – Agentic Workflows
- **Composite:** 71 (Base 16 + Equity 25 + Fresh 15 + Tier 15)
- **Eval:** 4.4/5 | 2026-04-28 (12d old) | A2 archetype | Pre-IPO Late (Series D+, ~$5.5B)
- **Report:** [101](reports/101-cohere-applied-ai-engineer-agentic-workflows-2026-04-28.md)
- **Action:** Cohere Applied AI Eng (Agentic Workflows) — only Cohere surface clearing 4.0 floor. Verify Ashby URL live.
- **Flags:** ⚠️ posting-staleness flagged in notes

### 17. #841 Synthesia — Solutions Architect
- **Composite:** 69 (Base 14 + Equity 25 + Fresh 15 + Tier 15)
- **Eval:** 4.35/5 | 2026-04-28 (12d old) | A2 archetype | Pre-IPO Late (Series D, $2.1B)
- **Report:** [092](reports/092-synthesia-2026-04-28.md)
- **Action:** Synthesia SA — Tier A2; verify Greenhouse URL live (12d stale).

### 18. #858 Anthropic — Manager, Forward Deployed Engineering
- **Composite:** 67 (Base 12 + Equity 25 + Fresh 15 + Tier 15)
- **Eval:** 4.3/5 | 2026-04-28 (12d old) | A2 archetype | Pre-IPO Late ($61.5B Series F+)
- **Report:** [083](reports/083-anthropic-manager-fde-2026-04-28.md)
- **Action:** DEFER under Anthropic 1-active-app rule. Manager-track FDE — lower base + secondary archetype. Skip in favor of #48/#2050.
- **Flags:** ANTHROPIC §0a 1-active-app cap

### 19. #853 Mistral AI — Developer Education Lead
- **Composite:** 66 (Base 14 + Equity 25 + Fresh 15 + Tier 12)
- **Eval:** 4.35/5 | 2026-04-28 (12d old) | B archetype | Pre-IPO Late ($14B)
- **Report:** [063](reports/063-mistral-2026-04-28.md)
- **Action:** Developer Education Lead — Tier B exact-match. Apply alongside or after #851; verify both still open via Lever before tailoring.

### 20. #1506 Perplexity — Member of Technical Staff (Forward Deployed Engineer, Applied AI)
- **Composite:** 64 (Base 4 + Equity 25 + Fresh 20 + Tier 15)
- **Eval:** 4.1/5 | 2026-05-07 (3d old) | A2 archetype | Pre-IPO Late (Series F, ~$14B)
- **Report:** [570](reports/570-perplexity-mots-fde-applied-ai-2026-05-07.md)
- **Action:** MoTS FDE Applied AI — apply after Anthropic queue resolves (per row notes). Python soft-gap is screening risk.

### 21. #1514 Cognition — AI Enablement Engineer
- **Composite:** 60 (Base 0 + Equity 25 + Fresh 20 + Tier 15)
- **Eval:** 4/5 | 2026-05-07 (3d old) | A2 archetype | Pre-IPO Late (Series B+, $9.8B)
- **Report:** [592](reports/592-remaining-tier1-batch-2026-05-07.md)
- **Action:** Cognition AI Enablement Eng — at 4.0 apply floor (base = 0). Apply only if Cognition is high personal interest.

### 22. #51 OpenAI — Research Communications Manager
- **Composite:** 56 (Base 4 + Equity 25 + Fresh 15 + Tier 12)
- **Eval:** 4.1/5 | 2026-04-27 (13d old) | B archetype | Pre-IPO Late (PPU structure, $500B class)
- **Report:** [050](reports/050-openai-research-communications-manager-2026-04-27.md)
- **Action:** DEFER under OpenAI 1-2 active limit. Comms surface lower than FDE pair; re-queue only after #1509/#1511 resolve.
- **Flags:** OPENAI 1-2 active limit

### 23. #854 Pinecone — Staff Developer Advocate
- **Composite:** 53 (Base 8 + Equity 18 + Fresh 15 + Tier 12)
- **Eval:** 4.2/5 | 2026-04-28 (12d old) | B archetype | Pre-IPO B (Series B, $750M; sale-rumor watchpoint)
- **Report:** [064](reports/064-pinecone-2026-04-28.md)
- **Action:** Pinecone Dev Advocate — Series B (only non-Late-stage in queue, equity score 18). Watch Calcalist sale-rumor; consider deferring until equity event clarifies.
- **Flags:** Equity tier: Pre-IPO B (lower discount)

### 24. #53 OpenAI — Policy Communications Manager
- **Composite:** 52 (Base 0 + Equity 25 + Fresh 15 + Tier 12)
- **Eval:** 4/5 | 2026-04-27 (13d old) | B archetype | Pre-IPO Late (PPU structure, $500B class)
- **Report:** [052](reports/052-openai-policy-communications-manager-2026-04-27.md)
- **Action:** DEFER under OpenAI 1-2 active limit. Lowest composite of OpenAI surfaces. Re-queue only after higher-scoring OpenAI roles resolve.
- **Flags:** OPENAI 1-2 active limit

---

## Composite-Score Tiers (visual)

- **80+ (Top of queue):** apply this week, top of ranked list.
- **70-79 (Strong):** apply within ~2 weeks, may be throttle-deferred.
- **60-69 (Moderate):** apply only if higher-composite roles resolve or close.
- **<60 (Borderline):** sub-floor base; manual review only.

## Throttle decision summary

- **Anthropic** (1 active app, company-wide): top 6 in queue. Apply ONE: pick #48 (highest base) OR #2050 (freshest, $300-355K disclosed). Defer the other 4.
- **OpenAI** (1-2 active): top two are #1509 (88) + #1511 (86) — apply BOTH simultaneously. Defer #847, #51, #53.
- **Sierra** (3 active DRE-family already, per existing playbook): apply #60 Strategic Writer (distinct function). Defer #59 DRE-SF until London resolves.
- **Mistral / ElevenLabs / Perplexity / Cursor / Cohere / Synthesia / Pinecone / Cognition**: no formal throttle — apply selectively but check posting freshness before tailoring (most have 12-13d staleness).

