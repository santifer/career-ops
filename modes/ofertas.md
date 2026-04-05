# Modo: ofertas — Comparación Multi-Oferta

**Uses the Canonical Scoring Model from `modes/_shared.md`** — the same 10 weighted dimensions used in `oferta`, `auto-pipeline`, and `batch` evaluations. This means scores from prior evaluations are directly comparable. No need to re-score unless the user explicitly requests it.

## Workflow

1. **Gather offers**: Ask the user for offers if not in context. Can be text, URLs, or references to already-evaluated offers in the tracker.
2. **Score each offer**: If an offer was already evaluated (has a report in `reports/`), read the existing per-dimension scores from the report. If not yet evaluated, score using the full Canonical Scoring Model.
3. **Build comparison matrix**: Show all 10 dimensions side-by-side across offers, with the weighted total.
4. **Rank and recommend**: Final ranking with recommendation. Highlight where offers differ most (the dimensions that actually discriminate). Include time-to-offer as a tiebreaker when scores are close (within 0.3).

## Output format

```
| Dimension (weight) | Offer A | Offer B | Offer C |
|---------------------|---------|---------|---------|
| North Star (25%) | X/5 | X/5 | X/5 |
| CV match (15%) | ... | ... | ... |
| ... | ... | ... | ... |
| **Weighted total** | **X.X** | **X.X** | **X.X** |
```

Then: narrative recommendation explaining which offer to prioritize and why, considering both score and practical factors (timeline, leverage for negotiation, etc.).
