from __future__ import annotations

import os
import time
from datetime import datetime, timezone

from scripts.python.admin.cv_sync_check import check_cv_sync, format_check
from scripts.python.admin.doctor import (
    PLAYWRIGHT_MCP_WARNING,
    check_pipeline_file,
    check_plugins,
    format_checks,
    onboarding_state,
    playwright_mcp_configured,
    run_checks,
)
from scripts.python.admin.update_system import (
    backup_timestamp,
    check_update,
    compare_versions,
    dismiss_update,
    git_timeout_ms,
    load_updater_path_lists,
    merge_path_lists,
    newest_backup_branch,
    parse_positive_int,
    parse_semver,
    parse_version_file,
    reexec_timeout_ms,
    relative_import_specifiers,
    resolve_reexec_checkout,
    safety_violations,
    update_backup_branch_name,
)
from scripts.python.admin.validate_portals import validate_portals_config
from scripts.python.admin.verify_portals import (
    FetchError,
    classify_fetch_error,
    derive_slug_candidates,
    format_results,
    parse_ats_slug,
    probe_slug,
    summarize_results,
    verify_companies,
    verify_portals_file,
)


def test_validate_portals_accepts_valid_shape_and_provider() -> None:
    config = {
        "title_filter": {"positive": ["AI"], "negative": ["Junior"], "seniority_boost": ["Senior"]},
        "location_filter": {"allow": ["Remote"], "block": [], "always_allow": ["Europe"]},
        "tracked_companies": [
            {
                "name": "Acme",
                "careers_url": "https://jobs.example.com",
                "api": "https://api.example.com/jobs",
                "provider": "greenhouse",
                "parser": {"command": "node", "script": "parser.mjs", "args": [], "timeout_ms": 1000},
            }
        ],
    }

    result = validate_portals_config(config, provider_ids={"greenhouse"})
    assert result == {"errors": [], "warnings": []}


def test_update_system_version_timeout_and_backup_helpers() -> None:
    assert parse_positive_int("42", 7) == 42
    assert parse_positive_int("0", 7) == 7
    assert parse_version_file("1.6.0 # x-release-please-version") == "1.6.0"
    assert parse_semver("career-ops-v1.9.0") == "1.9.0"
    assert compare_versions("1.2.0", "1.10.0") == -1
    assert compare_versions("2.0.0", "1.9.9") == 1
    assert compare_versions("1.0.0", "1.0.0") == 0

    when = datetime(2026, 7, 15, 10, 11, 12, tzinfo=timezone.utc)
    branch = update_backup_branch_name("1.2.3", when)
    assert branch == "backup-pre-update-1.2.3-20260715T101112Z"
    assert backup_timestamp(branch) > backup_timestamp("backup-pre-update-1.2.3-20260714T101112Z")
    assert newest_backup_branch("backup-pre-update-1-20260714T101112Z\nbackup-pre-update-1-20260715T101112Z") == "backup-pre-update-1-20260715T101112Z"
    assert newest_backup_branch("legacy-backup\n") == "legacy-backup"
    assert newest_backup_branch("") is None

    assert git_timeout_ms(["status"], env={"CAREER_OPS_GIT_TIMEOUT_MS": "123"}) == 123
    assert git_timeout_ms(["fetch"], env={"CAREER_OPS_GIT_TIMEOUT_MS": "123", "CAREER_OPS_GIT_FETCH_TIMEOUT_MS": "456"}) == 456
    assert reexec_timeout_ms(2, env={"CAREER_OPS_GIT_TIMEOUT_MS": "1000", "CAREER_OPS_GIT_FETCH_TIMEOUT_MS": "2000"}) >= 120_000


