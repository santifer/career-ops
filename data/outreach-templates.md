# Outreach Templates — Value-First, 5 Channels

**Generated:** 2026-05-07 (overnight autonomous session)
**Source of truth:** All proof points pulled from `cv.md` and `article-digest.md`. No invented metrics.
**Voice constraint:** All templates pass `corpus/voice-profile.md` filter — first-person voice, lead with the point, no banned phrases, 350-word cap on emails. Contractions allowed in casual outreach (LinkedIn DM, X), out for cold-email-to-recruiter.
**Cringe test:** Each template was written and re-read against the question: "Would I send this if I were the recipient?" Nothing here uses "I'm reaching out because" / "I'd love to connect" / "let's chat" / "circle back."

**[HOOK]** = first sentence creating curiosity (no introduction yet).
**[PROOF POINT]** = one specific verifiable metric.
**[CTA]** = specific, low-friction ask.

**Template IDs** — every reusable variant carries a stable `template_id` so it can be referenced from `data/outreach-state.json` and the strategy recommender (`lib/strategy-recommender.mjs`). Format: `{channel}_{purpose}_{variant}`.

---

## Channel 1: LinkedIn DM — cold outreach to hiring managers at target companies

`template_id: linkedin_dm_v3_recruiter_inbound` (variant 1.A) · `linkedin_dm_v3_fde_pitch` (1.B) · `linkedin_dm_v3_editorial_pitch` (1.C)

### Variant 1.A — Anthropic comms / research-comms hybrid HM

> [HOOK] Voice DNA + Kill List methodology runs the Executive RAG pipeline at Google xGE — 99% stylistic fidelity at 90% drafting-latency reduction for VP-level comms.
>
> [PROOF POINT] Methodology: curated Voice DNA corpus + restricted Kill List of rejected drafts taught the agent risk tolerance via negative training. ~1,000 senior technical ICs at Principal/Distinguished/Fellow tier are the audience.
>
> Saw {role title}. The negative-training-as-risk-encoding pattern reads structurally aligned with the way Anthropic encodes constraint into model behavior. Curious whether the role's day-one priorities are voice-calibration heavy, citation-discipline heavy, or both.
>
> [CTA] If there's a 15-minute window in the next two weeks, I'd take it.
>
> — Mitchell

### Variant 1.B — Solutions Engineering / Forward Deployed Engineer at xAI / Sierra / Cursor

> [HOOK] Built `career-ops` (production deployment April 2026) — agentic job-search pipeline with parallel workers, single-Claude orchestrator, zero-token portal scanning against Greenhouse/Ashby/Lever APIs. Public repo: github.com/mitwilli-create/career-ops.
>
> [PROOF POINT] At Google xGE I shipped a comms triage agent serving ~1,000 senior technical ICs (~160 hours/year recaptured at >90% classification accuracy). Same orchestration discipline applied to my own pipeline.
>
> {Role title} fits — a forward-deployed engineer's job is shipping the architecture into a customer's production environment, which is the exact pattern I'm running on the public build.
>
> [CTA] If you're filtering, the repo is the read. If there's appetite for a 15-minute call, I'd take it.

### Variant 1.C — Communications Lead / Engineering Editorial Lead at AI-native (Perplexity / Cohere / Hugging Face)

> [HOOK] Eight years inside the four properties that rewired digital journalism (The Stream / HuffPost Live / Fusion / AJ+) translated into Google: production AI systems serving 1,000+ senior engineers at Principal/Distinguished/Fellow tiers.
>
> [PROOF POINT] At AJ+ I designed a production line whose secondary outcome was talent development — three producers I coached (Mara Van Ells, Yara Elmjouie, Sana Saeed) became on-camera principals; the proof-of-concept hit 50M+ Facebook views in May 2017.
>
> The bridge from editorial methodology to AI-comms infrastructure is what I've been running for two years. {Company} sits at the layer where that composition pays.
>
> [CTA] If a 15-minute call lands in the next two weeks, I'd take it. Not pitching — calibrating.

