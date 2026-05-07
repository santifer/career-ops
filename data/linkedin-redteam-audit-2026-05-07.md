# LinkedIn Red-Team Audit — 2026-05-07

**Perspective:** A2 recruiter (AI Solutions Architect / Applied AI / FDE pool) + B recruiter (Engineering Editorial / Developer Comms) simultaneously scanning the public profile. No login. Speed-read simulation: 8-second skim, then 45-second deep dive if the skim passes.

**Input sources:** LinkedIn public view (fetched this session), `data/linkedin-pending-edits.md`, `cv.md`, `modes/_profile.md` archetype definitions.

---

## A2 Recruiter POV — "Is this an AI builder?"

### 8-Second Skim Result: FAIL

What an A2 recruiter sees in the first 8 seconds:
1. Name: Mitchell Williams
2. Location: Seattle, WA
3. Employer: Google
4. Connections: 3K followers, 500+
5. Headline: Likely reads as "Program Manager" or "Communications Lead" — NOT "AI Agent Builder"

**Verdict:** At glance, this profile routes to the traditional PM/Comms candidate pool. An AI recruiter scanning for "LLM orchestration" or "agent builder" or "RAG pipeline" at the headline/title level would scroll past without clicking.

**The Anthropic certs (visible publicly) partially recover the skim** — if a recruiter gets to the certification section, 4 Anthropic certs from March 2026 are a strong differentiator. But certs are below the fold on most screen sizes without login.

### 45-Second Deep Dive: PARTIAL PASS

With login (or if recruiter clicks through):
- About section opens with AI signal ("I bridge AI systems and human communication — shipping production AI agents at Google xGE") — this is strong IF recruiter reaches it
- No Featured section to anchor the AI portfolio
- Experience bullets behind login — recruiter can't verify agent-building depth without connection
- GitHub link is in the profile (github.com/mitwilli-create) — if clicked: 3 pinned repos confirm the build, but no profile README to frame them

**What's working:**
- The Anthropic certs are publicly visible and signal AI-native investment
- 3K followers suggests established voice / network
- GitHub link exists in profile

**What's killing the A2 read:**
1. **Headline** — the single highest-leverage field is doing no A2 work. An A2 recruiter searching LinkedIn for "AI agent builder" or "LLM orchestration" will NOT surface this profile because the headline doesn't contain those terms.
2. **No Featured section** — the GitHub portfolio is invisible unless a recruiter actively clicks through to the contact section
3. **Recommendation bias** — 2 visible recommendations emphasize journalism and content, not AI systems; algorithmic ranking penalizes this for AI-native searches

---

## B Recruiter POV — "Is this a comms leader who gets AI?"

### 8-Second Skim Result: CONDITIONAL PASS

A B-archetype recruiter (seeking Engineering Editorial Lead, Developer Advocate, Research Comms) sees:
1. Google (prestige signal) ✅
2. Comms/editorial framing in headline ✅
3. 3K followers (audience signal) ✅
4. Anthropic certs (AI literacy signal) ✅

**Verdict:** A B recruiter is more likely to click. The profile reads as a senior comms professional with AI credibility. This is the stronger read today.

### 45-Second Deep Dive: PASS WITH GAPS

With login:
- The 8-year broadcast journalism arc (AJE, HuffPost Live, Fusion, AJ+) is verifiable and impressive
- Google xGE scope (1,000+ senior engineers) is the right scale for enterprise comms roles
- The Communications Triage Agent and Executive RAG pipeline, if surfaced in bullets, are rare differentiators that separate Mitchell from traditional comms candidates

**What's working:**
- The hybrid narrative (editorial depth + AI production) is unique — no other candidate has this combination
- The Anthropic certs in public view validate the AI commitment for a comms recruiter who might otherwise question the technical depth

**What's missing for B:**
1. **Featured post or article** — B-archetype hiring managers look for editorial voice signals. A long-form post about the Communications Triage Agent or the Voice DNA methodology would demonstrate both the AI builder credentials AND the editorial intelligence simultaneously
2. **Recommendation from AI context** — current recommendations read journalism. A Google xGE colleague noting "built and shipped production AI systems" would shift the signal for B recruiters who are on the fence about AI depth

---

## Gap Matrix — Ranked by Recruiter Impact

| Gap | A2 Impact | B Impact | Fix Effort | Priority |
|-----|-----------|----------|------------|----------|
| Headline doesn't contain AI builder terms | HIGH — won't surface in AI searches | LOW — headline is passable for comms | 5 min | **#1** |
| No Featured section | HIGH — portfolio invisible | MED — voice/work samples invisible | 10 min | **#2** |
| About section truncates before AI proof point | MED — first claim doesn't land | LOW — truncation hurts SEO only | 15 min | **#3** |
| No long-form post demonstrating editorial+AI voice | LOW — A2 doesn't read posts | HIGH — B hires on voice signals | 45–90 min | **#4** |
| Recommendations lean journalism | MED — algorithmic penalty | LOW — journalism is on-brand for B | Relationship-dependent | **#5** |
| GitHub profile README missing | HIGH — if recruiter clicks through | LOW — B recruiters rarely check GitHub | 30 min | **#6** |
| Skills section missing AI terms | HIGH — LinkedIn search indexing | MED | 10 min | **#7** |

---

## Top Priority Edit (single highest recruiter impact)

**LinkedIn headline → rewrite to include "AI Agent Builder"**

Current (inferred): something like "Internal Communications Lead & Program Manager at Google"

Recommended:
```
Internal Comms Lead & AI Agent Builder @ Google xGE | Production LLM Systems for 1K+ Senior Engineers | Open: AI Enablement / Research Comms / Editorial AI
```

Why this headline wins both A2 and B:
- "AI Agent Builder" → surfaces in AI recruiter keyword search (A2)
- "Internal Comms Lead" → surfaces in comms/editorial search (B)
- "Production LLM Systems for 1K+ Senior Engineers" → quantified scope, differentiates from hobbyist AI profiles
- "Open:" → passive candidate signal that triggers recruiter outreach

**This is a 5-minute change with the highest leverage of any edit on this list.**

---

## What NOT to do

- Do NOT make the profile look like an engineering-only profile. The hybrid is the moat. Removing the comms language to "read more AI" would make Mitchell less unique, not more.
- Do NOT list "Python" or "ML" as skills if they can't be verified through the experience bullets. False signals break trust in the interview stage.
- Do NOT add every AI keyword from the job descriptions. One credible "AI Agent Builder" in the headline outweighs 20 skills-section keywords.

---

## Addendum — Red-Team Findings from Public View Fetch (this session)

**Confirmed publicly visible without login:**
- Anthropic certs (all 4, March 2026) ✅
- 3K followers, 500+ connections ✅
- GitHub link: github.com/mitwilli-create ✅
- Website link: thestorytellermitch.com (returns 401 — broken for public view) ⚠️
- About excerpt opens with AI framing ✅
- Indiana University Bloomington visible in Education ✅
- Two recommendations visible (journalism-focused) ⚠️

**Not visible without login:**
- Specific job titles and dates
- Experience bullet content
- Skills list
- All activity / posts

**Highest urgency finding:** thestorytellermitch.com returns 401 when followed from the LinkedIn profile. Any recruiter clicking the portfolio link gets a broken experience. Fix or remove this link.
