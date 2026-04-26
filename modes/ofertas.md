# Mode: offers-compare — Multi-Offer Comparison

Weighted scoring matrix across 10 dimensions:

| Dimension | Weight | Criteria 1-5 |
|-----------|--------|--------------|
| North Star alignment | 25% | 5=exact target role, 1=unrelated |
| CV match | 15% | 5=90%+ match, 1=<40% match |
| Seniority level | 15% | 5=senior+, 4=mid-senior, 3=mid, 2=junior-mid, 1=junior |
| Estimated comp | 10% | 5=top quartile Canada, 1=below market |
| Growth trajectory | 10% | 5=clear path to next level, 1=dead end |
| Remote quality | 5% | 5=full remote async, 1=onsite only outside Calgary |
| Company reputation | 5% | 5=top employer, 1=red flags |
| Tech stack modernity | 5% | 5=modern Microsoft 365/Azure stack, 1=legacy/obsolete |
| Time to offer | 5% | 5=fast process, 1=6+ months |
| Cultural signals | 5% | 5=collaborative/builder culture, 1=bureaucratic/toxic |

For each offer: score on each dimension, weighted total score.
Final ranking + recommendation with time-to-offer considerations.

Ask the user for the offers if not already in context. Can be text, URLs, or references to offers already evaluated in the tracker.
