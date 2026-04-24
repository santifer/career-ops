# Interview Intel: Marks & Spencer — Software Engineering Manager, Loyalty

**Report:** N/A (applied directly, no prior evaluation)
**Researched:** 2026-04-24
**URL:** https://jobs.marksandspencer.com/job-search/digital-tech/london-greater-london/software-engineering-manager-loyalty/300006527099637
**Closing date:** 5 May 2026
**Stage:** First — Technical STAR-based interview
**Sources:** Glassdoor (M&S), M&S careers page, Glassdoor engineering reviews, public news (cyber attack 2025)

---

## Process Overview

- **Rounds:** Online app → Assessment (role-dependent) → Interview (technical + STAR behavioral) → Decision
- **First stage format:** STAR competency-based interview — confirmed by candidate briefing
- **Location:** Remote or in-person (M&S offers both)
- **Difficulty:** Limited data for EM-level specifically. General M&S engineering interview Glassdoor reviews: 2.2/5 stars (21 reviews, Software Engineer level). Process described as structured and competency-led.
- **Known from research:**
  - Competency questions ask for past examples — classic STAR format
  - "Describe a time you made a mistake and how you fixed it" — [source: Glassdoor, M&S Software Engineer]
  - "Tell me about a time you pushed yourself beyond your comfort zone" — [source: Glassdoor]
  - Technical questions at later stage; first stage is behavioral/leadership competencies
- **Critical context:** M&S suffered a major cyber attack in 2025 that disrupted customer-facing services. They accelerated their digital transformation from a 2-year to a 6-month plan. Engineers who demonstrate **resilience, reliability, and delivery under pressure** will resonate strongly right now.

---

## Role Context You Must Know

**The Loyalty team** builds personalised offers and mission-based rewards for M&S customers. It collaborates directly with data scientists and the core loyalty platform team.

**Why this matters for your stories:**
- M&S Loyalty = high-volume, customer-facing, data-intensive. Your Ocado forecasting pipeline (high-volume, data-scientists collaboration) is a direct parallel.
- "You build it, you run it" DevOps mindset is explicit in the JD. Your out-of-hours support experience and SLO work map exactly.
- The cyber attack aftermath makes reliability/quality stories especially resonant.

**Tech stack alignment:**

| JD stack | Fergus's CV | Gap? |
|----------|-------------|------|
| Java, Spring Boot | ✅ Direct match | None |
| Azure Cloud | AWS experience | Minor — same concepts, different provider |
| Kubernetes | Not listed | Awareness gap — EM level, not a blocker |
| Dynatrace | Used CloudWatch + PagerDuty | Equivalent observability experience |
| SQL Server, MongoDB | SQL listed | Minor |
| React, Next.js, TypeScript | Not listed | Frontend gap — EM level, manageable |
| Micronaut | Not listed | Spring Boot adjacent — minimal gap |

**Bottom line on tech:** Java/Spring Boot is the core backend stack — Fergus is a direct fit. Frontend gaps (React, TypeScript) are not blockers at EM level.

---

## First Stage: STAR Interview — What They're Assessing

Based on the JD's four focus areas, the interviewer will be testing these competencies:

| JD Pillar | Competency being tested |
|-----------|------------------------|
| Team Management | Coaching, developing engineers, handling underperformance |
| Agile Delivery | Delivery ownership, managing risk, PM/Design collaboration |
| Technical Leadership | Driving standards, technical strategy, hands-on credibility |
| Quality Assurance | Reliability, incident response, quality culture |

---

## Likely Questions + Recommended Stories

### 1. Team Management

**"Tell me about a time you built or transformed a high-performing engineering team."**
- [inferred from JD: "Build and mentor high-performing software engineers"]
- **Your story:** Team promotions pipeline at Ocado
  - **S:** Inherited a team with no structured progression framework
  - **T:** Develop engineers to Senior, Staff, and Senior Staff level through structured coaching
  - **A:** Weekly 1:1s with explicit skill laddering; pushed each engineer toward one business-impacting stretch project per quarter; tracked progress transparently
  - **R:** Promoted engineers to Senior, Staff, and Senior Staff within 3 years — 100% of those who wanted to grow, grew. 100% retention rate for rotation graduates.
  - **Reflection:** "Career growth requires explicit conversations about what good looks like at the next level. I now start every development conversation with: what does the level above you do that you don't do yet?"

**"Describe a time you had to manage a difficult situation with an engineer on your team."**
- [inferred from JD: people management + coaching]
- Prepare a story around giving difficult feedback, managing performance, or supporting someone through a change. If you have a real example, use it. Keep it specific and forward-looking. Format: what the situation was → your instinct vs what you chose to do → outcome → what you'd do the same or differently.

---

### 2. Agile Delivery

