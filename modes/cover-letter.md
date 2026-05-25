# Mode: cover-letter — Generate Tailored Cover Letter

Generate a cover letter for the given role using Patrick's calibrated voice. The cover letter must sound like a human wrote it — specifically, like Patrick wrote it.

## Inputs Required

1. **JD text or URL** — the role to target
2. **cv.md** — read for proof points
3. **article-digest.md** — read for detailed proof points
4. **modes/_profile.md** — read the "Writing Style" section for voice rules
5. **Report** (if exists) — use the evaluation's archetype detection and match analysis

## Structure: 3 Short Paragraphs

### Paragraph 1 — Hook (2-3 sentences)
Identity + time-in-grade + what's specific about THIS company/role.

Pattern: "I've been [doing X] for [time]. The last chapter is [current work]. [Company]'s [specific thing from JD] is why I'm writing."

DO NOT start with "Dear Hiring Manager" — start with the hook directly.
DO NOT use "I am writing to express my interest in..." 

### Paragraph 2 — Proof (3-5 sentences)
Map 2-3 concrete proof points from cv.md/article-digest.md directly to specific JD requirements. Use the archetype framing from _profile.md to pick which proof points to lead with.

Rules:
- Name technologies, numbers, outcomes
- "I built X" not "I leveraged X"
- Connect each proof point to what THEY need, not just what you did
- One analogy or "signature line" from _profile.md if it fits naturally

### Paragraph 3 — Close (1-2 sentences)
Direct. No corporate valediction. Signal availability and enthusiasm without groveling.

Pattern: "I'd like to talk about [specific thing you'd do for them]. [One-sentence availability or link to portfolio]."

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

**200-300 words total.** Not a page. Not a memo. A recruiter reads 50 cover letters a day — respect their time. Hit hard, hit fast, get out.

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
I've been building and securing production systems for 28 years. The last chapter
is AI agents and GPU training infra in a regulated healthcare environment — three
Claude agents in production, with MCP infra and governance I built underneath.
{Company}'s {specific thing from JD} is why I'm writing.

At Viecure I shipped a PR review agent doing ~100 reviews/day, a combined design
review system across Figma and Jira via an Azure-hosted MCP proxy I built to clear
429 rate limits, and an App Insights operational loop that posts daily analysis to
Slack and lets engineers spawn Jira tickets directly from the report. The proxy
doubles as a HIPAA/HITRUST audit boundary. I also built the GPU training
infrastructure for an ambient AI transcription model — A100 VMSS, 3 RabbitMQ
servers, 80+ Azure resources, fully compliant. {Connect to what they need.}

I'd like to talk about how {specific value for them}. My portfolio is at
moorelab.cloud and I'm available anytime this week.
```

## File output

Save to: `output/cl-{company-slug}-{date}.md`
