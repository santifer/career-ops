---
name: openclaw-career-tracker
description: Manage job applications with full state machine tracking and statistics dashboard. Use when user asks to (1) check/update application status, (2) view application stats, (3) add a new application, (4) track job search progress, or (5) mentions "tracker" / "applications" / "pipeline". Supports SQLite or Markdown file storage.
---

# Career Application Tracker

Track job applications through a full state machine with statistics dashboard.

## State Machine

```
Evaluated → Applied → Responded → Contacted → Interview → Offer
                                                    → Rejected
                                                    → Discarded
```

### Status Definitions

| Status | Meaning | Trigger |
|--------|---------|---------|
| `evaluated` | JD scored, not yet applied | Evaluation complete |
| `applied` | Candidate submitted application | User confirms submission |
| `responded` | Inbound reply from recruiter/company | User receives reply |
| `contacted` | Candidate proactively reached out (outbound LinkedIn, email) | User confirms outreach |
| `interview` | Interview scheduled or completed | User confirms interview |
| `offer` | Received job offer | User confirms offer |
| `rejected` | Rejected at any stage | Rejection received |
| `discarded` | Candidate decided not to pursue | User decides to skip |

### Valid Transitions

- `evaluated` → `applied` | `discarded`
- `applied` → `responded` | `contacted` | `rejected` | `discarded`
- `responded` → `contacted` | `interview` | `rejected` | `discarded`
- `contacted` → `responded` | `interview` | `rejected` | `discarded`
- `interview` → `offer` | `rejected`
- Any terminal state (`offer`, `rejected`, `discarded`) → no further transitions

### Status Update Rules

- **Contacted** = outbound action by candidate (LinkedIn message, cold email, referral ping)
- **Responded** = inbound action by company (recruiter reply, screening invitation)
- Both `contacted` and `responded` can coexist; `contacted` before `responded` = candidate chased, `responded` before `contacted` = inbound first

## Statistics Dashboard

Generate on demand:

| Metric | Description |
|--------|-------------|
| Total applications | Count of all non-terminal states |
| By status | Breakdown: evaluated, applied, responded, contacted, interview, offer, rejected, discarded |
| Average score | Mean JD evaluation score (1-5) |
| % with PDF | Applications that have a generated resume PDF |
| % with report | Applications that have an evaluation report |

## Data Storage

Store applications in `data/applications.md` (Markdown table) or a database.

### Markdown Table Format

```markdown
| # | Date | Company | Role | Score | Status | PDF | Report |
|---|------|---------|------|-------|--------|-----|--------|
| 001 | 2026-04-19 | Acme Corp | Senior Engineer | 4.2 | applied | ✅ | ✅ |
```

### Schema (per row)

- `id`, `date`, `company`, `role`, `score` (1-5), `status` (state machine), `pdf` (✅/❌), `report` (link or ✅/❌)

## Workflows

### Workflow A — Search & Push

Job scanner writes matched positions to pipeline. New entries get status `evaluated`.

### Workflow B — Manual Application Add

User says "I applied to X" → add row with status `applied`.

### Workflow C — Status Update

User says "heard back from X" → update status to `responded`. Validate transition is legal per state machine above.

### Workflow D — Email Sync

Automated email parser updates status based on parsed content (screening → `responded`, interview invite → `interview`, rejection → `rejected`, offer → `offer`).

## Quick Start

**User asks for pipeline status:** Run statistics dashboard, display summary.

**User reports application:** Add to tracker, status `applied`.

**User reports reply:** Update to `responded` (inbound) or `contacted` (outbound).
