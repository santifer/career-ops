---
company: Deloitte
project: Chevron Agile Transformation
dates: 2019-2022
archetypes:
  - AI Transformation Lead
  - AI Consultant / Strategy
capabilities:
  - agile-transformation
  - program-management
  - ops-scaling
hero_metrics:
  - 500+ people
  - 36+ scrum teams
  - real-time CIO visibility
  - 1200+ features tracked
---

# Chevron Scaled Agile Transformation: Program Operating Engine Design & Delivery Architecture

## Executive Summary

Served on the Joint Operations Committee and designed the entire program operating engine for a 500+ person Fortune 10 enterprise ERP transformation ($100M/year, 10-year program). This was a director-level role combining Scaled Agile Framework (SAFe) deployment, enterprise delivery governance, and large-scale operating model design. Architected the end-to-end delivery framework: from how detailed design transitions into build, to how product requirements flow through key design decisions into RICEF objects, to how 36+ scrum teams coordinate dependencies and report into an integrated project plan. Built the traceability infrastructure in Azure DevOps, the governance and architectural runway series, the dependency management framework, and the real-time visibility pipeline (Azure DevOps to Microsoft Project to Power BI) that tracked 1,200+ features with CIO-level dashboards.

Calling this role "PMO" would be a massive understatement. This was designing how the entire engine of the program works, requiring an extraordinary combination of management skills and technical architecture skills to build and operate at Fortune 10 scale.

**Organizational Context:** Fortune 10 energy company; $100M/year, 10-year enterprise ERP transformation; 500+ person matrix organization; multiple geographic locations; 36+ scrum teams across 8+ functional pillars.

---

## Role & Career Progression

**Position:** Scaled Agile Transformation Lead, Joint Operations Committee Member
- Served on the Joint Operations Committee with program leadership
- Director-level scope: designed how the entire program delivery engine operates
- Reporting to program leadership and CIO
- Direct influence over all 36+ scrum teams and 500+ program members

**Scope of Responsibility:**
- Design the entire framework for how detailed design transitions into build
- Architect the traceability framework connecting product requirements to delivery
- Design and implement the scaled Agile operating model for 500+ people
- Establish delivery governance, architectural runway, and decision traceability
- Build the dependency management framework across all 36 scrum teams
- Build real-time visibility and tracking systems feeding the integrated project plan
- Lead organizational change and cultural transformation

---

## The Challenge

### Initial State: Waterfall at Scale
The 500+ person program was operating in traditional waterfall methodology:
- Long requirements-gathering phases
- Multi-month development cycles with no traceability from requirements to build
- Late discovery of issues
- Limited stakeholder visibility during execution
- No framework for how design decisions get dispositioned into development work
- No dependency management across teams
- Slow feedback loops

### The Problem
Waterfall doesn't scale well for large programs in dynamic environments. Chevron's transformation had:
- Changing requirements as business learned what the platform could enable
- Multiple dependent workstreams that needed coordination
- No traceability from product requirements through design decisions to build artifacts
- No standardized way to decompose design decisions into development work
- Need for visibility and stakeholder engagement
- Demand for faster delivery cycles
- Complex integration points requiring real-time coordination

The challenge was not just deploying Agile methodology. It was designing the entire delivery architecture: how requirements flow into design, how design flows into build, how build is tracked and governed, how dependencies are managed across 36 teams, and how all of that information rolls up into program-level visibility. This required both the management skills to coordinate across 500+ people and the technical architecture skills to build the systems that make it work.

---

## What I Built

### 1. End-to-End Delivery Architecture (Design to Build Framework)

The most critical contribution was designing the entire framework for how the program moves from detailed design into build. This is the delivery architecture that made everything else possible.

**Traceability Framework:**
Architected the end-to-end traceability chain connecting business intent to delivered software:

Product Requirements Backlog --> Key Design Decisions --> RICEF Objects --> Azure DevOps Features & Stories --> Delivered Software

- **Product Requirements Backlog:** Established the product requirements intake and backlog management process. Each requirement was logged, prioritized, and tracked through disposition.
- **Key Design Decisions (KDDs):** Requirements were packaged into key design decisions. Each KDD captured the business need, evaluated options, and documented the chosen approach. KDDs provided traceability of decision-making throughout the program.
- **RICEF Object Disposition:** Each KDD was dispositioned into one or more RICEF objects (Reports, Interfaces, Conversions, Enhancements, Forms) for custom build, or flagged as standard configuration. This disposition determined whether the solution required custom development or could be achieved through platform configuration.
- **Standardized ADO Templates per RICEF Object:** For each RICEF object type, I architected a standard set of Azure DevOps features and stories that teams could import into their backlog and customize for their specific item. These templates provided a consistent delivery framework across all 36 scrum teams, tracking the full lifecycle:
  - Functional specification document development
  - Technical specification document development
  - Development/build execution
  - Unit testing, integration testing, and validation

