# Skill Medallion Badges

Generated 2026-05-17 via `scripts/generate-skill-badges.mjs` using Nano Banana 2 (`gemini-3.1-flash-image-preview`).

## Summary

- Badges generated: **10/10**
- Subject Consistency: **enabled** (badge 1 is the style anchor; badges 2-10 reference it via `inline_data` per https://ai.google.dev/gemini-api/docs/image-generation)
- Total estimated API spend: **$0.450** (hard ceiling was $1.00)
- Average file size: **375 KB**
- Style anchor used: `circular medallion, line-art minimalist, neutral palette aligned with Career-Ops dashboard (#16a34a green accent, slate-blue background #475c75), flat geometric, no photorealism, no text, transparent ring on dark background, legible at 64px display size`

## Badges

| # | Skill | Slug | File | Size | Status |
|---|-------|------|------|------|--------|
| 1 | Python (agent-build) | `python-agent-build` | [`python-agent-build.png`](./python-agent-build.png) | 393 KB | ok |
| 2 | SQL (data analysis) | `sql-data-analysis` | [`sql-data-analysis.png`](./sql-data-analysis.png) | 424 KB | ok |
| 3 | Technical Program Management | `technical-program-management` | [`technical-program-management.png`](./technical-program-management.png) | 385 KB | ok |
| 4 | AI Product Management | `ai-product-management` | [`ai-product-management.png`](./ai-product-management.png) | 348 KB | ok |
| 5 | Voice & brand | `voice-brand` | [`voice-brand.png`](./voice-brand.png) | 354 KB | ok |
| 6 | Cross-functional leadership | `cross-functional-leadership` | [`cross-functional-leadership.png`](./cross-functional-leadership.png) | 334 KB | ok |
| 7 | Forward Deployed Engineering | `forward-deployed-engineering` | [`forward-deployed-engineering.png`](./forward-deployed-engineering.png) | 371 KB | ok |
| 8 | Solutions Architecture | `solutions-architecture` | [`solutions-architecture.png`](./solutions-architecture.png) | 337 KB | ok |
| 9 | Editorial & Communications | `editorial-communications` | [`editorial-communications.png`](./editorial-communications.png) | 469 KB | ok |
| 10 | Shipping velocity | `shipping-velocity` | [`shipping-velocity.png`](./shipping-velocity.png) | 332 KB | ok |

## How to regenerate a single badge

```bash
node scripts/generate-skill-badges.mjs --skills <slug> --limit 1
```

(Slugs are listed above. Adding `--no-consistency` disables the reference-image anchor.)

## How to regenerate all badges

```bash
node scripts/generate-skill-badges.mjs --limit 10
```

## Subject Consistency mechanism

Per the Gemini Image Generation docs (verified 2026-05-17), Nano Banana 2 does NOT take a dedicated
`tools: [{ subject_consistency: {} }]` flag. Consistency is achieved by passing one or more
reference images via `contents.parts.inline_data` (up to 14 objects).

This script generates badge #1 with NO reference (it IS the anchor), then passes badge #1 as an
`inline_data` reference for badges #2-N alongside the matching style-anchor prompt text.
