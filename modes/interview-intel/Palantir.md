# Palantir Interview Intelligence

## Overview

Palantir's interview process is unlike any other tech company. The primary technical evaluation is the **Palantir Hacker Assessment (PHA)**: a take-home problem that is open-ended, under-specified, and graded primarily on problem decomposition, code quality, and judgment rather than raw algorithmic speed. The follow-up "decomp" interview is a 60-90 minute discussion of your PHA solution.

Palantir builds AI-powered data platforms for government and enterprise (Gotham, Foundry, AIP). Engineers are expected to sit with customers and solve real problems in the field, not just build in isolation.

> Verify: Palantir's process is consistent but details vary by role (SWE vs. Forward Deployed vs. ML). Confirm the current format with your recruiter.

---

## Stages

| Stage | Format | Typical Duration |
|-------|--------|-----------------|
| Recruiter screen | 30-45 min | Within 1 week |
| Palantir Hacker Assessment (PHA) | Take-home, 3-5 hours, open-ended | 1 week to complete |
| Decomp interview | 60-90 min walkthrough of your PHA | 1 week after submission |
| On-site or virtual loop | 3-5 rounds x 45-60 min each | 1 day |
| Hiring decision | Internal | Within 1-2 weeks |
| Offer | Written | Within 1 week |

### On-site round breakdown (SWE or ML)

- **Coding x 1-2** -- algorithms, less emphasis than FAANG but still present
- **Decomp follow-up** -- deeper dive into your PHA design choices
- **Domain or ML depth x 1** (ML roles) -- modeling, ontology design, AI pipeline
- **Behavioral x 1** -- customer empathy, working with non-technical people

---

## Typical Questions

### Behavioral

- "Tell me about a time you worked with a customer who didn't know what they needed."
- "Describe a situation where you had to turn a vague business problem into a technical solution."
- "Tell me about a time your solution revealed a problem the customer didn't know they had."
- "How do you handle a person who disagrees with your technical recommendation?"

### ML / Applied AI

- "How would you build a fraud detection model for a government agency with no labeled data?"
- "Design an ontology for representing military asset tracking in Palantir Gotham."
- "How would you evaluate an AI pipeline in a domain where ground truth is unknown?"
- "What are the risks of deploying an LLM for decision support in a national security context?"
- "How do you handle data from 20 incompatible source systems in a customer deployment?"

### System Design

- "Design Palantir Foundry's pipeline builder: a UI for non-technical users to define data transformations."
- "Design a secure multi-tenant data platform where customers can share data with fine-grained access control."
- "Design an AI-assisted triage system for a hospital network with fragmented EHR data."
- "Design an audit trail system for AI model decisions in a regulated government environment."

---

## Coding Tasks

The PHA is the key coding artifact. Here's what matters:

- It's typically a realistic engineering problem: build a library, implement a data processor, design a CLI tool.
- It's graded on code quality, modularity, testing, documentation, and design judgment.
- Under-specification is intentional. Your choices and reasoning matter as much as the output.
- Submit clean, production-quality code with a README explaining your decisions.

Standard algorithms in on-site rounds:
- Data manipulation and transformation
- Graph and tree algorithms
- API design and system decomposition
- String parsing and normalization

---

## Cultural & Technical Signals

| Signal | What they're looking for |
|--------|--------------------------|
| **Customer deployment mindset** | Palantir engineers sit next to customers. Show you're comfortable in messy real-world environments, not just clean lab settings. |
| **Judgment under ambiguity** | The PHA tests your ability to make good decisions when requirements are unclear. Make your decision-making process explicit. |
| **Software craftsmanship** | Code quality, naming, modularity, and documentation matter as much as algorithmic correctness. |
| **Mission seriousness** | Palantir works on national security, healthcare, and critical infrastructure. Show you've thought about the ethics and responsibility of that work. |
| **Non-technical communication** | Especially for Forward Deployed Engineer (FDE) roles, explaining complex systems to generals, doctors, and executives is essential. |
| **Long-term problem ownership** | Palantir embeds engineers with customers for months or years. Show you can sustain deep engagement with one problem domain. |

---

## Pro Tips

1. **Treat the PHA like a production code submission.** The most common failure mode is submitting "just working" code. Write a proper README, add docstrings, include error handling, write at least basic tests. The bar is software engineering quality, not just problem solving.
2. **In the decomp, defend your choices explicitly.** Your interviewer will ask "why did you design it this way?" Be ready to explain every significant decision, including what you considered and rejected.
3. **For FDE roles, business acumen matters as much as technical skill.** FDEs are half engineer, half consultant. Show you can read a customer's organizational dynamics, not just their data model.
4. **Know Palantir's government posture.** Palantir has worked with ICE, military, and intelligence agencies. This is controversial. Be clear with yourself about your own views before the interview.
5. **Compensation is below FAANG but the equity thesis is different.** Palantir is public (PLTR). RSU grants are in a public company, which provides liquidity. Compare total comp and risk profile carefully.
6. **Ask about deployment context.** Some Palantir engineers work on-site at classified facilities. Understand whether your role requires travel, security clearance, or customer embedding before accepting.

---

*Sources: public Glassdoor reviews, Blind threads, Palantir blog, open candidate write-ups. Verify current process with your recruiter.*