def test_update_system_import_resolution_paths_and_safety() -> None:
    source = """
import './a.mjs';
import x from "../lib/x.mjs";
export { y } from './b.mjs';
import fs from 'node:fs';
"""
    assert relative_import_specifiers(source) == ["../lib/x.mjs", "./a.mjs", "./b.mjs"]

    files = {
        "update-system.mjs": "import './scaffolder/bin/skill-entrypoints.mjs';",
        "scaffolder/bin/skill-entrypoints.mjs": "export const x = 1;",
    }
    resolved = resolve_reexec_checkout("update-system.mjs", show_file=lambda path: files[path])
    assert resolved == ["update-system.mjs", "scaffolder/bin/skill-entrypoints.mjs"]

    assert merge_path_lists(["a", "b"], ["b", "c"]) == ["a", "b", "c"]
    paths = load_updater_path_lists("const SYSTEM_PATHS = ['modes/'];\nconst USER_PATHS = ['data/', 'cv.md'];\n")
    assert paths["system"] == ["modes/"]
    assert paths["user"] == ["data/", "cv.md"]
    violations = safety_violations(
        ["modes/x.md", "data/applications.md", "cv.md", "already.md"],
        initial_status_paths={"already.md"},
        system_paths=paths["system"],
        user_paths=paths["user"],
    )
    assert violations == ["data/applications.md", "cv.md"]


def test_update_system_check_and_dismiss(tmp_path) -> None:
    (tmp_path / "VERSION").write_text("1.0.0\n", encoding="utf-8")

    def fetch_available(url, **_kwargs):
        if url.endswith("/VERSION"):
            return "1.1.0\n"
        return '{"tag_name":"career-ops-v1.2.0","body":"Changes here"}'

    available = check_update(root=tmp_path, fetch_text=fetch_available)
    assert available == {"status": "update-available", "local": "1.0.0", "remote": "1.2.0", "changelog": "Changes here"}

    up_to_date = check_update(root=tmp_path, fetch_text=lambda url, **_kwargs: "1.0.0" if url.endswith("/VERSION") else None)
    assert up_to_date == {"status": "up-to-date", "local": "1.0.0", "remote": "1.0.0"}

    offline = check_update(root=tmp_path, fetch_text=lambda *_args, **_kwargs: None)
    assert offline == {"status": "offline", "local": "1.0.0"}

    no_remote = check_update(root=tmp_path, fetch_text=lambda *_args, **_kwargs: "not semver")
    assert no_remote == {"status": "no-remote-version", "local": "1.0.0"}

    dismiss_update(tmp_path, datetime(2026, 7, 15, tzinfo=timezone.utc))
    assert check_update(root=tmp_path, fetch_text=fetch_available) == {"status": "dismissed"}


def test_validate_portals_reports_errors_and_warnings() -> None:
    config = {
        "title_filter": {"positive": ["AI", ""]},
        "content_filter": {
            "by_title_keyword": {
                "Data": {"positive": ["python"], "negative": [123]},
                "AI": "bad",
            }
        },
        "search_queries": "bad",
        "tracked_companies": [
            {"name": "Acme", "provider": "not-real", "careers_url": "ftp://example.com"},
            {"name": " acme "},
            {"enabled": False, "name": ""},
            "bad",
        ],
    }

    result = validate_portals_config(config, provider_ids={"greenhouse"})
    errors = {item["path"]: item["message"] for item in result["errors"]}
    warnings = {item["path"]: item["message"] for item in result["warnings"]}

    assert errors["title_filter.positive[1]"] == "keyword must not be empty"
    assert errors["content_filter.by_title_keyword.Data.negative[0]"] == "keyword must be a string"
    assert errors["content_filter.by_title_keyword.AI"] == "must be an object with positive/negative keyword lists"
    assert errors["search_queries"] == "search_queries must be an array when set"
    assert errors["tracked_companies[0].provider"] == 'unknown provider "not-real"'
    assert errors["tracked_companies[0].careers_url"] == "unsupported URL protocol: ftp:"
    assert errors["tracked_companies[3]"] == "company entry must be an object"
    assert "will never apply" in warnings["content_filter.by_title_keyword.Data"]
    assert "duplicate enabled company name" in warnings["tracked_companies[1].name"]


