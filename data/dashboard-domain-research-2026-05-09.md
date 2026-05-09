# Dashboard Domain Research — 2026-05-09

**For:** Mitchell Williams — journalist-turned-AI-practitioner targeting AI Solutions Architect / Forward Deployed Engineer / AI Enablement Lead / AI/Technical PM / Engineering Editorial roles at AI-native companies (Anthropic, OpenAI, xAI, Perplexity, Waymo, Substack, Axios, The Atlantic).

**Use case:** Domain for a personal job-search ops dashboard (Node.js, shipped, working). Will be demoed live to AI-native hiring managers during interview loops as a build artifact.

**Currently owned:** `careers-ops.com` (with the S — reads weird, reads as a typo).

---

## ⚠️ Critical finding (read this first)

**The `careerops` name is a brand minefield.** Three active products already exist in the exact niche:

| Domain | Owner | Status |
|---|---|---|
| `careerops.com` | Chris McDermut — "CareerOps: The Job Search & Career Growth Engine" Chrome extension. Active, monetized, listed on Chrome Web Store. | TAKEN, competing product |
| `career-ops.org` | santifer / `santifer/career-ops` — the open-source AI job-search system (43.5K+ GitHub stars) that Mitchell's dashboard is built on top of | TAKEN, parent project |
| `careeropsai.com` | "Career Ops AI" — separate product | TAKEN |

Any `careerops.{tld}` Mitchell registers will read in a recruiter screen as "derivative of that thing on the Chrome Web Store" or "fork of santifer's repo with a domain slapped on it." That is the opposite of the signal he wants. He wants the screen to read: *"I built this. I named it. I shipped it."*

**Strong recommendation: walk away from the `careerops` stem entirely.** Same applies to `career-ops` with the hyphen — domain readers parse hyphens as workarounds for taken names. `careers-ops.com` (his current) is the worst of all worlds: it reads as a typo of an existing product. Do not point business cards or PDF footers at it.

---

## 1. Top 3 recommended domains (priority order)

### #1 — Subdomain on personal site: `dashboard.mitchellwilliams.com` (or `mitchellwilliams.com/career-ops`)

The 2026 consensus from developer-credibility research is unambiguous: a developer's strongest single asset is their own name domain, and projects shipped *under* it inherit that authority. Hiring managers at Anthropic/OpenAI screen the candidate's personal site first — landing the dashboard one level deep on `mitchellwilliams.com` does three things at once: (a) consolidates Mitchell's SEO/brand into a single signal, (b) demonstrates "I host and operate my own infra under my own name," (c) avoids the trap of looking like he tried to spin a side-project into a startup that didn't take off. The tool reads as one of several artifacts a builder ships — not as a failed seed-stage product. This is also the only option that scales: when he ships the next thing, it lives at `mitchellwilliams.com/atlas` or wherever, and the brand compounds.

### #2 — Dedicated SaaS-style: `applypipe.app`

If he wants a standalone product-style URL (because the dashboard is genuinely strong enough to stand alone, or because he wants something easier to read aloud in a screen), `applypipe.app` is the cleanest pick. Verb+noun pattern reads as a shipped tool. `.app` is on the HSTS preload list — it forces HTTPS at the browser level, which AI-native hiring managers will recognize as a "you picked a TLD that bakes security in by default" signal. No naming collisions surfaced in search; WHOIS returned no records (typically signals available for `.app` since the registry publishes when registered). The "pipe" metaphor maps cleanly to what the dashboard actually does — moves applications through stages.

### #3 — Premium metaphor: `flightdeck.work` or `shortlist.tools`

For a third option that reads as "production tool, not job-search confession": `flightdeck.work` (his dashboard literally IS a flight deck — pipeline, scan history, batch worker status, heartbeat, all in one view) or `shortlist.tools` (uses recruiter vocabulary, signals he understands the other side of the table). Both are unusual TLDs that need a strong concept to land — these have the concept. `.work` and `.tools` are second-tier in 2026 prestige but acceptable when the name does the heavy lifting.

---

## 2. Single concrete pick

# **`mitchellwilliams.com/dashboard`** (subdomain or path on his personal site)

**Why this and not a standalone:**

1. **Hiring manager mental model.** A Forward Deployed Engineer / Solutions Architect candidate is being evaluated as *a person who ships*, not as *a startup*. The dashboard is evidence of his judgment, taste, and operational chops. Hosting it under his own name frames it correctly: "look what Mitchell built." Hosting it at `careerops.app` frames it incorrectly: "look at this product Mitchell is trying to grow."
2. **No collision risk.** Zero chance a recruiter Googles it and finds a Chrome extension or an open-source repo with a similar name and gets confused.
3. **Compounds.** Every artifact he ships next reinforces the same domain. A standalone product-name domain is a sunk asset the day after the interview.
4. **The journalist angle.** Mitchell's edge is editorial sensibility + technical execution. A clean personal site says "I curate what I publish under my name" — that is the Substack/Axios/Atlantic register. A SaaS-styled domain says "indie hacker." Different signal.
5. **Production cost is identical.** Same DNS, same hosting, same Caddy/Nginx config. There is no engineering reason to prefer a separate root domain.

