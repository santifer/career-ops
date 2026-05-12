# Apply-Now Master Index — 2026-05-12 (cross-model audit sequence)

**This is the doc you open first when sitting down to build application materials.**

Multi-factor composite Priority Score (0-100) replaces flat eval-score sort. Composite = Base Fit (40) + Equity/IPO Upside (25) + Freshness (20) + Tier Match (15). See `data/apply-now-recalibration-2026-05-10.md` for methodology.

**Source of truth:** `data/applications.md` (canonical tracker)
**Last refreshed:** 2026-05-12 (cross-model audit recalibration — new SEQ column + 4 research stubs added)
**Total apply-now rows (Evaluated/Responded ≥ 4.0):** 24 + 4 research stubs
**Reference date for freshness:** 2026-05-10
**Equity stage source:** company-stage best-knowledge (May 2026)
**Delta log:** `data/apply-now-recalibration-2026-05-10-morning.md`
**Audit source:** `data/CROSS-MODEL-CAREER-INTELLIGENCE-REPORT.md`

> **NEW: SEQ column** = optimal APPLICATION SEQUENCE for negotiation leverage (per cross-model audit §7). This is NOT the same as composite score order — fast-offer companies come first to build BATNA before frontier labs. Rows without a SEQ number apply at any time per composite score.

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

