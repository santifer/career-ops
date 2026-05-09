# StorytellerMitch.com — Merged Uplevel Strategy (Greenlight Draft)

**Generated:** 2026-05-09
**Synthesized from:** `data/portfolio-strategy-2026-05-09.md` + `data/portfolio-site-strategy-2026-05-09.md` (two parallel research passes, same day, complementary findings — no major disagreements)
**Status:** Plan-only. No live-site changes until APPROVED.
**Source files used:** `cv.md`, `article-digest.md`, `writing-samples/voice-reference.md`, `modes/_profile.md`, `config/profile.yml`, `corpus/voice-profile.md`, `data/storytellermitch-rewrites-2026-05-09.md`, `data/storytellermitch-audit-2026-05-07.md`, `data/portfolio-networking-plan.md`, `data/industry-impact-document.md`, `corpus/research/perplexity-*` (4 files)
**Live research:** 2 parallel passes against the 2026-indexed public web (Grok / Perplexity surfaces auth-walled; substituted with WebSearch over the same question set, cross-validated against source material). Full source list in Appendix A.

---

## Executive Summary

The site today reads as a traditional media-comms portfolio with a 13-year tenure narrative and an Arizona-to-Okinawa-to-NYC bio that does not surface a single AI signal, build artifact, or measurable outcome. A recruiter at Anthropic, OpenAI, xAI, Perplexity, Substack, Axios, or The Atlantic landing here from `cv.md` would see a wrong-persona match for the roles I'm targeting. The fix is a positioning rebuild, not a redesign: lead with **AI Builder × Communications Lead** (a hybrid the market is paying $400K–$1.2M base for in 2026 per Fortune / Storytelling Edge), anchor every Select Works entry to a metric, surface GitHub and `career-ops` as first-class proof, and ship complete SEO metadata for all seven pages. My eight-year live-broadcast spine becomes the credibility engine for editorial judgment under pressure — not a separate identity.

This document specifies the architecture, copy, metadata, and voice calibration for a greenlight-ready uplevel — **five quick wins unlock most of the impact in under 60 minutes**, and the full rebuild is a ~5.5-hour Squarespace session staged for a single greenlight. Every decision needing my input is flagged.

---

## Cross-Validated Findings

| Finding | Confidence | Source corroboration |
|---|---|---|
| Production proof beats credentials at AI-native hires | HIGH | dataexec.io 2026; Anthropic explicitly tells candidates: "If you have done interesting independent research, written an insightful blog post, or made substantial contributions to open-source software, put that at the TOP of your resume." |
| AI-flooded content elevates the premium for distinctive human voice | HIGH | Storytelling Edge; greenmo.space 2026 — "human editorial judgment applied strategically to AI tools, not someone who can prompt better" |
| AI editorial / comms roles paying $400K–$1.2M base in 2026 (config target $200K–$320K is conservative for B-tier AI-native) | HIGH | Fortune; Storytelling Edge; Anthropic JDs (Editorial AI for Science / Editorial Economics & Policy Lead) |
| Non-PhD Anthropic hires universally have strong public portfolios | HIGH | Let's Data Science 2026 — gap is *quality* of portfolio, not existence |
| 30-second credibility test for portfolios is the binding constraint | HIGH | Multiple 2026 portfolio-format sources |
| Squarespace SEO 2026: 50–60 char titles, 150–160 char descriptions, schema markup, intent over keywords, E-E-A-T | HIGH | Tiffany Davidson; Square Theory 42; Swipe Up; Squarespace Help |
| Recruiters open repositories before resumes when GitHub is linked from header | HIGH | markaicode.com 2026 |
| Mobile-first is mandatory; >50% of recruiter traffic is mobile | HIGH | Multiple 2026 sources |
| Concentration > coverage on social (2 platforms > 6) | HIGH | Digital Applied 2026; aligns with `data/portfolio-networking-plan.md` LinkedIn + X cadence |
| Posts with explicit CTAs see 20–30% more engagement; personalized CTAs convert ~202% better than generic | HIGH | Lucky Orange; Venture Harbour; HubSpot 2026 |
| JSON-LD `Person` schema + AI-crawler allowlist (GPTBot/Claude-Web/Perplexity-Scraper) is increasingly load-bearing for AI-answer-engine visibility | MEDIUM | Digidop 2026; Adobe Business 2026 — adopt because cost is low and AI-answer-engine layer IS the target audience |
| Avoid password-protected sites; recruiters lose access flow | HIGH | Multiple 2026 portfolio sources |

**No major disagreements between research streams.** Source material wins ties: my proof point bank in `article-digest.md` is denser and more specific than anything on the public web, and `corpus/voice-profile.md` is more authoritative for register decisions than any general "personal brand" guide.

**Highest-value gap (acknowledged):** Public-web 2026 content for *non-engineering* AI-lab roles (comms, editorial, content strategy) is sparse. Most "how to break into AI" content targets ML / research engineers. A real Grok session over X / Reddit on this specific question would be a v1.1 polish — not a v1 blocker.

---

## Section 1 — Site Architecture

### Current state (inferred from May 7 audit + May 9 sessions)
- Site title: "Mitchell Williams: Shaping Narratives from Google to Global Newsrooms" (likely still in place)
- 7 pages exist; **0 of 7 have complete SEO metadata** (41% SEO score)
- Visible pages: **Home**, **Info** (About), **Select Works**, **Endorsements** (3 Google colleagues, all comms-framed)
- Three additional pages exist but unverified — likely **Contact**, **Resume/CV**, **Blog or Footer/legal**

