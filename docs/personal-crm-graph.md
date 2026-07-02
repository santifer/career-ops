# Personal CRM Relationship Graph

Issue: #1032

The personal CRM graph is a read-only relationship model over user-layer artifacts. It answers relationship questions across companies, people, roles, applications, and interactions without moving raw personal data out of the repo.

## Entities

### Company

- `id`: stable local slug
- `name`: display name
- `applications`: count of parsed applications for this company
- `interactions`: count of parsed follow-up interactions for this company

### Person

- `id`: stable local slug
- `name`: recruiter, hiring manager, referrer, or contact
- `company_id`: associated company when known
- `source`: tracker, follow-up, contact output, or interview notes

Person extraction is deferred in the initial implementation. The current graph emits `persons: []` and keeps `person_id` empty on interactions until a parser can extract named contacts reliably.

### Role

- `id`: stable local slug
- `company_id`
- `title`

### Application

- `id`: tracker row or report slug
- `company_id`
- `role_id`
- `status`
- `score`
- `report`
- `pdf`

### Interaction

- `id`: stable local slug derived from company, date, and summary
- `company_id`
- `person_id`: empty until person extraction is implemented
- `application_id`: empty until follow-ups can be linked to tracker rows
- `type`: outreach, reply, interview, follow-up, note
- `date`
- `summary`

## Source Artifacts

The graph can be derived from:

- `data/applications.md`
- `data/follow-ups.md`

Future versions may also derive optional nodes and links from:

- `reports/*.md`
- `interview-prep/*.md`
- contact/outreach outputs

The graph is an index, not a new source of truth. Raw personal data remains in the user layer.

## Example Queries

- "Who have I talked to at this company?"
- "Which roles at this company did I already evaluate?"
- "Did a recruiter reply before?"
- "What should I mention based on previous interactions?"
- "Which companies are warm versus cold?"

## Privacy Boundary

The CRM graph must not be shared unless a future privacy mode explicitly allows the selected data classes. By default, it stays local-only.

Local graph output may include unredacted company names, role titles, status history, report paths, PDF paths, follow-up summaries, personal notes, and references to private artifacts. Treat it as personal user-layer data, not anonymous market intelligence.
