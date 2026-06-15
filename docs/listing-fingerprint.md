# Listing Fingerprint Schema

Issue: #1030

The listing fingerprint identifies a public job posting without including candidate data. It supports local dedupe, reusable job-facts caches, and future anonymous market intelligence.

## Schema

```json
{
  "schema_version": "listing-fingerprint/v1",
  "fingerprint": "fp_v1_...",
  "public_inputs": {
    "company": "Example Inc",
    "title": "Senior AI Engineer",
    "location": "Berlin, Germany",
    "work_mode": "hybrid",
    "ats_provider": "greenhouse",
    "board_slug": "example",
    "posting_id": "12345",
    "canonical_host": "boards.greenhouse.io",
    "canonical_path": "/example/jobs/12345",
    "content_hash": "sha256:..."
  }
}
```

## Share-Safe Inputs

Allowed inputs are public posting facts:

- normalized company name
- normalized role title
- public location or work-mode bucket
- ATS provider and board slug
- public posting id
- canonical URL host and stable path
- selected public JD content hash

Forbidden inputs:

- candidate identity, CV, fit score, compensation floor, application decision, notes, or follow-up history
- private tracker status
- recruiter conversations
- interview outcomes

## Alias Handling

Branded pages and ATS-hosted pages can point to the same role. Implementations should normalize:

- tracking parameters and fragments out of URLs
- known ATS host aliases
- trailing slashes
- company casing and punctuation
- title whitespace and punctuation

When both a branded page and an ATS page are available, prefer the ATS provider, board slug, and posting id as the strongest identity fields.

## Versioning

The version prefix `fp_v1_` is part of the fingerprint. If normalization changes in a backward-incompatible way, create a new version such as `fp_v2_` rather than rewriting old fingerprints.

