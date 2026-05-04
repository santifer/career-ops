# Evidence Hierarchy (E1-E5)

The recruiter's brain processes claims in an implicit hierarchy of epistemic strength. Not every statement carries the same weight.

| Level | Type | Example | Perceived Strength |
|-------|------|---------|-------------------|
| E5 | Quantified result with context | "Reduced p99 latency from 2.1s to 380ms (−82%) by optimizing PostgreSQL queries" | Maximum — concrete, verifiable, specific |
| E4 | Quantified result without context | "Reduced latency by 82%" | High but generates doubt: "from what to what?" |
| E3 | Named action with technology | "Optimized PostgreSQL queries with partial indexes" | Moderate — shows know-how but no result |
| E2 | Generic action | "Worked on performance optimization" | Low — anyone could say this |
| E1 | Adjective/claim | "Experienced in performance" | Null — self-assessment, not evidence |

**Rule:** Every bullet must be E4 or E5. E1-E3 bullets are pixel waste.

**Why E5 > E1:** A recruiter scanning 200 CVs has no time to verify claims. "Experienced in performance" (E1) could come from anyone. "Reduced p99 from 2.1s to 380ms" (E5) can only come from someone who was there. The cost of producing an E5 signal filters out impostors — this is Signal Theory in action.

**E5 formula:** `RESULT + ACTION + TOOL + METRIC`

Example: "Reduced API latency 40% by implementing Redis caching layer (p99 from 800ms to 120ms)"

**Downgrade detection:** When you catch yourself writing E1-E3, ask: "What number proves this?" If no number exists, the claim isn't ready for a CV.