| SEQ | # | Company | Role | Composite | Base | Equity | Fresh | Tier | Action | Leverage Rationale |
|-----|---|---------|------|-----------|------|--------|-------|------|--------|--------------------|
| **1** | — | **Portkey** | Founding Solutions Architect | Research | — | — | — | A2a | NEW STUB — fastest offer timeline (7-10d). Apply immediately as BATNA vehicle. See corpus/companies/portkey.md | First offer in hand changes every frontier-lab conversation. Portkey = fastest close. |
| **2** | #840 | **Cursor (Anysphere)** | Forward Deployed Engineer | **75** | 20 | 25 | 15 (12d) | A2a | SEQ 2 — A2 exact-match; Series C speed (2-3 wks). Verify Ashby URL live. career-ops fork is a native demo inside their product. | Creates higher cash anchor before frontier labs; strong equity upside. |
| **3** | #60 | **Sierra** | Strategic Writer, Communications and Marketing | **72** | 20 | 25 | 15 (13d) | B | SEQ 3 — SIERRA-COMPATIBLE (distinct from throttled DRE family). Highest probability in corpus (60%). Apply before DRE roles re-open. | 60% offer probability; fast YC-style loop; second competing written-comms offer. |
| **4** | — | **Weights & Biases** | Staff Solutions Engineer, LLMs | Research | — | — | — | A2a | NEW STUB — bigger brand signal before frontier labs. 3-4 week timeline. See corpus/companies/wandb.md | Stronger name for signaling to Anthropic/OpenAI. Enterprise ML teams angle. |
| **5** | #50 | **ElevenLabs** | Communications Manager | **74** | 22 | 25 | 15 (13d) | B | SEQ 5 — primary Tier B ElevenLabs surface (70% probability per audit). Apply in parallel with Seq 3. Verify URL live. ⚠️ posting-staleness | Highest overall probability target. Must be framed as comms/product role not FDE. |
| **6** | #851 | **Mistral AI** | Senior/Staff AI Developer Advocate | **75** | 18 | 25 | 20 (2d) | B | SEQ 6 — FRESH 2-day-old. No formal throttle. Apply early in week. | Builds competing offer for Anthropic; Europe clock advantage; rarely drags past 4 weeks. |
| **7** | #48 | **Anthropic** | Engineering Editorial Lead | **78** | 26 | 25 | 15 (13d) | B | SEQ 7 — ANTHROPIC LEAD CANDIDATE. Walk in with 2-3 written offers. Per §0a 1-active-app rule: pick THIS or #2050. ⚠️ posting-staleness | Walk in with competing offers; 15% prob improves materially with offers + Newsroom-Bench artifact. |
| **7** | #2050 | **Anthropic** | Strategic Operations Manager, Claude Marketplace | **80** | 20 | 25 | 20 (1d) | A2 | SEQ 7 ALT — FRESH ($300-355K disclosed). Per §0a 1-active-app rule: pick THIS or #48; defer the rest. | Same leverage window as Engineering Editorial Lead. Pick one. |
| **8** | #1509 | **OpenAI** | AI Deployment Engineer — Media Partnerships | **88** | 28 | 25 | 20 (3d) | A2 | SEQ 8 — highest composite. OpenAI explicitly asks about competing offers — timing is a tool. Apply after Seq 7 is in process. OpenAI 1-2 active limit applies. | OpenAI insists on current offers disclosure — perfect timing if Anthropic is in process. |
| **8** | #1511 | **OpenAI** | Onboarding & Enablement Program Manager FDE | **86** | 26 | 25 | 20 (1d) | A2 | SEQ 8 PAIRED — apply simultaneously with #1509 under OpenAI 1-2 active limit. | Same leverage window as #1509. |
| **9** | — | **Scale AI** | Strategic AI Programs Lead | Research | — | — | — | A2 | NEW STUB — government/DoD loops slower; start mid-Anthropic process. See corpus/companies/scaleai.md | High-comp ceiling if it lands; backup for negotiation stack. |
| **10** | — | **Runway** | Head of AI Enablement (Broadcast/Studios) | Research | — | — | — | B | NEW STUB — 50M-view credentials = instant credibility; media DNA synergy. See corpus/companies/runway.md | Backup if OpenAI comp tops out; media-broadcast domain exact match. |
| — | #59 | Sierra | Developer Relations Engineer (SF) | **79** | 22 | 25 | 20 (2d) | B | SIERRA THROTTLED — 3 active DRE-family touches. Apply ONLY if London resolves first. | — |
| — | #1520 | Anthropic | Technical Deployment Lead | **76** | 16 | 25 | 20 (3d) | A2 | DEFER — link expired 2026-05-08 (Greenhouse 404). Re-eval only if active equivalent confirmed. | — |
| — | #44 | Anthropic | Communications Lead, Claude Code | **76** | 24 | 25 | 15 (13d) | B | DEFER under Anthropic 1-active-app rule. Apply only if #48 is closed/rejected first. | — |
| — | #842 | ElevenLabs | Forward Deployed Engineer - Software Engineer | **75** | 20 | 25 | 15 (12d) | A2 | DEFER — apply ONLY after Comms Mgr #50. One FDE variant max. | — |
| — | #847 | OpenAI | Forward Deployed Engineer (FDE) - Seattle | **75** | 20 | 25 | 15 (9d) | A2 | DEFER — OpenAI throttle bound by #1509 + #1511. Re-queue if either resolves. | — |
| — | #49 | Perplexity | Executive Communications Manager | **74** | 22 | 25 | 15 (13d) | B | Exec Comms Manager — Tier B exact-match, 13-day staleness. Verify URL before tailoring. | — |
| — | #1 | Anthropic | Communications Manager, Research | **74** | 22 | 25 | 15 (14d) | B | DEFER under Anthropic 1-active-app rule. Re-queue after #48/#2050 resolve. | — |
| — | #863 | Cohere | Applied AI Engineer – Agentic Workflows | **71** | 16 | 25 | 15 (12d) | A2 | Cohere Applied AI Eng — only Cohere surface clearing 4.0 floor. Verify Ashby URL live. | — |
| — | #841 | Synthesia | Solutions Architect | **69** | 14 | 25 | 15 (12d) | A2 | Synthesia SA — verify Greenhouse URL live (12d stale). | — |
| — | #858 | Anthropic | Manager, Forward Deployed Engineering | **67** | 12 | 25 | 15 (12d) | A2 | DEFER under Anthropic 1-active-app rule. Skip in favor of #48/#2050. | — |
| — | #853 | Mistral AI | Developer Education Lead | **66** | 14 | 25 | 15 (12d) | B | Developer Education Lead — apply alongside or after #851. Verify Lever before tailoring. | — |
| — | #1506 | Perplexity | Member of Technical Staff (FDE, Applied AI) | **64** | 4 | 25 | 20 (3d) | A2 | MoTS FDE Applied AI — apply after Anthropic queue resolves. Python soft-gap is screening risk. | — |
| — | #1514 | Cognition | AI Enablement Engineer | **60** | 0 | 25 | 20 (3d) | A2 | At 4.0 apply floor. Apply only if Cognition is high personal interest. | — |
| — | #51 | OpenAI | Research Communications Manager | **56** | 4 | 25 | 15 (13d) | B | DEFER under OpenAI 1-2 active limit. Re-queue after #1509/#1511 resolve. | — |
| — | #854 | Pinecone | Staff Developer Advocate | **53** | 8 | 18 | 15 (12d) | B | Series B (lower equity score 18). Watch Calcalist sale-rumor before tailoring. | — |
| — | #53 | OpenAI | Policy Communications Manager | **52** | 0 | 25 | 15 (13d) | B | DEFER under OpenAI 1-2 active limit. Lowest composite of OpenAI surfaces. | — |

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

