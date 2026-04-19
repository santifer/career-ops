---
name: rejection-patterns
description: Analyze tracked job applications for outcome patterns and conversion insights. Use when asked to analyze rejections, find application patterns, review conversion funnel, check score vs outcome correlations, or generate a pattern analysis report. Triggers on "analyze patterns", "rejection patterns", "conversion funnel", "what's working", "application insights".
---

# Rejection Pattern Detector

Analyze tracked applications to find actionable patterns in outcomes.

## Data Source

Application tracker stored as Markdown: `applications.md` in the project root.

Columns (TSV or table format): company, role, status, score, archetype, remote_policy, blockers, tech_gaps, date, notes.

## Minimum Threshold

Count entries with status beyond "Evaluated" (Applied, Responded, Interview, Offer, Rejected, Discarded, SKIP).

If < 5, respond:
> "Not enough data yet -- {N}/5 applications have progressed beyond evaluation. Keep applying and come back when you have more outcomes to analyze."

## Outcome Classification

| Status | Outcome |
|--------|---------|
| Interview, Offer, Responded, Applied | **Positive** |
| Rejected, Discarded | **Negative** |
| SKIP | **Self-filtered** |
| Evaluated | **Pending** |

## Analysis Steps

### Step 1 — Parse Data

Read `applications.md`. For each entry extract: status, score, archetype, remote_policy, blockers, tech_gaps, company_size, date.

### Step 2 — Compute Metrics

1. **Conversion funnel:** Count per status, percentage of total
2. **Score vs outcome:** Avg/min/max score per outcome group
3. **Archetype breakdown:** Per-archetype total, positive, negative, self_filtered, conversion rate
4. **Top blockers:** Frequency of recurring blockers
5. **Remote policy patterns:** Conversion rate by policy type
6. **Tech stack gaps:** Most frequent missing skills in negative outcomes
7. **Score threshold:** Recommended minimum from positive-outcome cluster

### Step 3 — Generate Report

Write to `reports/pattern-analysis-{YYYY-MM-DD}.md`.

### Report Structure

```markdown
# Pattern Analysis -- {YYYY-MM-DD}

**Applications analyzed:** {total}
**Date range:** {from} to {to}
**Outcomes:** {positive} positive, {negative} negative, {self_filtered} self-filtered, {pending} pending

## Conversion Funnel
| Stage | Count | % |

## Score vs Outcome
| Outcome | Avg Score | Min | Max | Count |

## Archetype Performance
| Archetype | Total | Positive | Negative | Conversion |

## Top Blockers
| Blocker | Count | % of Total |

## Remote Policy Patterns
| Policy | Total | Positive | Negative | Conversion |

## Tech Stack Gaps
| Missing Skill | Frequency |

## Recommended Score Threshold
{threshold} -- {reasoning}

## Recommendations
1. **[HIGH/MED/LOW]** Action -- Reasoning
```

### Step 4 — Present Summary

Condensed: one-line stat summary, top 3 findings, link to full report.

### Step 5 — Offer Actions

Ask user if they want to act on recommendations: update search filters, adjust score threshold, shift archetype targeting.
