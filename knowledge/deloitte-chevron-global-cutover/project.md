---
company: Deloitte
project: Chevron Global Cutover
dates: 2020-2021
archetypes:
  - AI Transformation Lead
  - AI Solutions Architect
capabilities:
  - program-management
  - enterprise-deployment
  - cross-functional-coordination
hero_metrics:
  - 10K+ activities
  - 8 time zones, 5 countries
  - weeks compressed to 1 weekend
  - zero major incidents
---

# Chevron Global Deployment: Enterprise Transformation Program Leadership

## Executive Summary

Served as Global Deployment Lead for Chevron's "Digital Core" SAP S/4HANA transformation program ($100M/year, 10-year enterprise transformation). Authored the full deployment strategy across 14 workstreams, designed the deployment execution structure, and managed two parallel cutovers (Digital Core S/4HANA and Consolidated Master Data Governance) spanning 8 time zones and 5 countries. Led a 14-person deployment team while coordinating hundreds of contributors across the 500+ person program to compress a weeks-long cutover into a single weekend. Developed and executed a 10,000+ line cutover plan, built automated notification and tracking systems, and established the go/no-go criteria, mock cutover methodology, and deployment ceremonies that became the repeatable framework for future releases.

**Organizational Context:** Fortune 10 energy company (Chevron); enterprise-wide $100M/year SAP S/4HANA program ("Digital Core"); 500+ person program team; global operations spanning upstream, midstream, and downstream across multiple countries and time zones.

---

## Role & Career Progression

**Position:** Global Deployment Lead, Chevron Digital Core Program (Deloitte)

**Reporting:** Program leadership and CIO

**Direct Team:** 14 reports across deployment threads, cutover analysts (US, India), and cutover communications

**Scope of Responsibility:**
- Author and own the end-to-end deployment strategy across 14 workstreams
- Design the deployment execution structure (Thread Leads, Deployment Champions, Customer Deployment Leads)
- Manage two parallel cutovers: Digital Core (S/4HANA) and Consolidated Master Data Governance (cMDG)
- Architect and execute 10,000+ line master cutover plan
- Coordinate 24/7 global operations across 8 time zones, 5 countries
- Manage transition of 30+ legacy applications and 110+ boundary applications
- Define and manage go/no-go criteria, mock cutover methodology, and deployment readiness assessment
- Establish deployment ceremonies, cadence, and reporting for program leadership

---

## The Challenge

### Program Context
This was not a single application migration. This was a Fortune 10 enterprise transformation with mission-critical constraints:

**Scale:**
- $100M/year program investment over a 10-year transformation roadmap
- 500+ person program team across multiple locations
- Chevron's upstream, midstream, and downstream operations
- Mission-critical energy production infrastructure (24/7 operations, zero tolerance for extended downtime)

**Technical Scope:**
- SAP S/4HANA replacing decades of legacy infrastructure
- 30+ legacy applications to be shut down or transitioned
- 110+ boundary applications (third-party systems, legacy interfaces, ERP integrations)
- Complete technology stack refresh across the entire enterprise

**Operational Complexity:**
- Operations spanning 8 time zones across 5 countries
- Multiple regulatory jurisdictions (energy sector compliance)
- Shift-based operations at operational facilities (24/7)
- Interdependent systems where one failure cascades across the business

### Deployment Challenge
The deployment was not just about cutover. It required coordinating 14 parallel workstreams to bring the entire organization to production readiness:

**Business & Site Readiness:** Ensuring technical infrastructure, hardware, and software were in place and tested at all locations prior to go-live. Identifying blackout dates, freeze windows, and contingency operating modes.

**Legacy Process & Application Readiness:** Inventorying all applications impacted by Digital Core, building deployment plans for each, executing shutdown/migration/startup sequences.

**Chevron Change Control:** Collecting and executing change requirements (financial, safety, legal, regulatory) from business functions through Chevron's standard operating procedures (ARTS/CBU/GSS).