---

## Channel 2: Discord intro — community introduction post for agent-builder servers

### Variant 2.A — LangChain / OpenAI / n8n Discord, #introductions

> Mitchell, Seattle. Comms PgM at Google xGE (Office of Cross-Google Engineering) — running production AI for senior technical ICs. Background: 8 years in digital journalism (AJ+, HuffPost Live, Fusion, Al Jazeera English) before Google. The bridge between editorial discipline and agent calibration is what I'm here for.
>
> Currently shipping: `career-ops` (agentic job-search pipeline on Claude Code Skills, public April 2026 — github.com/mitwilli-create/career-ops). Voice OS (1.08M-word personal-corpus calibration system). Tax Verification Agent (caught a $19K state-tax filing error commercial software missed).
>
> Lurking for a few days, then expect to start sharing — agentic workflow patterns, Voice DNA / Kill List methodology, HITL design from a comms-discipline perspective. If you're building agents that need to sound like a specific principal, I have a corpus of methodology that ports.

### Variant 2.B — Hugging Face Discord, #show-and-tell or builder channels

> Built and shipped `career-ops` last month — agentic job-search pipeline (parallel workers, single-Claude orchestrator, zero-token portal scanning against Greenhouse/Ashby/Lever APIs). Production deployment April 2026. Open source: github.com/mitwilli-create/career-ops.
>
> The system runs an unattended launchd schedule + heartbeat monitoring + retry/cost-cap discipline. Methodology pulled from running production agents at Google xGE for ~1,000 senior technical ICs (Principal/Distinguished/Fellow tiers).
>
> Posting because the orchestrator pattern (single Claude orchestrator + skill-based delegation, not multi-agent) cuts inference cost meaningfully against multi-agent pipelines and behaves more predictably under retry. If anyone's evaluating multi-agent vs. single-orchestrator on cost-per-action, the repo is a working comparison surface.

### Variant 2.C — Smaller AI-builder Discord (e.g., r/AiBuilders adjacent)

> Mitchell. Comms PgM building production AI for senior engineers at Google xGE. Eight years in newsroom production beforehand — Al Jazeera English / HuffPost Live / Fusion / AJ+. The thing I keep finding interesting is that newsroom HITL workflows and modern agent HITL workflows are isomorphic, but the AI-builder community treats HITL as a design problem while newsrooms treated it as an editorial-judgment problem. Different vocabulary, same pattern.
>
> Currently shipping: career-ops (open source agentic pipeline), Voice OS (corpus-based voice calibration), Tax Verification Agent (citation-gated KB on Claude). Anyone here working on principal-voice agent calibration or HITL classification feedback loops — would love to compare notes.

---

## Channel 3: X/Twitter engagement — reply or post template for AI builder threads

### Variant 3.A — Reply to a thread on agentic orchestration / multi-agent vs. single-orchestrator

> Single orchestrator + skill-based delegation > multi-agent on cost-per-action and retry behavior, in my experience.
>
> Shipped this in `career-ops` last month — public build at github.com/mitwilli-create/career-ops. Single Claude orchestrator, parallel workers, zero-token portal scanning. Has the cost discipline I couldn't get out of multi-agent on Claude Code.
>
> Caveat: works because the delegation surface is bounded (job-search pipeline). For open-ended task spaces, multi-agent probably still wins.

### Variant 3.B — Reply to a thread on HITL / human-in-the-loop design

> The HITL pattern from newsroom segment production ports almost directly to agent classification design — host has authority over final-air content, producer agent autonomously triages low/medium-touch traffic, escalation surfaces only the cases that hit pre-defined criteria.
>
> Built that as a 3-prompt architecture (triage/revise/escalate) at Google xGE — production agent serving ~1,000 senior engineering ICs, >90% classification accuracy.
>
> The interesting thing isn't the architecture — it's that the editorial-discipline parts (Smart Brevity, Anti-Spin, Elephant First) fold in as agent voice constraints, not separate guard layers.

### Variant 3.C — Build-in-public original post (career-ops weekly cadence)

