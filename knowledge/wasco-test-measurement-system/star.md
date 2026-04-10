---
company: Wasco
project: Automated Test & Measurement System
dates: 2014-06 to 2016-06
archetypes:
  - AI Solutions Architect
  - AI Forward Deployed Engineer
capabilities:
  - hardware-software-integration
  - test-automation
  - product-engineering
hero_metrics:
  - 0.37-year payback
  - $214K 5-year projected value
  - production since May 2016
---

# Wasco Test and Measurement System
## STAR Framework: Interview Narrative

### SITUATION
*Setup*: 2014-2016, early in my engineering career at Wasco, a semiconductor pressure switch manufacturer. The company faced a critical bottleneck in quality assurance — new product lines couldn't scale because testing was entirely manual and sequential. Each pressure switch required 20+ hours of environmental and performance validation, and throughput was capped by lab capacity. Wasco had landed a significant contract with LAM Research, a Tier-1 wafer fab equipment supplier, but couldn't deliver at scale without fundamentally reimagining the QA process.

*The Challenge*: I was tasked with designing and building an entirely new automated test platform from scratch. This wasn't just about writing software — it required orchestrating a complete system: environmental chambers capable of -35°C to 190°C, precision pressure controllers, pneumatic systems, data acquisition hardware, and database infrastructure. The system needed to simultaneously test 22+ pressure switches in parallel, measure critical performance parameters across multiple test phases, and generate production-grade data for regulatory and customer compliance.

*My Role*: I served as the sole engineer on this greenfield project, working under the mentorship of a Ph.D.-level mechanical engineer. I owned every layer — from pneumatic and electrical schematics to software architecture to manufacturing process design.

---

### TASK
*Strategic Objectives*:
1. **Eliminate the testing bottleneck** — scale from sequential single-unit testing to parallel multi-unit testing
2. **Achieve production-grade reliability** — the system would run 24/7 in manufacturing, so it had to be bulletproof
3. **Deliver measurable ROI** — justify the capital investment through operational savings and faster time-to-market
4. **Qualify new product line** — enable Wasco to fulfill the LAM Research contract

*Technical Requirements*:
- Simultaneous testing of 22+ units under precisely controlled conditions (temperature, humidity, pressure)
- Real-time measurement of actuation pressures, accuracy, repeatability, and lifecycle performance
- Autonomous operation across multi-hour test cycles without human intervention
- Production-grade executable that could be deployed to manufacturing with minimal training
- Comprehensive documentation (SOPs, PFMEA, test protocols) for regulatory compliance and reproducibility

---

### ACTION
*Architecture & System Design*:
I designed a **LabVIEW state machine architecture** that functioned as an autonomous orchestration engine. The system had discrete operational states (initialization, environmental ramp, pressure sweep, measurement, data validation, teardown), with transition logic based on real-time sensor outputs. This deterministic architecture allowed the system to autonomously manage complex hardware interactions across hardware controllers, pneumatic valves, DAQ systems, and environmental chambers — exactly like modern agentic systems manage task decomposition and conditional routing.

*Hardware Integration*:
- **ESPEC Environmental Chamber**: Integrated via controller protocol to maintain precise temperature/humidity within ±2°C, ±5% RH
- **Mensor Pressure Controller + Haskel Gas Booster**: Automated pressure sweep generation (0-5000 PSI), integrated feedback control
- **DAQ Hardware & PLCs**: Multi-channel simultaneous data acquisition at 1 kHz sampling across 22+ measurement points
- **Pneumatic & Electrical Design**: Designed complete pneumatic schematics (gas distribution, pressure relief, flow control) and electrical schematics (power distribution, signal conditioning, safety interlocks)

*Software Development*:
- Built standalone LabVIEW executable (SEMI_Cal.exe) using state machine pattern with full error handling and recovery logic
- Integrated SQL/Microsoft Access backend for real-time data persistence and post-test analytics
- Implemented automated data validation — tests would fail/pass based on parametric thresholds, with root cause logging

*Manufacturing Enablement*:
- **Wrote 43 technical documents**: 32 process-specific SOPs + 11 generic SOPs covering every operational scenario
- **PFMEA Analysis**: Comprehensive failure mode and effects analysis to identify and mitigate reliability risks
- **Training & Deployment**: Compiled production-grade executable that required minimal operator training; deployed May 2016 and remains in daily use

---

### RESULT
*Operational Impact*:
- **System went live May 2016** and has been in continuous daily production use for 8+ years
- **Throughput scaled 22x**: Parallel testing enabled 22+ simultaneous units vs. sequential single-unit testing
- **Eliminated manual bottleneck**: Reduced per-unit test time from 25+ hours of operator attention to autonomous execution with minimal oversight
- **Enabled LAM Research partnership**: Qualification of new product line unlocked enterprise customer relationship with Tier-1 wafer fab supplier

*Financial Performance*:
- **Year 0 Investment**: $72,560 (capital equipment + software development)
- **Annual Savings**: $64,810 (labor reduction + faster throughput)
- **Payback Period**: 4.5 months (0.373 years)
- **5-Year ROI**: $214,180 cumulative cash flow ($141,620 net benefit)

*Strategic Impact*:
- **Foundation for agentic thinking**: This project established my mental model for autonomous system design — discrete states, conditional routing, asynchronous orchestration. This exact architecture translates directly to modern LLM-based agentic systems (LangGraph, tool chains, workflow orchestration). When I later designed AI agentic architectures at scale, I was applying the same deterministic state-machine logic I learned building this hardware system.

- **Technical depth**: Mastered full-stack system design spanning hardware (pneumatics, electronics), embedded control (LabVIEW, hardware protocols), data systems (SQL), and manufacturing operations. This cross-functional literacy became a competitive advantage in every subsequent role.

- **Mentorship & learning velocity**: Working under a Ph.D.-level mechanical engineer with expertise in robotics compressed years of learning into months. I absorbed not just technical skills but an engineering mindset — systematic problem-solving, rigorous validation, designing for reliability and maintainability.

---

### INTERVIEW CLOSING

**Why this matters for your organization:**

This project demonstrates the **full arc of technical excellence** — from architectural design (state machines) to implementation (hardware integration, software development) to deployment (manufacturing operations) to outcomes (measurable financial ROI). The autonomous orchestration patterns I developed became the conceptual foundation for modern agentic AI systems — the same discrete-state, conditional-routing logic powers today's AI workflows.

More importantly, it shows I'm not siloed — I span hardware, software, process design, and operations. I can talk to hardware engineers about schematics, software engineers about architecture, manufacturing about process improvements, and executives about financial ROI. That cross-functional fluency is rare and valuable in roles that bridge engineering and strategy.
