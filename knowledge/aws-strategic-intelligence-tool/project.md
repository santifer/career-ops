---
company: AWS
project: Strategic Intelligence & Relationship Mapping Tool
dates: 2023
archetypes:
  - AI Product Manager
  - AI Solutions Architect
capabilities:
  - product-incubation
  - pipeline-analytics
  - gtm-automation
hero_metrics:
  - 1300+ accounts mapped
  - VP-level buy-in
  - 30% reduced deal cycle times
---

# Project Details: AWS Strategic Intelligence Tool

**Timeline:** 2022 (parallel to M&E customer work)
**Organization:** Amazon Web Services (Professional Services, Regional Leadership)
**Scope:** Strategic sales intelligence platform for presales across AWS region
**Status:** Fully functional, VP-level buy-in secured, deployment halted by Amazon reorganization

---

## Context & Problem Statement

AWS Professional Services was competing for massive enterprise deals ($100M+), where competitive intelligence and relationship insight were crucial to winning. Presales teams needed answers to high-stakes questions:

- Who else in this target company's industry is already on AWS?
- Who sits on their board or serves as an advisor that also has connections to existing AWS customers?
- Where are the relationship intersections that could provide warm paths into strategic conversations?
- What is the competitive landscape around this opportunity?

**The Business Opportunity:** AWS was leaving value on the table. Teams were making calls to new prospects without leveraging existing relationships. They didn't know that a board member at Target Company also advised Company X (which was already on AWS). They couldn't quickly surface relationship intersections that could be used for strategic leverage.

**The Challenge:** This information existed in fragmented sources:
- Salesforce (pipeline data and customer accounts)
- PitchBook (private company data, cap tables, board members, advisors)
- Public company databases (board members, shareholders, advisors for public companies)

Nobody had integrated these sources to surface relationship intelligence dynamically.

**Market Context:** This was 2022. AWS was aggressively pursuing AI/ML opportunities. Strategic account planning was becoming increasingly important as deal sizes grew. The team that could surface relationship intelligence fastest would have a competitive advantage.

---

## Solution Architecture

Jon designed and developed the entire system himself in Python, building a strategic intelligence platform that integrated multiple data sources and surfaced relationship intersections.

### Core Components

**Data Integration Layer:**
- **Salesforce Integration:** Built API to pull internal pipeline data (target accounts, opportunity stages, stakeholders, deal size)
- **PitchBook Integration:** Built API to source external data on private companies (cap tables, board members, advisors, funding history)
- **Public Company Data:** Integrated sources for public company information (shareholders, board members, SEC filings)
- **Customer Master Data:** Cross-referenced Salesforce customer accounts with external data sources

**Relationship Mapping Engine:**
- **Entity Recognition:** Identified key entities across all data sources (companies, people, board members, advisors)
- **Cross-Referencing:** Matched entity names across different data sources to identify shared relationships
- **Confidence Scoring:** Implemented matching algorithms to handle name variations, title variations, and incomplete data
- **Deduplication:** Resolved duplicate records across multiple data sources

**Intelligence Extraction:**
- **Target Analysis:** For each target company, identified all related entities (competitors, customers, board members, advisors)
- **Relationship Intersections:** Surfaced board members and advisors who appeared in both target company and AWS customer company
- **Competitive Intelligence:** Identified industry peers and their AWS adoption status
- **Account Mapping:** Created visual maps of relationship networks

**Strategic Leverage Identification:**
- **Warm Path Discovery:** Highlighted relationship intersections that could provide warm introductions
- **Decision Maker Mapping:** Identified which board members or advisors had influence at target company
- **Historical Relationships:** Tracked prior relationships and interactions where they existed
- **Network Analysis:** Analyzed depth of relationship network (direct connections, indirect connections)

### Technical Stack

**Languages & Frameworks:**
- Python (core development)
- API-based architecture for data source integration

**Data Sources:**
- Salesforce API (1,300+ SaaS accounts)
- PitchBook API (private company data)
- Public data sources (SEC EDGAR, stock exchange filings)
- Custom databases for relationship tracking

**Deployment Model:**
- Designed for regional presales deployment across entire AWS region
- Intended for integration into presales workflows and account planning tools
- Scalable to handle multiple geographies and expanding AWS customer base

---

## Key Metrics & Impact

