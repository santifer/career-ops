# Interview Intelligence Guides

Company-specific interview prep guides for AI/tech roles. Each file covers the interview process, typical questions, coding tasks, cultural signals, and pro tips, distilled from public post-mortems, candidate reports, and community knowledge.

## Available Guides

| Company | File | Focus |
|---------|------|-------|
| Amazon | [Amazon.md](Amazon.md) | Leadership Principles loop, bar raiser dynamics, front-loaded comp |
| Anthropic | [Anthropic.md](Anthropic.md) | Safety-depth filter, async writing sample, research mindset |
| Apple | [Apple.md](Apple.md) | On-device ML, secrecy culture, craftsmanship bar |
| Cohere | [Cohere.md](Cohere.md) | Enterprise RAG, multilingual NLP, production-first mindset |
| Databricks | [Databricks.md](Databricks.md) | Delta Lake, MLflow, cross-layer data and ML thinking |
| Google DeepMind | [DeepMind.md](DeepMind.md) | Research Scientist vs. Research Engineer split, paper discussion rounds |
| Google | [Google.md](Google.md) | HC review process, STAR behavioral rubric, team-matching strategy |
| Hugging Face | [HuggingFace.md](HuggingFace.md) | Open-source contributions, take-home projects, remote-first culture |
| Meta | [Meta.md](Meta.md) | Impact quantification, E-level calibration, data fluency |
| Microsoft | [Microsoft.md](Microsoft.md) | Growth mindset scoring, partner interview round, Azure AI stack |
| Mistral AI | [MistralAI.md](MistralAI.md) | Open-weight conviction, lean process, European AI market |
| Netflix | [Netflix.md](Netflix.md) | Keeper test, causal inference depth, candor culture |
| NVIDIA | [Nvidia.md](Nvidia.md) | GPU memory hierarchy, distributed training, systems depth |
| OpenAI | [OpenAI.md](OpenAI.md) | Research mindset bar, RLHF questions, inference system design |
| Palantir | [Palantir.md](Palantir.md) | Hacker Assessment (PHA), decomp interview, FDE role specifics |
| Perplexity AI | [PerplexityAI.md](PerplexityAI.md) | RAG-native product, search infrastructure, fast-ship culture |
| Salesforce | [Salesforce.md](Salesforce.md) | Agentforce, enterprise multi-tenant ML, Einstein AI stack |
| Scale AI | [ScaleAI.md](ScaleAI.md) | RLHF data pipelines, benchmark contamination, annotation systems |
| Waymo | [Waymo.md](Waymo.md) | AV perception, prediction and planning, safety-first ML |
| xAI | [xAI.md](xAI.md) | First-principles bar, competitive coding, early-stage culture |

## How to Use

Load any guide before an interview for a quick, structured briefing:

```
/career-ops interview-intel OpenAI
```

Or read the file directly. Every guide is self-contained.

## How to Contribute

1. Copy an existing `.md` file as a template.
2. Fill in the sections for your target company.
3. Keep content based on publicly available information (Glassdoor, Blind, official engineering blogs, candidate write-ups).
4. Submit a PR.

**File naming:** Use the official company name in PascalCase (e.g., `Apple.md`, `Nvidia.md`, `MistralAI.md`).

**Content guidelines:**
- Prioritize signal over noise. What actually differentiates this company's process?
- Mark anything time-sensitive with a `> Verify: ...` callout.
- No made-up or unverifiable claims.
- Keep sections consistent with the template so guides are easy to compare.
- Write like a senior engineer friend giving advice. No em dashes, no corporate language.

## Template

```markdown
# [Company] Interview Intelligence

## Overview
...

## Stages

| Stage | Format | Duration |
|-------|--------|----------|
| ...   | ...    | ...      |

## Typical Questions
...

## Coding Tasks
...

## Cultural & Technical Signals
...

## Pro Tips
...
```

---

*This directory addresses [issue #76](https://github.com/santifer/career-ops/issues/76) from the upstream project.*
