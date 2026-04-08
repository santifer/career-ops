# OpenAI Hiring Intelligence Briefing
## For: Director of Data Engineering and Agentic AI Automation, Finance
## Compiled: 2026-04-07

---

## Quick Reference

- **Timeline**: 6-12 weeks (director level can stretch to 4+ months)
- **Stages**: Recruiter screen → 2 phone screens (coding + system design) → Virtual onsite (4-6 hrs) → Offer committee
- **Comp**: $347-490K base + RSUs (quarterly vest, no cliff). Median total comp ~$1.37M. Director likely $800K-$1.5M+
- **Key risk**: Downleveling is common regardless of previous title
- **Referral**: Critical — cold apps get ignored. Philip Su (IC9 from Meta) got zero response cold.

---

## Interview Format

### Stage 1: Recruiter Screen (30 min)
- Background, motivations, "Why OpenAI?"
- Do NOT reveal salary expectations or status with other companies
- Recruiter feedback carries real weight
- Take their prep tips seriously — they're telling you what to study

### Stage 2: Technical Phone Screens (2 rounds, 60 min each)
- Coding round on CoderPad
- System design on Excalidraw
- Questions are practical/production-oriented, NOT LeetCode puzzles
- System design is the most heavily weighted skill area

### Stage 3: Virtual Onsite (4-6 hours, same day or consecutive days)
- Coding Round (60 min): Your IDE with screenshare or CoderPad
- System Design Round (60 min): Deeper than phone screen
- Technical Project Presentation (45 min): 30 min presentation + 15 min Q&A
- Behavioral: Leadership (45 min): With senior manager
- Behavioral: Collaboration (30 min): Cross-functional focus
- Optional: Domain-Specific Interview (60 min)

### Stage 4: Hiring Committee & Offer
- Leveling determined AFTER the loop, not before
- Downleveling is common

---

## What Gets You Hired

### 4 Core Values They Evaluate:
1. **Speed and Execution** — fast decisions, course-correction, shipping under compression
2. **Technical Ambition** — tackling genuinely hard frontier problems
3. **Adaptability** — thriving in rapid change, comfort with ambiguity
4. **Mission Alignment** — genuine commitment to beneficial AGI

### Director-Level Signals:
- Influencing technical strategy across teams
- Mentoring engineers who advance to senior roles
- Building organizational capability, not individual heroics
- 0-to-1 building — creating new systems, not optimizing existing ones
- Calculated boldness over process-heavy caution
- Clear point of view on AI's future

---

## What Gets You Rejected

- Insufficient leadership evidence (individual vs team/org impact)
- Poor system design communication (can't articulate trade-offs)
- Weak requirements gathering (jumping to solutions)
- Overengineering without justifying complexity
- Shallow technology justification ("we use Kafka" without WHY)
- Vague behavioral storytelling without measurable impact
- Mission misalignment (performative interest)
- Risk-averse examples (they want boldness)
- Scale insufficiency (small B2B startup got negative feedback)
- Emphasizing process over speed
- Not researching OpenAI beforehand
- Neglecting fault tolerance in designs

---

## Real Interview Questions (Reported by Candidates)

### Coding:
- Build an SQL Engine (parser + executor)
- Versioned key-value store with timestamp retrieval
- Excel cell dependency computation with cycle detection
- GPU credit management system (FIFO consumption)
- In-memory database with SQL-like operations
- API call logs: extract total token consumption by users

### System Design:
- Design the OpenAI Playground (UI + API + DB)
- Design a CI system like GitHub Actions
- Design a Payment Gateway (auth, queuing, retries, idempotency)
- Design a webhook service (caching, failure/retry)
- Distributed ML training infrastructure
- Design ChatGPT to handle 100M users

### Behavioral:
- "Significant disagreement with team member about technical solution"
- "Project that didn't meet expectations. What did you learn?"
- "Time you set technical direction that faced resistance"
- "How do you navigate disagreement between research and product?"
- "Mentoring someone who became a senior engineer"
- "Thoughts on AI safety and ethical issues?"

### Data Engineering Specific:
- Building/debugging data pipelines
- SQL with joins, aggregations, window functions
- ETL workflow architecture
- Kafka data ingestion (600M daily events)
- Hourly user analytics pipeline with Airflow
- Stripe payment ETL pipeline

---

## Compensation & Negotiation

- Base: $347K-$490K for this role
- RSUs: 25/25/25/25 quarterly vesting, 6-month cliff
- Median total comp: ~$1.37M/year
- 90th percentile: ~$2.79M/year
- They don't negotiate within level but may negotiate the LEVEL itself
- Best leverage: competing offers from Anthropic, Google, Meta
- Comp only discussed at offer stage, never during interviews

---

## Referral Strategy

- Referral bonus: $5,000
- Cold applications have extremely low response rate
- Even Philip Su (Distinguished Engineer, IC9 from Meta) was ignored cold
- A strong endorsement from someone who worked with you is the strongest signal
- Target: Finance org leaders (Sarah Friar, Stacie Faggioli, Shamez Hemani)
- Also: anyone in AI agent infrastructure team
- Apply through Ashby simultaneously — don't wait for referral

---

## Culture (Real Talk)

- "You can just do things" — bottoms-up, no quarterly roadmaps
- Meritocratic — promotion based on idea quality and execution
- Slack-centric, no email. Very secretive internally.
- Flat structure, minimal bureaucracy
- Teams are fluid — resources can materialize within 24 hours
- Intense pace — Codex launch was 7 weeks concept to public, 11pm-midnight hours
- Teams are "DERP" units: Design, Engineering, Research, Product
- Work-life balance: 3.9/5 (lower than other dimensions)

---

## Director-Specific Prep

1. Prepare for downleveling — mentally ready for Staff+ conversation
2. Technical Project Presentation is critical — choose org-level impact project
3. Prepare slides (content > aesthetics, 15-20 min talk + 25-30 min Q&A)
4. Know Oracle Fusion, Anaplan, Workday, Spark, Kafka, S3/ADLS
5. Come with a vision for how agentic AI transforms financial close/rev rec/forecasting
6. Philip Su spent 80+ hours over 2 weeks on systems design prep
7. Ask recruiter: format specifics, prep suggestions, common failure patterns, intros to recent hires
8. Behavioral must show LEADERSHIP not heroics
9. Mission alignment is real — read the Charter, have a genuine AGI safety perspective
10. The process is collaborative, not adversarial — treat it like working with a colleague

---

## Sources
[25+ sources listed in full briefing — see agent output for complete URLs]
