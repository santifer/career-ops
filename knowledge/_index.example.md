# Knowledge Index

Maps your career archetypes (from `modes/_shared.md`) to project folders for targeted context loading during evaluations, CV generation, and interview prep.

## How It Works

Each project in this folder has two files:

- `project.md` — Deep technical details, business context, architecture, and metrics
- `star.md` — STAR+R framework version optimized for interviews and external positioning

When the agent evaluates a job offer, it reads `_index.md` to find which projects map to the detected archetype, then loads those project files for richer CV personalization and interview story selection.

## Recommended Workflow: Voice-to-Knowledge

The fastest way to populate these files is a **2-3 minute voice session** per project:

1. **Start a voice conversation** with the agent (Cursor voice, Claude voice, or any voice input)
2. **Talk for 2-3 minutes** about the project — what the situation was, what you did, what you built, what the results were, and any technical details you remember
3. **The agent structures your narration** into the `project.md` and `star.md` formats below, extracting metrics, capabilities, and archetype mappings automatically

This approach captures details you might skip when writing — technical decisions, team dynamics, metrics you remember verbally but wouldn't bother typing. The agent does the structuring work.

## Index Structure

Organize by archetype first (for lookup during evaluations), then by company (for chronological reference):

```markdown
## By Archetype

### [Archetype Name from _shared.md]
- [project-slug](project-slug/) — one-line summary with hero metric

### [Another Archetype]
- [project-slug](project-slug/) — summary
- [another-project](another-project/) — summary

## By Company (chronological)

### Company Name (Start Date - End Date)
- [project-slug](project-slug/)
```

Projects can (and should) appear under multiple archetypes if they demonstrate different capabilities.

## Example

```markdown
## By Archetype

### Backend Engineer
- [acme-api-migration](acme-api-migration/) — migrated monolith to microservices, 40ms p99 latency
- [acme-event-pipeline](acme-event-pipeline/) — Kafka event pipeline, 2M events/day

### Technical Lead
- [acme-api-migration](acme-api-migration/) — led 4-person team through 6-month migration
- [startup-mvp-launch](startup-mvp-launch/) — architected and shipped MVP in 8 weeks

## By Company (chronological)

### Acme Corp (Jan 2020 - Dec 2023)
- [acme-api-migration](acme-api-migration/)
- [acme-event-pipeline](acme-event-pipeline/)

### Startup Inc (Jan 2024 - Present)
- [startup-mvp-launch](startup-mvp-launch/)
```
