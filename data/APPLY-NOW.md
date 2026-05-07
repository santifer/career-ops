# Apply-Now Master Index — 2026-05-07

**This is the doc you open first when sitting down to build application materials.**

Live snapshot of the apply-now queue: every evaluation with score ≥ 4.0/5 and status `Evaluated` or `Responded`. Each row links to the full report, the apply-pack folder (✅ already built / 🔧 needs build), and the per-company guide in `data/tailored-resume-bullets.md`.

**Source of truth:** `data/applications.md` (canonical tracker)
**Last refreshed:** 2026-05-07 (manual; refresh by re-running the build script in `scripts/build-apply-now-index.mjs`)
**Total apply-now rows:** 18 (down from 39 evaluated; 21 are sub-4.0 borderline)

---

## How to use this index tonight

1. Pick the row at the top of the table you want to act on (highest-score-first is the default).
2. Click into the **Report** link — read Block A through G (≤ 5 min).
3. If apply-pack column says ✅ — open that folder, the pre-built materials are there.
4. If column says 🔧 NEEDS-BUILD — run `node scripts/build-apply-pack.mjs --row={N}` to generate the apply-pack scaffold.
5. Open `data/tailored-resume-bullets.md` § per-company guide → use the recommended group + cross-archetype mix-in for the tailored CV.
6. Open `data/outreach-templates.md` → pick the LinkedIn DM variant for the company tier.
7. Open `templates/cover-letter-template.md` → fill in proof points from `article-digest.md`.
8. Run pre-flight checklist at `data/pre-flight-checklist.md` before submitting.
9. Mark row Applied via `✅ Mark Applied` button in heartbeat email OR `node scripts/mark-applied.mjs --row={N}`.

---

## Tier 1 — Anthropic (1 active app limit per `modes/_profile.md` §0a)

These four are the Anthropic-shape roles in the queue. **Pick ONE this week.** Default: highest score.

| Score | Row | Role | Comp anchor | Apply-pack | Report | Lead-with bullets |
|---|---|---|---|---|---|---|
| 4.65 | #48 | Engineering Editorial Lead | Not disclosed; pre-IPO equity | ✅ [048](apply-pack/048-anthropic-engineering-editorial-lead/) | [047](reports/047-anthropic-engineering-editorial-lead-2026-04-27.md) | Group 4 (AT.1, AT.2, AT.5) + Group 2 (B.6, B.10) |
| 4.60 | #44 | Communications Lead, Claude Code | Not disclosed | ✅ [044](apply-pack/044-anthropic-communications-lead-claude-code/) | [044](reports/044-anthropic-comms-lead-claude-code-2026-04-27.md) | Group 4 (AT.4, AT.6) + Group 1 (A2.5) |
| 4.55 | #1 | Communications Manager, Research | Not disclosed; corpus floor $230-300K | 🔧 NEEDS-BUILD | [002](reports/002-anthropic-2026-04-26.md) | Group 4 (AT.1, AT.2, AT.5) + Group 2 (B.6, B.4) |
| 4.50 | #839 | Technical Enablement Lead, Claude Code | $270-310K base disclosed | 🔧 NEEDS-BUILD | [126](reports/126-anthropic-technical-enablement-lead-claude-code-2026-04-29.md) | Group 1 (A2.3, A2.7) + Group 2 (B.3) + H.6 |

**Anthropic decision tree (per `modes/_profile.md` §0a):**
- ✅ HIGH-CONFIDENCE LEAD: #48 Engineering Editorial Lead at 4.65 — Tier B exact match, apply-pack already built, fastest to ship.
- ALSO CONSIDER: $400K Head of Product Communications (Fortune Apr 27 cite). Verify URL still live; if so, this is the high-ceiling play. Not yet in tracker.
- ALSO CONSIDER: #1 Communications Manager, Research at 4.55 — strongest CV-shape match per article-digest.md #17 hybrid proof point. Apply-pack needs build.
- DEFER all OTHER Anthropic rows once one is Applied (1 active app rule binds).

---

## Tier 2 — Other top-tier (≥ 4.5) AI-native

| Score | Row | Company | Role | Comp anchor | Apply-pack | Report | Lead-with bullets |
|---|---|---|---|---|---|---|---|
| 4.55 | #49 | Perplexity | Executive Communications Manager (Sr Manager) | Not disclosed | ✅ [049](apply-pack/049-perplexity-executive-communications-manager-sr-manager-exec-comms/) | [048](reports/048-perplexity-exec-comms-manager-2026-04-27.md) | Group 2 (B.1, B.2, B.10) + AT.1 |
| 4.55 | #50 | ElevenLabs | Communications Manager | Not disclosed | 🔧 NEEDS-BUILD | [049](reports/049-elevenlabs-communications-manager-2026-04-27.md) | Group 2 (B.6, B.7) + AT.5 |
| 4.50 | #59 | Sierra | Developer Relations Engineer (NYC) | $175-280K + Equity | ✅ [059](apply-pack/059-sierra-developer-relations-engineer-nyc/) | [533](reports/533-sierra-developer-relations-engineer-nyc-2026-05-07.md) | Group 1 (A2.5, A2.10, A2.11, A2.12) + B.4 |
| 4.50 | #60 | Sierra | Strategic Writer, Communications and Marketing | Not disclosed | 🔧 NEEDS-BUILD | [060](reports/060-sierra-strategic-writer-comms-marketing-2026-04-27.md) | Group 2 (B.1, B.2, B.7) + AT.5 |
| 4.50 | #840 | Cursor (Anysphere) | Forward Deployed Engineer | Not disclosed | 🔧 NEEDS-BUILD | [091](reports/091-cursor-2026-04-28.md) | Group 1 (A2.5, A2.10) + H.3 |
| 4.50 | #842 | ElevenLabs | Forward Deployed Engineer - Software Engineer | $230-260K + equity | 🔧 NEEDS-BUILD | [093](reports/093-elevenlabs-forward-deployed-engineer-software-engineer-2026-04-28.md) | Group 1 (A2.5, A2.10, A2.11) |

