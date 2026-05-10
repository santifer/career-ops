# User Profile Context -- career-ops

<!-- ============================================================
     THIS FILE IS YOURS. It will NEVER be auto-updated.
     
     Customize everything here: your archetypes, narrative,
     proof points, negotiation scripts, location policy.
     
     The system reads _shared.md (updatable) first, then this
     file (your overrides). Your customizations always win.
     ============================================================ -->

## Your Target Roles

14 years of experience in real estate firms as a full-stack data professional.
Targeting US remote **individual contributor (IC)** data roles at real estate and property management companies.
**Not seeking leadership, management, or people-manager roles.** Priority: work-life balance + AI-resilient work.

**Role preference order (highest to lowest interest):**
1. **Data Engineering** — pipelines, platform, infrastructure (primary focus)
2. **Data Governance / Quality** — data contracts, validation, lineage, observability (primary focus)
3. **Analytics Engineering** — dbt, semantic layer, modeling (strong fit)
4. **BI / Insights Engineering** — dashboards, KPI frameworks (good fit)
5. **ML Engineering / Data Science** — open to it, but not the primary target

| Archetype | Thematic axes | What they buy | AI resilience |
|-----------|---------------|---------------|---------------|
| **Senior / Staff Data Engineer** ⭐ | Pipelines, warehouses, dbt, Snowflake/Databricks, data platform | Someone who builds and owns the data infrastructure end-to-end | High — AI runs on top of this work, not instead of it |
| **Data Governance / Quality Engineer** ⭐ | Data contracts, validation frameworks, lineage, observability, compliance | Someone who keeps data trustworthy and auditable | High — judgment, stakeholder alignment, regulation-heavy |
| **Data Platform / Infrastructure Engineer** ⭐ | Cloud infra, orchestration, Airflow, CI/CD, data reliability | Someone who keeps the data platform running reliably | High — operational, context-heavy, judgment-dependent |
| **Analytics Engineer** | dbt, Snowflake, semantic layer, BI, data modeling | Someone who bridges raw data and business insight | High — requires business context + domain judgment AI lacks |
| **BI / Insights Engineer** | Tableau/Looker/Power BI, KPI frameworks, self-serve analytics | Someone who translates data into decisions | Medium-High — AI generates queries but humans define the questions |
| **Full Stack Data Engineer** | End-to-end: ingestion → transformation → serving → BI | A rare generalist who owns the entire data stack | High — breadth makes full replacement hard |
| **ML / Data Scientist** (lower priority) | Predictive models, forecasting, NLP, segmentation | Someone who builds and deploys models | Medium — many ML tasks compressing under AutoML/LLMs |

⭐ = primary focus. Boost these in scoring (see below).

## Your Adaptive Framing

| If the role is... | Emphasize about you... | Proof point sources |
|-------------------|------------------------|---------------------|
| Data Engineering ⭐ | Metadata-driven ETL on Azure, GCP+Azure pipelines, Spark/PySpark, Snowflake/Databricks, $200K+ DaVinci automation | cv.md + article-digest.md |
| Data Governance / Quality ⭐ | End-to-end validation frameworks, data contracts, governance councils, automated quality dashboards | cv.md + article-digest.md |
| Data Platform / Infra ⭐ | Cloud orchestration, Airflow, CI/CD, data reliability, governance | cv.md + article-digest.md |
| Analytics Engineering | dbt modeling, semantic layer, BI delivery, stakeholder impact | cv.md + article-digest.md |
| BI / Reporting | Dashboard design, KPI definition, self-serve analytics adoption | cv.md + article-digest.md |
| Full Stack / Platform | Ownership from ingestion to BI, breadth across the stack | cv.md + article-digest.md |
| ML / Data Science | RE-relevant predictive modeling (forecasting, segmentation, NLP) — open but not primary | cv.md |

## Your RE Domain Advantage

**This is your moat.** Most data engineers and scientists have no real estate context.
You have 14 years of it. Always surface domain knowledge explicitly in evaluations:

