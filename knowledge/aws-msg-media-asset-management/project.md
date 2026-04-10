---
company: AWS
project: MSG Media Asset Management Platform
dates: 2022-11 to 2023-07
archetypes:
  - AI Solutions Architect
  - AI Customer Success / Deployment
  - AI Forward Deployed Engineer
capabilities:
  - cloud-migration
  - ai-ml-metadata
  - customer-engagement
hero_metrics:
  - 10K+ media assets digitized
  - 30+ years of content
  - 9.9/10 customer satisfaction
---

# Project Details: AWS Madison Square Garden Media Asset Management Platform

**Timeline:** November 2022 - July 2023
**Organization:** Amazon Web Services (Professional Services, Media & Entertainment)
**Client:** Madison Square Garden Sports Corp
**Role:** Hybrid Product & Engagement Manager (platform architect and customer stakeholder leader)
**Scope:** Media digitization, AI-powered metadata tagging, secure media supply chain platform

---

## Context & Problem Statement

Madison Square Garden possessed one of the most valuable and vulnerable media archives in the world: 30+ years of live events, concerts, sports broadcasts, and entertainment content captured across dozens of physical media formats. This included:

- VHS tapes and Betacam videotapes
- 35mm slides and film reels
- CDs, DVDs, and other optical media
- DATs (Digital Audio Tapes) and MiniDV
- Hard drives and modern digital files
- Thousands of assets across multiple generations of media technology

**The Problem:** All of this media was stored in physical warehouses, at constant risk of degradation, obsolescence, and loss. As formats aged (VCRs no longer manufactured, tape oxide deteriorating), the content faced existential threat. MSG needed a comprehensive solution to:

1. **Preserve Content:** Digitize all physical media before formats become unreadable
2. **Enable Discovery:** Make 30+ years of content searchable and accessible (currently impossible — media was physically stored with limited metadata)
3. **Support Operations:** Enable internal teams and external creative agencies to collaborate on media projects securely
4. **Scale Infrastructure:** Handle continuous ingestion of new digital content with automated tagging

This was a mission-critical project with both preservation and business value: MSG's archived content represents significant commercial IP (rights to broadcast footage, music performances, sports moments, celebrity appearances).

---

## Solution Architecture

Jon served as the platform architect and customer stakeholder leader throughout. He designed and oversaw delivery of a three-layer platform.

### Layer 1: Physical-to-Digital Migration Platform

**Migration Logistics & Tracking:**
- Designed end-to-end strategy for physically moving 30+ years of multi-format media from MSG's warehouses to AWS data centers
- Implemented tracking system for entire migration pipeline
- Coordinated format detection and appropriate digitization processes for each media type
- Managed inventory management and chain-of-custody throughout migration

**Format Standardization:**
- Established standardized digital output formats and quality standards
- Created conversion specifications for each source format (VHS → H.264, Betacam → ProRes, 35mm → uncompressed DPX, etc.)
- Implemented quality assurance processes to ensure digitization fidelity

**Scale & Volume:**
- Successfully migrated 10,000+ media assets from physical formats to digital storage
- Handled multiple format types requiring format-specific digitization processes
- Maintained data integrity and metadata preservation throughout migration

---

### Layer 2: AI-Powered Metadata Tagging Engine

**Intelligent Asset Recognition:**
- Built AI/ML-enabled media asset management platform with automatic metadata generation
- Implemented computer vision models for visual content analysis (images and video keyframes)
- Deployed audio analysis for spoken content and music identification
- Integrated natural language processing for metadata enrichment

**Comprehensive Tagging Framework:**
- Automated tagging across multiple metadata dimensions:
  - **People:** Facial recognition and identity tagging for performers, athletes, celebrities, crew
  - **Objects:** Scene object detection (instruments, equipment, signage, apparel)
  - **Brands:** Logo and brand identification and extraction
  - **Locations:** Scene location identification and geospatial tagging
  - **Context:** Event type, date, time, performance details, broadcast information
  - **Custom Metadata:** Extensible framework for MSG-specific tagging needs

