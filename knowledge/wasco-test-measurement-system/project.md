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
## Project Details

### Timeline
- **Duration**: June 2014 – June 2016 (2 years)
- **Context**: Two internships, one 6-month full-time co-op, and ~25 hours/week part-time during final 2 years of undergraduate study
- **Classification**: Full-time operational responsibility; primary learning ground for technical foundations

### Project Scope

#### Objective
Design and build a fully automated test and measurement system for semiconductor pressure switch quality assurance. The system needed to simultaneously test multiple units across controlled environmental conditions, measure critical performance parameters, and generate production-grade executable for daily manufacturing use.

#### Technical Architecture

**Core Platform**: NI LabVIEW (Version 14) — state machine architecture with autonomous orchestration of physical hardware systems.

**Hardware Integration**:
- ESPEC Platinous-Series Environmental Chamber (temperature range: -35°C to 190°C; humidity range: 10%-99%)
- Mensor Pressure Controller
- Haskel Gas Booster
- Data Acquisition (DAQ) hardware
- Programmable Logic Controllers (PLCs)
- Solenoid valve control systems
- Simultaneous testing of 22+ pressure switches per test cycle

**Data Management**:
- Real-time pressure measurements across multiple lifecycle test phases
- Database architecture using SQL/Microsoft Access
- Continuous logging of actuation pressures, accuracy metrics, repeatability data, and environmental test results

#### Deliverables

**System Design & Engineering**:
- Pneumatic schematics (design and specification)
- Electrical circuit schematics (design and specification)
- Wiring schematics (design and specification)
- Physical server rack layout and infrastructure design
- Full hardware integration and control logic

**Process Documentation**:
- 32 process-specific Standard Operating Procedures (SOPs)
- 11 generic SOPs for new product line
- PFMEA (Process Failure Mode and Effects Analysis) documentation
- Comprehensive test protocols and validation procedures

**Production Software**:
- Compiled to standalone executable (SEMI_Cal.exe)
- Production-grade deployment since May 2016
- Continues in daily use in manufacturing operations

**Commercial Impact**:
- New product line qualification for LAM Research (major wafer fabrication equipment supplier)
- Enabled entry into enterprise fab supply chain

### Financial Analysis

**Investment & Returns**:
- Year 0 Capital Investment: $72,560
- Annual Operational Savings: $64,810
- Payback Period: 0.373 years (approximately 4.5 months)
- Cumulative 5-Year Cash Flow: $214,180
- ROI Metrics: System paid for itself in under 5 months; delivered $141,620 net benefit over 5 years

**Value Creation**:
- Eliminated manual testing bottleneck (previously labor-intensive quality verification)
- Enabled 22+ simultaneous test channels vs. sequential testing
- Reduced time-to-market for new products
- Improved measurement accuracy and repeatability vs. manual methods
- Qualified new product line for strategic customer (LAM Research)

### Learning Context

**Mentor**: Worked under the tutelage of one of Jon's most influential technical mentors — engineer with Masters degrees in Mechanical Engineering and Robotics Engineering. This engagement established foundational competencies in:
- Embedded systems control and automation
- Hardware-software integration
- Complex system design and architecture
- Manufacturing quality systems
- Cross-functional problem-solving

### System Architecture Philosophy

The LabVIEW state machine implementation was architecturally deterministic — discrete states representing distinct operational phases, transition logic based on sensor outputs and measurement results, and conditional routing based on test outcomes. The system autonomously orchestrated hardware devices (environmental chamber, pressure controllers, pneumatic valves, data acquisition hardware) without human intervention across multi-hour test cycles.

### Education Context
**Degree**: B.S. Industrial Engineering, Cal Poly San Luis Obispo — Magna Cum Laude

This project represented the synthesis of classroom industrial engineering principles (process design, quality systems, statistical analysis) applied to real-world manufacturing operations.