- Property valuation and AVM logic (how Zestimates, HouseCanary AVMs work)
- Lease lifecycle data (listing → showing → application → lease → renewal → churn)
- Portfolio analytics (occupancy rates, NOI, cap rates, rent rolls)
- Market data nuances (MLS feeds, CoStar/ATTOM data quality issues, dedup)
- Maintenance and ops data (work orders, vendor SLAs, turn costs)
- Mortgage pipeline data (origination, servicing, delinquency, prepayment)

When a JD mentions any of these — cite it as a direct match. Most candidates won't know what a rent roll is.

## Scoring Overrides

### Green Card / US Work Authorization Boost

**RULE: When a job posting explicitly states "Green Card or US Citizen only", "No sponsorship", "Must be authorized to work in the US without sponsorship", or equivalent language — add +0.4 to the final Global score (capped at 5.0).**

**Why:** These roles exclude the majority of highly qualified candidates (H1B holders, OPT, TN). As a green card holder or citizen, you face significantly less competition. The effective talent pool shrinks by 30-50%+, meaningfully improving your odds of reaching the interview stage.

**How to surface this in reports:**
- Note it explicitly in Block D (Cultural signals) or as a standalone callout:
  > ✅ **Work Auth Advantage:** Role requires GC/Citizen only. Candidate qualifies; estimated 30-50% fewer competing applicants.
- Add the +0.4 in the Global score calculation and annotate it:
  > Global: 3.8 → **4.2** (+0.4 work auth advantage)

**Signals to detect (case-insensitive, partial match):**
- "green card" + ("only" OR "required" OR "holders")
- "US citizen" + ("only" OR "required")
- "must be authorized to work" + ("without sponsorship" OR "no sponsorship")
- "no visa sponsorship" OR "cannot sponsor" OR "sponsorship not available"
- "US persons only" (common in defense/government-adjacent roles)
- "must have existing authorization"

