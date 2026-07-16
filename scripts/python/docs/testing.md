# Testing

Python test suite for career-ops scripts.

## Running Tests

```bash
# From repository root:
python -m pytest scripts/python/tests -q

# From scripts/python/:
cd scripts/python && python -m pytest

# Specific test file:
python -m pytest scripts/python/tests/test_scanner_liveness_invite.py -v

# With coverage:
python -m pytest scripts/python/tests --cov=scripts/python --cov-report=term
```

## Test Structure

28 test files covering 12 packages, 237 tests:

| Test File | Coverage |
|-----------|----------|
| `test_foundations.py` | Base imports, path resolution, constants |
| `test_merge_dedup_verify.py` | Tracker merge, dedup, verify |
| `test_set_status.py` | Status updates, locks |
| `test_tracker_cli_ports.py` | Tracker CLI parity |
| `test_detect_reposts.py` | Repost detection |
| `test_followup_cadence.py` | Follow-up cadence math |
| `test_followup_seed.py` | Follow-up seeding |
| `test_process_quality_add_entry.py` | Process quality + add entry |
| `test_scanner_liveness_invite.py` | Scanner + liveness + invite match |
| `test_browser_extract.py` | Playwright extraction |
| `test_cv_rendering.py` | CV generation (18 tests) |
| `test_evaluation.py` | Evaluation pipeline (13 tests) |
| `test_plugins.py` | Plugin engine + CLI (24 tests) |
| `test_reply_watch.py` | Reply classification |
| `test_reply_and_assessment.py` | Reply + assessment log |
| `test_salary_gap.py` | Salary gap analysis |
| `test_match_star.py` | STAR matching |
| `test_admin_stats.py` | Admin stats |
| `test_admin_upskill.py` | Uparskill analysis |
| `test_admin_validators.py` | Portal validation |
| `test_admin_export_misc.py` | Export + misc |
| `test_update_system_apply.py` | Update system |
| `test_jd_skill_gap_application_answers.py` | JD skill gap + app answers |
| `test_funnel_velocity.py` | Funnel velocity |
| `test_img_to_pdf.py` | Image to PDF |
| `test_liveness_pipeline.py` | Liveness + pipeline |
| `test_prepare_application.py` | Application form prep |
| `test_agent_inbox_reconcile.py` | Agent inbox + reconcile |

## Conventions

- Tests use `pytest` with `tmp_path` for isolated file I/O
- No `__init__.py` in `tests/` (pytest auto-discovers)
- All `main()` functions accept `argv: list[str] | None = None` → `int`
- Test fixtures avoid touching real `data/` or `config/` files
