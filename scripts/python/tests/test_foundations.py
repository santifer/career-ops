from __future__ import annotations

from pathlib import Path

from scripts.python.other.fingerprint_core import (
    find_cross_listings,
    fingerprint_text,
    normalize_jd_text,
    similarity,
)
from scripts.python.tracker.links import normalize_report_link
from scripts.python.tracker.parse import (
    looks_like_score_cell,
    normalize_via,
    parse_applications,
    resolve_columns,
    resolve_score_status,
)
from scripts.python.tracker.role_matcher import role_fuzzy_match, role_tokens
from scripts.python.tracker.utils import (
    cell,
    normalize_company,
    rebuild_row,
    resolve_canonical_state,
)


def test_tracker_columns_parse_custom_layout() -> None:
    markdown = """# Applications Tracker

| # | Date | Company | Location | Role | Status | Score | PDF | Report | Via | Notes |
|---|------|---------|----------|------|--------|-------|-----|--------|-----|-------|
| 7 | 2026-07-15 | Acme | Paris | Senior Platform Engineer | Applied | 4.3/5 | [PDF](../output/acme.pdf) | [Report](reports/007-acme.md) | リクルート | note |
"""
    lines = markdown.splitlines()
    colmap = resolve_columns(lines)
    assert colmap["location"] == 4
    assert colmap["status"] == 6
    assert colmap["score"] == 7

    rows = parse_applications(markdown)
    assert len(rows) == 1
    assert rows[0].num == 7
    assert rows[0].company == "Acme"
    assert rows[0].location == "Paris"
    assert rows[0].via == "リクルート"


def test_score_status_resolution_is_content_based() -> None:
    assert looks_like_score_cell("**4.5/5**")
    assert looks_like_score_cell("—")
    assert resolve_score_status("Applied", "4/5") == {"score": "4/5", "status": "Applied"}
    assert resolve_score_status("N/A", "Rejected") == {"score": "N/A", "status": "Rejected"}
    assert resolve_score_status("Applied", "Rejected") is None


def test_via_normalization_preserves_non_latin_agencies() -> None:
    assert normalize_via("リクルート") != ""
    assert normalize_via("Ｐｅｒｓｏｌ") == "persol"


def test_tracker_utils_match_js_semantics() -> None:
    assert rebuild_row(["", "1", "2026-07-15", "Acme", "Note"]) == "| 1 | 2026-07-15 | Acme | Note |"
    assert normalize_company("Acme, Inc.") == "acmeinc"
    assert cell("hello | world\nnext") == "hello / world next"


def test_canonical_state_resolution_from_objects() -> None:
    class State:
        id = "applied"
        label = "Applied"
        aliases = ["sent", "submitted"]

    assert resolve_canonical_state("**submitted**", [State]) == "Applied"
    assert resolve_canonical_state("unknown", [State]) is None


def test_report_link_normalization_is_idempotent() -> None:
    tracker_dir = Path("/repo/data")
    repo_root = Path("/repo")
    assert normalize_report_link("[Report](reports/007-acme.md)", tracker_dir, repo_root) == "[Report](../reports/007-acme.md)"
    assert normalize_report_link("[Report](../reports/007-acme.md)", tracker_dir, repo_root) == "[Report](../reports/007-acme.md)"
    assert normalize_report_link("[Other](docs/x.md)", tracker_dir, repo_root) == "[Other](docs/x.md)"


def test_role_matcher_dedup_logic() -> None:
    assert role_tokens("Senior Full Stack Engineer, Guarded Releases") == ["full", "stack", "engineer", "guarded", "releases"]
    assert role_fuzzy_match(
        "Senior Platform Engineer, AI Infrastructure",
        "Senior Platform Engineer - AI Infrastructure Remote",
    )
    assert not role_fuzzy_match("Senior Software Engineer", "Principal Software Engineer")
    assert not role_fuzzy_match("Full Stack Engineer, Foundation", "Full Stack Engineer, Guarded Releases")


def test_fingerprint_and_cross_listing_matching() -> None:
    base = " ".join(
        [
            "build",
            "reliable",
            "python",
            "services",
            "for",
            "data",
            "pipelines",
            "and",
            "automation",
            "platforms",
        ]
        * 30
    )
    fp = fingerprint_text(base)
    assert len(fp) == 16
    assert normalize_jd_text("<p>Hello&nbsp;World https://example.com</p>") == "hello world"
    assert similarity(fp, fp) == 1

    matches = find_cross_listings(
        [{"url": "https://a.example/jobs/1", "company": "Acme", "title": "Engineer", "fingerprint": fp}],
        [
            {
                "url": "https://agency.example/jobs/9",
                "dateStr": "2026-07-01",
                "company": "Agency",
                "title": "Engineer",
                "fingerprint": fp,
            }
        ],
        today="2026-07-15T00:00:00+00:00",
    )
    assert len(matches) == 1
    assert matches[0].score == 1

