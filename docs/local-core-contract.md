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

Schema versions use `career-ops.local-core/v<major>.<minor>` once the contract is implemented. The shorthand `career-ops.local-core/v1` means `career-ops.local-core/v1.0`.

- Patch-level changes are not encoded in the envelope and must not change the JSON shape.
- Minor versions may add optional fields, enum values, warnings, or error codes.
- Major versions may remove fields, rename fields, or change required semantics.
- Clients should accept the same major version with an equal or higher minor version by ignoring unknown additive fields.
- Clients should reject unknown major versions with `unsupported_schema_version`.
- Deprecations require one minor version of overlap before removal in a later major version.

Errors should include:

```json
{
  "code": "missing_user_file",
  "message": "cv.md is missing",
  "path": "cv.md",
  "recoverable": true
}
```

### Error Codes

Commands should use this registry for stable handling:

| Code | Meaning | Recoverable | Client handling |
|---|---|---:|---|
| `missing_user_file` | Required user-layer input is absent. | true | Show the path and offer to create or select the file. |
| `invalid_user_file` | Required user-layer input exists but cannot be parsed or validated. | true | Show validation details and keep the source editable. |
| `missing_config` | Required configuration key is missing. | true | Route the user to the relevant configuration file or UI. |
| `provider_timeout` | External provider did not respond within the command timeout. | true | Allow retry, skip provider, or continue partial results. |
| `provider_auth_required` | Provider requires credentials or an authenticated session. | true | Ask the user to configure credentials or disable that provider. |
| `network_unavailable` | Network access failed before provider-specific logic completed. | true | Allow retry after connectivity is restored. |
| `quality_gate_blocked` | Apply assistance is blocked by the configured quality threshold. | true | Require explicit human override before continuing. |
| `approval_required` | The operation reached a human-in-the-loop gate. | true | Present the approval reason and wait for explicit consent. |
| `unsafe_path` | A requested path escapes the allowed workspace or layer boundary. | false | Stop the operation and show the rejected path. |
| `unsupported_schema_version` | The client or command cannot handle the requested schema major version. | false | Ask the user to update the client or command. |
| `internal_error` | Unexpected command failure. | false | Show logs, preserve inputs, and avoid automatic retry loops. |

## Progress Events

Long-running commands should emit JSONL events when `--jsonl` is passed. A long-running command is any operation expected to take more than 3 seconds, including portal scans, PDF generation with remote assets, multi-provider liveness checks, and pipeline verification. Commands expected to complete in under 1 second may omit progress events and return only the final JSON envelope.

```json
{"type":"started","operation":"scan","total":25}
{"type":"progress","operation":"scan","current":7,"total":25,"label":"Greenhouse"}
{"type":"warning","code":"provider_timeout","provider":"workday"}
{"type":"completed","operation":"scan","status":"ok"}
```

JSONL adoption should be incremental:

- Emit `started` before external work begins.
- Emit `progress` for provider, file, or item boundaries rather than every small internal step.
- Emit `warning` for recoverable issues that also appear in the final envelope.
- Emit exactly one terminal `completed` or `failed` event.
- Keep each line valid standalone JSON so clients can stream without buffering the full command output.

## Human-in-the-Loop Gates

The local core must mark these as requiring explicit approval:

- applying to low-fit roles below the configured quality threshold
- submitting or drafting application answers that include sensitive claims
- changing user-layer profile, story bank, or tracker status from inferred data
- contributing anonymous shared signals
- syncing account data to any hosted service

## User/System Layer Boundary

GUI clients may edit only user-layer files by default.

Allowed user-layer paths:

- `config/profile.yml`
- `config/*.local.yml`
- `modes/_profile.md`
- `data/applications.md`
- `data/follow-ups.md`
- `data/*.local.md`
- `reports/`
- `output/`

Denied system-layer paths unless the user explicitly switches into project-development mode:

- `modes/*.md` except `modes/_profile.md`
- `providers/`
- `templates/`
- `docs/`
- `scripts/`
- `*.mjs`
- package and lock files

"Explicitly developing career-ops itself" means the user has intentionally chosen to modify the tool's source, prompts, templates, docs, or package metadata as a repository contribution. Normal career operations such as scanning roles, editing a profile, tracking applications, generating reports, or exporting PDFs do not count as project-development mode.

## Compatibility

Human-readable output can remain the default. JSON/JSONL modes should be opt-in flags so existing CLI workflows continue to work unchanged.
