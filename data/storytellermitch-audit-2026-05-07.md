# storytellermitch.com Audit — 2026-05-07

**Generated:** 2026-05-07 (overnight autonomous session)
**Tool used:** WebFetch
**URL audited:** https://thestorytellermitch.com
**Audit status:** PARTIAL — site is auth-gated.

---

## Current state — verified

**HTTP status:** 401 Unauthorized.

WebFetch attempt returned `401` — the site is behind some form of authentication or password-protection layer. Possible causes:
- Site is in a draft/private state during a redesign.
- Basic-auth or password-protected behind Cloudflare Access / Vercel password protection / WordPress draft / Squarespace lock.
- Misconfigured reverse proxy or expired cert (less likely given 401 vs 5xx).

**No other content was retrievable** via WebFetch. The audit below is therefore based on:
1. The contractual expectation set by `cv.md` (linked as `thestorytellermitch.com`).
2. The narrative position set by `config/profile.yml` (`portfolio_url: "https://thestorytellermitch.com"`).
3. The recruiter-facing expectations a Tier A2 / Tier B audience would have.

---

## What a recruiter would expect to see

A recruiter / hiring manager landing on `thestorytellermitch.com` after reading `cv.md` and seeing the listed link in the header would expect, at minimum:

1. **A clear single-line answer** to "what does this person do now?" — Mitchell's hybrid (AI Comms + Builder PgM @ Google xGE / 8-yr digital-journalism arc) needs to land in 5 seconds or the recruiter bounces.
2. **Live work / portfolio surface** — links or embeds to: the AJ+ Hurricane Maria field interview, the HuffPost Live PrEP segment with on-air editorial credit, the Fusion / Mandela 44-minute special, the Stream May 2 2011 launch coverage. These are the named, on-tape proof points in `article-digest.md` (Video Portfolio sections).
3. **AI builder evidence surface** — links to: github.com/mitwilli-create/career-ops, the Communications Triage Agent description, the Voice OS methodology summary. These bridge the broadcast → AI builder narrative.
4. **A "hire me" / "contact" action** — at minimum: email + LinkedIn + GitHub. Ideally also a "what I'm targeting right now" section so a recruiter who sees the site from a Greenhouse/Ashby ATS click-through immediately knows whether to engage.
5. **Voice consistency** — the site should read in Mitchell's voice (`corpus/voice-profile.md`), not in generic-portfolio-template-speak.

---

## Gap analysis (cannot verify; based on the 401 alone)

Because the site is auth-gated, the gap analysis must be conditional. Each row below is **"if state X is true, then gap Y exists."**

| If the current site state is... | Then the gap is... | Recruiter consequence |
|----------------------------------|---------------------|------------------------|
| Site under redesign behind a password lock | Mitchell's CV header points to a dead URL during the active job search. Recruiters who follow the link see only a 401 | HIGH — the CV explicitly invites the click; the click fails. This makes the candidate look unpolished. |
| Site is intentionally private (e.g., portfolio shared via direct PDF only) | The `portfolio_url` in `config/profile.yml` should be removed or replaced with `linkedin.com/in/mitwilli` until the site is public | MEDIUM — fix the `cv.md` and `config/profile.yml` references; keep the domain reserved. |
| Site is public-facing but I'm getting 401 due to bot blocking (e.g., Cloudflare Bot Fight) | This is recoverable — the site works for humans; the audit just cannot complete | LOW — but worth verifying with a manual browser check. |
| Site exists with content but lacks the AI builder narrative bridge | The 8-year digital-journalism arc + the production-AI-at-Google work need to coexist on the same page; otherwise the site reinforces the *old* identity and undermines the AI-builder application | HIGH — primary positioning gap. |
| Site exists but doesn't link to github.com/mitwilli-create or career-ops | The single highest-signal current artifact (the open-source agentic pipeline) is invisible to anyone who lands here from the CV | HIGH — the public build is the application; missing the link kills its value. |
| Site exists but doesn't show on-tape video proof (Hurricane Maria, PrEP, Mandela, Stream launch) | The verifiable broadcast credits documented in `article-digest.md` Video Portfolio sections are not surfacing | MEDIUM-HIGH — these are the rare on-tape verifiable credits; surfacing them is the highest-credibility move on the site. |

---

## Specific improvement recommendations (queued for Mitchell's approval; do NOT modify the live site)

These are draft recommendations only. Mitchell makes the call.

### Priority 1 — Make the site reachable
- **If under redesign:** put a single-page placeholder up immediately with name + 3-line bio + contact links. Recruiters following CV → site → 401 lose trust. A 30-second placeholder fixes that.
- **If intentionally private:** remove or replace the `portfolio_url` reference in `config/profile.yml` and the linkedin.com line in `cv.md` until the site goes public.