This traceability framework meant that at any point, leadership could trace a delivered feature back through the technical spec, functional spec, RICEF object, key design decision, and original product requirement. Nothing was built without a documented decision chain.

**Governance Framework & Decision Traceability:**
Architected a governance framework that provided traceability of decision-making across the entire program:

- Decision authority clearly defined at each level (product owner, architecture review board, steering committee, CIO)
- Every key design decision documented with rationale, alternatives considered, and approval chain
- Governance gates at critical transition points (requirements to design, design to build, build to test, test to release)
- Audit trail connecting business requirements through design decisions to delivered software

**Architectural Runway:**
Implemented the Architectural Runway, a recurring architectural governance series comprising key leaders from all functional pillars and the program's head architects. This series:
- Evaluated cross-cutting technical decisions that affected multiple scrum teams
- Ensured architectural consistency across the program
- Resolved technical conflicts and competing approaches before they became blockers
- Provided a forum for architects to align on platform standards and patterns
- Maintained a forward-looking architectural backlog so infrastructure and platform work stayed ahead of feature delivery

### 2. Scaled Agile Operating Model (36+ Scrum Teams)

**Organizational Structure:**

**Foundation: 36+ Scrum Teams**
- Organized by functional pillar (e.g., Materials Management, Finance, Hydrocarbon Value Chain, Asset Management)
- Each pillar had strategic scrum teams plus component-level scrum teams
- Teams sized 6-10 people (optimal scrum team size)
- Each team had dedicated product owner and scrum master
- Teams worked in 2-week sprints
- Each team imported standardized ADO feature/story templates for their RICEF objects and customized them for their specific work items

**Agile Release Trains (ARTs):**
- Grouped scrum teams by pillar
- Each ART managed 5-10 scrum teams
- ART lead (equivalent to program manager) coordinated sprints across teams
- Program-level planning cadence (PI planning)

**Solution Train:**
- Highest level of coordination
- Coordinated across all ARTs
- Managed dependencies between pillars
- Connected to enterprise architecture and the Architectural Runway

**Functional Authorities:**
- Quality assurance had separate reporting to maintain independence
- Infrastructure team coordinated with scrum teams for technical enablement
- Finance team coordinated across teams for cost tracking
- Vendor management coordinated third-party integrations

**Governance Model:**

**Decision Authority:**
- Product decisions: Product Owner (with escalation to pillar leader if needed)
- Technical decisions: Architecture Review Board and Architectural Runway
- Program-level decisions: Program Steering Committee (weekly)
- Escalations beyond steering committee: CIO
- Cross-cutting architectural decisions: Architectural Runway series

**Agile Planning Cadence:**
- PI Planning (quarterly): All 500+ people align on quarter goals
- Release Planning (monthly): ART-level planning for releases
- Sprint Planning (every 2 weeks): Team-level planning for 2-week sprints
- Sprint Reviews & Retros (every 2 weeks): Team-level feedback
- Architectural Runway (recurring): Cross-cutting technical alignment

**Release Cadence:**
- Monthly releases to production
- Each ART could contribute features to the monthly release
- Coordinated testing and deployment
- Rollback procedures if issues arose

**Metrics & Success Criteria:**
- Velocity (features delivered per sprint per team)
- Quality metrics (defects, test pass rates)
- Cycle time (from idea to production)
- Program health (on-track vs. at-risk features)
- Traceability coverage (percentage of delivered items with full requirement-to-delivery chain)
- Stakeholder satisfaction

### 3. Dependency Management Framework

Architected a dependency framework model enabling dependency management across all 36 scrum teams:

- **Cross-Team Dependency Mapping:** Each sprint planning cycle, teams identified dependencies on other teams' deliverables. Dependencies were logged in ADO and visualized in the integrated project plan.
- **Dependency Impact Analysis:** Built into the Power BI dashboards so program leadership could see which teams were blocking other teams and where the critical path ran across team boundaries.
- **PI Planning Integration:** During quarterly PI planning events (all 500+ people), dependencies were explicitly negotiated between teams and ARTs. Each team committed to deliverables other teams depended on.
- **Escalation Protocol:** Dependencies at risk triggered automatic escalation to ART leads, and cross-ART dependencies escalated to the Solution Train level.

This framework was essential because with 36 teams working in parallel, a single missed dependency could cascade into delays across multiple pillars.

### 4. Integrated Visibility System (Azure DevOps to Power BI)

All of the above (traceability, governance, dependencies, team execution) mapped into an integrated project plan and visibility system.

**Architecture: Azure DevOps --> VBA Middle Layer --> Microsoft Project --> Power BI**