def test_cv_sync_reports_missing_and_short_files(tmp_path) -> None:
    (tmp_path / "config").mkdir()
    (tmp_path / "modes").mkdir()
    (tmp_path / "batch").mkdir()
    (tmp_path / "cv.md").write_text("short", encoding="utf-8")
    (tmp_path / "config/profile.yml").write_text('full_name: "Jane Smith"\nemail: jane@example.com\nlocation: Earth\n', encoding="utf-8")
    (tmp_path / "modes/_shared.md").write_text("This candidate saved 170+ hours in production.\n# 200 tests heading ignored\n", encoding="utf-8")
    digest = tmp_path / "article-digest.md"
    digest.write_text("old", encoding="utf-8")
    old_time = time.time() - 40 * 24 * 60 * 60
    os.utime(digest, (old_time, old_time))

    result = check_cv_sync(tmp_path, now=time.time())
    rendered = format_check(result)

    assert result["errors"] == []
    assert any("cv.md seems too short" in item for item in result["warnings"])
    assert any("example data" in item for item in result["warnings"])
    assert any("Possible hardcoded metric" in item for item in result["warnings"])
    assert any("article-digest.md is" in item for item in result["warnings"])
    assert "WARNINGS" in rendered


def test_cv_sync_missing_required_files_and_clean_state(tmp_path) -> None:
    missing = check_cv_sync(tmp_path)
    assert len(missing["errors"]) == 2
    assert any("cv.md not found" in item for item in missing["errors"])
    assert any("config/profile.yml not found" in item for item in missing["errors"])

    (tmp_path / "config").mkdir()
    (tmp_path / "cv.md").write_text("A" * 120, encoding="utf-8")
    (tmp_path / "config/profile.yml").write_text("full_name: Ada Lovelace\nemail: ada@example.com\nlocation: Paris\n", encoding="utf-8")
    clean = check_cv_sync(tmp_path)
    assert clean == {"errors": [], "warnings": []}
    assert "All checks passed." in format_check(clean)


def test_doctor_onboarding_state_autocopies_templates_and_reports_missing(tmp_path) -> None:
    (tmp_path / "modes").mkdir()
    (tmp_path / "modes/_profile.template.md").write_text("# Profile template\n", encoding="utf-8")
    (tmp_path / "modes/_custom.template.md").write_text("# Custom template\n", encoding="utf-8")

    result = onboarding_state(tmp_path)

    assert result["onboardingNeeded"] is True
    assert result["missing"] == ["cv.md", "config/profile.yml", "config/portals.yml"]
    assert result["autoCopied"] == ["modes/_profile.md", "modes/_custom.md"]
    assert result["warnings"] == [PLAYWRIGHT_MCP_WARNING]
    assert (tmp_path / "modes/_profile.md").read_text(encoding="utf-8") == "# Profile template\n"
    assert (tmp_path / "modes/_custom.md").read_text(encoding="utf-8") == "# Custom template\n"