**Sierra recruiter-throttle note:** Mitchell already has #68 Sierra DRE London Applied + #447 SF DEFER + #504 NYC sibling DEFER. Don't add a 4th simultaneous DRE-family touch — wait for London resolution. For Sierra, lead with #60 Strategic Writer (distinct function) instead.

**ElevenLabs sequencing:** apply to Comms Manager #50 first (cleaner CV math), then ONE FDE variant (#842 SF or #843 Spain — not both).

---

## Tier 3 — Apply-Now ≥ 4.0

| Score | Row | Company | Role | Comp anchor | Apply-pack | Report |
|---|---|---|---|---|---|---|
| 4.40 | #863 | Cohere | Applied AI Engineer – Agentic Workflows | $200-280K USD-equiv | 🔧 NEEDS-BUILD | [101](reports/101-cohere-applied-ai-engineer-agentic-workflows-2026-04-28.md) |
| 4.35 | #841 | Synthesia | Solutions Architect | Not disclosed | 🔧 NEEDS-BUILD | [092](reports/092-synthesia-2026-04-28.md) |
| 4.35 | #853 | Mistral AI | Developer Education Lead | Not disclosed | 🔧 NEEDS-BUILD | [063](reports/063-mistral-2026-04-28.md) |
| 4.30 | #843 | ElevenLabs | Forward Deployed Engineer - Spain | €150-180K + equity | 🔧 NEEDS-BUILD | [094](reports/094-elevenlabs-forward-deployed-engineer-software-engineer-spain-2026-04-28.md) |
| 4.30 | #858 | Anthropic | Manager, Forward Deployed Engineering | Not disclosed | 🔧 NEEDS-BUILD | [083](reports/083-anthropic-manager-fde-2026-04-28.md) |
| 4.20 | #854 | Pinecone | Staff Developer Advocate | Not disclosed | 🔧 NEEDS-BUILD | [064](reports/064-pinecone-2026-04-28.md) |
| 4.10 | #51 | OpenAI | Research Communications Manager | Not disclosed; trend up to $1M | 🔧 NEEDS-BUILD | [050](reports/050-openai-research-communications-manager-2026-04-27.md) |
| 4.00 | #53 | OpenAI | Policy Communications Manager | Not disclosed | 🔧 NEEDS-BUILD | [052](reports/052-openai-policy-communications-manager-2026-04-27.md) |

**OpenAI throttle note:** OpenAI default 1-2 active concurrent apps. With #51 + #53 both at apply floor, lead with #51 (Research Comms — closer to Anthropic-shape Mitchell-fit), then queue #53 if recruiter doesn't push back.

---

## Recommended Tonight's Action Order

If Mitchell sits down for 90-120 minutes tonight:

1. **First 45 min — Anthropic #48 Engineering Editorial Lead (4.65/5).** Apply-pack already built. Open `apply-pack/048-anthropic-engineering-editorial-lead/`. Read README. Tailor cover letter using `templates/cover-letter-template.md`. Compose LinkedIn DM using Variant A from `data/outreach-templates.md`. Run pre-flight checklist. Submit.
2. **Next 30 min — Sierra #60 Strategic Writer (4.50/5).** Run `node scripts/build-apply-pack.mjs --row=60`. Tailored CV uses Group 2 + AT.5 bullets from `data/tailored-resume-bullets.md`. This is the Sierra surface that doesn't conflict with the in-flight DRE family.
3. **Next 30 min — ElevenLabs #50 Comms Manager (4.55/5).** Build apply-pack. Group 2 (B.6 talent pipeline) + AT.5 lead. Distinct function from Mitchell's potential FDE play at ElevenLabs — apply this one first.

Anything beyond this should wait for tomorrow morning. Quality > volume per ethical invariants.

---

## What to skip tonight

- **#1 Anthropic Comms Mgr Research** — strong fit but 1-active-app rule means choosing between #1 and #48. #48 wins on score and apply-pack readiness.
- **#840 Cursor FDE / #842 ElevenLabs FDE / #843 ElevenLabs Spain FDE** — Python "(learning)" CV gap requires honest disclosure. Worth a 2-day Python port pre-application; not a tonight ship.
- **#863 Cohere Applied AI Engineer** — Cohere just merged with Aleph Alpha April 24. Wait for role-survival confirmation before applying.

---

## How to refresh this index

This file is **not auto-updated**. Re-generate when applications.md changes:
```bash
node scripts/build-apply-now-index.mjs > data/APPLY-NOW.md
```
Or manually re-run the Python extract that produced the data above. The build script reads the same `data/applications.md` source-of-truth and re-renders the table.

---

## Cross-references

- Source: `data/applications.md` (canonical tracker)
- Bullets: `data/tailored-resume-bullets.md` (per-company guide at the bottom)
- Outreach templates: `data/outreach-templates.md`
- Tonight's workflow: `data/HOW-TO-APPLY.md`
- Pre-flight checklist: `data/pre-flight-checklist.md`
- Throttle rules: `modes/_profile.md` §0a
- Voice constraints: `corpus/voice-profile.md` (always-on)

**Last refresh:** 2026-05-07 — generated from applications.md row scan; 18 rows ≥ 4.0 surface; 6 of 18 have apply-packs already built.
