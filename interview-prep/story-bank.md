# Story Bank — Master STAR+R Stories

This file accumulates your best interview stories over time. Each evaluation (Block F) adds new stories here. Instead of memorizing 100 answers, maintain 5-10 deep stories that you can bend to answer almost any behavioral question.

## How it works

1. Every time `/career-ops oferta` generates Block F (Interview Plan), new STAR+R stories get appended here
2. Before your next interview, review this file — your stories are already organized by theme
3. The "Big Three" questions can be answered with stories from this bank:
   - "Tell me about yourself" → combine 2-3 stories into a narrative
   - "Tell me about your most impactful project" → pick your highest-impact story
   - "Tell me about a conflict you resolved" → find a story with a Reflection

## Stories

<!-- Stories will be added here as you evaluate offers -->
<!-- Format:
### [Theme] Story Title
**Source:** Report #NNN — Company — Role
**S (Situation):** ...
**T (Task):** ...
**A (Action):** ...
**R (Result):** ...
**Reflection:** What I learned / what I'd do differently
**Best for questions about:** [list of question types this story answers]
-->

### [Data Engineering] ETL Pipeline Transformation
**Source:** Report #023 — JL13 Concepts (GoA) — Data Analyst
**S:** Oracle, SQL Server, MySQL, and Dataverse data was siloed; management had no unified view and manual consolidation took 5 days per cycle.
**T:** Build an automated ETL pipeline to replace the manual process and feed real-time data into Power BI.
**A:** Designed pipeline using Azure, PowerShell, Python, and SQL to aggregate all sources into the Power BI service portal; implemented data quality assurance gates at each stage.
**R:** Processing time cut from 5 days to ~8 hours; management gained real-time operational visibility across all business units.
**Reflection:** Would add monitoring/alerting earlier and document pipeline dependencies from day 1. Would implement data contracts with source system owners to prevent schema drift breaking downstream reports.
**Best for questions about:** data pipeline design, ETL automation, performance improvement, cloud migration, technical problem-solving, impact delivery

### [Data Quality] Data Quality Assurance Program
**Source:** Report #023 — JL13 Concepts (GoA) — Data Analyst
**S:** Power BI service releases were questioned by stakeholders due to data inconsistencies between source systems.
**T:** Establish a reliable data quality gate before each release cycle.
**A:** Implemented rigorous data quality assurance checks on integrated datasets; created SQL validation scripts comparing source vs. warehouse counts and flagging anomalies before publish.
**R:** Increased stakeholder trust; zero quality-related report retractions after the process was in place.
**Reflection:** Manual checks don't scale — should have built automated monitoring from the start. Data quality is a product, not a task.
**Best for questions about:** data quality, stakeholder trust, process improvement, attention to detail, governance

### [Stakeholder Management] 45-Stakeholder Analytics Alignment
**Source:** Report #023 — JL13 Concepts (GoA) — Data Analyst
**S:** 45+ internal and external stakeholders (sales, finance, operations, management) had conflicting definitions of shared metrics and competing data requests.
**T:** Drive cross-functional alignment without formal authority over any of these teams.
**A:** Held discovery sessions per function, identified overlapping metrics, facilitated agreement on shared KPI definitions, built agreed definitions into the data warehouse as the single source of truth.
**R:** Cross-functional alignment achieved; all business units reporting on consistent data; significantly reduced ad-hoc report requests.
**Reflection:** The hardest part was the politics, not the tech. Agree on definitions first, build second. Now run a definitions workshop before any warehouse or dashboard project.
**Best for questions about:** stakeholder management, cross-functional collaboration, influence without authority, communication, project leadership