**Searchability & Discoverability:**
- Transformed 30+ years of previously unsearchable archive into a fully indexed, queryable database
- Enabled powerful search capabilities: "Find all images/video of Tiger Woods" or "Show every moment where a Coca-Cola logo is visible" or "Find all content from MSG concerts in 2005"
- Created a knowledge graph of media relationships and connections

**Permanent Ingestion Pipeline:**
- Built automated workflow for processing new digital content as it's captured
- New assets → upload to platform → automatic AI tagging → metadata mapping to existing or new entities
- Continuous learning: ingestion pipeline improved over time as additional assets and metadata enriched the training data
- Scaled to handle MSG's ongoing content capture (live events, broadcasts, editorial content)

**Advanced Media Network:**
- Implemented graph-based architecture for media asset relationships
- Created network of connections based on shared people, locations, objects, themes
- Enables "discovery serendipity" — find related content beyond direct search
- Network grows dynamically as new assets are ingested and tagged

---

### Layer 3: Secure Collaborative Media Supply Chain Platform

**Project-Based Collaboration:**
- Implemented project management framework for media curation and collaboration
- Internal teams (editorial, production, marketing) can create projects and invite collaborators
- Defined role-based access controls: view-only, download, edit, admin
- Managed project lifecycle from creation through completion

**External Collaboration & Security:**
- Enabled external creative agencies and partners to collaborate on projects securely
- Implemented granular access controls for external users
- Created secure sharing mechanisms that prevent unauthorized access or content leakage
- High-stakes environment: media supply chain security critical (film/sports footage can be worth millions if leaked)

**Access Control & Compliance:**
- Enforced identity and access management for all users (internal and external)
- Implemented audit logging for all content access and sharing
- Created compliance framework for content rights management
- Segmented data based on sensitivity levels and access requirements

**Secure Data Exchange:**
- Built encrypted data transfer mechanisms for content sharing
- Implemented secure asset download with audit trail
- Created temporary access links with expiration and revocation capabilities
- Enabled agencies to work with content without local copies (reduces security risk)

**Rights Management Integration:**
- Framework for tracking content rights (broadcast rights, music rights, talent rights)
- Enabled project-level rights tracking and compliance verification
- Connected to MSG's legal and licensing infrastructure

---

## Key Metrics & Impact

### Digital Preservation
- **Assets Digitized:** 10,000+ physical media assets successfully converted to digital format
- **Historical Coverage:** Complete 30+ year archive now in digital form
- **Format Coverage:** Multiple format types successfully processed (VHS, Betacam, 35mm, etc.)
- **Data Integrity:** All digitized content meets quality and fidelity standards

### AI Platform Performance
- **Tagging Accuracy:** High-confidence metadata generation across visual and audio dimensions
- **Searchability:** Transformed previously unsearchable archive into fully queryable database
- **Metadata Dimensions:** Comprehensive tagging across people, objects, brands, locations, context
- **Continuous Learning:** Ingestion pipeline improves accuracy with each new asset

### Operational Impact
- **Discovery Time:** Reduced from manual archive search (hours/days) to instant search
- **Creative Efficiency:** Agencies can find relevant assets in seconds vs. requesting physical archivists
- **Scale:** Permanent ingestion pipeline processes new content automatically

### Customer Satisfaction
- **NPS & CSAT:** 9.9/10 customer satisfaction score across Jon's AWS engagements
- **Executive Alignment:** Strong support from MSG executive leadership and project stakeholders
- **Business Value:** Direct impact on MSG's ability to monetize archived content and support creative operations

### Commercial Impact
- **Competitive Differentiation:** Transformed MSG's content library from liability (degradation risk) to strategic asset
- **Monetization Enablement:** Searchable archive enables new revenue opportunities (licensing, syndication, merchandise)
- **Operational Efficiency:** Internal teams and external partners can collaborate more effectively

