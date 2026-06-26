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

## Canonical v1 Input Set

The v1 digest is computed from this ordered public input set:

1. `schema_version`
2. `ats_provider`
3. `board_slug`
4. `posting_id`
5. `company`
6. `title`
7. `location`
8. `work_mode`
9. `canonical_host`
10. `canonical_path`
11. `content_hash`

Implementations may accept camelCase aliases for developer ergonomics, but the
documented contract is snake_case. Do not include candidate data in the v1 input
set.

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

ATS identity wins over URL aliases. When `ats_provider`, `board_slug`, and
`posting_id` are all present, v1 omits `canonical_host` and `canonical_path`
from the digest so a branded careers page and the ATS-hosted page collapse to
the same fingerprint. When that stable ATS identity is missing, v1 falls back to
the normalized `canonical_host` and `canonical_path` so different public URLs do
not collapse accidentally.

## Versioning

The version prefix `fp_v1_` is part of the fingerprint. If normalization changes in a backward-incompatible way, create a new version such as `fp_v2_` rather than rewriting old fingerprints.