### Scale & Reach
- **Customer Database:** Analyzed across 1,300+ SaaS accounts in AWS customer base
- **Relationship Intersections:** Surfaced multiple relationship pathways per target account
- **Geographic Scope:** Designed for deployment across entire AWS region
- **Data Coverage:** Integrated multiple external data sources (PitchBook, public markets, Salesforce)

### Business Impact Potential
- **Sales Cycle Reduction:** Early feedback indicated potential 30% reduction in sales cycle time through accelerated relationship discovery
- **Win Rate Improvement:** Identified warm paths to key decision makers, improving prospect quality
- **Deal Velocity:** Presales teams could focus on high-leverage relationship angles faster
- **Competitive Advantage:** Technology that AWS competitors didn't have (significant advantage in 2022)

### Organizational Reach
- **VP-Level Buy-In:** Secured direct support from VP of all Professional Services (AWS leadership L8/L9, few levels below CEO)
- **Regional Deployment:** Approved for region-wide deployment to all presales teams
- **Intended Scale:** Would have impacted hundreds of presales professionals and their customer interactions

---

## Project Status & Context

**Completion Status:**
- **Technical Delivery:** Platform was fully functional and operational
- **Testing & Validation:** System had been validated with early presales teams and showed promise
- **Stakeholder Buy-In:** Strong leadership support secured (VP of all Professional Services)
- **Deployment Plan:** Architecture designed for region-wide rollout

**Project Halt:**
Amazon's 2022 layoffs (~30,000 people) occurred during the final stages of development. Jon was caught in the reduction. The project was not deployed region-wide, though it had cleared all technical gates and had executive approval.

**Technical Legacy:**
The code and architecture remained functional proof that strategic intelligence platforms could be built and deployed at scale within AWS. The platform demonstrated that relationship intelligence could meaningfully reduce sales cycle time.

---

## Technical Achievements

**Python Development:**
- Wrote all application code in Python
- Implemented complex data integration logic
- Built relationship mapping algorithms
- Created confidence-scoring systems for entity matching
- Deployed as functional system

**Data Integration Challenges Solved:**
- Reconciled data from 3+ external sources
- Handled name variations and incomplete data
- Built intelligent deduplication
- Created efficient relationship mapping algorithms
- Implemented scalable architecture for growth

**System Design:**
- Modular architecture for easy modification and extension
- Scalable data ingestion
- Real-time relationship discovery
- Confidence scoring for output reliability

---

## Scope & Constraints

**Owned & Controlled:**
- Complete platform design and architecture
- All Python development
- Data integration strategy
- Relationship mapping algorithms
- System testing and validation

**Collaborative Elements:**
- AWS solution architects for infrastructure consultation
- VP of Professional Services for strategic direction and buy-in
- Early presales teams for use case validation and feedback
- Legal and compliance for data usage approval

**Constraints & Challenges:**
- Data quality variability across multiple sources
- Entity matching complexity (name variations, incomplete records)
- Salesforce API rate limits and data access restrictions
- PitchBook data freshness and coverage
- Regulatory constraints around data usage and privacy
- Time pressure (project running parallel to customer delivery)

---

## Long-Term Significance

Although the project wasn't deployed region-wide due to organizational circumstances, it demonstrated several important capabilities:

1. **Full-Stack Development:** Designed and built a complete system from architecture through deployment in Python
2. **Data Integration:** Successfully integrated multiple complex external data sources
3. **Strategic Thinking:** Understood how to translate business problems into technical solutions
4. **Executive Alignment:** Secured VP-level buy-in for regional deployment
5. **Innovation at Scale:** Built technology for regional deployment to hundreds of users

The project validated the concept of strategic intelligence platforms and showed that AWS could have built lasting competitive advantage through relationship intelligence.

---

## What This Reveals

For interviewers and evaluators:
- **Technical Capability:** Full-stack development in Python, data integration, algorithm design
- **Strategic Thinking:** Understood how presales organizations work, identified leverage points, built for operational impact
- **Execution:** Delivered functional product in parallel to customer delivery work
- **Leadership Buy-In:** Secured executive support from VP-level leadership (few levels below CEO)
- **Resilience:** Project outcome disrupted by external organizational event, not technical failure

---

## Alignment with Capability Clusters

- **AI/Agentic Development & Architecture:** Relationship mapping algorithms, intelligent entity matching, strategic inference engines
- **Product Strategy & Go-to-Market:** Sales process optimization, competitive intelligence, market positioning
