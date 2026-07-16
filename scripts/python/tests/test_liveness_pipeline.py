from __future__ import annotations

import asyncio

from scripts.python.pipeline.browser_extract import compact_text, normalize_jd, normalize_listing, parse_args, resolve_extractor_mode
from scripts.python.pipeline.liveness_api import HttpResponse, check_liveness_via_api, classify_ashby_board, is_ats_posting, resolve_ats_api
from scripts.python.pipeline.liveness_browser import extract_mapped_ipv4, is_challenge_result, jittered_delay_ms, normalize_host, reject_private_or_invalid
from scripts.python.scanner.check_liveness import build_liveness_checker, check_urls


def test_liveness_api_resolves_known_ats_and_blocks_unsafe_segments() -> None:
    greenhouse = resolve_ats_api("https://boards.greenhouse.io/acme/jobs/12345")
    assert greenhouse is not None
    assert greenhouse.ats == "greenhouse"
    assert greenhouse.apiUrl == "https://boards-api.greenhouse.io/v1/boards/acme/jobs/12345"

    lever = resolve_ats_api("https://jobs.eu.lever.co/acme/abc-123")
    assert lever is not None
    assert lever.apiUrl == "https://api.eu.lever.co/v0/postings/acme/abc-123"

    ashby = resolve_ats_api("https://jobs.ashbyhq.com/acme/job_123/application")
    assert ashby is not None
    assert ashby.interpret == "ashby"
    assert ashby.timeoutSeconds == 20

    assert resolve_ats_api("http://boards.greenhouse.io/acme/jobs/12345") is None
    assert resolve_ats_api("https://jobs.ashbyhq.com/acme/bad%2Fid") is None
    assert is_ats_posting("https://jobs.lever.co/acme/abc-123") is True


def test_liveness_api_classifies_fetch_results_without_network() -> None:
    def active_fetch(url: str, timeout: int) -> HttpResponse:
        assert "greenhouse" in url
        return HttpResponse(200, "{}")

    assert check_liveness_via_api("https://boards.greenhouse.io/acme/jobs/12345", active_fetch)["result"] == "active"

    def gone_fetch(url: str, timeout: int) -> HttpResponse:
        return HttpResponse(404, "")

    expired = check_liveness_via_api("https://jobs.lever.co/acme/abc-123", gone_fetch)
    assert expired == {"result": "expired", "code": "lever_api_gone", "reason": "ATS API 404 — posting removed"}

    def ashby_fetch(url: str, timeout: int) -> HttpResponse:
        return HttpResponse(200, '{"jobs":[{"id":"job_123","isListed":true}]}')

    assert check_liveness_via_api("https://jobs.ashbyhq.com/acme/job_123", ashby_fetch)["code"] == "ashby_api_ok"
    assert classify_ashby_board({"jobs": [{"id": "job_123", "isListed": False}]}, "job_123")["result"] == "expired"
    assert classify_ashby_board({"unexpected": []}, "job_123") is None


def test_liveness_browser_guards_private_hosts_and_challenges() -> None:
    assert normalize_host("[::1].") == "::1"
    assert extract_mapped_ipv4("::ffff:7f00:1") == "127.0.0.1"
    assert reject_private_or_invalid("ftp://example.com")["code"] == "unsupported_protocol"
    assert reject_private_or_invalid("http://localhost.")["code"] == "blocked_host"
    assert reject_private_or_invalid("http://[::ffff:7f00:1]/")["code"] == "blocked_host"
    assert reject_private_or_invalid("https://example.com/jobs/1") is None
    assert is_challenge_result({"result": "uncertain", "code": "bot_challenge"}) is True
    assert is_challenge_result({"result": "expired", "code": "bot_challenge"}) is False
    assert 10 <= jittered_delay_ms(10) < 20
    assert jittered_delay_ms(0) == 0


def test_browser_extract_pure_helpers(tmp_path) -> None:
    assert compact_text(" a\t b\n\n\nc ", 100) == "a b\n\nc"
    assert normalize_jd({"title": " Senior Engineer ", "text": "x" * 20}, "https://example.com/j", text_cap=5) == {
        "url": "https://example.com/j",
        "title": "Senior Engineer",
        "text": "xxxxx…",
    }
    listing = normalize_listing(
        [
            {"label": "Home", "href": "/"},
            {"label": "Platform Engineer", "href": "/jobs/1"},
            {"label": "Platform Engineer duplicate", "href": "/jobs/1"},
            {"label": "Data Engineer", "href": "https://jobs.example.com/2"},
            {"label": "Mail", "href": "mailto:a@example.com"},
        ],
        "https://example.com/careers",
        max_items=2,
    )
    assert listing["jobs"] == [
        {"title": "Platform Engineer", "url": "https://example.com/jobs/1"},
        {"title": "Data Engineer", "url": "https://jobs.example.com/2"},
    ]
    assert parse_args(["--mode", "listing", "--max", "0", "https://example.com"]) == {
        "url": "https://example.com",
        "mode": "listing",
        "max": 0,
        "maxChars": 12000,
        "timeout": 15000,
    }

    profile = tmp_path / "profile.yml"
    profile.write_text("scan:\n  extractor: cli\n", encoding="utf-8")
    assert resolve_extractor_mode(profile) == "cli"
    profile.write_text("scan:\n  extractor: mcp\n", encoding="utf-8")
    assert resolve_extractor_mode(profile) == "mcp"


def test_check_liveness_orchestrates_api_and_browser_checkers() -> None:
    async def browser_checker(url: str) -> dict[str, str]:
        return {"result": "active" if "active" in url else "uncertain", "code": "fake_browser", "reason": "fake"}

    def api_checker(url: str) -> dict[str, str] | None:
        if "api-expired" in url:
            return {"result": "expired", "code": "fake_api", "reason": "gone"}
        return None

    result = asyncio.run(
        check_urls(
            ["https://example.com/api-expired", "https://example.com/browser-active", "https://example.com/browser-unknown"],
            api_checker=api_checker,
            browser_checker=browser_checker,
        )
    )

    assert result["active"] == 1
    assert result["expired"] == 1
    assert result["uncertain"] == 1
    assert result["viaApi"] == 1
    assert result["results"][0]["viaApi"] is True


def test_build_liveness_checker_uses_browser_only_when_requested() -> None:
    calls: list[str] = []

    def api_checker(url: str) -> dict[str, str] | None:
        return {"result": "active", "code": "api", "reason": "ok"} if "api" in url else None

    async def browser_checker(url: str) -> dict[str, str]:
        calls.append(url)
        return {"result": "expired", "code": "browser", "reason": "gone"}

    api_only = build_liveness_checker(use_browser=False, api_checker=api_checker, browser_checker=browser_checker)
    assert api_only("https://example.com/browser") is None
    assert calls == []

    with_browser = build_liveness_checker(use_browser=True, api_checker=api_checker, browser_checker=browser_checker)
    assert with_browser("https://example.com/api")["code"] == "api"
    assert with_browser("https://example.com/browser") == {"result": "expired", "code": "browser", "reason": "gone"}
    assert calls == ["https://example.com/browser"]
