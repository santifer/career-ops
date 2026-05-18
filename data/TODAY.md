# TODAY.md — 2026-05-12 (cross-model audit execution)

Single landing surface for this session's work. Open this when you need to find anything from today.

---

## ⏰ Morning of 2026-05-18 — open this first

While you slept, an autonomous build session ran ~5 hours. Read [data/morning-handoff-2026-05-18.md](morning-handoff-2026-05-18.md) for the full report. Headlines:

- **13 tailored CV PDFs ready** at `apply-pack/<slug>/tailored-cv.pdf` for every live row in the apply-now queue (Anthropic Editorial Lead, ElevenLabs Comms, Mistral DevAdvocate, Sierra DRE-SF, plus 9 others).
- **Per-pack quality reports** at `apply-pack/<slug>/PREFLIGHT.md` — single PASS/CAUTION/FAIL verdict from the new `scripts/preflight-pack.mjs` aggregator (PDF + humanize + JD-keyword overlap + claim-consistency). Run before submitting.
- **All 13 URLs verified live as of 05:25 PDT.** Four others expired (Cursor #840, OpenAI ADE #1509, OpenAI Onboarding #1511, Anthropic Strategic Ops #2050) — all marked Discarded in `data/applications.md`.
- **Master CV refreshed** at `output/cv-mitchell-williams-master-2026-05-18.pdf` (2 pages, all ATS keywords).
- **Heartbeat email** now surfaces today's master CV path inline (Phase 2 Item L).
- **Cost tonight:** $0.92 of the $50 pre-approved cap. ~$49 remaining.

Quick apply order if you're picking the highest-leverage targets tonight: **#48 Anthropic Editorial Lead → #851 Mistral Sr/Staff AI DevAdvocate → #50 ElevenLabs Comms Mgr**. Anthropic 1-active-app rule means picking #48 blocks #1 and #44 (defer those).

---

## 🎯 FIVE IMMEDIATE PRIORITIES

### 1. Python Sprint — Day 1
**Start today.** Open [data/python-sprint.md](python-sprint.md) — full 90-day checklist.
Day 1 action: open *Automate the Boring Stuff with Python* (free at automatetheboringstuff.com), chapters 1–2. Write one script.
This gap was flagged by all four cross-model audit models as the primary rate-limiter on ≥60% of currently advanced roles. It is not optional.

### 2. Rita Kumar DM — Send before applying to OpenAI
Rita Kumar (Knowledge Architect, OpenAI) wrote a LinkedIn recommendation for Mitchell in 2023. She is the only confirmed warm-intro path into OpenAI.
**Message is ready:** [data/outreach-templates.md](outreach-templates.md) → section "WARM INTRO OUTREACH — RITA KUMAR"
Send this **before** the formal OpenAI application goes in. A 20-minute coffee chat is worth more than 10 cold applications.

### 3. Apply to Portkey (SEQ 1) + Sierra Strategic Writer (SEQ 3)
Both have the fastest offer timelines. Neither requires the Python sprint — Mitchell's profile clears the bar without it.
- **Portkey:** Cold outreach play (no formal posting may exist) — use the Portkey pitch from [data/outreach-templates.md](outreach-templates.md) → "NEW-TARGET COLD OUTREACH"
- **Sierra Strategic Writer (#60):** Apply via Ashby. Report at [reports/060-sierra-strategic-writer-comms-marketing-2026-04-27.md](../reports/060-sierra-strategic-writer-comms-marketing-2026-04-27.md).
Getting one offer in hand changes the entire frontier-lab conversation.

### 4. Register `newsroomagentbench.ai` domain + open the GitHub repo
Staking the domain and repo now signals intentionality before the benchmark is built.
When reaching out to anyone at Pinecone, Weaviate, LangChain, or Vercel, a real URL changes the conversation.
Action: check domain availability → register → create `newsroom-agent-benchmark` public repo on GitHub → write README before writing code.

### 5. Full intelligence report
Read the full four-model audit for complete context:
[data/CROSS-MODEL-CAREER-INTELLIGENCE-REPORT.md](CROSS-MODEL-CAREER-INTELLIGENCE-REPORT.md)

---

## 📊 What changed this session (2026-05-12 cross-model audit)

### Scoring engine recalibrated
- `batch/triage-prompt.md`: A2 split into A2a/A2b/A2c sub-archetypes. A2b (AI Enablement / Editorial-AI Lead) is now the PRIMARY archetype — scored 5.0 on North Star
- Comp floor raised: $120K → $160K remote / $180K Seattle/onsite
- CV Match weight: 15% → 25% (rarity of editorial+AI-ops combo)
- Two new scoring dimensions: Domain Specificity (10%) + Agentic Systems (5%)
- Python SKIP rule now exempts media/editorial/comms domain roles

### CV rewritten
- `cv.md`: New 4-sentence summary leading with domain specificity + production proof + scale signal
- 5 new proof point bullets added: Scientology litigation posture (HuffPost Live), AJ+ talent pipeline as human-capital system, Hong Kong FDE-mindset framing (Fusion, Oct 2014), trans military panel trend-identification framing, mentorship platform eight-figure retention lever (with [VERIFY] flag on dollar estimate)

### Application sequence restructured
- `data/APPLY-NOW.md`: New SEQ column shows optimal application order for negotiation leverage
- New top 10: Portkey (SEQ 1) → Cursor (2) → Sierra (3) → W&B (4) → ElevenLabs (5) → Mistral (6) → Anthropic (7) → OpenAI (8) → Scale AI (9) → Runway (10)
- 4 stub rows added for Portkey, Weights & Biases, Scale AI, Runway

### New portals + companies
- `portals.yml`: 9 new companies added (enabled: false — verify ATS before enabling): Weights & Biases, Arize AI, Portkey, Abridge, Hebbia, DeepJudge, LlamaIndex, HiddenLayer, Inworld AI
- 5 new media-vertical title filters added: Voice AI, Content Strategist, Media Partnerships, Newsroom, Broadcast
- 4 new `corpus/companies/` files: portkey.md, wandb.md, scaleai.md, runway.md

### New outreach templates
- `data/outreach-templates.md`: 3 internal champion Slack pitches (Anthropic, OpenAI, ElevenLabs) + Rita Kumar warm-intro DM (ready to send) + 3 cold outreach messages (Portkey, W&B, Runway)

### Python sprint tracker
- `data/python-sprint.md`: Full 90-day checklist with daily/weekly milestones, Day 1 → Day 90

### Pipeline health
- `node dedup-tracker.mjs` → 9 duplicates removed
- `node verify-pipeline.mjs` → 0 errors, 0 warnings (clean)

---

## 🛠 Materials for application builds

- [data/APPLY-NOW.md](APPLY-NOW.md) — ranked queue with new SEQ column (cross-model audit sequence)
- [data/python-sprint.md](python-sprint.md) — 90-day Python sprint tracker (Day 1 today)
- [data/outreach-templates.md](outreach-templates.md) — all outreach including Rita Kumar DM + 3 new cold outreach messages
- [data/HOW-TO-APPLY.md](HOW-TO-APPLY.md) — step-by-step workflow (~60-70 min/app)
- [data/pre-flight-checklist.md](pre-flight-checklist.md) — run before submitting

---

## ⚠ Apply-packs: DEFERRED (Block G)

Apply-packs for Cursor, Sierra, ElevenLabs, and Anthropic require Mitchell's review of the Block B CV changes first.
Run `scripts/build-apply-packs.mjs --top=N` after reviewing and approving the new `cv.md` summary and proof points.

---

## 📅 Recommended cadence from here

- **Today:** Rita Kumar DM + domain registration + Day 1 Python sprint
- **This week:** Apply to Portkey (cold outreach) + Sierra Strategic Writer (#60). Cursor FDE after verifying Ashby URL.
- **Week 2:** Apply Weights & Biases + ElevenLabs Comms Manager (#50) + Mistral Dev Advocate (#851)
- **Week 3:** Anthropic (one role, per §0a throttle: #48 Engineering Editorial Lead OR #2050 Strategic Ops)
- **Weeks 4-5:** OpenAI (#1509 + #1511 paired) — walk in with 2+ offers already in process
- **Day 14:** Voice OS FastAPI endpoint deployed (Python sprint Week 2 milestone)
- **Day 21:** "Kill-List RAG" post published on storytellermitch.com + HN
- **Day 60:** Newsroom-Agent-Benchmark launched

---

**Last refresh:** 2026-05-12
**This file is NOT auto-updated.** Re-write at the end of each major session.
