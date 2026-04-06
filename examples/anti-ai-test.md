# Anti-AI Detection Test Fixture

This file is a regression fixture for the sanitization pass added in `generate-pdf.mjs` (issue #1). It contains the Unicode artifacts and phrase patterns that AI-text detectors weight most heavily. Use it to verify that the sanitizer strips them, and to remind yourself what NOT to write when generating CV content.

## Forbidden Unicode (sanitizer must strip these)

| Name | Codepoint | Sample line |
|------|-----------|-------------|
| Em-dash | U+2014 | Built and sold a SaaS — now shipping AI in production. |
| En-dash | U+2013 | 2020–2024 at Acme Corp. |
| Curly double quote | U+201C / U+201D | "Spearheaded the migration" was a real bullet. |
| Curly single quote | U+2018 / U+2019 | The team's velocity tripled. |
| Ellipsis | U+2026 | And so on… |
| Zero-width space | U+200B | Hello​world (there is a ZWSP between the two words) |
| Non-breaking space | U+00A0 | 5 years experience |

## Forbidden phrases (writer must avoid these)

The sanitizer does NOT strip these. They are caught by the rules in `modes/_shared.md` and should never appear in generated CV text in the first place.

- "passionate about machine learning"
- "results-oriented professional with a proven track record"
- "leveraged cutting-edge LLM technology"
- "spearheaded a strategic initiative"
- "facilitated cross-functional synergies"
- "crafted robust, scalable solutions"
- "in today's fast-paced digital world"
- "5+ years of experience in artificial intelligence"
- "demonstrated ability to drive innovative outcomes"

## How to verify the sanitizer

```bash
# From the project root, after editing generate-pdf.mjs:
node --check generate-pdf.mjs

# Quick smoke test of the sanitizer logic (no Playwright needed):
node -e "
import('./generate-pdf.mjs').catch(()=>{});
" 2>/dev/null || true
```

For an end-to-end test, generate a CV PDF from a known dirty HTML file and inspect the output:

```bash
node generate-pdf.mjs /tmp/dirty-cv.html /tmp/clean-cv.pdf --format=a4
# Expected log line:
# 🧹 Anti-AI sanitization: N replacements (em-dash=X, smart-double-quote=Y, ...)
```

## What this does NOT fix

Stronger detectors (originality.ai paid tier, GPTZero on long passages) will still flag generated text by perplexity and burstiness metrics, regardless of Unicode hygiene. The only complete fix is for the candidate to write meaningful chunks of their own CV in their own voice. This sanitization pass removes the obvious low-hanging tells.