**Data Readiness:** Managing integration activities to ensure data migration objectives were met and integrated into the deployment and cutover plans.

**Integration Readiness:** Ensuring integrations within the new solution and with existing applications were activated and coordinated with the business.

**Go/No-Go:** Defining scope, criteria, target metrics, decision makers, and timelines for go/no-go decisions at periodic checkpoints.

**Cutover:** Building and executing the repeatable cutover plan, tested through Mock Cutover 1, Mock Cutover 2, UIT, Dress Rehearsal, and Final Cutover.

**Support Organization & Strategy:** Designing the organization providing elevated support (hypercare) following go-live.

**Hypercare & Transfer to Operations:** Defining processes and support model for the transition period following go-live until established exit criteria were met.

**Communications & Engagement:** Multi-channel approach to reaching end users, driving digital behavior change, and maintaining program awareness.

**Change Management & Analytics:** Comprehensive change management plan, readiness metrics, and change impact assessment.

**Learning:** Comprehensive training strategy for all impacted parties.

**Role Mapping & Org Alignment:** Mapping technical, security, and business roles to people in the new solution.

**Solution Readiness:** Managing integration activities with program execution and build teams to ensure the solution was ready to support deployment.

### Cutover Challenge
Coordinating the cutover specifically was multiply-constrained:

**Time Constraint:** The cutover had to fit into a narrow weekend window when business impact would be minimized. For 24/7 energy operations, there is no good time.

**Dependency Constraint:** System A could not cutover until System B was ready. System B depended on data from System C. One bottleneck rippled across everything.

**Coordination Constraint:** Getting 500+ people to execute their piece of a plan at exactly the right moment in a coordinated sequence. One person executing 30 minutes too early or too late breaks dependent tasks downstream.

**Parallel Complexity:** Two separate but interrelated cutovers (DCore and cMDG) had to be managed simultaneously, each with their own dependency networks, sequencing, and execution plans.

---

## What He Built

### 1. Deployment Strategy (14 Workstreams)

Authored the definitive deployment strategy for Release 1, a 40+ slide strategic document that became the program's deployment playbook. The strategy defined:

**Deployment Activities Framework:** 14 deployment threads organized into three categories:
- Behavioral Change Management (Communications & Engagement, Change Management & Analytics, Learning, Role Mapping & Org Alignment)
- Deployment (Business & Site Readiness, Legacy Process & Application Readiness, Chevron Change Control, Go/No-Go, Cutover, Support Organization & Strategy, Hypercare & Transfer to Operations)
- Deployment Integration (Data Readiness, Integration Readiness, Solution Readiness)

**Deployment Execution Structure:**
- Deployment Lead (Jon) overseeing all activities across threads
- Deployment Thread Leads responsible for planning and execution within their thread
- Digital Core Deployment Champions (from current scrum teams: Finance, Asset Mgmt, Materials Mgmt, Enabling ARTs)
- Platform Leads (SDP, Finance, PSCM, others)
- Customer Deployment Leads (CBU, GSS-Finance, GSS-Procurement)

**Deployment Ceremonies & Cadence:**
- Monday: Deployment Plan Review (cross-thread, late/upcoming items, round table)
- Tuesday: Legacy Process & Application, Hypercare, Support Org Check-In
- Wednesday: Business & Site Readiness, Chevron Change Control, Learning, Role Mapping, Change Mgmt Check-In
- Thursday: Cutover, Go/No-Go, Solution Readiness Check-In
- Friday: Progress updates due, deployment plan updated

**30-60-90 Day Plans:** Structured onboarding across BCM, Deployment, and Cutover with detailed activity milestones for the first 30, 60, and 90 days.

**Release Planning:** Constraints, assumptions, dependencies, and target go-live window (Q4 2022 through Q1 2023) with blackout period considerations (year-end, quarter close, well completion/spring breakup).

**Go/No-Go Framework:** Defined scope, criteria, decision makers, target metrics tied to T-Minus dates, and a review cadence with dashboards for ongoing readiness monitoring.