### Proposed 7-page architecture

| # | Page | Action | Nav order | Why |
|---|------|--------|-----------|-----|
| 1 | **Home** | Rebuild hero + below-fold | 1 | Above-the-fold positioning; 30-second credibility test |
| 2 | **About** | Rename from "Info"; rebuild bio | 2 | "Info" reads as boilerplate; "About" is the standard |
| 3 | **Build** *(NEW)* | Add | 3 | **Single biggest gap** — AI-builder identity is currently invisible. Without this page the bio rewrite alone won't shift positioning. |
| 4 | **Select Works** | Keep + reorder | 4 | Already strong from `data/storytellermitch-rewrites-2026-05-09.md`. Move from 2nd to 4th nav slot so AI work leads. |
| 5 | **Writing** *(NEW)* | Add | 5 | Anchors the *editorial* half of the hybrid; one-page link index, not a publisher |
| 6 | **Contact** | Rebuild as recruiter ramp | 6 | Convert to "what I'm targeting + how to reach me + what I need from you" |
| 7 | **Resume / CV** | One-click PDF link | Footer or under About | Don't waste a top-nav slot, but recruiters want one click |

### Top nav (recommended)
`Home · About · Build · Select Works · Writing · Contact`

Six items. Meets the standard recruiter scan budget without crowding.

### Removed
- **Endorsements as a standalone page.** Three Google comms-framed quotes work *against* the AI Builder positioning. Move them inline on About / Build (one quote per page, AI-aligned where possible) and quietly retire the page. Decision blocker → Open Question Q2.
- **"Echoing across the digital expanse" / Arizona-to-Okinawa-to-NYC life-journey framing** — does not advance any role I'm targeting; actively dilutes signal.
- **Generic "13+ years of excellence" language** — replaced by specific metrics throughout.

---

## Section 2 — Homepage Narrative (above-the-fold)

### Hero structure (top to bottom)
1. Name + role line (one tight string, replaces site title)
2. One-sentence positioning statement (the 30-second credibility test)
3. Three proof anchors (one AI build, one editorial benchmark, one building-in-public artifact)
4. Primary CTA (one button, one purpose)
5. Secondary contact rail (email, LinkedIn, GitHub)

### Hero copy — paste-ready

