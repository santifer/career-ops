# Evaluation Cache Contract

Issue: #1025

career-ops evaluations contain two different layers:

- **Job facts**: public facts derived from the posting, company pages, scanner output, and other public sources.
- **Candidate fit**: private scoring and advice derived from the user's CV, profile, preferences, compensation floor, constraints, and strategy.

Only the job-facts layer may be cached or shared. Candidate fit is always recomputed locally.

## Cache Key

A job-facts payload is keyed by a deterministic posting identity:

```yaml
schema_version: evaluation-job-facts/v1
listing_fingerprint: fp_v1_...
source_url: https://jobs.example.com/role/123
canonical_url: https://jobs.example.com/role/123
retrieved_at: 2026-06-15T00:00:00Z
content_hash: sha256:...
```

`listing_fingerprint` should come from the listing fingerprint contract when available. Until then, implementations may derive it from normalized company, role title, location, ATS provider, posting id, canonical URL, and selected public JD text.

## Share-Safe Job Facts

The job-facts payload may contain:

- company name, domain, public profile, size band, funding stage, and legitimacy signals
- normalized role title, level, team, function, seniority, employment type, and work mode
- public location, remote policy, relocation signal, travel signal, and visa signal
- salary or compensation signals copied from the posting or public sources
- posting freshness, liveness result, first seen, last seen, and expiry hints
- public requirements, responsibilities, tech stack, nice-to-haves, and interview hints
- public source URLs, retrieval timestamps, and confidence notes

## Forbidden Candidate Fields

The job-facts layer must not contain:

- CV text, resume bullets, portfolio claims, story-bank entries, or writing samples
- candidate name, email, phone, location, immigration status, or demographic data
- compensation floor, current salary, target salary, personal constraints, or family constraints
- fit score, gaps, mitigation strategy, apply/no-apply decision, override reason, or narrative advice
- tracker status, application outcome, recruiter notes, interview notes, or follow-up history

These fields belong to the candidate-fit layer and are recomputed per user.

## Evaluation Flow

1. Compute or receive a listing fingerprint.
2. Look for a local job-facts payload matching the fingerprint and schema version.
3. If present and fresh enough, reuse the public job facts.
4. Recompute candidate fit from user-layer files every time.
5. Save private evaluation output under `reports/`, `output/`, and tracker artifacts only.

The first implementation is local-only. A future shared layer can reuse the same schema after adding consent, redaction preview, audit logs, and privacy-mode enforcement.