### 2. Two Parallel Cutover Plans (DCore + cMDG)

Managed two separate cutover plans simultaneously:

**Digital Core (S/4HANA) Cutover Plan:**
- 10,000+ line master cutover plan
- Covered technical cutover (SAP environment startup, legacy shutdown sequences, data freezes, integration validation), business cutover (parallel processing, transaction routing, user provisioning), data cutover (112 data objects, 4,000-5,000 lines of sequencing at 5-minute granularity), and support activities
- Every activity mapped with predecessors, successors, estimated duration, owner, success criteria, and rollback procedures
- Dependency network identifying critical path, parallel activities, and slack

**Consolidated Master Data Governance (cMDG) Cutover Plan:**
- Separate parallel cutover plan managed simultaneously with DCore
- Independent dependency network and sequencing
- Coordinated with DCore plan at key integration points

**Mock Cutover Methodology:**
- Mock Cutover 1 (MC1): First full execution of cutover plan, identify gaps and timing issues
- Mock Cutover 2 (MC2): Refined plan based on MC1 performance
- UIT (User Integration Testing): Cutover integrated with user testing
- Dress Rehearsal (DR): Full production-mirror execution
- Final Cutover: Production go-live

Each mock cutover iteration refined the plan based on actual performance, identified bottlenecks, and calibrated timing estimates. The plan was a living document iterated through 16 revisions.

### 3. Automated Cutover Notification & Tracking System

**The Problem:**
Managing 10,000+ activities manually across 500+ people was impossible. Traditional project management tools were not designed for this level of precision and scale.

**The Solution:**
Built a custom automated system that:

**Task Notification:**
- Automated email notifications to every person involved in the cutover
- Each person received ONLY the tasks they owned (not noise from other teams)
- Notifications included task description, time window, predecessors, success criteria, rollback steps
- Notifications triggered based on task dependencies (only sent when preceding task was complete)

**Execution Tracking:**
- Recipients updated task status via email reply or web interface
- System tracked completion time vs. scheduled time
- Automated status aggregation up the hierarchy
- Real-time dashboard showing overall cutover progress

**Dependency Management:**
- System understood task dependencies and managed sequencing
- If Task A was not complete, Task B was not triggered
- Automatic escalation if task was not completed by target time
- Replan capability if major delays occurred

**Communication:**
- Central command center received real-time updates on all activities
- Escalation alerts if critical tasks were off-track
- Ability to push changes or adjustments to field teams
- Historical record of all status changes and decisions

**Key Innovation:** Most cutover teams use status meetings. Jon built a system where tasks reported themselves automatically. That freed up people from status reporting and let them focus on actual execution.

### 4. Data Cutover Sequencing & Dependency Management

The data section of the cutover plan alone was 4,000-5,000 lines. Jon also built the high-level data dependency diagrams (Visio, 11 pages) mapping data flows across SAP scope items, CBU systems, procurement flows, and service order lifecycles.

**Data Object Dependency Network:**
- Mapped all 112 data objects
- Identified which objects depended on which (Material A depends on Vendor Master being loaded)
- Built dependency graph: if you try to load a material before its vendor is loaded, it fails
- Calculated optimal load sequence to minimize overall data cutover time

**5-Minute-Level Sequencing:**
- For critical dependencies, planned at 5-minute granularity
- Identified window when Object A was fully loaded and validation complete, so Object B could start
- Accounted for load time, post-load validation time, issue resolution time
- Built in buffers for common issues

**Parallel Load Strategy:**
- Identified objects with no dependencies (could load simultaneously)
- Maximized parallel loading to reduce overall data cutover time
- Managed database load and I/O constraints
- Coordinated with infrastructure team on resource allocation

**Cutover Playbook:**
- Step-by-step instructions for data cutover execution
- Clear decision points (if discrepancy rate > 5%, do X; if < 5%, proceed to next object)
- Escalation procedures for data issues
- Rollback procedures if data load failed

---

## Execution & Results

