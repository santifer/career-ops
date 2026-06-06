# Mode: cover-letter — Generate Tailored Cover Letter

Generate a cover letter for the given role using Patrick's calibrated voice. The cover letter must sound like a human wrote it — specifically, like Patrick wrote it.

## Inputs Required

1. **JD text or URL** — the role to target
2. **cv.md** — read for proof points
3. **article-digest.md** — read for detailed proof points
4. **modes/_profile.md** — read the "Writing Style" section for voice rules
5. **Report** (if exists) — use the evaluation's archetype detection and match analysis

## Structure: 5-6 sentences. That's it.

Three beats: **why I'm writing → proof → let's talk.** No paragraphs. No filler. A cold pitch, not an essay.

| Beat | Sentences | What it does |
|------|-----------|--------------|
| Hook | 1-2 | Identity + what's specific about THIS role |
| Proof | 2-3 | Concrete numbers/outcomes mapped to their JD |
| Close | 1 | Let's talk + portfolio link |

DO NOT start with "Dear Hiring Manager" — start with the hook directly.
DO NOT use "I am writing to express my interest in..."

NEVER end with:
- "I look forward to discussing how my skills can contribute..."
- "Thank you for your time and consideration..."
- "I am confident that my background makes me an ideal candidate..."

## Voice Rules (from _profile.md — abbreviated)

**DO:** Short punchy sentences, direct verbs (built/shipped/run/operate), concrete specifics (A100 GPUs, 80+ resources), casual confidence, vary sentence structure, show personality.

**NEVER (lexical):** Leveraging, spearheading, pioneering, orchestrating, passionate about driving innovation, cross-functional collaboration, proven track record, state-of-the-art, perfect parallel structure, corporate valedictions.

**NEVER (structural — the bigger tells):** negation-elevation ("X isn't A — it's B"), the "same X / same instinct / same muscle" transfer-bridge, meta-labels ("Straight answer:", "Two honest notes.", "Reliability:"), stacked "X, not Y" contrasts, abstract clause-tricolons, and the same "clause — dash — appositive" sentence shape on repeat. **Apply the full "Structural & Rhythmic Tells" rules and run the MANDATORY pre-send self-audit in `modes/_profile.md` before returning the letter.**

## Output Format

```
---
To: {company} — {role}
Date: {YYYY-MM-DD}
---

{paragraph 1}

{paragraph 2}

{paragraph 3}

Patrick Moore
303-514-3586 · moorelab.cloud
```

## Length Target

**75-120 words. 5-6 sentences.** A recruiter reads 50 cover letters a day — this one takes 15 seconds. Hit hard, get out.

**This cap applies to EVERY path that emits a cover letter.** `apply` and `auto-pipeline` must route through these rules — never generate a 5-paragraph essay. For a senior role with a dedicated cover-letter upload you may stretch to ~180 words / 3 short paragraphs max, but the structural budgets in `_profile.md` apply at any length.

## Archetype-specific hooks

| Archetype | Lead with... |
|-----------|-------------|
| AI/Agentic | "Three Claude agents in production at a regulated healthcare company" |
| Cloud/Platform | "7 years across AWS+Azure in HIPAA/HITRUST environments" |
| Security | "Security engineer for 25+ years — hardening regulated environments is what I do" |
| FDE/SA | "Builder who turns messy environments into working systems" |
| Healthcare | "Running security and AI for an oncology EMR built from scratch" |

## Example (calibrated to Patrick's voice)

```
{Company}'s {specific thing} is the customer-facing version of something I already run.
At Viecure I built two proxy MCP servers and three Claude agents that ship into a
HIPAA/HITRUST production stack: a PR-review agent on ~100 PRs a day, plus a Figma proxy
I stood up to clear Anthropic-side 429s that ended up doubling as an audit boundary.
I've done security in regulated healthcare for 25 years. The new thing here is doing it
in {their context} instead of my own, and that's the part I'd be learning fast.
moorelab.cloud has the rest.
```

That's ~7 sentences, ~100 words. Note the shapes vary (a plain opener, a colon list, a short declarative) — no negation-elevation, no "same X", no signpost label, no tricolon-as-beat. Open a DIFFERENT way each time (see `_profile.md` "Cover letter openers — ROTATE").

## File output

Save to: `output/cl-{company-slug}-{date}.md`