> # Mitchell Williams
> ### AI Builder × Communications Lead @ Google xGE
>
> I build production AI systems for the 1,000+ Principal, Distinguished, and Fellow engineers inside Google's cross-engineering org — and before that I spent eight years at the four properties that rewired live television. The discipline is the same in both rooms: identify what matters, build the structure that gets it out, and measure what happened.
>
> ---
>
> **Production AI at scale** — Communications Triage Agent serving ~1,000 senior ICs, ~160 ops hours/year recaptured at >90% classification accuracy. Executive RAG pipeline ("Voice DNA" + "Kill List") at 99% stylistic fidelity / 90% drafting-latency reduction.
>
> **Editorial at scale** — Founding-team AP on Al Jazeera English's *The Stream* (250M-household global launch, May 2, 2011). Senior Producer at AJ+ during the 50M-view viral era. Line Producer on Fusion's *America With Jorge Ramos* during the 179% primetime growth window.
>
> **Building in public** — [career-ops](https://github.com/mitwilli-create/career-ops): an agentic job-search pipeline with parallel workers, zero-token portal scanning, and unattended launchd scheduling.
>
> ---
>
> **Targeting AI Solutions Architect, Forward Deployed Engineer, AI Enablement, and Engineering Editorial roles at AI-native companies.**
>
> [**Hire me →**](mailto:mitwilli@gmail.com?subject=Role%20at%20{Company}%20—%20Mitchell%20Williams) · [GitHub](https://github.com/mitwilli-create) · [LinkedIn](https://linkedin.com/in/mitwilli)

### Below-the-fold (single scroll)
- **3-card "Build" preview** — Comms Triage Agent / Voice DNA / career-ops, each a thumbnail + 1-line metric, link to /build
- **3-card "Work" preview** — Bin Laden launch, PrEP credit, Hurricane Maria
- **Footer-anchored** — `github.com/mitwilli-create · linkedin.com/in/mitwilli · mitwilli@gmail.com`

### What NOT to put on Home
- Long-form bio (lives on About)
- Endorsement carousels
- Generic stock photography
- "Welcome to my site" or any greeting-only copy
- A blog feed

### Why this works
- First noun in the role line is "AI Builder," not "Communications Specialist" — the trade I'm being hired for
- Three proof anchors map to the three archetypes I score in `modes/_profile.md` §1: A2 (AI builder), B (comms/editorial), and a building-in-public artifact
- Pre-filled subject template puts the recruiter one step into a usable email; the `{Company}` placeholder is a deliberate friction marker — recruiters fill it in within 2 seconds and the resulting email lands with a subject I can grep
- The multiplication symbol "×" does work that "and" doesn't — signals composition, not coexistence
- Survives the 40% compression test — every line carries a named artifact or named source

---

## Section 3 — About Page

### Structure (top to bottom)
1. **Page title** — "About" (replaces "Info")
2. **Subtitle** — `AI Builder · Communications Lead · Former Live Television Producer`
3. **Lede paragraph** — the 60-second elevator (paste-ready below)
4. **Three-section narrative** — "What I do now" / "What I did before" / "The through line"
5. **Currently building** — `career-ops` callout with working link
6. **Inline proof callouts** — 1–2 quoted on-air credits as block quotes with timestamps
7. **What I'm currently targeting** — 3-line list (Tier A2 / Tier B / Tier A1)
8. **Single endorsement** — if a Google colleague rewrites in AI-aligned framing per Q2
9. **Single CTA at bottom** — "Hiring for AI Solutions Architect, Forward Deployed, AI Enablement, or Engineering Editorial — I'm at mitwilli@gmail.com."

### Lede paragraph — paste-ready (passes compression test)

> I bridge two things that rarely share a résumé: production AI systems and live-broadcast journalism. At Google's Office of Cross-Google Engineering I build and run the communications infrastructure for 1,000+ senior engineers — Principal, Distinguished, Fellow tier. Before Google I spent eight years at the properties that rewired live television: founding-team AP on Al Jazeera English's *The Stream*; segment producer at HuffPost Live during its Webby-winning peak; line producer on Fusion's *America With Jorge Ramos* during the 179% primetime-growth window; senior producer at AJ+ at the 50M-view top of its category-defining era. The work I do now and the work I did then look different on the page. They run on the same instinct: identify what matters before the algorithm confirms it, build the structure that gets it out, and measure what happened.

### Body source
The "What I do now" section can substantially **reuse the v2 rewrite body in `data/storytellermitch-rewrites-2026-05-09.md` lines 76–86** — it's already in voice and metric-led. Two small edits:
- Trim "These are not prototypes. They are in production." → "These are in production, not prototypes."
- Move the `career-ops` mention into a dedicated "Currently Building" callout with a working link

### Voice constraints (enforce on this page specifically)
- First person throughout. No third-person ("Mitchell did X")
- Hard 350-word cap on the entire bio (lede + 3 sections combined)
- One specific-warmth marker per major section (named host, named guest, on-air timestamp). Generic warmth ("I love what I do") is the tell.
- Lead each section with the point — no "born under the endless blue skies" preambles

---

## Section 4 — Select Works

The heavy lift is already done in `data/storytellermitch-rewrites-2026-05-09.md` — 11 metric-led entries with verbatim on-air credits and downstream-impact callouts. Strategy here is order, framing additions, and what to add beyond the rewrites doc.

### Recommended order (top to bottom)

| # | Piece | Lead metric (bolded one-liner above the body) |
|---|-------|--------------------------------------|
| 1 | **AJ+ — Hurricane Maria / Carmen Yulín Cruz (Sept 2017)** | **1.3M views. Active storm. Federal advocacy contributing to the congressional FEMA investigation.** |
| 2 | **AJE / The Stream — Bin Laden Night Launch (May 2, 2011)** | **250M households. Eight social platforms integrated live. RTS Most Innovative Programme (2012).** |
| 3 | **AJ+ — Measles Outbreaks USA (2017)** | **50M views on Facebook. Two minutes. One editorial position.** |
| 4 | **Fusion — Mandela Breaking News Special (Dec 5, 2013)** | **44-minute primetime broadcast. Three-way ABC/Univision/Fusion integration on a rebuilt rundown.** |
| 5 | **HuffPost Live — PrEP/Truvada Panel (Nov 8, 2012)** | **Six months ahead of mainstream coverage. Host credited me on tape: "who brought this to our attention."** |
| 6 | **HuffPost Live — Trans Military Panel (Sept 25, 2012)** | **Four years before the 2016 Pentagon policy reversal.** |
| 7 | **HuffPost Live — Jazz / Trans Youth (April 2, 2013)** | **58-minute live episode. Two years before TLC's *I Am Jazz*.** |
| 8 | **Fusion — Netanyahu Exclusive / Umbrella Revolution (Oct 7, 2014)** | **Four international live locations in 43 minutes.** |
| 9 | **HuffPost Live — Bahrain / Maryam Al-Khawaja (Nov–Dec 2012)** | **Foreign Policy #48 Global Thinker. Integrated AJE *Shouting in the Dark* footage live.** |
| 10 | **HuffPost Live — Sarah Michelle Gellar (June 5, 2013)** | **Pertussis vaccination campaign anchored to celebrity premiere.** |
| 11 | **AJ+ — How the Media Fails / Amy Goodman (2017)** | **3.8M Facebook views. Democracy Now's Amy Goodman naming the structural mechanism.** |

Optional / second-row visibility: collapse #8–11 behind a "Show more" expand if the page feels dense.

### Section structure for each entry (already in rewrites doc — keep)
- Title with platform + month/year
- **One bolded metric** at top (lead-with-the-point signature) — *new*
- 2–3 sentence editorial-decision paragraph
- Verbatim on-air credit pulled out as blockquote where it exists
- `[On-air credit:]`, `[Downstream:]`, `[Source:]` metadata strip below the body

### What to ADD beyond the existing rewrites
- **GitHub bridge at the top of Select Works**: "I think of these video segments and my AI-builder work the same way — both are systems-under-pressure artifacts. Here's the AI-builder side ↓ [career-ops repo embed]." Bridges Select Works to Build.
- **Vimeo play counts** for the archive copies once analytics access is restored (rewrites doc flag #1)
- **One AI-native endorsement quote** at the top, sourced from a Google xGE colleague who actually used the Comms Triage Agent or Voice DNA. Without it, AI-builder claims rest entirely on my own framing. Decision blocker → Q6.

### What NOT to do
- Do not embed Vimeo plays as the *primary* metric — they are mirror-archive plays, not canonical engagement
- Do not list segment counts, episode counts, or year-range padding
- Do not include any clip I cannot substantiate against `article-digest.md` Video Portfolio sections

---

## Section 5 — Build Page (NEW — highest-leverage addition)

This page does not currently exist. Adding it is the single highest-leverage change in this entire strategy because it surfaces the AI-builder identity that the current site hides.

### Page header
**Build**
*Production AI systems, public artifacts, methodologies in use.*

### Three first-class artifacts (full cards)

#### 1. Communications Triage Agent (Google xGE)
- **Hero metric:** ~160 operational hours/year recaptured at >90% classification accuracy across ~1,000 senior technical ICs (Principal/Distinguished/Fellow tier).
- **Architecture:** Three-prompt routing (triage / revise / escalate), conditional KB loading, single-Gemini-agent design — not multi-agent.
- **What it teaches:** Single-orchestrator + skill-based delegation beats multi-agent on cost-per-action and retry behavior in bounded task spaces.
- **Status:** In production. Internal-only build, code not public.
- **Link target:** Public spec gated by Q3. If no spec, ship as written artifact with `[contact for spec]`.

#### 2. Executive RAG Pipeline / Voice DNA + Kill List (Google xGE)
- **Hero metric:** 99% stylistic fidelity, 90% drafting-latency reduction.
- **Methodology:** Curated Voice DNA corpus + restricted Kill List of rejected drafts as negative training. Risk-tolerance encoded structurally, not via instruction.
- **What it teaches:** **Negative-training corpus is the load-bearing innovation, not the positive corpus.** Most agent voice work treats principal corpus as the only training signal — Kill List is the differentiator.
- **Why it matters here:** Methodology-flavored, not just product-flavored. Editorial-discipline-as-agent-constraint is the bridge I'm selling. **Highest-ceiling artifact for AI editorial / comms hires.**
- **Status:** In production. Internal-only.

#### 3. career-ops (open source — public)
- **Hero metric:** Production deployment April 2026; agentic job-search pipeline with parallel workers, zero-token portal scanning (Greenhouse / Ashby / Lever direct API), unattended launchd schedule, daily cost caps.
- **Architecture:** Single Claude orchestrator with skill-based delegation across pipeline stages. Node.js / Playwright / YAML.
- **What it teaches:** The build artifact is the application — open-source pipeline that runs my own job search.
- **Link:** [github.com/mitwilli-create/career-ops](https://github.com/mitwilli-create/career-ops) — embed README first paragraph + live commit-count badge if Squarespace allows.

### Two secondary artifacts (single-line each, with link)
- **Voice OS** — 1.08M-word personal corpus → six voice signatures + AI-detection risk surfacing → calibration data for any agent in my voice. Methodology public via [`corpus/voice-profile.md`](https://github.com/mitwilli-create/career-ops/blob/main/corpus/voice-profile.md).
- **Tax Verification Agent** — caught a ~$19K state-tax filing error commercial software missed; citation-gated four-layer KB on Claude.

### Page footer CTA
> If you're building agents at scale — internal AI enablement, applied AI, forward deployed — this is the work I'd bring on day one. **mitwilli@gmail.com**.

### What NOT to do
- Do not screencap code blocks as images (kills SEO + accessibility)
- Do not embed half-finished demos. If the artifact isn't shippable, leave it off the page.
- Do not list "AI tools I use" — signals consumer, not builder
- Do not lead with "Passionate about AI." Lead with the build.

---

## Section 6 — Writing Page (NEW, lightweight)

A one-page index. Anchors the *editorial* half of the hybrid for any recruiter reading from the editorial / content / comms direction (Anthropic Editorial AI for Science, Editorial Economics & Policy Lead, Communications Manager Research; Substack editorial; Axios Smart Brevity adjacent; Atlantic AI vertical).

### Sections
1. **Methodology notes** — Voice DNA + Kill List explainer (link to Build); Smart Brevity / Anti-Spin / Elephant First as agent constraints; Voice OS methodology summary.
2. **Featured essay** — the Industry Impact one-pager (`data/industry-impact-document.md`) reformatted as a proper essay with byline + date stamp. Argues a thesis; doesn't summarize career.
3. **Build-in-public series** — link archive (LinkedIn + X cross-post per `data/portfolio-networking-plan.md` weekly Wednesday cadence). Earns its keep once 3–4 posts exist.
4. **Public writing (if any clears the editorial bar)** — published essays / op-eds / longer-form posts. Decision blocker → Q4 (`corpus/bylines/` not yet read).
5. **Voice corpus excerpt** — *one* representative paragraph from `writing-samples/voice-reference.md` as a stylistic anchor for any recruiter wondering "does this person actually write this way." Keep it short.

### Constraints
- **Lowest-density of the seven pages.** White space + 4–5 link blocks. Do not bulk it up.
- 200-word total cap.
- Recommended publishing cadence (off-site, link from here): **1 essay every 6–8 weeks**, drafted from real-time work, never speculative. Frequency without depth is worse than frequency at all.

---

## Section 7 — Contact / CTA

### Goal
Convert a recruiter-arrival into a 24-hour-resolution event. They either hear from me or have everything they need to make a yes/no call without writing.

### Page structure

**Header:** *Hiring for an AI builder, comms lead, or editorial hybrid?*
**Subhead:** Email is the fastest path to a real conversation. I read every recruiter email myself.

#### Block 1 — What I'm targeting
> **Tier A2 — primary:** AI Solutions Architect · Forward Deployed Engineer · Applied AI Engineer · AI Enablement Lead · AI / Technical Program Manager (AI-native)
> **Tier B — equivalent priority:** Communications Manager (AI-native) · Developer Education Lead · Engineering Editorial Lead · Communications Manager, Research · Internal Communications, Policy
> **Tier A1 — adjacent:** Residencies / Fellowships at AI-native or AI-policy orgs (Anthropic Societal Impacts, OpenAI Residency, Tarbell, IAPS Horizon, Berkman Klein)

#### Block 2 — How to reach me (no form; direct lines)
> [**mitwilli@gmail.com**](mailto:mitwilli@gmail.com?subject=Role%20at%20{Company}%20—%20Mitchell%20Williams) — pre-filled subject template ready
>
> [**linkedin.com/in/mitwilli**](https://linkedin.com/in/mitwilli) — for DM with role link attached
>
> [**github.com/mitwilli-create**](https://github.com/mitwilli-create) — to see the code

No form by default. Forms add friction and route through Squarespace's spam queue. Direct email + LinkedIn convert better. *Optional fallback*: 3-field form (name / email / one sentence) below the direct lines if I want a non-mailto path.

#### Block 3 — What helps me move fast on your end
> **If you're a recruiter:** include the team / reporting line / location flexibility / comp band in the first message. I will respond within 24 hours.
> **If you're a hiring manager:** I'm happy to skip the recruiter screen if mutually preferred. The Build page has the artifacts; the CV is one click away.
> **If you're a builder peer:** DMs open on LinkedIn. The career-ops repo has issues open.

#### Block 4 — Geographic / availability
> Currently in Seattle. Open to Chicago, Dallas, NYC, Portland, SF, Mexico City, Cuenca, Medellín, London, Dublin, Glasgow, Berlin, Lisbon, Porto, Madrid, Barcelona, Bilbao, San Sebastián, Chiang Mai, Chiang Rai. US citizen — no US sponsorship needed; international roles handled per local work-auth pathway.

(Pulls from `config/profile.yml` `compensation.location_flexibility`. Verify city list matches current preference set before publishing.)

### CTA hierarchy across the site
| Page | Primary CTA |
|---|---|
| Home | "See the build" → /build |
| About | "Reach me" → /contact |
| Build | mailto:mitwilli@gmail.com (no intermediary) |
| Select Works | "See what I'm building now" → /build |
| Writing | "Reach me" → /contact |
| Contact | None needed — the page IS the CTA |

### Removals
- No "I'd love to hear from you" / "feel free to reach out" / "let's grab coffee"
- No social-icon row (Twitter/X, Instagram) — fragments the CTA. Surface in site footer if at all.

---

## Section 8 — SEO Metadata (page-by-page + site-wide)

### Site-wide settings
- **Site title:** `Mitchell Williams — AI Builder × Communications Lead @ Google xGE`
- **SEO title format:** `%s — Mitchell Williams` *(already set per May 9 audit)*
- **OG default title:** `Mitchell Williams — AI Builder × Communications Lead`
- **OG default description:** `Eight years of live-broadcast production. Three years shipping production AI at Google. One portfolio.`
- **OG default image:** missing — see Q5
- **robots.txt:** Allow GPTBot, Claude-Web, Perplexity-Scraper, PerplexityBot. I *want* to be cited by AI search engines — that's exactly the audience surfacing me to AI hiring managers.
- **Sitemap:** Squarespace generates automatically; verify submitted to Google Search Console + Bing Webmaster.

### Page-by-page

| Page | Title tag (≤60 chars) | Meta description (≤160 chars) |
|------|-----------------------|--------------------------------|
| **Home** | `Mitchell Williams — AI Builder × Comms Lead @ Google xGE` (57) | `Production AI for 1,000+ senior Google engineers. Former AJ+ / HuffPost Live / Fusion / Al Jazeera. Targeting AI Solutions Architect, FDE, Comms roles.` (155) |
| **About** | `About — Mitchell Williams` (25) | `Eight years at the properties that rewired live TV — Stream, HuffPost Live, Fusion, AJ+ — now building production AI for senior engineers at Google xGE.` (157) |
| **Build** | `Build — Production AI Systems & Open Source` (44) | `Communications Triage Agent (~160 hrs/yr recaptured), Executive RAG / Voice DNA (99% fidelity), career-ops open-source agentic pipeline.` (139) |
| **Select Works** | `Select Works — Live Broadcast Portfolio` (40) | `On-tape editorial credits: HuffPost Live PrEP panel, Fusion Mandela primetime special, AJ+ Hurricane Maria, AJE The Stream Bin Laden launch.` (143) |
| **Writing** | `Writing — Methodology & Public Notes` (36) | `Voice DNA + Kill List methodology. Smart Brevity / Anti-Spin / Elephant First as agent constraints. Build-in-public archive.` (123) |
| **Contact** | `Contact — Mitchell Williams` (27) | `Hiring for an AI builder, comms lead, or editorial hybrid? Email is fastest. mitwilli@gmail.com — read by me. Targeting AI Solutions Architect / FDE / etc.` (159) |
| **Resume / CV** | `Resume — Mitchell Williams` (26) | `One-click PDF download. Eight years AJ+ / HuffPost Live / Fusion / Al Jazeera, then production AI at Google xGE. Anthropic AI Fluency / Claude / MCP certs.` (160) |

### JSON-LD `Person` schema (paste-ready, inject into Squarespace site header)

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Mitchell Williams",
  "jobTitle": "Internal Communications Lead, Program Manager",
  "worksFor": { "@type": "Organization", "name": "Google" },
  "alumniOf": [
    { "@type": "Organization", "name": "Al Jazeera English" },
    { "@type": "Organization", "name": "AJ+" },
    { "@type": "Organization", "name": "HuffPost Live" },
    { "@type": "Organization", "name": "Fusion (ABC News / Univision)" },
    { "@type": "Organization", "name": "Indiana University Bloomington" }
  ],
  "url": "https://thestorytellermitch.com",
  "sameAs": [
    "https://linkedin.com/in/mitwilli",
    "https://github.com/mitwilli-create"
  ],
  "email": "mitwilli@gmail.com"
}
</script>
```

### Keywords to weave into body copy (not stuffed)
`AI Solutions Architect` · `Forward Deployed Engineer` · `Applied AI Engineer` · `AI Enablement Lead` · `Engineering Editorial Lead` · `Developer Education` · `Communications Manager Research` · `LLM orchestration` · `agentic pipelines` · `RAG` · `MCP` · `Claude Code` · `Voice DNA` · `Smart Brevity`

### What NOT to do
- Do not stuff keywords. Modern E-E-A-T penalizes density without substance.
- Do not use "I'm passionate about" / "thought leader" / "results-driven" / "synergy"
- Do not let Squarespace auto-fill descriptions from page text. Override every page.

---

## Section 9 — Voice and Tone Calibration

### Hard rules (paste these into Squarespace style notes)
1. **Lead with the point.** No "born under the endless blue skies" preambles. No "passionate about." No "I'd like to share."
2. **Banned phrases (non-negotiable):** leverage (verb), delve, synergy, utilize, deep dive, circle back (as filler), bandwidth (for availability), ping (for contact), "I hope this email finds you well," "please don't hesitate to reach out," "thought leader," "results-driven."
3. **Use contractions as warmth signals.** "I've," "I'm," "don't," "that's." Stripping contractions to seem formal is exactly what reads as machine-produced. *Exception: hero positioning line gets full formal weight.*
4. **Specific warmth, not generic.** "The host thanked me by name on air" — not "I had the privilege of working with great teams."
5. **Sentence length variance.** Mix 5–8 word sentences with 18–25 word sentences. Uniform 15-word sentences read as templated. (Voice corpus shows long-clauses-for-setup → short-sentences-for-landing pattern; reference Bin Laden Night paragraph in current rewrites.)
6. **Numbers, not adjectives.** "1,000+ senior engineers" not "many senior engineers." "50M views" not "incredible reach."
7. **Pronouns:** First person on all pages. Never third-person.
8. **Spelling note:** "yeah" not "yea" if any informal voice surfaces.
9. **No emojis on the public-facing site.**
10. **Compression test:** every page survives a 40% cut without losing what makes it mine.

### Tone per page
| Page | Audience | Register |
|---|---|---|
| Home | Recruiter / hiring manager skim. 8 seconds. | Confident, declarative, metric-heavy |
| Build | Engineering lead / AI-curious recruiter | Technical-but-accessible. Architecture sentences must read as written by someone who shipped the thing. |
| Select Works | Comms / content / editorial hiring manager | Editorial. Lead with the editorial decision, not the production credit. |
| About | Hiring manager who liked the homepage | Narrative-but-tight. Don't repeat the homepage — extend it. |
| Writing | Same as About + writing-sample seekers | Voice-forward, opinion-bearing |
| Resume / Contact | Anyone | Transactional. No prose. Just the path forward. |

### Hard word-count caps
| Surface | Cap |
|---|---|
| Home hero | 80 words |
| Home below-fold copy total | ≤300 words |
| About lede | 60 words |
| About body total (lede + 3 sections) | ≤350 words |
| Build page intro | 40 words |
| Build per-artifact summary | 60 words |
| Select Works per-piece | 80–100 words |
| Writing page total | ≤200 words |
| Contact page total | ≤200 words |

### One-voice mandate
The voice has to be one voice across both technical and editorial audiences, **not code-switched**. Per 2026 research: Big Tech is paying a premium for professionals who can cut through the noise *because* AI-flooded content has commodified generic voice. My editorial register is the differentiator — do not soften it for the technical audience.

---

## Section 10 — Content Strategy (on-site vs. off-site)

### On the site (concentration)
- Static positioning copy (Home, About, Contact)
- Build artifacts and methodology summaries (Build)
- Curated portfolio with editorial credits (Select Works)
- Thin index of writing/methodology pointers (Writing)
- 1 long-form essay on Writing: Industry Impact one-pager — argues a thesis, not a summary

### Off the site (linked from Writing)
- **Build-in-public posts** — LinkedIn + X cross-post weekly Wednesday cadence (per `data/portfolio-networking-plan.md`)
- **Long-form essays (>2,000 words)** — Substack or Medium IF I commit to ≥1 essay every 6–8 weeks
- **Open-source artifacts** — `github.com/mitwilli-create/career-ops` + future repos
- **Conference talks / podcast appearances** — link back as they accumulate

### Why no blog ON the site
Squarespace blogs decay fast without weekly cadence. The portfolio-networking plan already commits me to one weekly post on LinkedIn + X. Forking energy to a third surface dilutes both. **The Writing page is a pointer, not a publisher.**

### Cadence
- **Distribution platforms:** 1 high-effort post/week (LinkedIn + X cross-post)
- **Site itself:** quarterly review (March / June / September / December). Add a "Last reviewed: [date]" footer line that's actually accurate.
- **Concentration > coverage:** two platforms (LinkedIn + X) > six. Don't open Threads, Bluesky, Mastodon, YouTube unless one becomes the natural distribution channel for a specific artifact.

### What does NOT belong on the site
- A blog with stale dates. If most recent post is >90 days old, kill the section.
- A "thoughts" or "musings" section with no clear editorial position
- Tutorial content
- A "podcast appearances" or "speaking" section with <3 entries (single talk = footer line, not section)

---

## Section 11 — Quick Wins (5 changes, ~60 min total, ship-safe before full greenlight)

| # | Change | Effort | Impact |
|---|--------|--------|--------|
| 1 | **Update site title** to `Mitchell Williams — AI Builder × Communications Lead @ Google xGE` (Squarespace site settings → Site title) | 5 min | First thing in browser tab + LinkedIn/X share preview. Currently signals wrong persona. |
| 2 | **Replace Home hero copy** with §2 hero block | 15 min | Above-the-fold positioning shifts from generic comms specialist → AI-builder-with-journalism-foundation. |
| 3 | **Rename "Info" → "About"** + replace About page subtitle to `AI Builder · Communications Lead · Former Live Television Producer` | 5 min | Industry-standard nomenclature. Removes "looks unfinished" tell. |
| 4 | **Add `github.com/mitwilli-create` link** to site-wide footer + Home hero | 10 min | Highest-signal current artifact (career-ops + AI repos) is invisible from the site today. |
| 5 | **Set page-level meta descriptions** for Home, About, Select Works using §8 table | 25 min | Closes 41% SEO score gap most efficiently — three pages get to ~85%. |

**Total: ~60 minutes. Safe to ship before full strategy is greenlit.**

---

## Section 12 — Implementation Sequence (when greenlit)

| Phase | Work | Time |
|-------|------|------|
| **0** | Quick wins (Section 11) — ship-safe standalone | 60 min |
| **1** | Page rebuilds in priority order: Home (45) → About (30) → Build NEW (60) → Select Works reorder + bolded leads (30) → Contact NEW (30) → Writing NEW (20) → Resume one PDF link (10) | 3 hr 45 min |
| **2** | SEO metadata pass — all 7 pages per §8 table | 30 min |
| **3** | Schema.org JSON-LD + robots.txt updates (requires Squarespace code injection access) | 30 min |
| **4** | Site-wide nav reorder + retire Endorsements page (or fold one AI-aligned quote into About per Q2) | 15 min |
| **5** | Final QA pass — desktop + mobile, share preview tests on LinkedIn / X, page speed check | 30 min |

**Total: ~5.5 hours focused Squarespace work.** Stageable across 2 evenings or 1 long Saturday.

---

## Open Questions (need my input before implementation — consolidated, deduped)

| Q | Question | Default if no answer |
|---|----------|----------------------|
| **Q1** | Confirm the actual 7-page list currently on the live site. Strategy assumes Home / Info / Select Works / Endorsements / Contact / Resume / one more. | Treat the inferred list as canonical; verify during implementation. |
| **Q2** | Endorsements page: ask any of the 3 Google colleagues to rewrite in AI-aligned framing (then place inline on About / Build), or retire all three? | Retire the page; surface no quotes. |
| **Q3** | Comms Triage Agent — is there a public-facing repo or spec safe to link without IP exposure? | Link to written summary only with `[contact for spec]` CTA. |
| **Q4** | Writing page — ship now with just the Industry Impact essay (recommended), or hold until 2 essays exist? | Ship with the Industry Impact piece, framed as the inaugural essay. |
| **Q5** | Journalism-era public bylines for the Writing page — are any in `corpus/bylines/` worth surfacing? | Leave Writing page thin (methodology + build-in-public series only). |
| **Q6** | Endorsement quote from a Google xGE colleague who actually used Comms Triage Agent or Voice DNA — who do I ask, what specifically? | Ship Build / Select Works without it for v1; add as v1.1 within two weeks. |
| **Q7** | Calendar link on Contact (Cal.com / SavvyCal) — yes or no? Increases conversion meaningfully but exposes live availability publicly. | No. Mediate via email first. |
| **Q8** | OG image — do I have one or do we create? Options: (a) typographic on dark, ships today; (b) Canva custom ~30 min; (c) high-res still from verified video credit (Hong Kong, Hurricane Maria, Stream launch). | (a) for v1, (c) for v1.1. |
| **Q9** | Domain — keep `thestorytellermitch.com` or move to `mitchellwilliams.ai` / `mitwilli.com`? Current domain references the *old* identity. | Keep the domain; pour positioning work into the site. Re-evaluate at quarterly review. |
| **Q10** | Comp transparency on Contact — list a comp range / floor as a recruiter filter, or omit? Profile target $200K–$320K / floor $175K / Seattle floor $180K. | Omit; comp comes up in the first recruiter call. |
| **Q11** | Anything password-protected? May 7 audit's 401 was likely a bot block, not intentional auth. | Fully public. |
| **Q12** | Real Grok / Perplexity sessions on the non-engineering AI-lab portfolio question — run them as v1.1 polish before final implementation? | No, optional. Strategy in this doc is strong enough to greenlight without it. |

---

## Appendix A — Research Sources

**Anthropic / OpenAI / hiring-signals:**
- [Fortune — Big Tech is shelling out up to $1M for new hires who never write code](https://fortune.com/article/big-tech-million-dollar-communications-jobs-ai-anthropic-openai-netflix/)
- [Storytelling Edge — Why OpenAI Is Offering $400K for Storytelling Roles](https://storytellingedge.substack.com/p/why-openai-and-anthropic-are-paying)
- [Anthropic — Editorial, AI for Science (JD)](https://job-boards.greenhouse.io/anthropic/jobs/4966474008)
- [Anthropic — Editorial, Economics & Policy Lead (JD)](https://job-boards.greenhouse.io/anthropic/jobs/4966476008)
- [Anthropic Candidate AI Guidance](https://www.anthropic.com/candidate-ai-guidance)
- [Fast Company — AI startup Anthropic is betting on a human editorial team](https://www.fastcompany.com/91385491/ai-startup-anthropic-is-betting-on-a-human-editorial-team)
- [Let's Data Science — How to Land a Job at OpenAI/Anthropic/DeepMind](https://letsdatascience.com/blog/how-to-land-a-job-at-openai-anthropic-or-google-deepmind)
- [DataExec — Breaking Into AI in 2026: What Anthropic, OpenAI, and Meta Actually Hire For](https://dataexec.io/p/breaking-into-ai-in-2026-what-anthropic-openai-and-meta-actually-hire-for)
- [Aakash Gupta — How to Land a $500K AI PM Job at OpenAI (2026 Playbook)](https://aakashgupta.medium.com/how-to-land-a-500k-ai-pm-job-at-openai-the-2026-playbook-ae074fed5b54)

**Portfolio format / journalist portfolio examples 2026:**
- [Squarespace — Journalist Websites: How to and Examples (2026)](https://www.squarespace.com/blog/making-journalist-websites)
- [Site Builder Report — 20+ Well-Designed Journalist Portfolio Examples (2026)](https://www.sitebuilderreport.com/inspiration/journalist-portfolio-websites)
- [Authory — 20 Journalist Portfolio Examples](https://authory.com/examples/journalist-portfolio-examples)
- [Creative Lives in Progress — Portfolio format 2026](https://creativelivesinprogress.com/articles/portfolio-format-2026)

**SEO / structured data / Squarespace 2026:**
- [Digidop — Structured data: SEO and GEO optimization for AI in 2026](https://www.digidop.com/blog/structured-data-secret-weapon-seo)
- [Adobe Business — SEO in 2026: How AI is reshaping search](https://business.adobe.com/uk/blog/seo-in-2026-fundamentals)
- [Tiffany Davidson — Comprehensive 2026 SEO Checklist for Squarespace](https://www.tiffany-davidson.com/squarespace-seo-checklist)
- [Square Theory 42 — Squarespace SEO Checklist 2026](https://www.squaretheory42.com/blog/squarespace-seo-checklist-2026-rank-higher-on-google)
- [Swipe Up — Squarespace SEO Guide 2026](https://www.swipeupamsterdam.com/blog/squarespace-seo-complete-guide-2026)

**Journalism → AI transition narrative:**
- [Mediabistro — Media Industry Jobs in the AI Era (2026 Guide)](https://www.mediabistro.com/be-inspired/career-transition/media-industry-jobs-are-being-rewritten-this-is-the-new-list/)
- [Mediabistro — AI Editing and Global Media Roles 2026](https://www.mediabistro.com/get-hired/hot-jobs/ai-editing-and-global-media-roles-signal-new-career-paths-in-2026/)
- [Newmark J-School — News Leaders Chosen for AI Journalism Lab](https://www.journalism.cuny.edu/2025/01/23-news-leaders-chosen-for-ai-journalism-lab-leadership-cohort/)

**Audience engagement / recruiter outreach 2026:**
- [Digital Applied — Social Media Strategy Template 2026](https://www.digitalapplied.com/blog/social-media-strategy-template-2026-full-framework)
- [Martal — LinkedIn Statistics 2026](https://martal.ca/linkedin-statistics-lb/)
- [Reachinbox — Message Recruiters on LinkedIn 2026](https://reachinbox.ai/blog/how-to-message-recruiters-on-linkedin/)
- [HeroHunt — AI Outreach Sequences for Recruiting 2026](https://www.herohunt.ai/blog/ai-outreach-sequences-recruiting-2026-guide)
- [markaicode 2026 — Recruiters open repos before resumes](https://markaicode.com/)
- Lucky Orange / Venture Harbour / HubSpot 2026 — personalized CTA conversion data

---

**Strategy ready for greenlight. Reply APPROVED to begin implementation, starting with Section 11 (Quick Wins).**