def test_doctor_onboarding_clean_with_mcp_and_plugin_status(tmp_path) -> None:
    (tmp_path / "config").mkdir()
    (tmp_path / "modes").mkdir()
    (tmp_path / "plugins/foo").mkdir(parents=True)
    (tmp_path / "cv.md").write_text("CV", encoding="utf-8")
    (tmp_path / "config/profile.yml").write_text("name: Ada\n", encoding="utf-8")
    (tmp_path / "config/portals.yml").write_text("tracked_companies: []\n", encoding="utf-8")
    (tmp_path / "config/plugins.yml").write_text("plugins:\n  foo:\n    enabled: true\n", encoding="utf-8")
    (tmp_path / "modes/_profile.md").write_text("# Profile\n", encoding="utf-8")
    (tmp_path / ".mcp.json").write_text('{"mcpServers":{"pw":{"command":"playwright"}}}', encoding="utf-8")
    manifest = {
        "id": "foo",
        "apiVersion": 1,
        "description": "Foo plugin",
        "hooks": ["search"],
        "requiredEnv": ["FOO_TOKEN"],
        "allowedHosts": ["api.example.com"],
        "entry": "index.mjs",
        "humanInTheLoop": True,
    }
    import json

    (tmp_path / "plugins/foo/manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (tmp_path / "plugins/foo/index.mjs").write_text("export default {};\n", encoding="utf-8")

    assert playwright_mcp_configured(tmp_path) is True
    result = onboarding_state(tmp_path)

    assert result["onboardingNeeded"] is False
    assert result["warnings"] == []
    assert result["plugins"] == [{"id": "foo", "hooks": ["search"], "enabled": False, "missingEnv": ["FOO_TOKEN"]}]


def test_doctor_pipeline_file_and_plugin_check(tmp_path) -> None:
    result = check_pipeline_file(tmp_path)
    assert result["pass"] is True
    assert "auto-created" in result["label"]
    assert "## Pending" in (tmp_path / "data/pipeline.md").read_text(encoding="utf-8")

    (tmp_path / "plugins/foo").mkdir(parents=True)
    (tmp_path / "config").mkdir(exist_ok=True)
    (tmp_path / "config/plugins.yml").write_text("plugins:\n  foo:\n    enabled: true\n", encoding="utf-8")
    import json

    manifest = {
        "id": "foo",
        "apiVersion": 1,
        "description": "Foo plugin",
        "hooks": ["notify"],
        "requiredEnv": ["FOO_TOKEN"],
        "allowedHosts": ["api.example.com"],
        "entry": "index.mjs",
        "humanInTheLoop": True,
    }
    (tmp_path / "plugins/foo/manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (tmp_path / "plugins/foo/index.mjs").write_text("export default {};\n", encoding="utf-8")

    plugin_result = check_plugins(tmp_path, env={})
    assert plugin_result["warn"] is True
    assert "foo (missing FOO_TOKEN)" in plugin_result["label"]
    assert plugin_result["fix"] == ["foo: add FOO_TOKEN to .env"]


def test_doctor_run_checks_and_format(tmp_path) -> None:
    (tmp_path / "scripts/python").mkdir(parents=True)
    (tmp_path / "scripts/python/pyproject.toml").write_text("[project]\n", encoding="utf-8")
    checks = run_checks(tmp_path, env={})
    rendered = format_checks(checks)

    assert any(item["label"] == "cv.md not found" for item in checks)
    assert "career-ops doctor" in rendered
    assert "Result:" in rendered


def test_verify_portals_parses_ats_slugs_and_candidates() -> None:
    assert parse_ats_slug("https://boards.greenhouse.io/acme/jobs/123") == {
        "ats": "greenhouse",
        "slug": "acme",
    }
    assert parse_ats_slug("https://boards-api.greenhouse.io/v1/boards/acme/jobs") == {
        "ats": "greenhouse",
        "slug": "acme",
    }
    assert parse_ats_slug("https://jobs.ashbyhq.com/acme") == {"ats": "ashby", "slug": "acme"}
    assert parse_ats_slug("https://jobs.eu.lever.co/acme") == {
        "ats": "lever",
        "slug": "acme",
        "eu": True,
    }
    assert parse_ats_slug("https://evil.example/jobs.lever.co/acme") is None

    candidates = derive_slug_candidates("Acme Corp!")
    assert candidates[:4] == ["acmecorp", "acme-corp", "acme_corp", "acme"]
    assert "acmecorpai" in candidates
    assert "acme.io" in candidates


def test_verify_portals_probe_and_error_classification() -> None:
    def fetch(url: str):
        if "greenhouse" in url:
            return {"jobs": [{"id": 1}]}
        if "ashby" in url:
            return {"jobs": []}
        if "lever" in url:
            return [{"id": 1}, {"id": 2}]
        raise AssertionError(url)

    assert probe_slug("greenhouse", "acme", fetch_json=fetch)["status"] == "live"
    empty = probe_slug("ashby", "acme", fetch_json=fetch)
    assert empty["status"] == "empty"
    assert empty["jobCount"] == 0
    assert probe_slug("lever", "acme", fetch_json=fetch)["jobCount"] == 2

    missing = probe_slug("greenhouse", "missing", fetch_json=lambda _url: (_ for _ in ()).throw(FetchError("HTTP 404", 404)))
    assert missing["status"] == "missing"
    assert missing["errorKind"] == "slug_gone"
    assert classify_fetch_error(FetchError("HTTP 500", 500)) == "server"
    assert classify_fetch_error(FetchError("HTTP 403", 403)) == "auth"
    assert classify_fetch_error(RuntimeError("ENOTFOUND example")) == "network"


def test_verify_companies_suggests_alternate_and_reads_file(tmp_path) -> None:
    def fetch(url: str):
        if "/wrong" in url:
            raise FetchError("HTTP 404", 404)
        if "/acme" in url and "greenhouse" in url:
            return {"jobs": [{"id": 1}]}
        raise FetchError("HTTP 404", 404)

    companies = [
        {"name": "Acme", "careers_url": "https://boards.greenhouse.io/wrong"},
        {"name": "Quiet", "api": "https://api.ashbyhq.com/posting-api/job-board/quiet"},
        {"name": "WorkableCo", "careers_url": "https://apply.workable.com/workableco/"},
        {"name": "Brand", "careers_url": "https://example.com/jobs"},
        {"name": "Disabled", "enabled": False, "careers_url": "https://boards.greenhouse.io/disabled"},
    ]
    def file_fetch(url: str):
        if "quiet" in url:
            return {"jobs": []}
        return fetch(url)

    def file_fetch_text(url: str):
        assert url == "https://apply.workable.com/workableco/jobs.md"
        return "| Title | Department | Location | Type | Salary | Posted | Details |\n| Engineer | Eng | Remote | Full-time | | Today | [View](https://apply.workable.com/workableco/jobs/view/1.md) |\n"

    results = verify_companies(companies, fetch_json=file_fetch, fetch_text=file_fetch_text)
    assert results[0]["status"] == "missing"
    assert results[0]["suggested"]["slug"] == "acme"
    assert results[1]["status"] == "empty"
    assert results[2] == {"name": "WorkableCo", "provider": "workable", "status": "live", "jobCount": 1}
    assert results[3]["status"] == "skipped"
    assert len(results) == 4

    (tmp_path / "portals.yml").write_text(
        """
tracked_companies:
  - name: Acme
    careers_url: https://boards.greenhouse.io/acme
""",
        encoding="utf-8",
    )
    file_result = verify_portals_file(tmp_path / "portals.yml", fetch_json=file_fetch)
    assert file_result["found"] is True
    assert file_result["results"][0]["status"] == "live"
    assert verify_portals_file(tmp_path / "missing.yml", fetch_json=file_fetch) == {"found": False, "results": []}


def test_verify_portals_summary_and_format() -> None:
    results = [
        {"name": "Live", "status": "live", "ats": "greenhouse", "slug": "live", "jobCount": 3},
        {"name": "Empty", "status": "empty", "ats": "ashby", "slug": "empty", "jobCount": 0},
        {"name": "Missing", "status": "missing", "ats": "lever", "slug": "missing", "errorKind": "auth", "reason": "HTTP 403"},
        {"name": "Skipped", "status": "skipped", "reason": "no provider"},
    ]

    summary = summarize_results(results)
    assert summary["live"] == 1
    assert summary["empty"] == 1
    assert summary["missing"] == 1
    assert summary["skipped"] == 1
    assert summary["errorKinds"]["auth"] == 1

    rendered = format_results(results)
    assert "1 live, 1 live-but-empty, 1 unresolved" in rendered
    assert "auth blocked" in rendered