**Data Collection Layer (Azure DevOps):**
- All 36+ scrum teams tracked work in Azure DevOps using standardized templates
- Thousands of stories, features, and epics with full traceability metadata
- Real-time status updates as work moved through sprints
- Automated data feeds from Azure DevOps API

**Data Transformation Layer (Custom VBA Application):**
- Extracted raw data from Azure DevOps (tens of thousands of work items)
- Applied business logic to aggregate and enrich (stories to features to epics, RICEF object rollups)
- Calculated derived metrics (velocity trends, cycle time, predictive completion dates)
- Prepared data for project management and analytics consumption
- Batch refresh 2x daily (morning and afternoon)

**Program Visibility Layer (Microsoft Project):**
- Every story mapped 1:1 to project plan items in the integrated project plan
- Real-time status from Azure DevOps synchronized to Project
- Assignment tracking (who owns each item)
- On/off track vs. baseline visibility
- Critical path highlighting
- Dependency tracking across teams and releases

**Analytics & Dashboarding (Power BI):**
- Executive dashboards: CIO view (program health, risk indicators, critical blockers)
- Program dashboards: Program leadership (feature delivery, quality, velocity trends)
- Pillar dashboards: ART leads (team health, velocity, dependencies within pillar)
- Team dashboards: Scrum teams (sprint progress, velocity trends, blockers)
- Portfolio dashboards: Planning and resource teams (utilization, capacity, forecasting)
- Dependency dashboards: Cross-team dependency status, blocking items, cascade risk

**Coverage & Scale:**
- 1,200+ features tracked across 35 scrum teams
- 500+ team members
- Real-time updates (refreshed 2x daily)
- Every persona had relevant visibility
- Full traceability from product requirement to delivered story

### 5. Organizational Change & Training

**Training Program:**

**Foundation Training (for all 500+ people):**
- Introduction to Agile principles and methodology
- Scrum roles (Product Owner, Scrum Master, Development Team)
- Sprint ceremonies (Planning, Daily Standup, Review, Retro)
- How the scaled Agile framework works
- How the traceability framework works (requirements to KDDs to RICEF to ADO)
- How the visibility system works (dashboards, status updates)

**Role-Specific Training:**
- **Product Owners:** Backlog management, prioritization, stakeholder engagement, KDD process
- **Scrum Masters:** Facilitation, removing blockers, team dynamics, dependency management
- **Development Teams:** Agile execution, estimation, ADO templates, RICEF workflow
- **ART Leads:** Program-level coordination, PI planning, release management, dependency resolution
- **Leadership:** Servant-leadership model, removing organizational barriers

**Specialized Training:**
- Vendor/third-party partners (how they integrate with Agile teams)
- Infrastructure/DevOps teams (supporting Agile deployment)
- Quality assurance (testing in Agile environments)

**Change Leadership:**

**Pillar-Level Change Champions:**
- Worked with each of the functional pillar leads
- Helped them understand both Agile benefits and the new delivery architecture
- Supported them in managing resistance within their teams
- Provided coaching on Agile best practices and traceability framework adoption

**Backlogs & Prioritization:**
- Established product management discipline across pillars
- Helped pillar leads prioritize work based on business value
- Managed dependencies between pillars through the dependency framework
- Negotiated resource allocation across competing priorities

**Cultural Transformation:**
- Shifted mindset from "waterfall deliverables" to "incremental value delivery"
- Built transparency into the organization (everyone could see status, traceability, dependencies)
- Enabled faster feedback and adaptation
- Reduced blame culture (focus on learning from retrospectives)
- Established decision traceability as a cultural norm

---

## Impact & Results

### Organizational Transformation
- **500+ person organization successfully transitioned from waterfall to hybrid Agile**
- 36+ scrum teams operating in coordinated cadence with standardized delivery processes
- Quarterly PI planning events with full organizational alignment
- Monthly release cycles with coordinated features from multiple teams

### Delivery Architecture
- **End-to-end traceability from product requirement to delivered software**
- Standardized RICEF-to-ADO templates adopted across all 36 scrum teams
- Governance framework with full decision traceability
- Architectural Runway maintaining technical alignment across the program
- Dependency management framework preventing cross-team cascade failures

### Visibility & Control
- **Real-time visibility from story level to CIO**
- 1,200+ features tracked across 35 scrum teams with full traceability metadata
- Every persona had dashboard relevant to their decision-making
- Metrics-driven program management (velocity, quality, cycle time, dependency health)

### Delivery Improvement
- **Measurable improvements in delivery velocity and collaboration**
- Faster feedback loops enabling quicker adaptation
- Better coordination across teams through dependency framework
- Increased team autonomy with standardized processes reducing central bottlenecks
- Reduced integration issues through dependency management and architectural alignment

