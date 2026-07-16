from __future__ import annotations

import asyncio
import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from scripts.python.pipeline.browser_extract import (
    DEFAULT_LISTING_MAX,
    compact_text,
    extract_url,
    main,
    normalize_jd,
    normalize_listing,
    parse_args,
)


def _make_pw_context(*, url: str = "https://example.com", dom: dict[str, Any] | None = None) -> tuple[MagicMock, MagicMock]:
    """Return (mock_api_module, page_mock) where mock_api_module plugs into sys.modules."""
    dom = dom or {"title": "", "text": "", "anchors": []}

    page_mock = AsyncMock()
    page_mock.url = url
    page_mock.goto = AsyncMock()
    page_mock.wait_for_timeout = AsyncMock()
    page_mock.evaluate = AsyncMock(return_value=dom)

    browser_mock = AsyncMock()
    browser_mock.new_context = AsyncMock()
    context_mock = AsyncMock()
    context_mock.new_page = AsyncMock(return_value=page_mock)
    context_mock.route = AsyncMock()
    browser_mock.new_context.return_value = context_mock
    browser_mock.close = AsyncMock()

    pw_root = MagicMock()
    pw_root.chromium.launch = AsyncMock(return_value=browser_mock)

    async_cm = MagicMock()
    async_cm.__aenter__ = AsyncMock(return_value=pw_root)
    async_cm.__aexit__ = AsyncMock(return_value=False)

    async_playwright_fn = MagicMock(return_value=async_cm)

    mock_api = MagicMock()
    mock_api.async_playwright = async_playwright_fn
    return mock_api, page_mock


def test_compact_text_collapses_whitespace_and_caps() -> None:
    assert compact_text(" a\t b\n\n\nc ", 100) == "a b\n\nc"
    assert compact_text("x" * 20, 5) == "xxxxx…"
    assert compact_text(None) == ""


def test_normalize_jd_returns_compacted_fields() -> None:
    result = normalize_jd({"title": " Senior Engineer ", "text": "x" * 20}, "https://example.com/j", text_cap=5)
    assert result == {"url": "https://example.com/j", "title": "Senior Engineer", "text": "xxxxx…"}


def test_normalize_listing_filters_nav_and_deduplicates() -> None:
    listing = normalize_listing(
        [
            {"label": "Home", "href": "/"},
            {"label": "Platform Engineer", "href": "/jobs/1"},
            {"label": "Platform Engineer duplicate", "href": "/jobs/1"},
            {"label": "Data Engineer", "href": "https://jobs.example.com/2"},
            {"label": "Mail", "href": "mailto:a@example.com"},
            {"label": "x", "href": "/short"},
        ],
        "https://example.com/careers",
        max_items=2,
    )
    assert listing["jobs"] == [
        {"title": "Platform Engineer", "url": "https://example.com/jobs/1"},
        {"title": "Data Engineer", "url": "https://jobs.example.com/2"},
    ]


def test_normalize_listing_returns_empty_for_none_anchors() -> None:
    listing = normalize_listing(None, "https://example.com")
    assert listing == {"url": "https://example.com", "jobs": []}


def test_parse_args_extracts_timeout_and_max_chars() -> None:
    result = parse_args(["--mode", "listing", "--max", "0", "--max-chars", "500", "--timeout", "30000", "https://example.com"])
    assert result == {"url": "https://example.com", "mode": "listing", "max": 0, "maxChars": 500, "timeout": 30000}


def test_parse_args_defaults() -> None:
    result = parse_args(["https://example.com"])
    assert result == {"url": "https://example.com", "mode": "jd", "max": DEFAULT_LISTING_MAX, "maxChars": 12000, "timeout": 15000}


def test_extract_url_returns_no_playwright_when_not_installed() -> None:
    result = asyncio.run(extract_url("http://localhost"))
    assert result["code"] == "no_playwright"


def test_extract_url_blocks_ftp_without_playwright() -> None:
    result = asyncio.run(extract_url("ftp://example.com"))
    assert result["code"] == "no_playwright"


def test_extract_url_blocks_private_hosts_with_playwright() -> None:
    mock_api, _ = _make_pw_context()
    with patch.dict("sys.modules", {"playwright": MagicMock(), "playwright.async_api": mock_api}):
        result = asyncio.run(extract_url("http://localhost"))
        assert result["code"] == "blocked_host"


def test_extract_url_blocks_ftp_with_playwright() -> None:
    mock_api, _ = _make_pw_context()
    with patch.dict("sys.modules", {"playwright": MagicMock(), "playwright.async_api": mock_api}):
        result = asyncio.run(extract_url("ftp://example.com"))
        assert result["code"] == "unsupported_protocol"


def test_extract_url_jd_mode_returns_compacted_text() -> None:
    mock_api, page_mock = _make_pw_context(
        url="https://example.com/job/1",
        dom={"title": " Staff Engineer ", "text": "You will build systems.", "anchors": []},
    )
    with patch.dict("sys.modules", {"playwright": MagicMock(), "playwright.async_api": mock_api}):
        result = asyncio.run(extract_url("https://example.com/job/1", mode="jd", max_chars=50))
        assert result["url"] == "https://example.com/job/1"
        assert result["title"] == "Staff Engineer"
        assert "build systems" in result["text"]
        assert len(result["text"]) <= 50


def test_extract_url_listing_mode_returns_job_links() -> None:
    mock_api, page_mock = _make_pw_context(
        url="https://example.com/careers",
        dom={
            "title": "Careers",
            "text": "",
            "anchors": [
                {"href": "/jobs/swe", "label": "Software Engineer"},
                {"href": "/jobs/pm", "label": "Product Manager"},
            ],
        },
    )
    with patch.dict("sys.modules", {"playwright": MagicMock(), "playwright.async_api": mock_api}):
        result = asyncio.run(extract_url("https://example.com/careers", mode="listing"))
        assert len(result["jobs"]) == 2
        assert result["jobs"][0]["title"] == "Software Engineer"
        assert result["jobs"][0]["url"] == "https://example.com/jobs/swe"


def test_extract_url_blocks_final_url_redirect_to_private() -> None:
    mock_api, page_mock = _make_pw_context(url="http://127.0.0.1/secret")
    with patch.dict("sys.modules", {"playwright": MagicMock(), "playwright.async_api": mock_api}):
        result = asyncio.run(extract_url("https://example.com/redirect"))
        assert result["code"] == "blocked_host"
        assert "blocked final URL" in result["error"]


def test_extract_url_navigation_error_returns_code() -> None:
    mock_api, page_mock = _make_pw_context()
    page_mock.goto = AsyncMock(side_effect=Exception("net::ERR_CONNECTION_REFUSED"))
    with patch.dict("sys.modules", {"playwright": MagicMock(), "playwright.async_api": mock_api}):
        result = asyncio.run(extract_url("https://example.com"))
        assert result["code"] == "navigation_error"
        assert "ERR_CONNECTION_REFUSED" in result["error"]


def test_main_prints_error_for_blocked_host(capsys: Any) -> None:
    code = main(["http://localhost"])
    assert code == 1
    output = json.loads(capsys.readouterr().out)
    assert output["code"] == "blocked_host"


def test_main_prints_json_for_playwright_error(capsys: Any) -> None:
    with patch("scripts.python.pipeline.browser_extract.extract_url", new_callable=AsyncMock) as mock_extract:
        mock_extract.return_value = {"error": "playwright not installed", "code": "no_playwright"}
        code = main(["https://example.com"])
        assert code == 1
        output = json.loads(capsys.readouterr().out)
        assert output["code"] == "no_playwright"
