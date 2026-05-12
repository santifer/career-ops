# CROSS-MODEL INTELLIGENCE REPORT — EXECUTION PROMPT
**Companion to:** `data/CROSS-MODEL-CAREER-INTELLIGENCE-REPORT.md`  
**Purpose:** Drop this prompt into a Claude Code session to execute every gap, fix, and immediate action from the report. Self-contained — no prior context needed.

---

## HOW TO USE THIS PROMPT

Paste the block below the horizontal rule into a new Claude Code session opened in `/Users/mitchellwilliams/Documents/career-ops`. The agent will execute every change in dependency order. Estimated session time: 90–120 minutes.

If you only want a subset of work, include the relevant section headers in your paste.

---

```
You are executing a structured improvement plan for the career-ops job search pipeline
at /Users/mitchellwilliams/Documents/career-ops. The plan is derived from a
four-model career intelligence audit (Grok-3, Perplexity sonar-deep-research, OpenAI
o3, Gemini 2.5 Pro) summarized in data/CROSS-MODEL-CAREER-INTELLIGENCE-REPORT.md.
Read that file first for full context, then execute every task below in order.

Before starting, run: node update-system.mjs check

─────────────────────────────────────────────────────────────────
BLOCK A — TRIAGE + SCORING RECALIBRATION
─────────────────────────────────────────────────────────────────

Task A1 — Split archetype A2 into three sub-archetypes in batch/triage-prompt.md

Current A2 definition lumps Solutions Architect, FDE, AI Enablement, and AI PgM
into one bucket. This creates false positives (infrastructure-heavy FDE) and false
negatives (editorial-AI hybrid roles). Replace the A2 definition with:

  A2a — SA/FDE Technical: Solutions Architect or Forward Deployed Engineer at an
         AI-native company where the primary screen is Python production experience,
         systems design, and customer-facing technical implementation. Requires
         demonstrated Python in portfolio.

  A2b — AI Enablement / Editorial-AI Lead: AI Enablement, Communications Manager
         at an AI-native company, Engineering Editorial Lead, Voice/Content AI
         Strategist, Internal AI Lead. Domain expertise (media, editorial, comms)
         is the primary hiring screen. Python helpful but not gate. This is
         Mitchell's PRIMARY archetype — weight it accordingly.

  A2c — Technical Evangelist / Developer Education Lead: DevRel, Staff Technical
         Evangelist, Head of DevEx, Developer Education. Requires on-camera/writing
         credibility + technical literacy. No CS degree required.

  North Star scoring: A2b roles score 5.0 on North Star. A2a roles score 4.0 unless
  Mitchell has shipped a public Python service (check cv.md for this). A2c roles
  score 4.5. All other roles score per existing logic.

Task A2 — Update hard SKIP rules in batch/triage-prompt.md

Change the compensation hard SKIP floor from:
  "Estimated TC < $120K"
to:
  "Estimated TC < $160K (remote) or < $180K (Seattle/onsite)"

Also update the mandatory-Python SKIP rule. Current: "Role requires mandatory deep
Python production experience as primary technical screen." Change to:
  "Role requires mandatory deep Python production experience as primary technical
   screen AND role is NOT explicitly in the media, editorial, content, comms, or
   publishing domain."
Rationale: In domain-specific roles, Mitchell's editorial credentials outweigh
the Python gap and he can credibly commit to ramping.

Task A3 — Reweight the 8 scoring dimensions in batch/triage-prompt.md

Apply this new weight distribution (must sum to 100%):
  North Star match:      25%  (unchanged)
  CV Match:              25%  (was 15% — rarity of editorial+AI-ops combo)
  Estimated Comp:        10%  (was 15% — floor is now a hard gate, not gradient)
  Growth trajectory:      8%  (was 15% "Growth to A2" — poorly defined, adding noise)
  Remote/Location:        5%  (unchanged)
  Company AI-nativity:   12%  (was 10% — needs AI-first environment)
  Tech Stack:             5%  (unchanged)
  Culture Signals:        5%  (was 10% — reduce to create room for new dimensions)
  Domain Specificity:    10%  (NEW — does the role explicitly name media, content,
                                editorial, comms, or publishing as customer context?)
  Agentic Systems:        5%  (NEW — does the role involve designing/deploying/
                                evaluating LLM agents, not just prompt engineering?)

After editing, run: node scripts/token-counter.mjs (if available) to verify prompt
length is still within cache budget.

─────────────────────────────────────────────────────────────────
BLOCK B — CV REWRITE
─────────────────────────────────────────────────────────────────

Task B1 — Rewrite the CV summary/objective section in cv.md

Read cv.md first to understand the current summary framing. Then replace the
opening summary/positioning statement with a version that leads with domain
specificity, not general AI credentials. The new summary must:

  1. Name the specific domain intersection (media/editorial/comms + AI systems)
     in the first sentence.
  2. Reference the three production agents as proof of "shipped, not studied."
  3. Reference the Google-scale audience (1,000+ L6–L10 engineers) to establish
     the seniority of stakeholders he has served.
  4. Use the voice calibration at writing-samples/voice-reference.md — precision,
     directness, no preamble.
  5. Be ≤4 sentences. No buzzwords ("passionate about," "leverage," "synergy").

Example structure (do not copy verbatim — rewrite in Mitchell's voice):
  "[One sentence: What Mitchell is, with domain named explicitly]. [One sentence:
  The clearest production proof]. [One sentence: The scale/seniority signal].
  [One sentence: What he is looking to do next and why now]."

Task B2 — Add five under-leveraged proof points to cv.md

The four-model audit identified these strengths as present in the corpus but missing
from the CV. Add them as bullets or proof points in the appropriate role entries:

  1. In the journalism / HuffPost Live section: Add a bullet for the Scientology
     litigation angle: "Produced under active 'attack the attacker' legal posture —
     every editorial decision subject to multi-million-dollar legal scrutiny."

  2. In the AJ+ / journalism section: Reframe the talent pipeline story:
     "Designed and deployed a human-capital scaling system that up-leveled three
     junior producers into on-air principal correspondents (Emmy + Webby winners)
     — a program management proof point, not just a production success."

  3. In the Fusion / journalism section: Add the "Live from a backpack" proof point:
     "Field-produced live breaking news coverage integrating three competing
     broadcast organizations, multiple live feeds, and real-time social data with
     no script and zero infrastructure — in the field during the 2013 Hong Kong
     protests." (Verify the date against the corpus before writing.)

  4. In the HuffPost Live section: Add the trans military panel proof point:
     "Produced trans military service segment four years before policy change with
     source at active discharge risk — demonstrates long-range trend identification
     and editorial courage under reputational exposure."

  5. In the Google xGE section: Reframe the mentorship platform impact:
     "Scaled mentorship program 300% in capacity via autonomous matching platform
     serving the top 0.5% of a 180,000-person org — estimated eight-figure
     retention lever." (Only include if you can verify this claim from article-
     digest.md or corpus/projects/. Do not fabricate metrics.)

Task B3 — Verify and update article-digest.md to reflect the five proof points above

Check that article-digest.md contains accurate, specific metrics for each of the
five proof points added in Task B2. If a proof point lacks a specific metric or
date in the corpus, note it with [VERIFY] in the digest entry. Do not invent
metrics.

─────────────────────────────────────────────────────────────────
BLOCK C — OUTREACH TEMPLATES + PITCHES
─────────────────────────────────────────────────────────────────

Task C1 — Add three company-specific pitches to data/outreach-templates.md

Append a new section "## INTERNAL CHAMPION PITCHES (Slack-ready)" with the
following three pitches, each ≤3 sentences, formatted for direct paste into Slack.
These are sourced from Gemini 2.5 Pro's full-corpus analysis and validated against
what each company has publicly stated it values:

  ANTHROPIC (safety/risk calibration angle):
  "Found a fascinating profile in Mitchell Williams. He's a comms lead from
  Google's senior engineering org who's built multiple production AI agents, but
  his real differentiator is his background running high-stakes editorial ops under
  active litigation threats — think Scientology, Trump lawsuits. He brings a level
  of operational discipline and risk calibration to comms and agent design that
  feels very aligned with our thoughtful approach."

  OPENAI (builder + field deployment angle):
  "Take a look at Mitchell Williams for our Applied AI / FDE teams, especially for
  media partners. He's shipped production AI systems for 1,000+ senior engineers at
  Google, but before that he spent 8 years line-producing live global news —
  literally field-producing from a backpack during the Hong Kong protests. He has
  the end-to-end builder mentality and the real-world, high-pressure deployment
  experience we need."

  ELEVENLABS (Voice DNA methodology angle):
  "I think I found the perfect person for our comms/product-strategy team: Mitchell
  Williams. He's a Google AI comms lead, but get this: he engineered a 'Voice DNA'
  RAG pipeline for his VP that achieved 99% stylistic fidelity by using a 'Kill
  List' of rejected drafts to teach the model risk tolerance. He has a unique,
  pre-built methodology for exactly what our product does."

Task C2 — Draft the Rita Kumar outreach message in data/outreach-templates.md

Append a section "## WARM INTRO OUTREACH — RITA KUMAR (OpenAI)". 
Rita Kumar is a Knowledge Architect at OpenAI and is the only confirmed warm-intro
path in the network (corpus/linkedin.md). Draft a LinkedIn DM that:
  - References a specific mutual interest or OpenAI product area (use
    corpus/companies/openai.md for context)
  - Names the specific role: "AI Deployment Engineer — Media Partnerships" (queue #1509)
  - Uses the field-production / FDE-mindset angle from the OpenAI pitch above
  - Asks for a 20-minute call, not a referral (lower ask = higher conversion)
  - Is ≤5 sentences
  - Uses Mitchell's voice (writing-samples/voice-reference.md for calibration)
  - Does NOT mention it was AI-assisted

Task C3 — Draft cold outreach templates for three new-company targets

Append a section "## NEW-TARGET COLD OUTREACH". Draft one outreach message each
(LinkedIn DM format, ≤5 sentences, Mitchell's voice) for:
  - Portkey (Founding Solutions Architect — technical + equity angle)
  - Weights & Biases (Staff Solutions Engineer — enterprise ML adoption angle)
  - Runway (Head of AI Enablement — media/broadcast credibility angle)

Use the company intelligence at corpus/companies/ if files exist; otherwise use
the report context. Match the angle to what each company publicly values.

─────────────────────────────────────────────────────────────────
BLOCK D — PORTALS + COMPANY TARGETING EXPANSION
─────────────────────────────────────────────────────────────────

Task D1 — Add new company targets to portals.yml

The audit identified 15 companies Mitchell is not currently targeting. Check which
of the following already exist in portals.yml. For any that are MISSING, add new
entries using the appropriate ATS (research each company's careers page to determine
if they use Greenhouse, Ashby, Lever, or Workday). Add them as enabled: false
initially so the next scan does not run automatically — Mitchell should manually
review the role fit first.

Companies to add (if missing):
  - Weights & Biases (W&B) — likely Greenhouse
  - Arize AI — check careers page for ATS
  - Portkey — likely Ashby or Lever (Series A)
  - Abridge — check careers page
  - Hebbia — check careers page
  - DeepJudge — check careers page
  - Runway — likely Greenhouse
  - LlamaIndex — check careers page
  - HiddenLayer — check careers page
  - Character.ai — check careers page
  - Inworld AI — check careers page
  - LangChain / LangSmith — check careers page

For each new entry, use this YAML template:
  - name: "[Company Name]"
    ats: "[greenhouse|ashby|lever|workday|other]"
    board_token: "[token if greenhouse/ashby/lever — leave blank if unknown]"
    enabled: false
    title_filter:
      positive: ["solutions architect", "ai enablement", "developer education",
                 "technical evangelist", "forward deployed", "developer experience"]
      negative: ["intern", "junior", "data scientist", "research scientist"]
    note: "Added 2026-05-12 per cross-model audit — verify ATS before enabling"

Task D2 — Add a "media-vertical" title filter to portals.yml global config

In the global title_filter.positive list (if one exists), add these terms that
capture Mitchell's highest-probability role type:
  "voice ai", "content strategist", "communications manager", "editorial lead",
  "media partnerships", "newsroom", "broadcast"

─────────────────────────────────────────────────────────────────
BLOCK E — APPLICATION SEQUENCE + APPLY-NOW QUEUE
─────────────────────────────────────────────────────────────────

Task E1 — Reorder data/APPLY-NOW.md to reflect the optimal leverage sequence

The current queue is ordered by composite score. Re-sort the top 10 rows to
reflect the optimal APPLICATION SEQUENCE for negotiation leverage:

  New priority order for the top 10:
  1. Portkey — Founding Solutions Architect (NEW — not currently in queue)
  2. Cursor — Forward Deployed Engineer (currently queue position ~8)
  3. Sierra — DRE / Strategic Writer (currently top 5)
  4. Weights & Biases — Staff Solutions Engineer (NEW)
  5. ElevenLabs — Communications Manager (currently in queue)
  6. Mistral — Senior Developer Advocate (currently in queue)
  7. Anthropic — Engineering Editorial Lead OR Strategic Ops (currently top 5)
  8. OpenAI — AI Deployment Engineer: Media Partnerships (currently #1)
  9. Scale AI — Strategic Programs Lead (NEW)
  10. Runway — Head of AI Enablement (NEW)

  Add a new column "SEQ" before the existing columns to show application order.
  Add a one-line "LEVERAGE RATIONALE" note column at the end.

  For NEW entries (Portkey, W&B, Scale AI, Runway): add stub rows with Status
  "Research" and link to corpus/companies/ file if it exists, or "[stub]" if not.

Task E2 — Create stub company files for new targets

For each NEW company in the sequence (Portkey, Weights & Biases, Scale AI, Runway),
check if corpus/companies/{company}.md exists. If not, create a stub file using
this template:

---
# [Company Name]
**Status:** Research stub — added 2026-05-12 per cross-model audit
**ATS:** [TBD]
**Valuation:** [TBD]
**IPO Signal:** [TBD]
**Primary Role Target:** [role from sequence above]
**Mitchell Fit Angle:** [1–2 sentences from the audit's company description]
**Key Contacts:** [LinkedIn search needed]
**Notes:** [blank]
---

─────────────────────────────────────────────────────────────────
BLOCK F — PYTHON SPRINT TRACKING
─────────────────────────────────────────────────────────────────

Task F1 — Create data/python-sprint.md as a 90-day tracking file

Create a file that Mitchell can open each morning to track the Python sprint.
Structure it as a day-by-day checklist with the following milestones:

  Week 1 (Days 1–7): Python fundamentals
    - [ ] Complete Automate the Boring Stuff chapters 1–6 (functions, lists, dicts,
          file I/O, regex)
    - [ ] Write one Python script per day (suggested: rewrite a Node.js script from
          career-ops in Python)
    - [ ] Set up a local venv, install fastapi, uvicorn, requests, openai

  Week 2 (Days 8–14): Deploy Voice OS as a web service
    - [ ] Read corpus/projects/voice-os.md to understand the current Voice OS design
    - [ ] Build a FastAPI endpoint: POST /analyze accepts text, returns voice
          similarity score vs. the reference corpus
    - [ ] Deploy to Vercel or Modal (free tier)
    - [ ] Push to GitHub with a clean README — this is a portfolio artifact
    - [ ] Update cv.md to add "Deployed public FastAPI service (Voice OS API —
          link)" to the projects section

  Week 3 (Days 15–21): Publish first technical post
    - [ ] Write "Kill-List RAG: negative-example conditioning for stylistic risk
          control" (1,500–2,000 words, technical, specific implementation details)
    - [ ] Cross-post to: personal blog / storytellermitch.com, LinkedIn article,
          Hacker News Show HN submission
    - [ ] Link to Voice OS API repo in the post

  Weeks 4–5 (Days 22–35): Newsroom-Agent-Benchmark core build
    - [ ] Register newsroomagentbench.ai domain (or .com/.io equivalent)
    - [ ] Create GitHub repo: newsroom-agent-benchmark (public, MIT license)
    - [ ] Write README with benchmark description, motivation, and usage before
          writing any code (README-driven development)
    - [ ] Implement benchmark harness: Python + LangChain Expressions + Weaviate
          vector store (or Pinecone) + Claude/OpenAI/Mistral SDKs
    - [ ] Define 3 evaluation axes: factuality (citation recall), Voice DNA cosine
          similarity, token latency (ms to first token + full completion)
    - [ ] Add 20 sample wire-service headlines as test fixtures

  Weeks 6–7 (Days 36–45): Production-grade benchmark
    - [ ] Add Streamlit leaderboard dashboard
    - [ ] Add GitHub Actions CI: pytest-benchmark runs on push
    - [ ] Deploy demo to Modal or Replicate (public URL)
    - [ ] Add CONTRIBUTING.md (signals multi-contributor intent)

  Week 7 (Days 46–60): Launch
    - [ ] HN Show HN post (title: "Show HN: Newsroom-Agent-Benchmark — factuality
          + style fidelity + latency eval for LLM broadcast copy")
    - [ ] LinkedIn article: "I built the benchmark I wish existed when I was
          deploying LLMs in a newsroom"
    - [ ] Submit to r/MachineLearning and r/LocalLLaMA
    - [ ] Email the repo link to 3 hiring managers at companies in the sequence
          (not as an application — as a "thought you'd find this useful")

  Weeks 9–13 (Days 61–90): On-camera + open source
    - [ ] Record 5-minute walkthrough video of the benchmark (use on-camera
          production skills — studio framing, no "um" cuts)
    - [ ] Identify one issue in LangChain, LlamaIndex, or Weaviate GitHub repos
          that you can credibly fix
    - [ ] Open a PR with the fix (even documentation counts — the goal is a
          merged commit in a shared codebase)
    - [ ] Update cv.md and LinkedIn with all three new artifacts

─────────────────────────────────────────────────────────────────
BLOCK G — APPLY-PACK GENERATION FOR SEQUENCE COMPANIES
─────────────────────────────────────────────────────────────────

Task G1 — Build apply-packs for the top 4 sequence companies

Run the canonical apply-pack builder for the following companies (use
scripts/build-apply-packs.mjs --top=1 or the individual row number from
APPLY-NOW.md):

  For each of these, generate: cover letter, form fields, interview prep,
  ATS keyword check, LinkedIn DM, one-pager, pre-flight checklist.

  Companies:
  1. Cursor — Forward Deployed Engineer (find current row number in APPLY-NOW.md)
  2. Sierra — DRE/Strategic Writer (current top-5 row)
  3. ElevenLabs — Communications Manager (current row)
  4. Anthropic — Engineering Editorial Lead (current row)

  For each cover letter, the opening paragraph MUST use one of the three
  narrative reframes from the report (choose the one that best matches the role):
    - FDE framing: "I turn vague, high-risk communication workflows into audited,
      production LLM agents. Three of those agents now run unattended for 1,000+
      Principal-level Googlers, survived my own 3-month absence, and freed ~½ FTE
      of senior-engineer time."
    - SA/AI framing: "Former Google internal-systems builder who has already
      translated 'LLM hype' into two RAG pipelines and one autonomous triage agent
      that passed Google Privacy & Security Review."
    - AI Enablement framing: "Journalist-turned-Googler who specializes in turning
      domain experts into AI power users. Built the mentorship-match platform that
      tripled program capacity and the Voice DNA twin that cut VP drafting latency
      90%."

  Cover letters must be calibrated against writing-samples/voice-reference.md.
  Do NOT submit any of these — generate them for Mitchell's review.

─────────────────────────────────────────────────────────────────
BLOCK H — PIPELINE INTEGRITY CHECK
─────────────────────────────────────────────────────────────────

Task H1 — Run pipeline health checks after all changes above

  node verify-pipeline.mjs
  node normalize-statuses.mjs
  node dedup-tracker.mjs

Fix any validation errors before proceeding. Report results.

Task H2 — Update data/TODAY.md to reflect new priorities

Rewrite the "Tonight's focus" or current-session section of data/TODAY.md to
surface:
  1. Python sprint — Day 1 (link to data/python-sprint.md)
  2. Rita Kumar DM — paste from outreach-templates.md
  3. Apply to Sierra and Cursor (first applications in sequence)
  4. Register newsroomagentbench.ai domain
  5. Link to the full intelligence report: data/CROSS-MODEL-CAREER-INTELLIGENCE-REPORT.md

─────────────────────────────────────────────────────────────────
EXECUTION ORDER
─────────────────────────────────────────────────────────────────

Execute blocks in this order to avoid dependency issues:

  1. Block A (triage calibration) — changes the scoring engine first
  2. Block B (CV rewrite) — changes the source of truth before packs are built
  3. Block D (portals expansion) — adds companies before sequencing
  4. Block E (sequence + queue) — reorders queue after new companies added
  5. Block C (outreach templates + pitches) — drafts outreach after queue is set
  6. Block F (Python sprint tracker) — creates the skill plan
  7. Block G (apply-packs) — builds packs using the rewritten CV
  8. Block H (pipeline integrity) — health check last

Estimated total execution time: 90–120 minutes.
Blocks A, B, D, E, F can be run in a single session.
Block G (apply-pack generation) should be run as a separate session after
Mitchell has reviewed and approved the Block B CV changes.

─────────────────────────────────────────────────────────────────
SUCCESS CRITERIA
─────────────────────────────────────────────────────────────────

This execution is complete when:
  [ ] batch/triage-prompt.md reflects the new A2a/A2b/A2c split and weights
  [ ] cv.md has a new domain-specific summary and five new proof point bullets
  [ ] article-digest.md reflects all five proof points (with [VERIFY] flags where
      needed)
  [ ] data/outreach-templates.md has three company-specific pitches + Rita Kumar DM
      + three new-target cold outreach templates
  [ ] portals.yml has new entries for ≥8 of the 12 new companies (enabled: false)
  [ ] data/APPLY-NOW.md has a SEQ column and the top 10 rows reflect the leverage
      sequence
  [ ] data/python-sprint.md exists with the full 90-day checklist
  [ ] apply-packs exist for Cursor, Sierra, ElevenLabs, and Anthropic
  [ ] node verify-pipeline.mjs exits with 0 errors
  [ ] data/TODAY.md is updated to surface the five immediate priorities
```