**"Tell me about a time you delivered a complex project on time and on budget."**
- [inferred from JD: "Oversee planning and execution of software projects aligned with business objectives"]
- **Your story:** 14-person cross-team project at Ocado
  - **S:** Cross-functional project involving data scientists, data analysts, and software engineers across multiple teams
  - **T:** Deliver on time with no direct authority over most contributors
  - **A:** Automated blocker visibility on the scrum board; surfaced dependencies early; maintained shared capacity view; reduced dependency impact before it became a crisis
  - **R:** Project delivered; cross-team dependencies managed proactively; team secondments and knowledge-sharing as a by-product
  - **Reflection:** "Accountability without authority requires information systems, not just relationships. I built the tooling to make invisible problems visible."

**"Tell me about a time you improved your team's delivery process."**
- [inferred from JD: Agile, monitoring progress and risks]
- **Your story:** Cycle time improvement
  - **S:** Sprint cycles too long, WIP sprawling, team morale low around delivery pace
  - **T:** Improve cycle time without disrupting the team
  - **A:** Reduced sprint length, capped WIP per engineer, introduced just-in-time technical discovery (not up-front)
  - **R:** 30% cycle time improvement, reduced wasted effort, team reported clearer focus
  - **Reflection:** "The hardest part was convincing the team to take things off the board. People confuse busyness with progress."

---

### 3. Technical Leadership

**"Give me an example of when you drove adoption of engineering standards or best practices."**
- [inferred from JD: "Drive adoption of development standards and methodologies"]
- **Your story:** Department-wide UI working group
  - **S:** UI technical debt owned by one team; five other teams contributing without accountability or shared standards
  - **T:** Expand ownership and codify best practices without top-down mandate
  - **A:** Established cross-team working group; defined best practices collaboratively; created a forum for dissemination every 3 weeks alongside the tech talks series
  - **R:** 6 teams now jointly own and improve the UI layer; practices codified and adopted department-wide
  - **Reflection:** "Standards spread through communities of practice, not mandates. Give people ownership of the standards and they maintain them."

**"Tell me about a significant technical decision you made and how you ensured it was the right call."**
- [inferred from JD: "Provide technical guidance on complex projects"]
- **Your story:** AWS Lambda migration OR Modular Monolith architecture
  - **Option A (Lambda):** Steered the team from traditional infrastructure to AWS Lambda for high-volume forecasting. Built simulation data to validate the approach before committing. Result: 85% cost reduction, 5× faster, production incidents eliminated.
  - **Option B (Modular Monolith):** Proposed modular monolith for a greenfield project. Explicit reasoning: initial speed + clean path to microservices. Enforced boundaries via architecture testing. Result: team shipped fast without accruing unmanageable debt.
  - Pick Option A for "biggest impact" questions; Option B for "architecture decision-making" questions.

---

### 4. Quality Assurance / Reliability

**"Describe a time you improved the reliability or quality of a system your team owned."**
- [inferred from JD: "Establish quality standards ensuring software meets performance and reliability requirements"]
- **Your story:** SLO definition + monitoring before go-live
  - **S:** New warehouse orchestration service going live; no observability, no on-call runbooks
  - **T:** Ensure the system was production-ready before launch
  - **A:** Defined SLOs; implemented CloudWatch + PagerDuty monitoring; wrote support playbook; rehearsed incident response
  - **R:** Zero incidents at launch; on-call team had clear procedures; stakeholder trust maintained
  - **Reflection:** "You cannot retrofit observability after a bad incident. For any system going live, monitoring and runbooks are part of the definition of done."

**"Tell me about a time you had to deal with a production incident. How did you handle it?"**
- [inferred from JD + M&S cyber attack context — reliability is top of mind right now]
- **Your story:** Out-of-hours production support at Ocado
  - Frame around: quick response, keeping stakeholders informed, root cause analysis, prevention.
  - Key line: "I kept stakeholders informed around the root cause and resolution throughout — maintaining trust is as important as fixing the problem."

---

### 5. Cross-Functional Collaboration (Loyalty team works with Data Scientists + Platform team)

**"Tell me about a time you worked closely with non-engineering stakeholders to deliver something."**
- [inferred from JD: "Collaborate with product management and design teams" + Loyalty team works with data scientists]
- **Your story:** PM/UX/Eng alignment OR Data scientist collaboration
  - Frame Ocado's cross-functional structure: "My team included data scientists, data analysts, and software engineers. Orchestrating that collaboration — making sure the data science work connected to the engineering delivery — was a core part of my role."
  - Add the PM/UX dynamic: "I positioned myself as the feasibility translation layer — present in discovery, not just delivery."

---

### 6. Mistake / Failure Question (Almost Certain)