**If — and only if — Mitchell already plans to open-source or commercialize the dashboard as a product**, then `applypipe.app` is the fallback. But for the interview-demo use case explicitly stated, the subdomain wins.

---

## 3. Full availability + prestige table

Prestige scored 1–10 for the **specific target audience** (AI-native hiring managers at Anthropic/OpenAI/xAI/Perplexity/Waymo + editorial-tech hires at Substack/Axios/Atlantic in 2026). "Availability" reflects search and WHOIS signal — not a registrar transaction confirmation; verify on Cloudflare/Porkbun before purchase.

| Domain | Availability | Prestige | Notes |
|---|---|---|---|
| `careerops.app` | Likely available | **2/10** | Brand-collides with active Chrome extension `careerops.com` and OSS `career-ops.org`. Signals derivative work. |
| `careerops.io` | Likely available | **2/10** | Same collision. `.io` doesn't fix the naming problem. |
| `careerops.dev` | Likely available | **2/10** | Same collision. |
| `careerops.ai` | Likely available; `.ai` is expensive (~$70–$100/yr) | **3/10** | Same collision. `.ai` premium does not compensate for naming overlap. |
| `careerops.so` | Likely available | **2/10** | `.so` peaked when Notion popularized it; muted in 2026. Same collision. |
| `careerops.build` | Likely available | **3/10** | `.build` is novel but unproven; same collision concerns. |
| `career-ops.com` | TAKEN (santifer's project — currently parked/redirecting) | **1/10** | Cannot register. Even if it were available: hyphen reads as workaround. |
| `careerops.work` | Likely available | **2/10** | `.work` reads as weak/unprofessional in 2026 absent very strong concept; same collision. |
| `careers-ops.com` | OWNED by Mitchell | **1/10** | The S makes it read as a typo. **Do not use as the demo URL.** Park as a redirect to whatever wins, then drop it next renewal cycle. |
| `jobops.app` | Likely available | **5/10** | No collisions found. "Jobops" is generic but clean. .app HSTS is a plus. |
| `jobops.io` | Likely available | **5/10** | Same as above. `.io` reads slightly more "platform-y" than `.app`. |
| `jobops.ai` | Likely available; premium pricing | **6/10** | `.ai` premium might land here — the dashboard *is* AI-assisted. But "jobops" is still generic. |
| `applypipe.app` | Likely available; no collisions in search | **8/10** | **Strong second pick.** Verb+noun, HSTS, metaphor matches dashboard function. |
| `applypipe.io` | Likely available | **7/10** | Slightly less "shipped product" feel than `.app` but acceptable. |
| `pipeops.app` | Likely available | **3/10** | **`pipeops.io` is TAKEN by an active DevOps platform.** Even if `.app` is free, this name is now muddied. Skip. |
| `offerops.app` | Likely available | **5/10** | Clean enough, no collision found, but "offer" is the wrong end of the funnel — it's the rare event, not the daily work. |
| `huntops.app` | Likely available | **3/10** | "Hunt" is amateur-hour vocabulary in 2026 — it signals hustle/desperation, not engineering. Avoid. |
| `opsforjobs.app` | Likely available | **2/10** | Reads like a Slack channel, not a product. Three-word stems on `.app` are fragile. |

---

## 4. Alternative names worth considering

These avoid the careerops collision and were not on the original list. Each verified as either zero-result in search or otherwise visibly available — verify at the registrar.

| Domain | Why it scores | Prestige |
|---|---|---|
| **`flightdeck.work`** or **`flightdeck.tools`** | The dashboard literally IS a flight deck — a single pane showing pipeline, heartbeat, scan history, batch jobs. The metaphor is what the tool does. Reads as a product, not a job hunt. Pairs naturally with the demo: "this is my flight deck for the search." | 8/10 |
| **`shortlist.tools`** | Recruiter vocabulary. Signals to the hiring manager that Mitchell understands the other side of the table — the candidate-shortlist mental model. Short, memorable, ages well. | 7/10 |
| **`shipped.work`** or **`shipped.tools`** | Lean directly into the hiring signal: "I shipped this." Verb-as-noun, AI-native cadence (Linear/Vercel/Anthropic naming feels). | 7/10 |
| **`dispatch.work`** or **`dispatch.tools`** | Editorial-tech bilingual: "dispatch" lands at Axios/Atlantic/Substack as newsroom vocabulary AND lands at Anthropic/Waymo as ops vocabulary. Plays Mitchell's dual-fluency hand. | 8/10 |
| **`rolepipe.app`** | Variant of applypipe — "role" instead of "apply" reads slightly more strategic / less reactive. Verb+noun, .app HSTS. | 7/10 |
| **`scoutroles.app`** | Frames Mitchell as the agent doing the scouting (not the candidate being scouted). Reframes the demo from "job seeker tool" to "search-side intelligence tool." | 7/10 |

If Mitchell wants to lean into his journalist-builder hybrid, **`dispatch.work`** is the most distinctive choice on this entire page. It says one thing AI Solutions Architect recruiters at Anthropic don't hear from anyone else: *"I am from the editorial world, I built tooling, and I named it accordingly."*

---

## 5. What NOT to do (TLDs and patterns to avoid in 2026)

**TLDs to avoid for this use case:**
- **`.systems`** — peaked ~2018, now reads dated and over-formal. SRE-vibe without the SRE substance.
- **`.tech`** — overused, low-trust in 2026; cheap-domain energy.
- **`.xyz`** — crypto/Web3 association; wrong audience signal.
- **`.cloud`** — generic, AWS-adjacent in a forgettable way.
- **`.online` / `.site` / `.website`** — these are the 2026 equivalent of a Geocities address in a portfolio context.
- **`.co`** — fine for startups, but a "fallback because .com was taken" signal in personal portfolios.

**Naming patterns to avoid:**
- **Hyphenated stems** (`career-ops`, `apply-pipe`) — reads as a workaround for unavailability. Always.
- **Pluralized forms when singular is taken** (`careersops`, `careers-ops`) — same problem, worse signal. This is what `careers-ops.com` already does. It reads as "they couldn't get the real one."
- **Three-word concatenations** on novel TLDs (`opsforjobs.app`, `getjobpipe.io`) — fragile, hard to say aloud, hard to remember after a 30-min screen.
- **"Hunt" / "grind" / "hustle" vocabulary** — amateur in 2026 across all hiring contexts. Anthropic/OpenAI hire for taste; this is the opposite of taste.
- **`get-` prefix** (`getapplied.app`) — landing-page-builder cliché, dead by 2024.
- **"AI" jammed into the name** (`careeropsai.com`) — desperate; `.ai` does that work for you if you want the signal.
- **Numbers** (`apply2.io`) — looks like a v2-of-something-failed.
- **Misspellings / vowel drops** (`applypip`, `jbops`) — Web 2.0 era. Done.
- **`.com` with hyphens or pluralization when you don't already own the canonical** — the cost is low (one renewal) but the perception cost is high (recruiter sees `careers-ops.com` and thinks "off-brand of the real thing").

**One meta-pattern to internalize:** in 2026, any domain that *looks like a fallback* (hyphen, plural, weird TLD chosen because the good one was gone) sends the wrong signal even when the underlying tool is excellent. The cleanest move is to either (a) host under your own name on `.com` or (b) pick a name whose canonical TLD is genuinely available. Don't ship a beautiful Node.js dashboard under a domain that telegraphs compromise.

---

## Sources

- [TLD Guide for 2026 — Namekit](https://namekit.app/blog/tld-guide-2025/)
- [.AI vs .com vs .io vs .co (2026) — Namecheckly](https://namecheckly.com/blog/ai-vs-com-vs-io-domain-guide)
- [Top 10 Domain Extensions for 2026 — Snagged](https://www.snagged.com/post/top-10-domain-extensions-for-2025-which-tld-should-you-choose)
- [Best TLDs for Startups and Tech Companies — DomainDetails](https://domaindetails.com/kb/best-tlds-for-startups)
- [.AI Domains in 2026: Smart Investment? — Times of AI](https://www.timesofai.com/industry-insights/ai-domains-worth-investing/)
- [.com vs .io vs .app vs .dev — Domhaul](https://www.domhaul.com/blog/com-vs-io-vs-app-vs-dev-which-tld-should-you-choose)
- [CareerOps Chrome extension (collision check)](https://chromewebstore.google.com/detail/careerops-the-job-search/nnagkjkdadkhboehpicmdggfadmhnemb)
- [career-ops open source project (collision check)](https://career-ops.org/)
- [PipeOps DevOps platform (collision check)](https://www.pipeops.io/)
- [How to Get Hired at OpenAI, Anthropic & DeepMind in 2026 — Sundeep Teki](https://www.sundeepteki.org/advice/how-to-get-hired-at-openai-anthropic-and-google-deepmind-in-2026)
- [2026 Best Name Ideas for Portfolio Website — new-people.cv](https://new-people.cv/blogs/what-should-i-name-my-portfolio-website)
- [Best TLDs for Web Designers & Developers — GoDaddy Pro](https://www.godaddy.com/resources/skills/best-tlds-designers-developers)
