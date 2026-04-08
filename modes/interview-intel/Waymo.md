# Waymo Interview Intelligence

## Overview

Waymo is one of the oldest and most technically serious autonomous vehicle companies in the world, spun out of Google's self-driving project in 2016. It runs commercial robotaxi services in Phoenix and San Francisco, and has a research culture that feels more like a frontier AI lab than a traditional automotive company.

ML roles here are genuinely differentiated: you work on perception (cameras, lidar, radar), prediction (how will every agent in the scene move?), planning (what should the car do?), and simulation (how do you test decisions without driving millions of miles). The data is proprietary, the problems are hard, and the safety stakes are real.

> Verify: Waymo's process can vary significantly by team (Research vs. Applied vs. SWE). Confirm the current format with your recruiter.

---

## Stages

| Stage | Format | Typical Duration |
|-------|--------|-----------------|
| Recruiter screen | 30-45 min | Within 1 week |
| Technical phone screen x 1-2 | 60 min each, coding and ML depth | 1-2 weeks |
| Virtual on-site | 4-5 rounds x 60 min each | Scheduled as a full day |
| Hiring decision | Internal debrief | 1-2 weeks |
| Offer | Written, negotiation window | Within 1 week |

### On-site round breakdown (ML Engineer or Research Scientist)

- **Coding x 2** -- algorithms, data structures, sometimes spatial/geometric problems
- **ML depth x 1** -- perception, prediction, or planning depending on team
- **System design x 1** -- ML infrastructure or data pipelines at AV scale
- **Behavioral x 1** -- ownership, safety mindset, cross-team collaboration

---

## Typical Questions

### Behavioral

- "Tell me about a time you identified a safety issue in a system. What did you do?"
- "Describe a project where failure had real consequences. How did you handle uncertainty?"
- "Tell me about a time you had to make a technical decision that affected other teams."
- "How do you approach a problem where you can't get more real-world data?"

### ML / Applied AI

- "Walk me through how you'd design a pedestrian behavior prediction model."
- "How would you train a perception model that needs to work across night, rain, and construction zones?"
- "What are the tradeoffs between rule-based and learned approaches for motion planning?"
- "How do you handle distribution shift when your training data doesn't cover rare but critical scenarios?"
- "Design an evaluation framework for a model whose failures could cause physical harm."

### System Design

- "Design a large-scale simulation environment for testing autonomous driving behavior."
- "Design a data pipeline that ingests lidar, radar, and camera streams from a fleet of 1,000 vehicles."
- "Design a continuous learning system that improves the perception model from daily fleet data."
- "Design an anomaly detection system that flags unusual driving scenarios for human review."

---

## Coding Tasks

Expect LeetCode medium to hard. Waymo attracts strong engineers and the coding bar is high:

- Array, matrix, and geometric problems (intersection, distance, spatial queries)
- Graph algorithms (path planning is literally a graph problem)
- Dynamic programming on sequences
- Tree traversal and recursion
- Sorting and interval merging

Python and C++ are both common. For perception and planning roles, comfort with NumPy, SciPy, and geometric math is expected.

---

## Cultural & Technical Signals

| Signal | What they're looking for |
|--------|--------------------------|
| **Safety-first reasoning** | This is not optional at Waymo. Show you think about failure modes, edge cases, and second-order consequences before you think about performance. |
| **Multi-modal sensor fluency** | Waymo uses cameras, lidar, and radar together. Understanding how these sensors complement and conflict with each other is a real differentiator. |
| **Uncertainty quantification** | The car needs to know what it doesn't know. Calibration, epistemic vs. aleatoric uncertainty, and safe handling of uncertain predictions are genuine interview topics. |
| **Long-horizon thinking** | Autonomous driving requires planning seconds to minutes ahead. Show you can reason about sequential decisions under uncertainty. |
| **Empirical rigor** | Waymo runs billions of miles of simulation. Show you care about valid experiments, not just good-looking metrics. |
| **Mission seriousness** | Waymo believes autonomous vehicles will save lives. If you find that genuinely motivating rather than just a good career story, it comes through. |

---

## Pro Tips

1. **Know the AV perception stack.** At minimum: BEV (bird's eye view) representation, 3D object detection from lidar point clouds, multi-object tracking, and sensor fusion. These come up in ML interviews regardless of your specific team.
2. **Prediction and planning are distinct disciplines.** Prediction is "where will every agent go?"; planning is "what should we do given that?" Know which one your target team focuses on and go deep there.
3. **Simulation is taken seriously.** Waymo doesn't just drive cars: it runs vast simulations to test edge cases. Familiarity with closed-loop vs. open-loop evaluation and the limits of simulation is valued.
4. **The Google parentage matters.** Waymo inherited Google's engineering culture: strong systems thinking, data-driven decisions, and a high bar for code quality. Prepare accordingly.
5. **Compensation is competitive with late-stage startup levels.** Waymo was spun out as a separate company and has received significant outside investment. Equity is meaningful but tied to an eventual liquidity event.
6. **Ask about the team's safety review process.** Waymo has rigorous safety processes that affect how fast teams can ship. Understanding what that looks like for your target team helps set expectations.

---

*Sources: public Glassdoor reviews, Blind threads, Waymo research blog, open candidate write-ups. Verify current process with your recruiter.*
