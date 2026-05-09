# StorytellerMitch.com — Uplevel Strategy (Greenlight Draft)

**Author:** Strategy synthesis pass, 2026-05-09
**For:** Mitchell Williams (mitwilli@gmail.com)
**Status:** Plan-only. No implementation until APPROVED.
**Source layers used:** `cv.md`, `article-digest.md`, `writing-samples/voice-reference.md`, `modes/_profile.md`, `config/profile.yml`, `data/storytellermitch-rewrites-2026-05-09.md`, `data/industry-impact-document.md`, `corpus/voice-profile.md`, plus 2026-dated web research (see Methodology Note).

---

## Executive Summary

My current site reads as a generalist comms portfolio with traditional-media tenure — the exact opposite of what the AI-native hiring market in May 2026 actually rewards. The fix is a positioning shift, not a redesign: lead the homepage with the AI-builder identity, anchor every Select Works entry to a metric the visitor can repeat to a colleague, expose the GitHub + career-ops repo as first-class proof, and ship complete SEO metadata for all seven pages. The proof points are already in `cv.md` and `article-digest.md`; the site is just under-leveraging them. This document specifies the architecture, copy, metadata, and voice calibration to ship a greenlight-ready uplevel — including the exact title tags, meta descriptions, hero copy, and About lede ready to paste — and flags every decision that needs my call before implementation.

---

## Methodology Note (Phase 2/3 Limitation)

The brief asked for direct deep-research queries through grok.com and perplexity.ai. Both products are auth-walled conversational interfaces that don't accept programmatic WebFetch calls without a session, so I substituted live WebSearch over the 2026 public web (sources cited inline) and WebFetch on specific 2026-dated articles that mapped to each Grok/Perplexity question. Where the public web is thin on direct AI-comms-portfolio guidance (most search results return engineering-track content), I weighted my own judgment against my source material in `cv.md`, `article-digest.md`, and the 2026-04-26 perplexity research files already in `corpus/research/`. Open question #5 below names which findings would benefit from a real Grok/Perplexity session before final implementation.

---

## Cross-Validated Findings (synthesis)

**High confidence (multiple 2026 sources agree):**
1. Production proof beats credentials. Anthropic explicitly tells candidates: "If you have done interesting independent research, written an insightful blog post, or made substantial contributions to open-source software, put that at the TOP of your resume." (dataexec.io, 2026)
2. Outcome-led case studies beat project lists. Hiring managers in 2026 scan for production signals — error handling, evaluation, deployment, structured thinking — not tutorial-level work.
3. AI-fluency + editorial judgment is the differentiator for comms/editorial roles at AI-native companies. The standout candidate "demonstrates human editorial judgment applied strategically to AI tools — not someone who can prompt better, but someone who can ensure AI amplifies quality at scale" (greenmo.space, 2026).
4. Squarespace SEO essentials in 2026: 50–60 char title tags, 150–160 char meta descriptions, unique per page, primary keyword + clear value prop, action-oriented language. (squarespace.com support; thesmcollective.com 2026 guide.)
5. Mobile-first is mandatory; >50% of recruiter traffic is mobile.

**Medium confidence (one strong source, plausible but not yet stress-tested):**
- Personalized CTAs convert ~202% better than generic ones (HubSpot data via lucky orange / venture harbour 2026 roundups).
- Recruiters open repositories before resumes when GitHub is linked from the resume header. (markaicode.com 2026.)

