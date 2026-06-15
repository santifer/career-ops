# Privacy Modes

Issue: #1031

career-ops is local-first. Future shared intelligence or account sync features must be governed by explicit privacy modes instead of implicit agent behavior.

## Modes

### `local_only`

Default mode.

- Allowed: local file reads/writes, user-directed browsing, user-directed API calls, local reports, local tracker updates.
- Prohibited: background sharing, anonymous contribution, account sync, hosted storage, telemetry, or uploading user-layer artifacts.
- Consent: no sharing prompt should appear because sharing is disabled.
- Audit: local operations may be logged in user-layer artifacts only.

### `anonymous_contribution`

Optional future mode for contributing public job-market signals after redaction and consent.

- Allowed: share-safe public listing fingerprints, public job facts, provider quality metrics, liveness/freshness outcomes, and aggregate scanner signals.
- Prohibited: CV, profile, compensation floor, candidate fit score, application decision, tracker status, recruiter conversations, interview notes, and personal constraints.
- Consent: every contribution path must show a preview of the exact payload before sending.
- Audit: write the timestamp, destination, schema version, and payload hash to a user-layer audit log.

### `account_sync`

Optional future mode for users who explicitly want cross-device or hosted features.

- Allowed: only the data classes named in the sync consent screen.
- Prohibited: silent sync of user-layer files, reports, CVs, or tracker data.
- Consent: initial opt-in plus per-data-class confirmation.
- Audit: local sync log with operation, destination, schema version, and changed artifact list.

## Data-Class Matrix

| Data class | local_only | anonymous_contribution | account_sync |
|---|---:|---:|---:|
| public listing fingerprint | local | allowed with preview | allowed if selected |
| public job facts | local | allowed with preview | allowed if selected |
| provider benchmark metrics | local | allowed with preview | allowed if selected |
| CV/profile/story bank | local only | prohibited | opt-in only |
| candidate fit score | local only | prohibited | opt-in only |
| application decision/status | local only | prohibited | opt-in only |
| recruiter/interview notes | local only | prohibited | opt-in only |

## Preview Requirement

Any non-local mode must show an auditable preview containing:

- privacy mode
- destination
- schema version
- payload JSON
- redaction summary
- payload hash

If the user does not explicitly confirm the preview, the contribution or sync operation is blocked and no payload may be sent.

Agents must treat missing `privacy.mode` as `local_only`.
