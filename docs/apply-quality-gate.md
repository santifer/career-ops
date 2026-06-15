# Apply Quality Gate

Issue: #1028

career-ops should not behave like a spray-and-pray application tool. Evaluation and reporting may run for any role, but candidate-facing apply packages should require an explicit override when the score is below the configured quality threshold.

## Default Policy

The default threshold is `4.0`.

```yaml
apply_quality:
  threshold: 4.0
```

If `apply_quality.threshold` is absent, scripts and agents should use `4.0`.

## Gate Behavior

- Scores below the threshold default to `do_not_apply`.
- Evaluation, reporting, scanner output, and tracker review are not blocked.
- Apply/PDF/cover/form-answer flows must ask for an override reason before generating candidate-facing materials.
- Override reasons are user-layer data and should be recorded in tracker/report notes or `data/apply-overrides.md`.

## Override Record

```markdown
## 2026-06-15 - company-role-slug

- score: 3.4
- threshold: 4.0
- reason: "Strategic relationship with the hiring manager despite weak role fit."
- target: reports/123-company-2026-06-15.md
```

## Non-Blocking Scope

The gate must not prevent:

- scanning
- liveness checks
- evaluation reports
- salary research
- tracker entries
- user review of a weak-fit opportunity

It only gates the action of producing application materials.