**Do NOT apply this boost if:**
- The JD says "we welcome all work authorizations" or similar
- Sponsorship is mentioned but only for future GC (many companies sponsor GC for H1B holders — that's a different signal)
- The JD is silent on sponsorship (neutral — no boost, no penalty)

### Remote-Only Boost

**RULE: Roles listed as "100% remote" or "fully remote" with no travel requirement get +0.2 to Global score.**

**Why:** You are targeting US remote only. Fully remote removes relocation pressure, maximizes optionality, and fits your work style.

**Do NOT apply if:**
- Role says "remote-friendly" but expects quarterly travel or onsite sprints
- Role is remote only for a specific geography you're not in

### Role-Type Tilt (DE + DG > Analytics > ML)

**RULE: Apply the following Global score adjustment based on detected primary role type:**

| Primary role type | Adjustment | Rationale |
|---|---|---|
| **Data Engineering** (pipelines, platform, infra) | **+0.3** | Top interest. Direct match to JLL track record. |
| **Data Governance / Quality** (contracts, validation, lineage, observability) | **+0.3** | Top interest. JLL governance council + validation frameworks experience. |
| **Data Platform / Infrastructure** | **+0.2** | Strong fit, AI-resilient. |
| **Analytics Engineering** (dbt + semantic layer) | **+0.1** | Good fit, secondary preference. |
| **BI / Insights Engineering** | neutral | Acceptable, not preferred. |
| **ML Engineer / Data Scientist** (primary focus) | **−0.2** | Open to it but not primary interest. Apply only if other signals are strong. |
| **Hybrid DE + ML** ("ML Platform Engineer", "MLOps") | **+0.1** | DE-flavored ML is fine. |

**Detection guide:**
- Look at the JD's day-to-day responsibilities, not just the title.
- A "Data Scientist" role that's 70% pipelines and 30% modeling = treat as Data Engineering (+0.3).
- A "Data Engineer" role that's 70% notebook ML work = treat as ML (−0.2).

**Annotate the adjustment in the report:**
> Role type: Data Engineering — applied +0.3 (primary interest area).

### Real Estate Domain Boost

**RULE: When the company is a real estate firm, PropTech, property management SaaS, or RE data platform — add +0.3 to Block A (Match con CV) before the Global calculation.**

**Why:** Your 14 years of RE domain experience is directly transferable and rare. Generic tech companies don't get this boost.

### Work-Life Balance Scoring

**RULE: Evaluate WLB signals explicitly in Block D (Cultural signals) using these adjustments:**

| Signal in JD | Adjustment |
|---|---|
| "on-call rotation", "pagerduty", "24/7 support" for IC data roles | −0.3 |
| "fast-paced", "wear many hats", "startup hustle", "move fast" with no WLB mention | −0.2 |
| "unlimited PTO" with no other WLB signals (often meaningless) | neutral |
| "flexible hours", "async-first", "no meetings culture", "outcomes over hours" | +0.2 |
| Glassdoor WLB rating ≥ 4.0 (check via WebSearch) | +0.1 |
| Series A or earlier startup (<50 people) with no explicit WLB mention | −0.2 (flag it) |
| Public company or late-stage (Series C+, >200 employees) | +0.1 (structural stability) |

**Always call out WLB signals explicitly in Block D.** If the JD is silent, say so — silence is a yellow flag for startups, neutral for established companies.

### Leadership / People Manager Penalty

**RULE: If a role requires managing people, owning hiring, or carrying a people-manager title (Manager, Director, Head, VP, Lead with direct reports) — subtract −1.0 from Global score and flag as misaligned.**

Rationale: You are targeting IC roles for work-life balance. People management expands scope, hours, and stress unpredictably. Flag clearly:
> ⚠️ **Role mismatch:** This is a people-manager position. Candidate is targeting IC roles only. Score penalized −1.0.

**Exception:** "Tech Lead" or "Lead Engineer" with no direct reports is acceptable IC — do not penalize.

### AI-Resilience Assessment

**RULE: Add a brief AI-Resilience note to every evaluation report, after Block F:**

> **AI Resilience:** [High / Medium / Low] — [1-sentence reason]

**Guidelines:**
- **High** — Data Engineering (pipelines, platform, infra), Analytics Engineering (dbt + domain modeling), Data Governance. These build the infrastructure AI depends on. Domain context (RE) makes replacement harder.
- **Medium** — BI/Reporting, Data Analysis, Data Science with narrow scope. AI can accelerate but not fully replace — especially where RE domain judgment is required.
- **Low** — Pure report-pulling, generic SQL analysis, simple dashboard maintenance with no engineering component. Flag these.

**Do NOT penalize score** based on AI resilience — it's informational only. But if a role is Low resilience, mention it as a consideration.

## Your Comp Targets

Use WebSearch for current market data (Levels.fyi, Glassdoor, Blind, Comprehensive.io).
Anchor by title and years of experience (14 YOE). IC roles only.

**General guidance:**
- Senior Data Engineer (US remote): $150k–$200k base + equity
- Staff Data Engineer: $180k–$240k base + equity
- Analytics Engineer (Senior): $140k–$185k base
- Data Platform / Infra Engineer (Senior): $155k–$205k base + equity
- BI Engineer (Senior): $130k–$170k base

## Your Negotiation Scripts

**Salary expectations:**
> "Based on current market data for senior data roles in real estate tech, I'm targeting $[RANGE]. I'm open on structure — base, equity, and bonus all matter. What's the range budgeted for this level?"

**On domain depth:**
> "14 years in RE data is unusual — most data engineers have to learn the domain on the job. I've already built the muscle: MLS feeds, AVM validation, lease lifecycle modeling, portfolio analytics. That ramp-up cost is zero for you."

**Geographic discount pushback:**
> "The work is fully remote and output-based. My track record doesn't change based on where my desk is."

**When offered below target:**
> "I'm comparing this with other opportunities in the $[higher range]. I'm drawn to [company] specifically because of [concrete reason]. Can we get to $[target] on base, or explore equity/bonus to close the gap?"

## Your Location Policy

- **Target:** US remote only. No relocation. No hybrid outside your metro.
- **Timezone:** Flexible across US timezones (flag in applications if ET/CT/MT/PT overlap matters).

**In evaluations (scoring):**
- Hybrid required (3+ days onsite): score **2.0** on Cultural signals, note as near-dealbreaker
- Travel required >20%: score **2.5**, flag explicitly
- "Remote with occasional travel" (1-2x/year): acceptable, score **4.0**
- Fully remote, no travel: score **5.0**, apply Remote-Only Boost (+0.2)
- Only score 1.0 if JD says "must be on-site 4-5 days/week, no exceptions"