### Stakeholder Engagement
- **Increased executive visibility and confidence**
- Monthly releases providing visible progress to leadership
- PI planning events enabling strategic alignment
- Metrics dashboards proving program health and predictability
- Decision traceability providing audit trail for governance

### Framework Legacy
- **Established playbook for large-scale enterprise delivery architecture**
- Traceability framework and RICEF templates reusable for future initiatives
- Governance model proven at Fortune 10 scale
- Visibility platform demonstrating value of metrics-driven management
- Dependency framework adopted as standard practice

---

## Technical Architecture

### Delivery Architecture
- End-to-end traceability: Product Requirements --> KDDs --> RICEF Objects --> ADO Features/Stories --> Delivered Software
- Standardized ADO templates per RICEF object type (functional spec, technical spec, build, test)
- Governance gates at each transition point
- Architectural Runway for cross-cutting technical decisions

### Operating Model
- Hierarchical organization: 36+ scrum teams --> 8+ ARTs --> Solution Train --> Program Steering
- Joint Operations Committee for program-level governance
- Clear decision authority at each level
- Dependency framework with cross-team and cross-ART escalation protocols
- Quarterly PI planning cadence with monthly releases

### Data Pipeline
**Layer 1, Source (Azure DevOps):**
- Work item tracking (stories, features, epics) with RICEF traceability metadata
- Real-time status updates
- Team metrics (velocity, capacity)
- Automated API feeds

**Layer 2, Transformation (Custom VBA):**
- Data extraction and cleaning
- Enrichment and calculation (RICEF rollups, dependency mapping)
- Batch processing 2x daily
- Data quality validation

**Layer 3, Integration (Microsoft Project):**
- 1:1 mapping of stories to integrated project plan items
- Real-time status synchronization
- Assignment and ownership tracking
- Critical path and dependency analysis

**Layer 4, Analytics (Power BI):**
- Multi-persona dashboards (5+ distinct views)
- Real-time metric calculation
- Trend analysis and forecasting
- Risk, health, and dependency indicators

### Metrics Tracked
- Velocity (features/story points per sprint)
- Cycle time (days from story creation to production)
- Quality (defects, test pass rates, code coverage)
- On-track/at-risk status
- Dependency impact analysis (cross-team blocking)
- Traceability coverage
- Resource utilization
- Budget tracking

---

## Capability Clusters Demonstrated

1. **Enterprise Delivery Architecture & Program Design**
   - Designed end-to-end delivery framework from detailed design through build
   - Architected traceability framework (requirements to KDDs to RICEF to ADO to delivery)
   - Established governance, architectural runway, and decision traceability
   - Director-level scope designing how the entire program engine operates

2. **Operational Scaling & Team Design**
   - Designed organizational structure for 500+ person Agile program with 36+ scrum teams
   - Established dependency management framework across all teams
   - Built standardized delivery processes (RICEF templates) enabling team autonomy at scale

3. **Systems Thinking & Technical Architecture**
   - Architected integrated data pipeline connecting multiple systems
   - Built automated calculation and aggregation of metrics
   - Created multi-persona dashboards enabling real-time decision-making
   - Designed the ADO template architecture for RICEF object lifecycle tracking

4. **Strategic Leadership & Governance**
   - Served on Joint Operations Committee
   - Implemented Architectural Runway with program's head architects
   - Defined governance framework balancing autonomy with accountability
   - Managed stakeholder expectations and drove cultural adoption

---

## Timeline
**Duration:** ~18 months (2017-2019, concurrent with quality management and data migration projects)
**Key Phases:**
- Phase 1 (Months 1-3): Delivery architecture design, traceability framework, operating model design, pilot with 2-3 teams
- Phase 2 (Months 4-6): Rollout to all 36+ teams, establish governance, deploy RICEF templates
- Phase 3 (Months 7-12): Stabilize operations, build visibility system, implement Architectural Runway
- Phase 4 (Months 13-18): Optimize and scale, dependency framework maturity, demonstrate value, cultural embedding

---

## Residual Value

- Delivery architecture (traceability framework, RICEF templates, governance) became the standard for how the program operated through subsequent releases
- Operating model and governance became template for future Chevron transformation initiatives
- Visibility platform (Azure DevOps to Project to Power BI) became standard practice across Deloitte's enterprise programs
- Training materials and change leadership playbook reusable for future transformations
- Proof point that Agile scales at Fortune 10 level when properly designed with end-to-end delivery architecture

---

## External Framing Note

For resume and external contexts, frame as "enterprise ERP transformation" rather than SAP/S/4HANA to avoid being typecast as an SAP specialist. The skills demonstrated (delivery architecture, operating model design, governance, scaled Agile, visibility systems) are platform-agnostic.
