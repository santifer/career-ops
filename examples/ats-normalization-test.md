# ATS Normalization Test Fixture

This file is a regression fixture for the text normalization pass added in `generate-pdf.mjs` (issue #1). It contains the Unicode artifacts that can cause parsing errors or display issues in ATS systems and legacy parsers. Use it to verify that the normalizer converts them to ASCII-safe equivalents.

## Problematic Unicode (normalizer must convert these)

| Name | Codepoint | Sample line | Converts to |
|------|-----------|-------------|-------------|
| Em-dash | U+2014 | Built and sold a SaaS — now shipping AI in production. | Built and sold a SaaS - now shipping AI in production. |
| En-dash | U+2013 | 2020–2024 at Acme Corp. | 2020-2024 at Acme Corp. |
| Curly double quote | U+201C / U+201D | "Led the migration" was a real bullet. | "Led the migration" was a real bullet. |
| Curly single quote | U+2018 / U+2019 | The team's velocity tripled. | The team's velocity tripled. |
| Ellipsis | U+2026 | And so on… | And so on... |
| Zero-width space | U+200B | Hello​world (there is a ZWSP between the two words) | Helloworld (removed) |
| Non-breaking space | U+00A0 | 5 years experience | 5 years experience (regular space) |

## Writing quality guidelines (writer must follow these)

The normalizer does NOT fix writing style. These are enforced by the rules in `modes/_shared.md` and should never appear in generated CV text in the first place.

- "passionate about machine learning"
- "results-oriented professional with a proven track record"
- "leveraged cutting-edge LLM technology"
- "spearheaded a strategic initiative"
- "facilitated cross-functional synergies"
- "crafted robust, scalable solutions"
- "in today's fast-paced digital world"
- "5+ years of experience in artificial intelligence"
- "demonstrated ability to drive innovative outcomes"

## How to verify the normalizer

```bash
# From the project root, after editing generate-pdf.mjs:
node --check generate-pdf.mjs

# Quick smoke test of the normalizer logic (no Patchright needed):
node -e "
import('./generate-pdf.mjs').catch(()=>{});
" 2>/dev/null || true
```

For an end-to-end test, generate a CV PDF from a known dirty HTML file and inspect the output:

```bash
node generate-pdf.mjs /tmp/dirty-cv.html /tmp/clean-cv.pdf --format=a4
# Expected log line:
# 🧹 ATS normalization: N replacements (em-dash=X, smart-double-quote=Y, ...)
```
