# Local Core Contract

Issue: #1029

This RFC defines the boundary a future desktop app or GUI client can wrap without scraping human-readable output or duplicating CLI behavior.

## Principles

- The local repo remains the source of truth.
- User-layer files stay editable and portable.
- System-layer scripts expose stable machine-readable contracts where a UI needs them.
- Human approval gates stay explicit.
- JSON output should be additive and versioned.

## Stable Operations

| Operation | Current command | Required machine-readable interface |
|---|---|---|
| evaluate a JD | agent mode / `modes/oferta.md` | JSON summary with report path, score, decision, warnings |
| scan portals | `node scan.mjs` / `node scan-ats-full.mjs` | JSONL progress and final normalized jobs |
| generate PDF | `node generate-pdf.mjs` | JSON result with input report, output file, template, warnings |
| query tracker | `node tracker.mjs` | JSON list/detail/filter responses |
| apply assistance | agent mode / `modes/apply.md` | JSON preflight state, required fields, human approvals |
| liveness check | `node check-liveness.mjs` | JSON result with status, reason code, final URL, evidence |
| verify pipeline | `node verify-pipeline.mjs` | JSON health report with errors and warnings |

## JSON Envelope

Future commands should support:

```json
{
  "schema_version": "career-ops.local-core/v1",
  "operation": "scan",
  "status": "ok",
  "data": {},
  "warnings": [],
  "errors": []
}
```

Errors should include:

```json
{
  "code": "missing_user_file",
  "message": "cv.md is missing",
  "path": "cv.md",
  "recoverable": true
}
```

## Progress Events

Long-running commands should emit JSONL events when `--jsonl` is passed:

```json
{"type":"started","operation":"scan","total":25}
{"type":"progress","operation":"scan","current":7,"total":25,"label":"Greenhouse"}
{"type":"warning","code":"provider_timeout","provider":"workday"}
{"type":"completed","operation":"scan","status":"ok"}
```

## Human-in-the-Loop Gates

The local core must mark these as requiring explicit approval:

- applying to low-fit roles below the configured quality threshold
- submitting or drafting application answers that include sensitive claims
- changing user-layer profile, story bank, or tracker status from inferred data
- contributing anonymous shared signals
- syncing account data to any hosted service

## User/System Layer Boundary

GUI clients may edit user-layer files such as `config/profile.yml`, `modes/_profile.md`, `data/applications.md`, `data/follow-ups.md`, `reports/`, and `output/`.

GUI clients must treat system-layer prompts, scripts, templates, and docs as update-managed unless the user is explicitly developing career-ops itself.

## Compatibility

Human-readable output can remain the default. JSON/JSONL modes should be opt-in flags so existing CLI workflows continue to work unchanged.

