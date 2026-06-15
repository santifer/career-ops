# Evidence Graph Contract

Issue: #1033

The evidence graph connects user-owned proof points to generated CVs, cover letters, reports, and interview stories. It helps agents avoid unsupported claims before output is finalized.

## Evidence Item

```yaml
id: ev_a1b2c3d4e5f6
source: article-digest.md
source_anchor: "Project Alpha"
claim_type: metric
claim: "Reduced inference latency 40%"
confidence: high
urls:
  - https://example.com/project-alpha
```

## Claim Types

- `metric`: measurable impact, revenue, latency, adoption, scale, quality, or cost
- `project`: project ownership or delivery claim
- `skill`: technology, domain, language, or method evidence
- `leadership`: mentoring, cross-functional work, hiring, stakeholder management
- `story`: STAR/STAR+R interview narrative
- `credential`: degree, certificate, publication, award, or talk

## Reference Format

Generated artifacts may reference evidence internally:

```markdown
<!-- evidence: ev_a1b2c3d4e5f6, ev_1234abcd5678 -->
```

Reports may also include metadata:

```yaml
evidence_ids:
  - ev_a1b2c3d4e5f6
  - ev_1234abcd5678
```

## Unsupported Claim Rule

Before finalizing candidate-facing output, agents should flag claims that:

- contain a strong metric without an evidence ID
- introduce a company, project, credential, or technology not present in user-layer evidence
- strengthen a claim beyond the evidence confidence
- cite a URL that is not present in the user layer

The graph remains local. Evidence IDs may appear in generated metadata, but private source content must not be shared without explicit privacy-mode consent.