**"Tell me about a time you made a mistake and what you learned."**
- [source: Glassdoor, M&S Software Engineer review]
- Prepare a real, specific mistake. Not a humble-brag ("I worked too hard"). Something that cost real time or trust, where you can show:
  - What you did wrong
  - What you did immediately to fix it
  - What you changed systemically so it wouldn't happen again
- Format that signals seniority: "The lesson I took from this is now part of how I run every project."

---

## Background Red Flags to Pre-empt

| Likely question | Why it comes up | Your framing |
|----------------|-----------------|--------------|
| "You've been at Ocado your entire career — why M&S?" | 6 years at one company; loyalty vs. growth signal | "Ocado gave me a deep foundation in distributed systems and platform engineering. I'm looking for the next stage — a larger-scale consumer-facing product with a direct loyalty/personalisation mission. M&S's technology transformation and the Loyalty team's data-science integration is exactly that." |
| "M&S is retail, Ocado is logistics tech — different world?" | Domain switch concern | "The engineering problems are the same: high-volume, event-driven, real-time systems serving millions of customers. The stack is almost identical (Java/Spring Boot). Domain knowledge is learnable; systems thinking and people leadership are what transfer." |
| "The JD mentions React/TypeScript — your CV shows Java/Spring Boot" | Frontend stack gap | "At EM level I set quality standards and unblock decisions — I don't need to be the best TypeScript engineer. My team at Ocado included engineers across multiple stacks. I'll ramp on the specifics; the engineering leadership I bring is language-agnostic." |
| "M&S has been through a lot with the cyber attack — what would you do in your first 90 days?" | [likely asked given context] | "Listen first. Map the health of the Loyalty platform — talk to engineers about what's brittle, what's reliable, what keeps them up at night. The cyber attack context makes reliability culture urgent; I'd make on-call hygiene and runbook quality a priority in the first 30 days." |

---

## Company Signals

**Values to demonstrate:**
- "You build it, you run it" — M&S explicitly uses this language. Show it: your SLO work, your out-of-hours support, your playbook maintenance.
- Quality + reliability — post-cyber attack, this is not abstract. Connect every delivery story to what happened in production afterwards.
- Collaboration with data science — the Loyalty team works directly with data scientists. Your Ocado experience (orchestrating data scientists, analysts, and engineers) is a direct differentiator.

**Vocabulary to use:**
- "Customer-facing reliability" (not just "system uptime")
- "Inner loop productivity" (DevOps language for fast feedback cycles)
- "You build it, you run it" — use this phrase, it's in the JD
- "Loyalty signals / personalisation" — shows you understand the product domain

**Things to avoid:**
- Don't dismiss retail as "less technical" than logistics — it isn't
- Don't over-claim frontend expertise — be honest, frame as manageable
- Don't speak negatively about Ocado — frame every transition as additive

**Questions to ask them:**
1. "The JD mentions the Loyalty team works closely with data scientists — how integrated are the data and engineering pipelines today, and where do you see the biggest friction?"
2. "Given the accelerated transformation plan after last year's cyber attack, how is the engineering org balancing delivery pace with building in resilience?"
3. "What does success look like for this EM in the first 6 months?"

---

## Technical Prep Checklist (for later rounds — not first stage)

- [ ] Java/Spring Boot — review recent patterns (Spring Boot 3.x, virtual threads) — why: core stack
- [ ] Azure vs AWS — familiarise with Azure equivalents for services you know in AWS — why: JD specifies Azure
- [ ] Kubernetes fundamentals (as EM: deployment, scaling, health checks) — why: listed in JD
- [ ] Distributed systems design patterns (event-driven, eventual consistency) — why: loyalty offers are event-driven
- [ ] Dynatrace vs CloudWatch — understand Dynatrace's APM model — why: listed as observability tool
- [ ] MongoDB + Redis + Ignite — caching/storage patterns for personalisation at scale — why: Loyalty use case

---

## Story Bank (STAR+R — ready to use)

| # | Question type | Story title | Strength |
|---|--------------|-------------|---------|
| 1 | Team building / coaching | Team promotions pipeline | Strong |
| 2 | Delivery / cross-team | 14-person cross-team project | Strong |
| 3 | Process improvement | Cycle time improvement | Strong |
| 4 | Technical standards | Department-wide UI working group | Strong |
| 5 | Technical decision | AWS Lambda migration | Strong |
| 6 | Architecture decision | Modular monolith | Strong |
| 7 | Reliability / quality | SLO definition before go-live | Strong |
| 8 | Stakeholder management | PM/UX/Eng alignment | Strong |
| 9 | Mistake / failure | Prepare a real one — see above | Needs prep |
| 10 | Cross-functional with data | Data scientist collaboration at Ocado | Strong |