### Deployment Execution
- **Deployment Strategy Adopted:** 14-workstream deployment strategy became the program's deployment playbook for Release 1 and the repeatable framework for Release 2 and beyond
- **Go/No-Go Framework:** Established measurable criteria tied to T-Minus dates with business concurrence, used at periodic checkpoints leading to go-live
- **Mock Cutover Methodology:** Successfully executed MC1, MC2, UIT, DR, and Final Cutover, with each iteration refining the plan based on actual performance

### Cutover Execution
- **Weekend Cutover:** Compressed weeks-long cutover cycles down to single weekend execution (72-hour window, Friday evening through Monday morning)
- **Two Parallel Cutovers:** Managed DCore (S/4HANA) and cMDG cutovers simultaneously with zero major incidents
- **24/7 Operations:** Managed continuous operations across all time zones with coordinated handoffs
- **Team Coordination:** Directed 14-person deployment team while coordinating hundreds of contributors across the 500+ person program
- **Zero Major Incidents:** Executed 30+ legacy application shutdowns and 110+ boundary application transitions without major unplanned downtime

### Program Coordination
- **500+ Contributors:** Coordinated activities from 500+ program members during cutover execution
- **Cross-Functional Alignment:** Managed dependencies across Digital Core ARTs (Finance, Asset Mgmt, Materials Mgmt, Enabling), Digital Platforms (SDP, Finance, PSCM), and Customer organizations (CBU, Global Shared Services)
- **Real-time Visibility:** Provided executive leadership and CIO with real-time cutover status through automated dashboards
- **Issue Resolution:** Escalated and resolved blockers in real-time during cutover execution

### Cutover Plan Precision
- **10,000+ Activities:** Coordinated 10,000+ discrete tasks in master cutover plan
- **4,000+ Data Activities:** Managed 4,000-5,000 lines of data cutover sequencing
- **112 Data Objects:** Mapped and sequenced across full dependency network
- **30+ Legacy Systems:** Coordinated shutdown and transition of 30+ legacy applications
- **110+ Boundary Systems:** Managed cutover dependencies with 110+ third-party and legacy systems

---

## Technical Architecture

### Deployment Strategy & Planning
- **Deployment Strategy Deck:** 40+ slide strategic document defining all 14 deployment threads
- **Deployment Execution Structure:** Hierarchical model (Deployment Lead > Thread Leads > Champions > Customer Leads)
- **Ceremonies & Cadence:** Weekly cadence with thread-specific check-ins (Mon-Thu) and Friday progress updates
- **30-60-90 Plans:** Structured onboarding across BCM, Deployment, and Cutover

### Cutover Planning Tools
- **Master Cutover Plans:** Two parallel plans (DCore, cMDG) in Microsoft Project
- **Dependency Mapping:** Network diagram of task dependencies and critical path
- **Data Dependency Diagrams:** 11-page Visio mapping data flows across SAP scope items, CBU systems, procurement, and service orders
- **Timeline & Scheduling:** Coordinated schedule across 8 time zones with task sequencing
- **Resource Planning:** Staffing plan for 14-person team across US, India, and additional locations

### Cutover Tracking System
- **Notification Engine:** Automated task notifications based on dependencies
- **Status Tracking:** Real-time task completion tracking
- **Dashboard/Reporting:** Visual representation of cutover progress and status for CIO and program leadership
- **Escalation Management:** Automated alerts for off-track activities

### Data Cutover Management
- **Dependency Graph:** Network of 112 data objects with load sequencing
- **Load Playbook:** Step-by-step instructions for data load execution
- **Validation Integration:** Connected to BI reconciliation framework (see companion data migration project)
- **Parallel Load Optimization:** Strategy for maximizing parallel loads while managing infrastructure constraints

---

## Key Learnings & Operational Legacy

### Deployment Approach
- Established a repeatable 14-workstream deployment framework leveraged for Release 2 and beyond
- Proved that weekend-window cutover was achievable for massive programs through rigorous mock cutover methodology
- Demonstrated value of automated notification and tracking (vs. traditional status meetings)
- Created the deployment execution structure (Thread Leads, Champions, Customer Leads) adopted as the program standard

