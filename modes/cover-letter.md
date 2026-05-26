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

**NEVER:** Leveraging, spearheading, pioneering, orchestrating, passionate about driving innovation, cross-functional collaboration, proven track record, state-of-the-art, perfect parallel structure, corporate valedictions.

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
I've been building and securing production systems for 28 years — the last chapter
is three Claude agents in production at a regulated healthcare company, with the
MCP infra and governance underneath. {Company}'s {specific thing} is why I'm writing.
At Viecure I run a PR review agent at ~100 PRs/day, an Azure-hosted MCP proxy that
doubles as a HIPAA audit boundary, and the GPU training infra for an ambient AI
transcription model (A100s, 80+ Azure resources). Happy to talk — moorelab.cloud
has the details.
```

That's 6 sentences. 95 words. Done.

## File output

Save to: `output/cl-{company-slug}-{date}.md`