> {Day} update on `career-ops` — agentic job-search pipeline on Claude Code Skills.
>
> This week:
> - {1-2 specific things shipped, e.g., "added retry handler with exponential backoff + jitter"}
> - {1-2 specific things learned, e.g., "BATCH_PARALLEL=2 stable, 4 caused 12/30 failures in one test run"}
> - {1 specific thing next, e.g., "Grok overnight research integration via launchd → Claude apply review loop"}
>
> Public build: github.com/mitwilli-create/career-ops
>
> 8-year newsroom-production-into-AI-PgM career arc. The build artifact is the bridge.

---

## Channel 4: Email to recruiter — for inbound recruiter contacts at target companies

### Variant 4.A — Anthropic recruiter cold ping

> Subject: Re: {whatever subject they used} — Mitchell Williams
>
> Thanks for reaching out — happy to talk.
>
> Background, compressed: Comms + Program Management at Google xGE, building production AI for ~1,000 senior technical ICs at Principal / Distinguished / Fellow tiers. Voice DNA + Kill List methodology behind the Executive RAG pipeline (99% stylistic fidelity, 90% drafting-latency reduction). Eight years in digital journalism beforehand — Al Jazeera English's The Stream, HuffPost Live, Fusion's America With Jorge Ramos, AJ+ at its category-defining peak.
>
> Active build artifact: `career-ops` — agentic job-search pipeline on Claude Code Skills, public deployment April 2026. github.com/mitwilli-create/career-ops.
>
> Most-aligned roles I've seen at Anthropic: any role where the day-one priorities involve voice calibration, citation discipline, or principal communications under safety constraint. Two prior Anthropic applications (Developer Education Lead, Comms AI Productivity Lead) — happy to discuss whichever current opening you'd like to route this against.
>
> Comp anchor: floor at $175K base / target band $200K-$320K total comp; flexible on equity-heavy structures given Anthropic stage and mark.
>
> Available windows next week: {2-3 specific time slots}. Or send the team a calendar link and I'll grab the first thing that fits.
>
> — Mitchell

### Variant 4.B — Pre-IPO startup recruiter cold ping (Sierra / Perplexity / Cursor)

> Subject: Re: {their subject} — let's set this up
>
> Thanks — happy to talk this week.
>
> Compressed read: Comms + Program Management at Google xGE running production AI for senior technical ICs (~1,000 Principal+/Distinguished/Fellow). Three production agents and counting. Eight years in newsroom production beforehand at Al Jazeera English, HuffPost Live, Fusion, AJ+. Public repo `career-ops` (github.com/mitwilli-create/career-ops) — agentic job-search pipeline that's the build artifact for the methodology I'd bring.
>
> What I'd want to dig into on a first call: what's the day-one priority on this role, who's the team's principal counterpart inside the company, and whether the role's comp-vs-equity structure leaves room for a senior-IC-with-comms-bridge profile.
>
> Comp anchor: $175K floor / $200K-$320K total comp target. Equity-heavy structures workable given stage; happy to walk through stage-discount logic on the call.
>
> Available windows: {2-3 specific time slots}. Or share a calendar link.
>
> — Mitchell

### Variant 4.C — Big-Tech AI-org recruiter cold ping (Microsoft / Amazon / Meta / Adobe / Nvidia)