### Tools & Artifacts
- Deployment strategy deck (adopted as program standard, reusable for future releases)
- Two parallel cutover plans (DCore, cMDG) serving as templates for future phases
- Data dependency diagrams (11-page Visio)
- Dependency mapping methodology applicable to other programs
- Automated notification system (became baseline for future program work)
- Data cutover playbook and sequencing methodology
- Go/no-go criteria framework and dashboards
- Deployment ceremonies and cadence model

### Organizational Learning
- Chevron learned how to execute large-scale, complex deployment and cutover with minimal downtime
- Program team learned the value of structured mock cutover methodology (MC1, MC2, UIT, DR)
- Operations team learned to manage complex system transitions through repeatable playbooks
- IT leadership learned to work with real-time automated tracking instead of status meeting culture

---

## Capability Clusters Demonstrated

1. **Enterprise Program Delivery & Strategic Planning**
   - Authored the full deployment strategy across 14 workstreams for a Fortune 10 enterprise transformation
   - Designed the deployment execution structure adopted by the entire program
   - Established go/no-go criteria, mock cutover methodology, and deployment ceremonies

2. **Operational Scaling & Team Design**
   - Directed 14-person deployment team across multiple locations and time zones
   - Managed coordination across 500+ program contributors
   - Implemented automated systems for scaled program execution without proportional overhead

3. **Cross-Functional Leadership**
   - Coordinated across Digital Core ARTs, Digital Platforms, Customer organizations, and Global Shared Services
   - Managed dependencies across Product, Engineering, QA, Infrastructure, Security, and Business teams
   - Balanced technical precision with business delivery windows

4. **Systems Thinking & Problem-Solving**
   - Designed dependency network mapping and sequencing strategy
   - Built automated notification and tracking system
   - Managed two parallel cutover plans with interrelated dependencies

---

## Timeline
**Duration:** ~18 months (planning and execution for Release 1)
**Key Phases:**
- Phase 1 (Months 1-6): Deployment strategy development, requirements gathering, 30-60-90 plans, team standup
- Phase 2 (Months 7-12): Detailed cutover plan development (DCore + cMDG), automated tracking system build, MC1 and MC2 execution
- Phase 3 (Months 13-18): UIT, Dress Rehearsal, Final Cutover execution, hypercare, transfer to operations

**Mock Cutover Cycles:** MC1, MC2, UIT, Dress Rehearsal, Final Cutover (plan iterated through 16 revisions)
**Cutover Window:** 72-hour execution period (Friday evening through Monday morning) with 24/7 operations
**Target Go-Live:** Q4 2022 through Q1 2023

---

## Residual Value

- Deployment strategy and 14-workstream framework became the blueprint for Release 2 and future transformation phases
- Mock cutover methodology (MC1 > MC2 > UIT > DR > Final) became the standard approach for Deloitte enterprise deployments
- Automated notification system became standard practice for large Deloitte engagements
- Data cutover playbook and dependency mapping methodology established best practices for data migration execution
- Deployment execution structure (Thread Leads, Champions, Customer Leads) adopted as the organizational model for future releases
- Go/no-go criteria framework and dashboards became reusable templates across the program

---

## Notes for Context

- The deployment strategy deck was authored by Jon and presented during a multi-day kickoff workshop (Feb 7-10, 2022) with Day 1 "Inform", Day 2 "Learn", Day 3 "Decisions"
- Jon is listed as Author on both the DCore and cMDG cutover plans in Microsoft Project
- The cMDG cutover plan was co-managed with Erik Hernandez (Deloitte)
- Olivia Lindstrom served as Cutover Analyst (US) under Jon's direction
- The program operated on a SAFe (Scaled Agile Framework) cadence with Program Increments (PI 22.1, etc.)
- For external/resume purposes, frame as "enterprise ERP transformation" rather than SAP S/4HANA to avoid being typecast as an SAP practitioner
