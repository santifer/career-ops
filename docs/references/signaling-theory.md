# Signaling Theory (Spence, 1973)

The job market has radical information asymmetry: you know your capabilities intimately; the employer does not. This asymmetry creates a trust problem that CVs are designed to solve.

## Core Concept

Spence demonstrated that **costly signals** — those requiring real investment to produce — are more credible than cheap signals. The cost of producing a signal acts as a filter: only those who genuinely possess the quality can afford to produce it.

## Costly vs. Cheap Signals

| Costly Signal (credible) | Cheap Signal (disposable) |
|---------------------------|---------------------------|
| Open-source project with 500+ stars | "Passionate about open-source" |
| p99 latency reduction documented with numbers | "Experienced in performance" |
| AWS Solutions Architect Professional certification | "Knows AWS" |
| Tech conference talk with public recording | "Great communicator" |
| System processing $XM/year in production | "Worked on critical systems" |
| Publication with 10K+ views | "Enjoys sharing knowledge" |
| Promotion to Staff/Principal at recognized company | "I have seniority" |
| Verbal reference from ex-CTO with verifiable contact | "I have good references" |

## Three Properties of a Credible Signal

1. **Observable** — Visible without effort from the receiver (recruiter doesn't need to dig)
2. **Verifiable** — Can be checked by third parties (GitHub link, LinkedIn, portfolio)
3. **Hard to falsify** — Cannot be easily replicated by someone without the actual competence

## Application to CVs

Every claim on your CV should pass the costly signal test:
- If you write "experienced in performance" (E1), anyone can write that — zero signal value
- If you write "reduced p99 from 2.1s to 380ms" (E5), only someone who was there can write that — high signal value

**Rule:** Each positioning point must be backed by ≥1 costly signal. Cheap signals are permitted only as supplements, never as primary proof.

## ATS Keyword Distribution

Keywords serve a dual function: discoverability (machine matching) and signaling (human scanning). Distribute varied terms across sections without repetition:

- **Headline:** top 3 keywords (highest search weight)
- **About/Summary:** keywords 4-12
- **Experience bullets:** keywords 13-20
- **Skills section:** keywords 21-50

Vary terms: `React = React.js = ReactJS = Frontend React = React Developer`. Same concept, different search queries.