---

## Technical Stack & Architecture

**Core Technologies:**
- AWS cloud infrastructure (S3, EC2, Lambda, RDS)
- AWS AI services (Rekognition for computer vision, Transcribe for audio)
- Custom ML pipeline for domain-specific tagging
- Graph database for media relationship mapping
- Identity and Access Management (IAM, SSO integration)
- Encryption and secure data handling (KMS, encrypted transfers)

**Architectural Patterns:**
- Serverless ingestion pipeline (Lambda-triggered workflows)
- Asynchronous processing for long-running digitization and tagging jobs
- Graph-based knowledge representation for media relationships
- Role-based access control with fine-grained permissions
- Audit logging and compliance tracking

**Integrations:**
- MSG's existing asset management systems
- Creative workflows and project management tools
- Rights management and licensing systems
- Email and notification systems

---

## Project Structure & Governance

**Jon's Role Definition:**
Jon functioned as a hybrid Product & Engagement Manager:
- **Quarterback for Delivery:** Engineers reported to him; he managed the engineering team's roadmap and execution
- **Customer Executive Interface:** He owned the customer relationship across MSG's executive sponsors, product teams, technical teams, and steering committee
- **Decision Authority:** Responsible for product decisions, priority tradeoffs, and stakeholder alignment
- **Risk Management:** Managed both technical risks and relationship risks

**Stakeholder Landscape:**
- **Executive Sponsors:** C-level leadership at MSG (COO, CMO)
- **Technical Steering Committee:** MSG IT, security, architecture teams
- **Project Teams:** MSG business units interested in content (editorial, production, marketing)
- **External Partners:** Creative agencies and content partners
- **AWS Team:** Solution architects, engineers, product managers, professional services

**Governance Structure:**
- Weekly executive steering committee meetings (Jon as AWS principal)
- Technical working group meetings for implementation and architecture decisions
- Project reviews and milestone tracking
- Risk and escalation management

---

## Scope & Constraints

**Owned & Controlled:**
- Platform architecture and design (all three layers)
- Product strategy and requirements definition
- Customer relationship and executive engagement
- Engineering team management and delivery roadmap
- Stakeholder alignment and decision facilitation

**Collaborative Elements:**
- Specialized media digitization partner for format conversion expertise
- MSG's IT and security teams for compliance and integration requirements
- AWS solution architects and engineers for infrastructure and AI services
- External creative agencies for use case validation and feedback

**Key Constraints:**
- Media supply chain security requirements (high-stakes content at risk of leakage)
- Legacy system integrations with existing MSG infrastructure
- Physical logistics complexity (warehouse coordination, format handling)
- Rights management complexity (multiple copyright holders, licensing agreements)
- Performance requirements for enterprise-scale media platform

---

## Long-Term Value & Legacy

The MSG project demonstrated several capabilities:

1. **End-to-End Product Ownership:** From customer problem discovery through architecture through delivery through customer success
2. **Hybrid Leadership Model:** Ability to lead both engineers and customer executives simultaneously
3. **Enterprise Complexity:** Experience managing complex stakeholder landscapes, security requirements, and integration challenges
4. **Customer Success:** 9.9/10 satisfaction across all AWS engagements
5. **AI/ML Application:** Practical application of computer vision, NLP, and graph database technologies to real business problems
6. **Executive Presence:** Demonstrated ability to engage at C-level and manage strategic initiatives

---

## Alignment with Capability Clusters

- **AI/Agentic Development & Architecture:** Computer vision, NLP, ML pipeline design, graph-based knowledge representation, automated metadata generation
- **Product Incubation & Commercialization:** Platform design, three-layer architecture, monetization strategy, continuous innovation through ingestion pipeline
- **Customer Discovery & Executive Engagement:** Executive relationship management, requirements gathering, stakeholder alignment, addressing high-stakes business problems