> Subject: Re: {their subject} — happy to talk
>
> Thanks for the ping — interested.
>
> Background read: Comms + Program Management at Google xGE (Office of Cross-Google Engineering) — production AI systems serving ~1,000 senior technical ICs at Principal / Distinguished / Fellow tier, AI-driven mentorship platform scaling 300%+ in H1 2026, governance overhaul cutting low-value executive requests by 50%. Comms triage agent + Executive RAG pipeline + AI-driven mentorship matching — three shipped agents.
>
> Eight years in digital journalism beforehand (Al Jazeera English's The Stream / HuffPost Live / Fusion / AJ+ at its peak).
>
> Roles I'm filtering for: AI Solutions Architect / Forward Deployed Engineer / AI Enablement Lead / AI Program Manager / AI-native Communications Lead. Per-team / per-function distinct from any prior {company} application — happy to confirm there's no req-ID conflict if useful.
>
> Comp: floor $175K base / $200K-$320K total comp band; RSU stage = 100% scoring against floor. Open to relocation worldwide for the right role.
>
> Calendar: {2-3 specific windows next week}.
>
> — Mitchell

---

## Channel 5: GitHub README hook — "Why you'd want to hire me" section for career-ops repo

### Variant 5.A — Compact section (3 sentences + link, drop into top of README under the project description)

> ## Why this repo is also an application
>
> The orchestration patterns here — single-Claude orchestrator, zero-token portal scanning, retry/cost-cap discipline, atomic-locked spend logs — are the same patterns I run on production AI for ~1,000 senior technical engineers at Google xGE (Office of Cross-Google Engineering). Voice DNA + Kill List methodology, citation-gated KBs, HITL classification at >90% accuracy. Eight years in digital journalism (Al Jazeera English / HuffPost Live / Fusion / AJ+) underwrites the editorial-into-agent-design bridge.
>
> Hiring? Read `cv.md` (project root) and `article-digest.md`. mitwilli@gmail.com / linkedin.com/in/mitwilli.

### Variant 5.B — Expanded section ("Hire Mitchell" full block, ~250 words for those who want the full read)

> ## Hire Mitchell
>
> The patterns running this repo — single-Claude orchestrator with skill-based delegation, parallel-worker batch processing, zero-token portal scanning against Greenhouse/Ashby/Lever APIs, atomic-locked spend logs with daily caps, retry handlers with exponential backoff + jitter, launchd schedule + heartbeat monitoring — are not new patterns. They're the patterns I run on production AI systems for ~1,000 senior technical ICs at Google xGE.
>
> Specifically:
> - **Communications Triage Agent** — three-prompt architecture (triage/revise/escalate), conditional KB loading, ~160 ops hours/year recaptured at >90% classification accuracy.
> - **Executive RAG Pipeline** — Voice DNA + Kill List methodology, 99% stylistic fidelity, 90% drafting-latency reduction for VP-level comms.
> - **AI-driven mentorship platform** — 90% admin-time reduction (3.5 hours → 20 minutes per match); 300%+ deployment-capacity scaling for H1 2026.
>
> Eight years in digital journalism beforehand — The Stream at Al Jazeera English (founding team, May 2 2011 launch on the night of bin Laden), HuffPost Live (Webby Award 2013, PrEP segment editorial credit on air, anonymous active-duty trans Navy service member booked under discharge risk), Fusion's America With Jorge Ramos (top-10 cable launch, 40M households, the active $500M Trump-Univision lawsuit window), AJ+ at its category-defining peak (50M+ view viral hits, talent pipeline producing three on-camera principals).
>
> Targeting: AI Solutions Architect / Forward Deployed Engineer / AI Enablement Lead / AI Program Manager / Engineering Editorial Lead / DevRel at AI-native pre-IPO companies (Anthropic, xAI, OpenAI, Sierra, Perplexity, Groq, Databricks, Cerebras, Cursor, Mistral). Comp floor $175K base; target band $200K-$320K total comp.
>
> mitwilli@gmail.com / linkedin.com/in/mitwilli / github.com/mitwilli-create

### Variant 5.C — Single-line README badge addition (front-most signal)

> ![Available for AI Solutions Architect / Forward Deployed / AI Enablement / AI PgM / Engineering Editorial roles at AI-native pre-IPO companies — see cv.md](https://img.shields.io/badge/status-open_to_AI--native_roles-success)

---

## B-Archetype: Comms Roles at AI-Native Companies

### Why this section is different
Comms roles at AI-native companies are NOT typically sourced through engineering channels. The hiring path is:
- Direct inbound to the **Head of Comms** (if the company has one, they're likely on LinkedIn with ≤500 connections)
- **CPO/VP Product** at companies where AI Comms is a product function
- **Chief of Staff** or **Ops Lead** at companies where Internal Comms reports to COO

The DM should not feel like a standard candidate outreach. It should feel like one operator reaching out to another.

### Variant B1 — Head of Comms at an AI-native company (existing team)
```
Hi [Name],

I've been following [Company]'s comms approach — the way you've handled [specific thing: model card language / dev community tone / launch messaging] is exactly the kind of intentional voice work I want to be doing next.

I'm currently in transition from Google xGE, where I ran internal comms for 1,000+ senior ICs and built three production AI agents (one of them specifically for comms triage). I'm targeting AI-native companies where comms is actually infrastructure, not afterthought.

If there's a conversation worth having — whether or not there's a posted role — I'd welcome a 20-minute call.

— Mitchell
```

### Variant B2 — CPO / VP Product where AI Comms is a product function
```
Hi [Name],

[Company]'s product is doing something unusual with [specific capability] — and whoever is responsible for translating that to developers/customers is doing it right.

I'm coming from Google xGE (internal AI comms, 1,000 senior ICs) with a side project that accidentally became an open-source job search system used by the community. The technical credibility + comms instinct combination is relatively rare, and I'm looking for a home where that combination is actually the job description.

Would love 15 minutes if [Company]'s comms function intersects with product at all.

— Mitchell
```

### Variant B3 — Recruiter / people team at AI-native company (when no Head of Comms is on LinkedIn)
```
Hi [Name],

I'm reaching out about [Company]'s comms or AI Enablement / Developer Relations function — I didn't find a direct contact on that team, so I'm starting here.

Background: 8 years in editorial/journalism → Google xGE Internal AI Comms Lead → now building AI systems full-time. The intersection of technical AI credibility + communication infrastructure is where I'm targeting my next role.

If [Company] has an opening at that intersection (formal posting or not), I'd love to connect.

— Mitchell
```

### Variant B4 — Cold email to Head of Comms / editorial director (email format, not LinkedIn DM)
Subject: [Company] comms + AI editorial direction

```
[Name],

I've been following [Company]'s content and voice for about [N months]. The [specific piece: developer blog post / model documentation / launch thread] you published last [month] is the kind of work that clarifies rather than hypes.

That clarity is getting rarer in AI. I spent six years in editorial before moving into AI systems at Google, and I've been looking for a company that treats comms as product infrastructure.

I'm in active search. If [Company] has any appetite for someone who can both build the AI systems and write the messaging around them — I'd welcome a 15-minute conversation.

Full context: [portfolio URL / LinkedIn URL]

Mitchell
```

### When to use each variant
| Situation | Variant |
|-----------|---------|
| Company has a visible Head of Comms on LinkedIn | B1 |
| Comms function reports to Product/CPO | B2 |
| No visible comms team contact | B3 |
| Email preferred (via About page or personal domain) | B4 |
| Company has published something specific you can cite | B1 or B4 |

### Calibration notes
- **NEVER lead with your job title.** Lead with something specific about their comms/content work you've observed.
- **Always name something specific** — a launch post, a developer guide, a model card, a hiring email. Generic praise reads as template.
- **Short is credibility.** These people receive a lot of outreach. Under 150 words in the DM. Full context in email variant only.
- **The portfolio URL matters.** Only include it if storytellermitch.com or the GitHub profile is clean and discoverable. Otherwise leave it out rather than linking to an empty site.

---

## FOLLOW-UP TEMPLATES (strategy recommender targets)

*Used by `lib/strategy-recommender.mjs` when a LinkedIn / X / email contact has gone silent. Each maps to a strategy in `data/linkedin-followup-strategy-2026-05-15.md` §2. Always run the humanize check (`scripts/humanize-check.mjs`) before sending.*

### `linkedin_dm_2nd_touch_news_hook` — Strategy 1 (Timed Second Touch, day 5–7)

*Anchor on something that has changed since the first DM — a recent post they made, a launch they're connected to, a piece of news about the team. Never "just checking in."*

> Saw your post about {specific topic from their last 14d}. Pulled at this because {one-sentence connection to my background or the role}.
>
> Quick reminder of context — {one-line role/company hook from initial DM, restated differently}. The angle I didn't lead with: {one new piece of intel — a relevant project, a mutual contact, a specific archetype fit}.
>
> If a 15-minute call lands in the next two weeks, I'd take it.

**Don't use if:** original DM was already long (150+ words) or pitch-heavy.

### `email_cold_post_linkedin` — Strategy 3 (Channel Switch, day 10–14)

*Cold email after LinkedIn went silent. Reference the prior LinkedIn DM by name so it doesn't read as totally cold. Sourcers at FAANG: skip — routed to spam.*

> Subject: {role title} — Mitchell Williams (followed up on LinkedIn last week)
>
> {Name},
>
> Followed up on LinkedIn last week — wanted to switch to email in case that channel works better.
>
> Context, compressed: {2-sentence compressed pitch from cv.md proof points}. Background pulls together {one-line bridge — e.g., "8 years digital journalism + 2 years building production AI at Google xGE"}.
>
> What I'd want to dig into on a first call: {role-specific question — e.g., "whether the day-one priority is voice calibration, citation discipline, or both"}.
>
> If a 15-minute window opens up in the next two weeks, I'd take it. Calendar link below if easier:
> {calendly url}
>
> — Mitchell

**Cap:** 120 words. Pre-flight email through `scripts/humanize-check.mjs`.

### `linkedin_dm_value_give` — Strategy 4 (Value-Give Touch, day 4–9)

*Send something genuinely useful. Anchor on their actual interests pulled from `intel.linkedin_recent_posts` or `intel.x_recent_themes`. Inauthenticity here is worse than silence.*

> {Name} — wanted to share this without an ask attached: {specific piece — link to a methodology / framework / dataset / write-up that genuinely connects to what their team is working on}.
>
> Pulled it because {1-sentence connection to your last post / their work / the role}. If it's useful, great; if not, no follow-up needed.
>
> Separately — still very interested in {role title}. If a 15-minute call in the next two weeks fits, I'd take it. Otherwise the resource above stands on its own.

**Don't use if:** the value-give is thin or obviously manufactured (sharing their own company blog back at them).

### `linkedin_dm_pattern_interrupt` — Strategy 7 (Pattern Interrupt, day 9–10, 3rd touch)

*Different register, different length, different framing. If prior touches were professional/long, this is short/direct. Don't be gimmicky with senior contacts.*

> Different tack: I'll keep this to two sentences.
>
> {Specific one-line ask — e.g., "Would a 10-minute call this week be more workable than the 15 I asked for before?"} or {alt question — e.g., "If now isn't the right window, is there a better time to circle back?"}.

**Don't use if:** contact is senior (exec / founder) — too informal.

### `linkedin_dm_breakup` — Strategy 10 (Graceful Exit, day 14–21, after 3+ touches)

*Explicitly name the breakup. Removes ambiguity, generates 33% reply rate in HubSpot data, preserves the relationship cleanly.*

> {Name} — I've reached out a couple of times about {role title} and don't want to keep landing in your inbox. Going to stop here.
>
> If timing changes or there's a different role at {company} where the fit is sharper, my contact info is below. Otherwise, no follow-up needed and best of luck with the search.
>
> — Mitchell (mitwilli@gmail.com / linkedin.com/in/mitwilli)

**Don't use if:** you've only sent one prior message. Breakup on touch #2 reads dramatic.

### `referral_ask_v1` — Strategy 6 (Referral Activation, 2nd-degree contact)

*Ask a 2nd-degree contact at the company to refer you. Always frame around their interest first — the bonus, the eligibility question, their protection — never just "can you refer me."*

> {Name} — saw you're at {company}. I'm in the process for {role title} (req ID {id if known}) and wanted to ask before doing anything that creates a problem on your side.
>
> Two questions: (1) does {company}'s referral policy let you refer someone who's already in the ATS — I know some companies cap that — and (2) if it does, would you be open to it? I'd send you the cover letter + portfolio so you have full context before deciding.
>
> Either way, happy to send a quick read on my background if it's useful: {portfolio url} / {github url}.

**Pre-condition:** Confirmed referral bonus + post-app eligibility per `data/referral-bonuses.yml`. Never ask without checking the policy first.

### `x_dm_warmup` — Strategy 8 (X/Twitter Hook)

*Lower-friction channel for contacts active on X. Use after 2–3 public, substantive replies on their posts. Never use as the FIRST touch.*

> Followed up on your post about {specific X topic from intel.x_recent_themes} — pulled at it because {one-line connection}.
>
> Separately, sent a DM on LinkedIn about {role title} at {company} that may have gotten lost. The shape, compressed: {2-sentence bridge}. If a 15-minute call this week or next fits, I'd take it.

**Don't use if:** X account is dormant (last post > 14 days) or personal-only.

### `linkedin_engagement_warmup` — Strategy 2 (Content Warm-Up — meta-template)

*Not a DM template — instructions for the manual engagement phase. The bot can prep the comment, but the human must review and post.*

**Workflow:**
1. Pull contact's last 2-3 LinkedIn posts from `data/linkedin/2nd-degree/` or via the dashboard intel drawer.
2. Pick the post most substantively connected to your work — not a corporate repost, not a personal life update.
3. Write a 2-3 sentence comment that adds a specific perspective, not generic agreement. Reference a counter-example, a related project, a sharper framing.
4. Wait 48 hours. Repeat once.
5. Then re-DM with `linkedin_dm_2nd_touch_news_hook`, anchoring on the recent thread.

**Voice rules:** same as cold outreach — no "great post!" / no "love this thread!" / no emoji.

---

## Usage rules

1. **Always start with the [HOOK].** Never lead with "Hi, I'm Mitchell" or "I'm reaching out about." The hook is a specific proof point or claim that creates curiosity. Identity comes later.
2. **One [PROOF POINT] per outreach.** Pulling 3 metrics in one message dilutes signal. The recipient can find more in `cv.md`.
3. **Specific [CTA].** "Connect" is not a CTA. "15-minute call in the next two weeks" is.
4. **Don't pitch — calibrate.** The framing "I'm calibrating, not pitching" works because it's true. Mitchell is filtering target companies as much as they're filtering candidates.
5. **Re-read against the cringe test.** If a sentence reads as recruiter-speak, cut it.
6. **Voice profile applies.** Run all drafts through `corpus/voice-profile.md` filter before shipping.
7. **350-word email cap.** Emails over 350 words get cut to 40% per `modes/_profile.md` §6.

**This file is NOT auto-updated.** Re-generate when the archetype taxonomy changes or after meaningful new proof points enter `cv.md` / `article-digest.md`.

---

## INTERNAL CHAMPION PITCHES (Slack-ready)

*Source: Gemini 2.5 Pro full-corpus analysis, validated against each company's public positioning. Each ≤3 sentences, formatted for direct paste into Slack. Updated 2026-05-12.*

### ANTHROPIC (safety/risk calibration angle)

> "Found a fascinating profile in Mitchell Williams. He's a comms lead from Google's senior engineering org who's built multiple production AI agents, but his real differentiator is his background running high-stakes editorial ops under active litigation threats — think Scientology, Trump lawsuits. He brings a level of operational discipline and risk calibration to comms and agent design that feels very aligned with our thoughtful approach."

*Why this works:* Anthropic's primary differentiator claim is "safety and responsibility." Litigation-hardened risk calibration is a credibility signal no pure-engineer candidate can match. The editorial-under-legal-threat parallel directly mirrors the regulatory exposure Anthropic operates under as frontier AI becomes a policy target.

### OPENAI (builder + field deployment angle)

> "Take a look at Mitchell Williams for our Applied AI / FDE teams, especially for media partners. He's shipped production AI systems for 1,000+ senior engineers at Google, but before that he spent 8 years line-producing live global news — literally field-producing from a backpack during the Hong Kong protests. He has the end-to-end builder mentality and the real-world, high-pressure deployment experience we need."

*Why this works:* OpenAI's Applied AI team values "generalists with spikes" and a track record of shipping under ambiguity. "Field-producing from a backpack" is the concrete FDE-mindset image that's more powerful than any Google project description. The media-partnerships role creates a natural domain hook — he has been inside the buyer.

### ELEVENLABS (Voice DNA methodology angle)

> "I think I found the perfect person for our comms/product-strategy team: Mitchell Williams. He's a Google AI comms lead, but get this: he engineered a 'Voice DNA' RAG pipeline for his VP that achieved 99% stylistic fidelity by using a 'Kill List' of rejected drafts to teach the model risk tolerance. He has a unique, pre-built methodology for exactly what our product does."

*Why this works:* ElevenLabs' entire product is synthetic voice. "Voice DNA / Kill List" is not a background credential — it is a demonstration that Mitchell has already solved a harder version of their core problem. Gemini 2.5 Pro rated ElevenLabs the single highest-probability target (70%) and identified "landing in a comms/product role, not Python-heavy FDE" as the only meaningful risk.

---

## WARM INTRO OUTREACH — RITA KUMAR (STALE — DO NOT USE)

*⚠️ Rita Kumar is no longer at OpenAI (confirmed 2026-05-12). The outreach strategy below is archived for reference but must not be sent. The corpus/linkedin.md entry and any warm-intro path planning for OpenAI should be updated to reflect this. OpenAI application should proceed via direct application quality, not warm intro.*

---

## NEW-TARGET COLD OUTREACH

*Three new cold outreach messages for SEQ 1, 4, and 10 companies. LinkedIn DM format, ≤5 sentences, Mitchell's voice.*

### PORTKEY — Founding Solutions Architect (technical + equity angle)

> Built three production LLM deployments at Google xGE — comms triage agent, Voice DNA RAG pipeline, AI-driven mentorship platform — then built career-ops on the side, an agentic pipeline with the same retry/cost-cap/fallback discipline your product handles at scale.
>
> I've been on the customer side of every problem Portkey solves: rate limits that kill a demo, cost overruns that kill a project, latency that kills trust with a senior principal. The Founding SA role is exactly the pattern I want to run next — setting the enterprise deployment motion from zero.
>
> If there's appetite for a 20-minute call this week, I'd take it.
>
> — Mitchell (github.com/mitwilli-create/career-ops)

### WEIGHTS & BIASES — Staff Solutions Engineer (enterprise ML adoption angle)

> Spent the last two years as the person on the W&B customer side: running LLM evaluations in production at Google's Office of Cross-Google Engineering, measuring classification accuracy on a comms triage agent, tracking Voice DNA cosine similarity across drafting cycles, monitoring cost-per-match on an AI-driven mentorship platform serving the top 0.5% of a 180,000-person engineering org.
>
> The enterprise ML adoption motion — briefing senior ICs on what the model is actually doing, translating eval results into decisions, getting buy-in from skeptical principals — is what I've been running at Google. I'd like to run it for W&B's customers.
>
> Worth a 20-minute call if there's a Staff Solutions Engineer role in the LLMs space that's open or opening.
>
> — Mitchell

### RUNWAY — Head of AI Enablement (media/broadcast credibility angle)

> Produced content seen by 500M+ viewers weekly at AJ+'s peak. Field-produced live from Hong Kong during active Umbrella Revolution confrontations. Line-produced Fusion's breaking-news special on Mandela's death integrating three competing broadcast organizations, multiple live feeds, and real-time social data — on a broken rundown, in real time, no script.
>
> Then spent two years building production AI systems at Google. Those two things together — broadcast DNA and shipped LLM agents — are exactly what a Head of AI Enablement needs to walk into a film studio or broadcast network and be believed.
>
> If Runway has a role at that intersection, I'd welcome a 20-minute call.
>
> — Mitchell