### Priority 2 — Two-paragraph hero / above-the-fold content
Suggested copy (Mitchell's voice profile applies; rewrite before publishing):

> **Mitchell Williams — AI Comms + Builder PgM @ Google xGE.**
>
> Eight years inside the four properties that rewired digital journalism — Al Jazeera English's The Stream, HuffPost Live, Fusion's America With Jorge Ramos, AJ+ at its category-defining peak. Then translated that operating discipline to Google: production AI systems serving 1,000+ senior engineers at Principal / Distinguished / Fellow tier, agentic pipelines under measurement, principal communications at scale.
>
> Currently shipping public AI agent infrastructure on Claude Code Skills — github.com/mitwilli-create/career-ops. Targeting AI Solutions Architect / Forward Deployed / AI Enablement / AI PgM / Engineering Editorial roles at AI-native pre-IPO companies.

### Priority 3 — Three sections, in this order

1. **Build artifacts** (top-of-page after hero) — career-ops repo embed, Communications Triage Agent description, Voice OS methodology, Tax Verification Agent.
2. **Video proof** (middle) — embed the Hurricane Maria field interview, the HuffPost Live PrEP segment with the editorial-credit timestamp, the Fusion Mandela 44-minute special, the Stream bin Laden launch coverage.
3. **Contact / hire me** (bottom or fixed nav) — email, LinkedIn, GitHub, "what I'm targeting" one-liner.

### Priority 4 — SEO / discoverability hooks
- Title tag: `Mitchell Williams — AI Comms + Builder PgM @ Google xGE`
- Meta description: ~150 chars summarizing the hybrid; include "AI Solutions Architect" / "Forward Deployed Engineer" / "Communications Lead" / "Engineering Editorial" so the site surfaces for those searches.
- OG tags for clean LinkedIn / X share previews.

### Priority 5 — Maintenance discipline
- Add a "Last updated" footer line that's actually accurate.
- Tie updates to a quarterly cadence (March / June / September / December) so the site doesn't decay.

---

## What is OUT OF SCOPE for this audit

| Item | Reason |
|------|--------|
| Editing the live site | Per session prompt: "audit only — no changes to live site." Mitchell makes site changes himself. |
| Fetching the site through a different user-agent string to bypass possible bot blocks | Could be misread as bypassing access controls; not a fit for an autonomous overnight session. |
| Speculation about which CMS or hosting platform the site uses based on the 401 alone | Insufficient signal; would be guessing. |
| Recommendation about domain (`thestorytellermitch.com` vs alternatives) | Branding decision belongs to Mitchell. |

---

## Action items for Mitchell on review

1. **Verify site reachability manually** — does `https://thestorytellermitch.com` open in Mitchell's browser? Does it return content or also a 401? (If it returns content, the audit's 401 was a bot-block; the site is live.)
2. **If site is live + content exists** — re-run this audit with manual paste of the homepage HTML or screenshot, and the gap analysis can be made specific instead of conditional.
3. **If site is dead / under construction** — decide whether to (a) deploy a 30-second placeholder, (b) remove the portfolio_url reference, or (c) leave it as is. Each has tradeoffs noted above.
4. **Either way** — pull the on-tape video proof points from `article-digest.md` (Video Portfolio sections, lines ~600-660 of the file) and surface them somewhere recruiter-accessible. This is the rarest credibility surface in Mitchell's portfolio and underused.

---

**This file is NOT auto-updated.** Re-run audit when site state changes; cite this file's date so the gap is preserved if site work happens.

---

## Addendum — GitHub + LinkedIn Public Audit (Session 2, 2026-05-07)

### GitHub — github.com/mitwilli-create

**What a recruiter sees:**
- Bio: "Shipped 3 AI systems @ Google xGE for 1K+ senior engineers. Voice OS · Tax Verification Agent · career-ops. Open to AI editorial + comms roles."
- 3 pinned repos: `comms-triage-agent`, `tax-verification-agent`, `voice-os`
- `comms-triage-agent` README: production 3-prompt system, ~160 hrs/yr metric, conditional KB loading — credible as systems thinking; weakness is Google Workspace moat, not novel methodology
- `career-ops` fork: 0 stars, upstream README — Mitchell's personal extensions not visible

**Gaps:**
- No profile README (highest-impact blank in GitHub UX)
- `career-ops` fork README is santifer's generic version — Mitchell's extensions (portal scanning, parallel workers, Voice DNA, skill layers) are invisible
- 5 repos total — thin portfolio for an AI builder persona
- Only JavaScript language tag detected; Python not visible

**Top actions (in order):**
1. Create `mitwilli-create/mitwilli-create` profile README — 30 min, highest-leverage single fix
2. Fork README: add "Mitchell's Extensions" section documenting what was built on top of the upstream
3. Pin `career-ops` with a custom description: "AI job-search pipeline — 1,665 jobs triaged, 100+ CVs generated"

### LinkedIn — linkedin.com/in/mitwilli (public view)

**What a recruiter sees without login:**
- 3K followers, 500+ connections (solid signal)
- About excerpt: "I bridge AI systems and human communication — shipping production AI agents at Google xGE…" (truncates early)
- Headline: Not the A2 signal — renders as "Mitchell Williams · Google" in most contexts
- 4 Anthropic certs (March 2026) VISIBLE publicly — strong differentiator ✅
- Recommendations (2): lean journalism/comms, not AI — no AI builder endorsement visible
- Featured section: none visible; no portfolio links surfaced

**Critical gap:** Headline is the only field that affects cold sourcing search results. If it reads as a traditional comms title, LinkedIn's algorithm routes Mitchell to comms candidate pools, not AI pools.

**Top priority edits (from `data/linkedin-pending-edits.md`):**
1. **Headline rewrite** (5 min): `Internal Comms Lead & AI Agent Builder @ Google xGE | Production LLM Systems for 1K+ Senior Engineers | Open: AI Enablement / Research Comms`
2. **Featured section** (10 min): Add GitHub portfolio link + career-ops fork link — only portfolio signals visible without login
3. **About first 220 chars** (15 min): Front-load AI proof point; current version truncates before the quantified claim

### Top 3 Cross-Surface Actions by Recruiter Impact

| # | Surface | Action | Effort |
|---|---------|--------|--------|
| 1 | LinkedIn | Rewrite headline to include "AI Agent Builder" | 5 min |
| 2 | GitHub | Create profile README (`mitwilli-create/mitwilli-create`) | 30 min |
| 3 | LinkedIn | Add Featured section with GitHub + career-ops links | 10 min |