**Disagreements / gaps:**
- Public-web 2026 content for *non-engineering* roles at AI labs (comms, editorial, content strategy) is sparse. Most "how to break into AI" pieces target ML / research engineers. This is the highest-value gap to fill with a real Grok session over X/Reddit (see Open Question #5).
- No clean public benchmark on optimal Squarespace cover-letter / contact-page structure for B2B/recruiter audiences. I'm filling this from my voice profile (lead-with-the-point, low-friction, ask one question) plus general CTA best practices.

**Where my source material wins ties:**
- My proof point bank (`article-digest.md` #1, #2, #3, #17, #18) is denser and more specific than anything on the public web. Strategy weights these hard.
- My voice profile (`corpus/voice-profile.md`) is more authoritative for register decisions than any general "personal brand voice" guide. The site copy below all passes the 40% compression test.

---

## 1. Site Architecture

**Current presumed structure (7 pages per the audit):**
The previous session said "0 of 7 pages have complete SEO metadata," which implies these pages exist or will exist. I'm proposing the canonical set below; if the live site has different page names, the strategy stays — just remap.

**Proposed 7-page architecture (navigation order):**

| # | Page | Purpose | Status |
|---|------|---------|--------|
| 1 | **Home** | Above-the-fold positioning + 3 anchor proof points + primary CTA | Already exists; needs hero rewrite |
| 2 | **Builds** *(new)* | AI / agent work front and center: career-ops, Comms Triage Agent, Voice DNA, Voice OS, Tax Verification Agent | NEW — currently invisible on site |
| 3 | **Select Works** | Video portfolio with metric-led descriptions (already drafted in `data/storytellermitch-rewrites-2026-05-09.md`) | Partially live; needs all entries published |
| 4 | **About** | Long-form bio, narrative arc journalism → AI, hybrid positioning | Currently exists as "Info" — needs full rewrite |
| 5 | **Writing** *(optional but recommended)* | Industry Impact one-pager + 1–2 essays in my voice + link-outs to LinkedIn long-form | Optional — see Open Question #2 |
| 6 | **Resume / CV** | One-click PDF download of `cv.md` rendered through `templates/cv-template.html` | Should exist; verify download flow |
| 7 | **Contact** | One-purpose CTA: "Hiring for X — let's talk" with 3-field form + direct email + LinkedIn + GitHub | Currently exists; needs CTA rewrite |

**Architectural decisions:**

- **Add a Builds page** — currently the AI-builder identity is invisible. This is the single biggest signal failure; without a Builds page my site reads as a former producer applying to AI roles, not an AI builder with a journalism foundation. The Builds page does the heaviest lifting of the whole strategy.
- **Keep Select Works** as the second proof layer, not the first. The journalism work is differentiating only because it's paired with the AI work. Lead-with-AI, support-with-journalism — never the reverse.
- **Promote GitHub + career-ops** to a navigation-level callout (header link, repeated in footer), not buried inside a page. The repo is a working artifact and should function the same way "see code" links work on a research lab's site.
- **Rename "Info" to "About"** — "Info" is a Squarespace default that reads as unfinished. Industry-standard nomenclature is "About."
- **Make the Resume page a real PDF**, not just a list of credentials. One click → download `mitchell-williams-cv.pdf` (already generatable via `generate-pdf.mjs`). Recruiters want the file, not a webpage.

**Removals:**

- Drop the "echoing across the digital expanse" / Arizona-to-Okinawa-to-NYC life-journey framing entirely. It does not advance any role I'm targeting and it actively dilutes the signal.
- Drop generic "13+ years of excellence" language. Specific metrics replace adjectives.

---

## 2. Homepage Narrative (above-the-fold positioning)

**Hero structure (top of page, in this order):**

1. **Name + role line** (one tight string, replaces site title)
2. **One-sentence positioning statement** (the elevator pitch)
3. **Three proof anchors** (one AI build, one editorial benchmark, one current build-in-public artifact)
4. **Primary CTA** (one button, one purpose)
5. **Secondary contact rail** (email, LinkedIn, GitHub)

**Exact copy — paste-ready:**

> # Mitchell Williams
> ### AI Builder × Communications Lead @ Google xGE
>
> I build production AI systems for the 1,000+ Principal, Distinguished, and Fellow engineers inside Google's cross-engineering org — and before that I spent eight years at the four properties that rewired live television. The discipline is the same in both rooms: identify what matters, build the structure that gets it out, and measure what happened.
>
> ---
>
> **Production AI at scale** — Communications Triage Agent serving ~1,000 senior ICs, ~160 ops hours/year recaptured at >90% classification accuracy. Executive RAG pipeline ("Voice DNA" + "Kill List" methodology) hitting 99% stylistic fidelity at 90% drafting-latency reduction.
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

**Why this works:**

- The first noun in the role line is "AI Builder," not "Communications Specialist." That's the trade I'm being hired for.
- The three proof anchors map exactly to the three archetypes I score in `modes/_profile.md` §1: A2 (AI builder), B (comms/editorial), and a building-in-public artifact that demonstrates A2-AB instincts on a public surface.
- The CTA pre-fills a subject line — recruiters who click are already one step into a usable email. The Lucky Orange / Venture Harbour 2026 CTA research called this "personalized CTAs convert 202% better than generic ones." Even discounted, this is the cheapest improvement on the page.
- Compression test: this passes. Cut 40% and the meaning survives.

**Banned phrases I avoided** (per `corpus/voice-profile.md`): "leverage," "delve," "deep dive," "synergy," "circle back" (as filler), "I hope this email finds you well," "I'm passionate about." Spelling: "yeah" rule doesn't apply at this register but contractions ("I've," "I'm") are deliberate — they're warmth markers, not laziness.

---

## 3. About Page (recommended structure + lede)

**Structure (top to bottom):**

1. **Page title** — "About" (replaces "Info")
2. **Subtitle** — three-noun identity strip
3. **Lede paragraph** — the 60-second elevator version
4. **Three-section narrative**
   - "What I do now" — Google xGE specifics
   - "What I did before" — journalism arc (Stream → HuffPost Live → Fusion → AJ+)
   - "The through line" — the connection sentence (systems under pressure)
5. **Currently building** — career-ops + targeting line
6. **Contact rail**

**Subtitle (exact copy):**

> AI Builder · Communications Lead · Former Live Television Producer

**Lede paragraph (exact copy — passes the compression test):**

> I bridge two things that rarely share a résumé: production AI systems and live-broadcast journalism. At Google's cross-engineering org I build and run the communications infrastructure for 1,000+ senior engineers — Principal, Distinguished, Fellow tier. Before that I spent eight years at the properties that rewired live television: a founding-team AP at Al Jazeera English's *The Stream*, segment producer at HuffPost Live during its Webby-winning peak, line producer on Fusion's *America With Jorge Ramos* during the 179% primetime-growth window, and senior producer at AJ+ at the 50M-view top of its category-defining era. The work I do now and the work I did then look different on the page. They run on the same instinct: identify what matters before the algorithm confirms it, build the structure that gets it out, and measure what happened.

**The "What I do now" section** can substantially reuse the bio block already drafted in `data/storytellermitch-rewrites-2026-05-09.md` lines 76–86 — it's already in voice and already metric-led. Two small edits I'd make:

- Trim "These are not prototypes. They are in production." into one sentence: "These are in production, not prototypes." (Tighter, same meaning.)
- Move the career-ops mention into a dedicated "Currently Building" callout with a working link, rather than a closing paragraph.

**Voice notes for the About page specifically:**

- Use first-person throughout. Do *not* third-person ("Mitchell did X").
- Lead each section with the point. No "Born under the endless blue skies" preambles.
- Keep one specific-warmth marker per major section. Examples that work: "the host thanked me by name on air," "Mariana Atencio ran the broadcast solo," "the planned rundown was abandoned overnight." Generic warmth ("I love what I do") is the tell.
- 350-word cap on each section. The whole About page should run ~700–900 words top to bottom.

---

## 4. Select Works (which projects, how to frame, what to lead with)

**Good news:** the heavy lift is already done in `data/storytellermitch-rewrites-2026-05-09.md`. That file has 11 metric-led entries with verbatim on-air credits and downstream-impact callouts. The strategy here is which to prioritize, how to order them, and what to add.

**Recommended order (top to bottom on Select Works):**

1. **AJ+ — Hurricane Maria / Carmen Yulín Cruz (Sept 2017)** — *lead with this.* Field-produced under active storm conditions, primary-source verbatim quote on tape, 1.3M views, downstream policy impact (Puerto Rico death-toll revision 64 → 2,975). It's the strongest single demonstration of editorial judgment under pressure with public, measurable downstream consequence. **Lead metric:** "1.3M views, federal advocacy that contributed to the congressional FEMA investigation."
2. **AJE / The Stream — Bin Laden Night Launch (May 2, 2011)** — historical anchor + foundational pattern. **Lead metric:** "250M households. Eight social platforms integrated live. RTS Most Innovative Programme (2012)."
3. **AJ+ — Measles Outbreaks USA (2017)** — peak-viral proof. **Lead metric:** "50M views on Facebook. Two minutes. One editorial position."
4. **Fusion — Mandela Breaking News Special (Dec 5, 2013)** — multi-stakeholder coordination under live conditions. **Lead metric:** "44-minute primetime broadcast, three-way ABC/Univision/Fusion integration on a rebuilt rundown."
5. **HuffPost Live — PrEP/Truvada Panel (Nov 8, 2012)** — story origination, on-air credit by name. **Lead metric:** "Six months ahead of mainstream coverage. Host credited me on tape: 'who brought this to our attention.'"
6. **HuffPost Live — Trans Military Panel (Sept 25, 2012)** — four-year editorial lead time on Pentagon policy. **Lead metric:** "Four years before the 2016 Pentagon policy reversal."
7. **HuffPost Live — Jazz / Trans Youth (April 2, 2013)** — two-year lead on TLC's *I Am Jazz*. **Lead metric:** "58-minute live episode, two years before TLC's *I Am Jazz*."
8. **Fusion — Netanyahu Exclusive / Umbrella Revolution (Oct 7, 2014)** — distributed-system journalism. **Lead metric:** "Four international live locations in 43 minutes."
9. **HuffPost Live — Bahrain / Maryam Al-Khawaja (Nov–Dec 2012)** — editorial framing as the differentiator. **Lead metric:** "Foreign Policy #48 Global Thinker, integrated AJE *Shouting in the Dark* footage live."
10. **HuffPost Live — Sarah Michelle Gellar (June 5, 2013)** — second on-air credit, talent + editorial purpose pairing. **Lead metric:** "Pertussis vaccination campaign anchored to celebrity premiere."
11. **AJ+ — How the Media Fails / Amy Goodman (2017)** — editorial argument framing. **Lead metric:** "3.8M Facebook views, Democracy Now's Amy Goodman naming the structural mechanism."

**Section structure for each entry** (already implemented in the rewrites doc — keep):

- Title with platform + month/year
- 2–3 sentence editorial-decision paragraph (what made the segment matter)
- Verbatim on-air credit pulled out as blockquote where it exists
- `[On-air credit:]`, `[Downstream:]`, `[Source:]` metadata strip below the body

**What to ADD beyond the existing rewrites doc:**

- **GitHub embed at the top of Select Works**, with a short framing line: "I think of these video segments and my AI-builder work the same way — both are systems-under-pressure artifacts. Here's the AI-builder side ↓ [career-ops repo embed]." This bridges Select Works to Builds.
- **Vimeo play counts** for the archive copies once analytics access is restored (flagged in rewrites doc as `WHAT'S NEEDED BUT NOT YET SOURCEABLE` #1).
- **One AI-native endorsement quote** placed at the top of the Select Works page, sourced from a Google xGE colleague who actually used the Comms Triage Agent or Voice DNA. (Flagged in rewrites doc as #3.) Without this, the AI-builder claims rest entirely on my own framing. With it, the page gains third-party signal that maps to the editorial endorsements already on the site.

---

## 5. Builds Page (new — highest-impact addition)

This page does not currently exist on the site. Adding it is the single highest-leverage change in this entire strategy because it surfaces the AI-builder identity that the current site hides.

**Proposed structure:**

1. **Page title:** Builds
2. **Subtitle:** "Production AI systems and personal-corpus calibration tools."
3. **One-paragraph framing**
4. **Five build cards** (in order of strength)
5. **GitHub link rail at the bottom**

**Framing paragraph (exact copy):**

> Five projects. Three shipped at Google to ~1,000 senior engineers. Two shipped on my own time to scratch personal itches that turned into useful tools. All five run in production. None are demos.

**Build cards (one per project):**

**Card 1 — Communications Triage Agent (Google xGE)**
- One-line pitch: Autonomous triage / classify / resolve / escalate for inbound comms requests at scale.
- Architecture: Three-prompt routing (triage / revise / escalate) with conditional KB loading. Single-Gemini-agent design — not multi-agent.
- Result: ~160 ops hours/year recaptured at >90% classification accuracy across ~1,000 senior ICs (Principal, Distinguished, Fellow tier).
- Status: In production. Internal-only build, code not public.

**Card 2 — Executive RAG Pipeline (Voice DNA + Kill List)**
- One-line pitch: Digital twin for VP-level executive comms — fast enough to move with the cycle, faithful enough to ship without rewriting from scratch.
- Architecture: RAG pipeline with curated "Voice DNA" corpus + restricted "Kill List" of rejected drafts as negative training.
- Result: 90% drafting-latency reduction, 99% stylistic fidelity vs. baseline.
- Status: In production. Internal-only.

**Card 3 — career-ops (open source — public)**
- One-line pitch: Agentic job-search pipeline with parallel workers, zero-token portal scanning, unattended launchd scheduling.
- Architecture: Single Claude orchestrator with skill-based delegation across pipeline stages. Direct Greenhouse / Ashby / Lever API hits (no LLM tokens spent on portal scans).
- Result: Production deployment April 2026. Open source.
- Link: [github.com/mitwilli-create/career-ops](https://github.com/mitwilli-create/career-ops)

**Card 4 — Voice OS (personal corpus calibration)**
- One-line pitch: Self-portrait of my own writing voice from a ~1.08M-word personal corpus.
- Architecture: Multi-platform corpus ingestion (Gmail 2007–2026, Instagram, Facebook, LinkedIn, iMessage), six voice signatures, banned-phrase set, length / structure-density trajectories.
- Result: Surfaced that my professional emails grew 289 → 853 words across the trajectory, projecting to 1,000+ within 12 months. Length is the single biggest AI-detection risk under personal control. Output: agent-usable self-portrait that informed Voice DNA design at xGE.
- Status: Personal infrastructure. Methodology public via [`corpus/voice-profile.md`](https://github.com/mitwilli-create/career-ops/blob/main/corpus/voice-profile.md) on GitHub.

**Card 5 — Tax Verification Agent**
- One-line pitch: Personal tax-prep agent that cross-references federal return logic against state-specific deduction rules.
- Result: Caught a ~$19K state-tax filing error during 2025 returns — an edge case the commercial software missed.
- Status: Personal use. Demonstrates citation-gated four-layer KB pattern on Claude.

**Why this card structure works:**

Each card is one screen of mobile real estate, leads with a verb-noun pitch, names the architecture in one sentence, and lands on a number. That mirrors the build-card pattern that does well on AI-lab job-postings pages (Anthropic's own careers page, OpenAI's research-publications grid) — and it's the format hiring managers are already trained to scan.

**Banned move:** Do not lead with "Passionate about AI." Lead with the build.

---

## 6. Contact / CTA Strategy

**The principle:** one purpose per page. The Contact page has exactly one job — make it cheap and obvious for a recruiter to start a conversation.

**Page structure:**

1. **One-line directive headline** (replaces generic "Contact" or "Get In Touch")
2. **Three CTA options** in strict order of preference:
   - Direct email (preferred for recruiters)
   - LinkedIn DM
   - GitHub (for engineering-track outreach)
3. **One short form** as a fallback (3 fields max)
4. **Calendar link** if I'm running a recurring "office hours" pattern — flagged as Open Question #1
5. **What I'm targeting** (single line, restates the role types)

**Exact copy — paste-ready:**

> # Hiring for an AI builder, comms lead, or editorial hybrid?
>
> Email is the fastest path to a real conversation. I read every recruiter email myself.
>
> [**mitwilli@gmail.com**](mailto:mitwilli@gmail.com?subject=Role%20at%20{Company}%20—%20Mitchell%20Williams) — pre-filled subject template ready
>
> [**linkedin.com/in/mitwilli**](https://linkedin.com/in/mitwilli) — for DM with role link attached
>
> [**github.com/mitwilli-create**](https://github.com/mitwilli-create) — to see the code
>
> ---
>
> Or if a form is easier:
>
> *[Three-field form: Your name · Your email · One sentence — what's the role?]*
>
> *[Submit button: "Send"]*
>
> ---
>
> **Currently targeting:** AI Solutions Architect · Forward Deployed Engineer · Applied AI Engineer · AI Enablement Lead · AI Program Manager · Communications Manager (AI-native) · Engineering Editorial Lead.

**Why this structure:**

- **Direct email beats forms** for recruiter outreach because most recruiters compose in their own inbox already and forms break that flow. The form is fallback, not primary. The 2026 wpforms research said >50% of users abandon forms with >5 fields.
- **Pre-filled subject line** is the single highest-conversion CTA pattern. Personalized > generic by ~202% per HubSpot data. The `{Company}` placeholder is a deliberate friction marker — recruiters fill it in within 2 seconds, and the resulting email lands with a subject I can grep.
- **GitHub link in the contact rail** signals technical-track openness without me having to reframe the page for a different audience.
- **"What I'm targeting"** at the bottom is the disqualification filter. It saves me and the recruiter time when the role is wrong-shape.

**Removals:**

- No "I'd love to hear from you" / "feel free to reach out" / "let's grab coffee" phrasing. The voice profile bans these as filler.
- No social-icon row (Twitter/X, Instagram, etc.) — those audiences aren't the hiring audience and they fragment the CTA. If I want to surface social, do it in the footer of the whole site, not on the Contact page.

---

## 7. SEO Metadata — Exact Title Tags + Meta Descriptions for All 7 Pages

**Format rules (per Squarespace 2026 best practices):**

- Title tag: 50–60 characters, primary keyword + value, brand suffix.
- Meta description: 150–160 characters, action-oriented language, primary keyword, distinct per page.
- The site-wide title format is already set: `%s — Mitchell Williams`. So the `%s` portion is what I write below.

**Page 1 — Home**

- Title tag: `Mitchell Williams — AI Builder × Comms Lead @ Google xGE`
  *(57 chars)*
- Meta description: `Production AI for 1,000+ senior Google engineers. Former AJ+ / HuffPost Live / Fusion / Al Jazeera. Targeting AI Solutions Architect, FDE, Comms roles.`
  *(155 chars)*

**Page 2 — Builds**

- Title tag: `Builds — Mitchell Williams`
  *(26 chars — short by design; the brand suffix carries the rest)*
- Meta description: `Five production AI builds: Communications Triage Agent, Executive RAG (Voice DNA), career-ops, Voice OS, Tax Verification Agent. Architecture + results.`
  *(160 chars)*

**Page 3 — Select Works**

- Title tag: `Select Works — Mitchell Williams`
  *(32 chars)*
- Meta description: `Live-broadcast video portfolio: Hurricane Maria field interview (1.3M views), Bin Laden night launch (250M households), Mandela special, AJ+ measles 50M.`
  *(159 chars)*

**Page 4 — About**

- Title tag: `About — Mitchell Williams`
  *(25 chars)*
- Meta description: `Eight years at the properties that rewired live TV — Stream, HuffPost Live, Fusion, AJ+ — now building production AI for senior engineers at Google xGE.`
  *(157 chars)*

**Page 5 — Writing**

- Title tag: `Writing — Mitchell Williams`
  *(27 chars)*
- Meta description: `Industry Impact (2010–2018 infrastructure layer for live audience-driven content) plus essays on AI-builder + editorial discipline at AI-native companies.`
  *(160 chars)*

**Page 6 — Resume / CV**

- Title tag: `Resume — Mitchell Williams`
  *(26 chars)*
- Meta description: `One-click PDF download. Eight years AJ+ / HuffPost Live / Fusion / Al Jazeera, then production AI at Google xGE. Anthropic AI Fluency / Claude / MCP certs.`
  *(160 chars)*

**Page 7 — Contact**

- Title tag: `Contact — Mitchell Williams`
  *(27 chars)*
- Meta description: `Hiring for an AI builder, comms lead, or editorial hybrid? Email is fastest. mitwilli@gmail.com — read by me. Targeting AI Solutions Architect / FDE / etc.`
  *(159 chars)*

**Site-level metadata to confirm:**

- Site title (browser tab + search engine display): `Mitchell Williams — AI Builder × Communications Lead @ Google xGE`
- OG title: `Mitchell Williams — AI Builder × Communications Lead`
- OG description: `Eight years of live-broadcast production. Three years shipping production AI at Google. One portfolio.`
- OG image: needs creation — see Open Question #4.
- Schema.org markup: add `Person` schema (jobTitle, alumniOf, worksFor, sameAs) — Squarespace supports custom code injection in Site Header. (squarespace.com support.)

**One paste-ready Person schema block** for the site-header injection:

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

---

## 8. Voice and Tone Calibration

**The register the whole site should hit** is the same register `corpus/voice-profile.md` describes for my professional writing: lead-with-the-point, contractions where appropriate, specific-warmth-not-generic, compression-test-survives-40%-cut.

**Hard rules for site copy (paste these into the Squarespace style notes):**

1. **Lead with the point.** No "born under the endless blue skies" preambles. No "passionate about." No "I'd like to share."
2. **Banned phrases (non-negotiable):** leverage (verb), delve, synergy, utilize, deep dive, circle back (as filler — fine as a follow-up), bandwidth (for availability), ping (for contact), "I hope this email finds you well," "please don't hesitate to reach out."
3. **Use contractions as warmth signals.** "I've," "I'm," "don't," "that's." Stripping contractions to seem formal is exactly what reads as machine-produced.
4. **Specific warmth, not generic.** "The host thanked me by name on air" — not "I had the privilege of working with great teams."
5. **Sentence length variance.** Mix 5–8 word sentences with 18–25 word sentences. Uniform 15-word sentences read as templated. (My voice corpus showed structure density 0.81 today, projecting to 0.85–0.88 within 18 months — the fix is more variance, not more rules.)
6. **Numbers, not adjectives.** "1,000+ senior engineers" not "many senior engineers." "50M views" not "incredible reach." "99% stylistic fidelity" not "high accuracy."
7. **Pronouns:** First person on all pages. Never third-person ("Mitchell did X").
8. **Spelling note:** "yeah" not "yea" (probably won't appear at site register, but flagged).
9. **Compression test:** every page should survive a 40% cut. Draft, then cut. The cut version is usually correct.

**Tone calibration per page:**

- **Home:** confident, declarative, metric-heavy. Audience is the recruiter or hiring manager skim. They have 8 seconds.
- **Builds:** technical-but-accessible. Audience is the engineering lead or AI-curious recruiter. Architecture sentences must read as written by someone who actually shipped the thing.
- **Select Works:** editorial. Audience is the comms / content / editorial hiring manager who recognizes the work and the lineage. Lead with the editorial decision, not the production credit.
- **About:** narrative-but-tight. Audience is the hiring manager who already liked the homepage and wants to know the through line. Don't repeat the homepage — extend it.
- **Writing:** voice-forward, opinion-bearing. Same audience as About + anyone who wants a writing sample before booking a call.
- **Resume / Contact:** transactional. No prose. Just the path forward.

---

## 9. Content Strategy (what stays on the site, what lives elsewhere)

**The site's job is concentration, not breadth.** It surfaces the strongest 10% of my work and points to where the rest lives. Ongoing content that requires scale (LinkedIn long-form, Substack, X threads) belongs on platforms built for distribution, not on the portfolio.

**On the site:**

- The 11 Select Works video entries (already drafted).
- The 5 Builds cards.
- 1 long-form piece on the Writing page: the Industry Impact one-pager (already drafted in `data/industry-impact-document.md`), reformatted as a proper essay with a working byline and a date stamp. This is the single piece that earns its place on the portfolio because it argues a thesis — it doesn't just summarize career.
- Optionally: 1–2 essays drawn from the heartbeat / session-notes archive that have actual editorial voice (see Open Question #2).

**Off the site, link from the site:**

- LinkedIn: ongoing build-in-public posts (career-ops weekly progress, AI builds, voice / corpus / agent observations). The portfolio links to LinkedIn but doesn't republish.
- GitHub: career-ops as the canonical artifact + future builds. The portfolio embeds a repo card on the Builds page but doesn't mirror the README.
- Substack / Medium: only if I'm actively publishing. If I'm not, do not list. A cold Substack with two posts is worse than no Substack.

**The publishing cadence question** (relevant for AI-native hiring audiences but optional for portfolio purposes): the 2026 dataexec.io research says Anthropic specifically prizes "interesting independent research, written an insightful blog post, or made substantial contributions to open-source software." If I want to capitalize on that signal, the move is to ship 1 essay/quarter on the Writing page, not 1/week. Frequency without depth is worse than frequency at all. **Default recommendation: 1 essay every 6–8 weeks, drafted from real-time work, never speculative.**

**What does NOT belong on the site:**

- A blog with stale dates. If the most recent post is >90 days old, kill the section.
- A "thoughts" or "musings" section with no clear editorial position. This dilutes the AI-builder signal.
- Tutorial content. There's no shortage of LLM tutorials on the public web; mine adds nothing.
- A "podcast appearances" or "speaking" section unless I have ≥3 entries with public links. One conference talk is a footer line, not a section.

---

## 10. Quick Wins (5 changes, each <30 minutes, highest impact)

These are the changes I should make today even if every other piece of this strategy waits for review.

| # | Change | Time | Impact |
|---|--------|------|--------|
| 1 | **Update site title** to `Mitchell Williams — AI Builder × Communications Lead @ Google xGE`. Confirmed today: this isn't yet saved. | 2 min | Every recruiter who sees the browser tab now reads "AI Builder" as the first noun. This is the single highest-leverage 2-minute change on the site. |
| 2 | **Replace the homepage hero copy** with the exact copy in §2 of this doc. | 10 min | Above-the-fold positioning shifts from generic comms specialist to AI-builder-with-journalism-foundation. |
| 3 | **Add GitHub link to the site-wide footer** (and the homepage hero). Currently invisible. | 5 min | Every page now signals there's actual code behind the framing. Recruiters open repos before reading resumes (markaicode.com 2026). |
| 4 | **Save the SEO metadata for all 7 pages** per §7 of this doc. Currently 0 of 7 pages have complete metadata per the audit. | 25 min | Discoverability layer is 100% under my control and currently 0% deployed. |
| 5 | **Rename "Info" to "About"** in the navigation. | 1 min | Industry-standard page-name convention. Removes a "looks unfinished" tell. |

**Total time: under 45 minutes for all five.** None of these require copywriting beyond pasting from this document.

---

## 11. Open Questions (need my input before implementation)

These are decisions I need to make before the implementation phase can ship.

**1. Calendar link on the Contact page — yes or no?**
A "book a 20-minute call" link (Cal.com / SavvyCal / Google Calendar) increases recruiter conversion meaningfully but exposes my live availability publicly. Recommendation: yes if I'm comfortable with that, no if I'd rather mediate via email first. Default if no answer: no.

**2. Writing page — ship with the Industry Impact one-pager only, or wait until I have 2–3 essays?**
The Industry Impact piece is already strong enough to ship alone (`data/industry-impact-document.md`). But a single-essay Writing page can read as thin. Two options:
- **a.** Ship now with just the Industry Impact piece, framed as the inaugural essay.
- **b.** Hold the Writing page until I have 2 published pieces. Pull the Industry Impact essay onto a "Featured" callout on the About page in the meantime.
- Recommendation: **option a**. The piece is good. Shipping it sooner beats hoarding it.

**3. Builds page — public repos only, or include the internal Google work?**
My strongest builds (Comms Triage Agent, Voice DNA / Executive RAG, Mentorship Platform) are internal-only. The metric framing in this doc (90% latency reduction, ~160 ops hours/year) is the publicly disclosable summary version. Question: am I OK with that level of disclosure on a public site, or do I want to pull anything back?
- Recommendation: **the framing in this doc passes the disclosure bar**. Numbers are described, methodology is named, no proprietary code or product surface is exposed. But it's my call.

**4. Open Graph image — do I have one, or do we need to create it?**
Currently missing per the audit. Options:
- **a.** Use a high-contrast typographic image (the AI-builder + comms-lead string on a dark background, my name + URL beneath). Cheap, ships today.
- **b.** Custom design in Canva. ~30 minutes; better visual identity.
- **c.** Use a high-resolution still from one of the verified video credits (Hong Kong backpack, Hurricane Maria field, Stream launch night).
- Recommendation: **option a** for the v1, **option c** for v2 if I want signal density.

**5. Real Grok / Perplexity sessions — should I run them before final implementation?**
This document substituted live web search for direct Grok / Perplexity queries because their conversational interfaces are auth-walled. The highest-value gap a real Grok session would fill is: "What are AI hiring managers at Anthropic / OpenAI / xAI / Perplexity actively saying on X / Reddit / LinkedIn in May 2026 about portfolio signals for *non-engineering* candidates?" The public-web 2026 content for non-engineering AI-lab roles is thin. If I have 30 minutes, running that one query in a real Grok session and feeding the output back into this doc would tighten the comms / editorial / content-strategy guidance specifically.
- Recommendation: **yes, but optional**. The strategy in this doc is strong enough to greenlight without it. A real Grok pass would be a v1.1 polish, not a v1 blocker.

**6. Endorsement quote — will I ask a Google xGE colleague to write one?**
The rewrites doc flags this as `WHAT'S NEEDED #3`. Without a quote, the AI-builder claims rest entirely on my own framing. With one, the page gains third-party signal. The ask is small (1–2 sentences) and the colleague who used the Comms Triage Agent or Voice DNA system the most is the obvious target. Question: who do I ask, and what specifically do I want them to say?
- Recommendation: **yes, ship the page without it for v1, add it as v1.1 within two weeks**. Don't block the launch on the quote.

**7. Existing page that I might be missing from this strategy?**
The 7-page architecture I proposed assumes the live site has Home, Info, Select Works, Contact + 3 others I haven't seen. If the live site has different pages (e.g., a separate Awards page, a Press page, a Speaking page), the strategy stays — just remap. Question: can I confirm the actual live page list before implementation, or should the implementation phase audit the live site first?

---

## Methodology Note (research source attribution)

| Source | What it informed |
|---|---|
| `cv.md` | Canonical proof points, on-air credits, role tenure |
| `article-digest.md` | Proof point bank #1, #2, #3, #17, #18 (archetype mapping) |
| `writing-samples/voice-reference.md` | Hero copy register, About lede |
| `modes/_profile.md` | Archetype taxonomy A1/A2/B, target role list |
| `config/profile.yml` | Comp range, location policy, contact info |
| `corpus/voice-profile.md` | Six voice signatures, banned phrases, compression test |
| `data/storytellermitch-rewrites-2026-05-09.md` | Existing video descriptions, on-air credits, downstream callouts |
| `data/industry-impact-document.md` | Industry Impact essay for Writing page |
| dataexec.io 2026 | Anthropic / OpenAI / Meta hiring signals (production proof, public artifacts) |
| Sundeep Teki 2026 | Research-track signals (less directly applicable) |
| greenmo.space 2026 | Editorial-discipline-over-efficiency thesis |
| markaicode.com 2026 | "Recruiters open repos before resumes" finding |
| thesmcollective.com 2026 | Title-tag / meta-description Squarespace conventions |
| webfx.com / wpforms.com 2026 | Form-conversion best practices |
| Lucky Orange / Venture Harbour 2026 | Personalized CTA conversion data |

---

Strategy ready for greenlight. Reply APPROVED to begin implementation.
