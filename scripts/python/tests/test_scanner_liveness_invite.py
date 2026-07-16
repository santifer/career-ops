from __future__ import annotations

import json

import pytest

from scripts.python.pipeline.liveness_core import classify_liveness, has_apply_control, job_id_token
from scripts.python.scanner.classify_tier import classify_tier
from scripts.python.scanner.scan import (
    append_to_pipeline,
    append_to_scan_history,
    build_company_canonicalizer,
    build_content_filter,
    build_cooldown_filter,
    build_location_filter,
    build_posting_age_filter,
    build_salary_filter,
    build_title_filter,
    builtin_providers,
    company_match,
    company_role_dedup_key,
    compile_keyword,
    clean_csod_locations,
    csod_config,
    extract_csod_token,
    greenhouse_api_url,
    format_compensation,
    format_pipeline_offer,
    format_scan_history_row,
    ashby_api_url,
    lever_api_url,
    load_provider_plugins,
    load_blacklist,
    load_fingerprint_history,
    load_seen_company_roles,
    load_seen_urls,
    matched_title_keywords,
    merge_provider_plugins,
    normalize_role_for_dedup,
    parse_workday_posted_on,
    parse_workday_response,
    parse_blacklist,
    resolve_provider,
    run_scan,
    scan_history_policy,
    sanitize_markdown_field,
    sanitize_tsv_field,
    should_dedup_scan_history_row,
    parse_smartrecruiters_response,
    parse_teamtailor_feed,
    parse_personio_xml,
    parse_bamboohr_response,
    parse_comeet_response,
    parse_csod_date,
    parse_csod_requisitions,
    parse_phenom_date,
    parse_phenom_refine_search,
    parse_pinpoint_response,
    parse_remoteok_response,
    parse_remotive_response,
    parse_recruitee_response,
    parse_successfactors_csb_date,
    parse_successfactors_csb_jobs,
    parse_successfactors_tiles,
    parse_workable_markdown,
    bamboohr_api_url,
    comeet_api_url,
    personio_feed_url,
    phenom_config,
    phenom_job_location,
    phenom_slugify,
    pinpoint_api_url,
    recruitee_api_url,
    smartrecruiters_api_url,
    successfactors_city_from_slug,
    successfactors_config,
    successfactors_extract_locales,
    teamtailor_feed_url,
    verify_offers,
    workable_feed_url,
    workday_endpoint,
    workday_location_from_path,
    workday_page_is_past_window,
)
from scripts.python.scanner.scan_ats_full import (
    classify_posting_date,
    entry_on_host,
    filter_jobs,
    json_summary,
    load_company_list,
    markdown_digest,
    parse_args,
    run_reverse_scan,
    sample_companies,
    source_specs,
    workday_entry,
)
from scripts.python.scanner.trust_validator import (
    build_trust_validator,
    classify_trust_level,
    company_matches_hostname,
    matches_domain_list,
    validate_url,
)
from scripts.python.tracker.invite_match import (
    analyze_invite,
    company_similarity,
    extract_company,
    extract_date,
    extract_req_id,
    match_invite,
    normalize_company_name,
)


def test_classify_tier_cases() -> None:
    cases = {
        "Software Engineer Intern": "intern",
        "Junior Software Engineer": "entry",
        "Software Engineer I": "entry",
        "Software Engineer II": "mid",
        "Senior Software Engineer": "senior",
        "Staff Engineer": "senior",
        "Principal Engineer": "senior",
        "VP of Engineering": "senior",
        "Engineering Intern Program": "intern",
        "Software Engineer": "mid",
        "Senior Intern Coordinator": "senior",
        "Graduate Engineer": "mid",
        "Graduate Engineer Program": "intern",
        "A.I. Researcher": "mid",
        "I.T. Specialist II": "mid",
    }
    for title, expected in cases.items():
        assert classify_tier(title) == expected
    assert classify_tier(None) == "mid"


def test_trust_validator_matches_js_guard_behavior() -> None:
    assert classify_trust_level(100) == "high"
    assert classify_trust_level(90) == "high"
    assert classify_trust_level(89) == "medium"
    assert classify_trust_level(60) == "medium"
    assert classify_trust_level(59) == "low"

    assert validate_url("https://openai.com/careers")["valid"] is True
    assert validate_url("http://example.com/jobs/123")["valid"] is True
    for url in ["not-a-url", "", "javascript:void(0)", "ftp://example.com", "file:///etc/passwd"]:
        assert validate_url(url) == {"valid": False, "flag": "invalid_url"}

    assert matches_domain_list("abc.bit.ly", ["bit.ly"]) is True
    assert matches_domain_list("notbit.ly", ["bit.ly"]) is False
    assert matches_domain_list("greenhouse.io", ["bit.ly", "tinyurl.com"]) is False
    assert company_matches_hostname("OpenAI", "openai.com") is True
    assert company_matches_hostname("Acme Corp", "acme.com") is True
    assert company_matches_hostname("AB Co", "ab.com") is False
    assert company_matches_hostname("", "example.com") is True

    assert build_trust_validator(None)({"url": "not-a-url", "company": "Test"}) == {"score": 100, "flags": [], "level": "high"}
    assert build_trust_validator({"enabled": False})({"url": "not-a-url", "company": "Test"})["score"] == 100

    validator = build_trust_validator({"enabled": True})
    assert validator({"url": "", "company": "Test"}) == {"score": 60, "flags": ["missing_apply_url"], "level": "medium"}
    assert validator({"url": "not-a-url", "company": "Test"}) == {"score": 50, "flags": ["invalid_url"], "level": "low"}
    bitly = validator({"url": "https://bit.ly/abc", "company": "OpenAI"})
    assert bitly["flags"] == ["suspicious_domain", "company_domain_mismatch"]
    assert bitly["score"] == 60
    assert validator({"url": "https://openai.com/jobs", "company": "OpenAI"}) == {"score": 100, "flags": [], "level": "high"}
    assert validator({"url": "https://boards.greenhouse.io/openai/jobs/123", "company": "OpenAI"})["flags"] == []

    custom = build_trust_validator({"enabled": True, "suspicious_domains": ["evil.com"], "ats_allowlist": ["custom-ats.io"]})
    assert custom({"url": "https://evil.com/job", "company": "Test"})["flags"] == ["suspicious_domain", "company_domain_mismatch"]
    assert "suspicious_domain" not in custom({"url": "https://bit.ly/abc", "company": "Test"})["flags"]
    assert "company_domain_mismatch" not in custom({"url": "https://custom-ats.io/company/jobs", "company": "Test"})["flags"]
    assert "company_domain_mismatch" in custom({"url": "https://boards.greenhouse.io/test/jobs/1", "company": "Test"})["flags"]


def test_scan_core_filters_salary_cooldown_and_dedup() -> None:
    assert compile_keyword("coo")("chief coo officer") is True
    assert compile_keyword("coo")("coordinator") is False
    title_filter = {"positive": ["AI Engineer", "SDR"], "negative": ["Intern"]}
    assert build_title_filter(title_filter)("Senior AI Engineer") is True
    assert build_title_filter(title_filter)("SDR Manager") is True
    assert build_title_filter(title_filter)("AI Engineer Intern") is False
    assert matched_title_keywords("Senior AI Engineer", title_filter) == ["AI Engineer"]

    loc = build_location_filter({"allow": ["Belgium"], "block": ["France"], "always_allow": ["Remote"]})
    assert loc("Remote, France") is True
    assert loc("Paris, France") is False
    assert loc("Brussels, Belgium") is True
    assert loc("") is True

    age = build_posting_age_filter(7, now_ms=1_000_000)
    assert age(1_000_000 - 8 * 86_400_000) is False
    assert age(None) is True

    content = build_content_filter(
        {
            "positive": ["python"],
            "negative": ["php"],
            "by_title_keyword": {"AI Engineer": {"positive": ["llm"], "negative": ["salesforce"]}},
        }
    )
    assert content("Python backend", []) is True
    assert content("PHP backend", []) is False
    assert content("LLM platform", ["AI Engineer"]) is True
    assert content("Salesforce automation", ["AI Engineer"]) is False

    salary = build_salary_filter({"min": 100_000, "max": 150_000, "currency": "USD"})
    assert salary({"min": 120_000, "max": 160_000, "currency": "USD"}) is True
    assert salary({"min": 160_000, "max": 200_000, "currency": "USD"}) is False
    assert salary({"min": 120_000, "max": 140_000, "currency": "EUR"}) is False
    assert salary(None) is True

    assert company_match("Acme Technologies Inc.", "Acme Technologies") is True
    cooldown = build_cooldown_filter(
        {"Acme": {"last_apply_date": "2026-07-01", "same_role_days": 30, "applied_to": ["Engineer"]}},
        "2026-07-15",
    )
    assert cooldown({"company": "Acme Inc", "title": "Senior Engineer"})["skip"] is True
    assert build_cooldown_filter({}, "2026-07-15")({"company": "x"}) == {"skip": False}

    canonicalize = build_company_canonicalizer({"Canonical": ["Alias"], "Other": ["Alias"]})
    assert canonicalize("Canonical") == "canonical"
    assert canonicalize("Alias") == "alias"
    canonicalize = build_company_canonicalizer({"Canonical": ["Alias"]})
    assert canonicalize("Alias") == "canonical"
    assert normalize_role_for_dedup("Senior Engineer (Berlin)") == "senior engineer"
    assert normalize_role_for_dedup("Senior Engineer (Platform)") == "senior engineer platform"
    assert company_role_dedup_key("Alias", "Senior Engineer [Remote]", canonicalize) == "canonical::senior engineer"


def test_scan_core_formatting_blacklist_and_files(tmp_path) -> None:
    assert sanitize_markdown_field("A | B [x]") == "A / B \\[x\\]"
    assert sanitize_tsv_field("=SUM(A1)") == "'=SUM(A1)"
    assert format_compensation({"min": 120000, "max": 160000, "currency": "USD"}) == "120000-160000 USD"
    offer = {
        "url": "https://jobs.example.com/a|b",
        "company": "Acme",
        "title": "Senior [AI] Engineer",
        "location": "Remote",
        "salary": {"min": 120000, "max": 120000, "currency": "USD"},
        "postedAt": 1_772_928_000_000,
        "note": "curated | high",
        "source": "greenhouse-api",
        "description": "short",
    }
    line = format_pipeline_offer(offer)
    assert line.startswith("- [ ] https://jobs.example.com/a%7Cb | Acme | Senior \\[AI\\] Engineer | Remote | 120000 USD")
    assert "posted: 2026-03-08" in line
    assert "note: curated / high" in line
    history = format_scan_history_row(offer, "2026-07-15")
    assert history.split("\t")[:7] == ["https://jobs.example.com/a|b", "2026-07-15", "greenhouse-api", "Senior [AI] Engineer", "Acme", "added", "Remote"]

    append_to_pipeline([offer], root=tmp_path)
    pipeline = (tmp_path / "data/pipeline.md").read_text(encoding="utf-8")
    assert "Senior \\[AI\\] Engineer" in pipeline
    append_to_scan_history([offer], "2026-07-15", root=tmp_path, status="skipped_expired")
    assert "skipped_expired" in (tmp_path / "data/scan-history.tsv").read_text(encoding="utf-8")

    blacklist = parse_blacklist("| Company | Since | Scope | Reason |\n|---|---|---|---|\n| Acme Inc. | 2026 | all | no |\n")
    assert blacklist["acmeinc"]["reason"] == "no"
    (tmp_path / "data").mkdir(exist_ok=True)
    (tmp_path / "data/blacklist.md").write_text("| Company | Since | Scope | Reason |\n| Acme | 2026 | all | no |\n", encoding="utf-8")
    assert load_blacklist(tmp_path)["acme"]["company"] == "Acme"

    (tmp_path / "data/applications.md").write_text(
        "# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|------|---------|------|-------|--------|-----|--------|-------|\n| 1 | 2026-07-15 | Acme | Senior Engineer (Remote) | 4/5 | Applied | | | |\n",
        encoding="utf-8",
    )
    assert "acme::senior engineer" in load_seen_company_roles(tmp_path)


def test_scan_core_seen_urls_recheck_and_fingerprint_history(tmp_path) -> None:
    assert scan_history_policy({"scan_history": {"recheck_after_days": 14}}) == {"recheckAfterDays": 14}
    assert scan_history_policy({"scan_history": {"recheck_after_days": "bad"}}) == {"recheckAfterDays": None}
    assert should_dedup_scan_history_row({"firstSeen": "2026-07-01", "status": "added"}, recheck_after_days=30, today="2026-07-15") is True
    assert should_dedup_scan_history_row({"firstSeen": "2026-06-01", "status": "added"}, recheck_after_days=30, today="2026-07-15") is False
    assert should_dedup_scan_history_row({"firstSeen": "2026-06-01", "status": "skipped_invalid_url"}, recheck_after_days=0, today="2026-07-15") is True
    assert should_dedup_scan_history_row({"firstSeen": "2026-06-01", "status": "cooldown:Acme:2026-08-01"}, recheck_after_days=0, today="2026-07-15") is True

    (tmp_path / "data").mkdir()
    (tmp_path / "data/scan-history.tsv").write_text(
        "url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\tfingerprint\tposted\n"
        "https://old.example\t2026-07-01\ts\tRole\tAcme\tadded\t\tabcdefabcdefabcd\t2026-06-01\n"
        "https://blocked.example\t2026-06-01\ts\tRole\tAcme\tskipped_blocked_host\t\t\t\n",
        encoding="utf-8",
    )
    (tmp_path / "data/pipeline.md").write_text("- [ ] https://pipeline.example | A | B\n", encoding="utf-8")
    (tmp_path / "data/applications.md").write_text("inline https://apps.example/report", encoding="utf-8")
    seen_state = load_seen_urls(tmp_path, recheck_after_days=30, today="2026-07-15")
    assert seen_state["seen"] == {"https://old.example", "https://blocked.example", "https://pipeline.example", "https://apps.example/report"}
    assert seen_state["recheckEligible"] == 0
    recheck_state = load_seen_urls(tmp_path, recheck_after_days=1, today="2026-07-15")
    assert "https://old.example" not in recheck_state["seen"]
    assert recheck_state["recheckEligible"] == 1

    fingerprints = load_fingerprint_history(tmp_path)
    assert fingerprints == [
        {
            "url": "https://old.example",
            "dateStr": "2026-07-01",
            "title": "Role",
            "company": "Acme",
            "fingerprint": "abcdefabcdefabcd",
        }
    ]


def test_scan_run_scan_orchestrates_providers_filters_liveness_and_writes(tmp_path) -> None:
    (tmp_path / "config").mkdir()
    (tmp_path / "data").mkdir()
    (tmp_path / "config/profile.yml").write_text(
        "re_apply_windows:\n  CooldownCo:\n    last_apply_date: '2026-07-01'\n    same_role_days: 30\n    applied_to: ['Engineer']\n",
        encoding="utf-8",
    )
    (tmp_path / "data/applications.md").write_text(
        "| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n"
        "|---|------|---------|------|-------|--------|-----|--------|-------|\n"
        "| 1 | 2026-07-01 | ExistingCo | Senior Engineer | 4/5 | Applied | | | |\n",
        encoding="utf-8",
    )
    (tmp_path / "data/blacklist.md").write_text("| Company | Since | Scope | Reason |\n| BlacklistCo | 2026 | all | no |\n", encoding="utf-8")
    config = {
        "title_filter": {"positive": ["Engineer"], "negative": ["Intern"]},
        "location_filter": {"allow": ["Remote"]},
        "salary_filter": {"min": 100000, "max": 180000, "currency": "USD"},
        "content_filter": {"positive": ["python"]},
        "max_posting_age_days": 10,
        "skip_tiers": ["intern"],
        "trust_filter": {"enabled": True},
        "tracked_companies": [
            {"name": "Acme", "provider": "fake", "careers_url": "https://jobs.acme.com"},
            {"name": "NoProvider"},
        ],
        "job_boards": [{"name": "RemoteBoard", "provider": "board"}],
    }
    now_ms = 2_000_000_000

    def fake_fetch(entry, _ctx):
        return [
            {"url": "https://jobs.acme.com/1", "company": "Acme", "title": "Senior Engineer", "location": "Remote", "salary": {"min": 120000, "max": 150000, "currency": "USD"}, "description": "python platform", "postedAt": now_ms},
            {"url": "https://jobs.acme.com/intern", "company": "Acme", "title": "Engineer Intern", "location": "Remote", "salary": {"min": 120000, "max": 150000, "currency": "USD"}, "description": "python", "postedAt": now_ms},
            {"url": "https://jobs.acme.com/location", "company": "Acme", "title": "Senior Engineer", "location": "Paris", "salary": {"min": 120000, "max": 150000, "currency": "USD"}, "description": "python", "postedAt": now_ms},
            {"url": "https://jobs.acme.com/salary", "company": "Acme", "title": "Senior Engineer", "location": "Remote", "salary": {"min": 190000, "max": 210000, "currency": "USD"}, "description": "python", "postedAt": now_ms},
            {"url": "https://jobs.acme.com/content", "company": "Acme", "title": "Senior Engineer", "location": "Remote", "salary": {"min": 120000, "max": 150000, "currency": "USD"}, "description": "php", "postedAt": now_ms},
            {"url": "https://jobs.acme.com/old", "company": "Acme", "title": "Senior Engineer", "location": "Remote", "salary": {"min": 120000, "max": 150000, "currency": "USD"}, "description": "python", "postedAt": now_ms - 11 * 86_400_000},
            {"url": "https://jobs.acme.com/existing", "company": "ExistingCo", "title": "Senior Engineer (Remote)", "location": "Remote", "salary": {"min": 120000, "max": 150000, "currency": "USD"}, "description": "python", "postedAt": now_ms},
            {"url": "https://jobs.acme.com/cool", "company": "CooldownCo", "title": "Senior Engineer", "location": "Remote", "salary": {"min": 120000, "max": 150000, "currency": "USD"}, "description": "python", "postedAt": now_ms},
            {"url": "https://jobs.acme.com/black", "company": "BlacklistCo", "title": "Senior Engineer", "location": "Remote", "salary": {"min": 120000, "max": 150000, "currency": "USD"}, "description": "python", "postedAt": now_ms},
            {"url": "https://jobs.acme.com/expired", "company": "Acme", "title": "Expired Engineer", "location": "Remote", "salary": {"min": 120000, "max": 150000, "currency": "USD"}, "description": "python", "postedAt": now_ms},
            {"url": "https://jobs.acme.com/noapply", "company": "Acme", "title": "Noapply Engineer", "location": "Remote", "salary": {"min": 120000, "max": 150000, "currency": "USD"}, "description": "python", "postedAt": now_ms},
            {"url": "ftp://bad", "company": "Acme", "title": "Invalid Engineer", "location": "Remote", "salary": {"min": 120000, "max": 150000, "currency": "USD"}, "description": "python", "postedAt": now_ms},
        ]

    def board_fetch(entry, _ctx):
        return [{"url": "https://board.example/1", "company": entry["name"], "title": "Board Engineer", "location": "Remote", "description": "python", "postedAt": now_ms}]

    providers = {
        "fake": {"id": "fake", "fetch": fake_fetch},
        "board": {"id": "board", "fetch": board_fetch},
    }

    def live(url):
        if "expired" in url:
            return {"result": "expired", "code": "http_gone", "reason": "HTTP 404"}
        if "noapply" in url:
            return {"result": "uncertain", "code": "no_apply_control", "reason": "no apply"}
        if url.startswith("ftp"):
            return {"result": "uncertain", "code": "unsupported_protocol", "reason": "bad"}
        return {"result": "active", "code": "apply_control_visible", "reason": "ok"}

    result = run_scan(
        root=tmp_path,
        config=config,
        providers=providers,
        verify=True,
        liveness_checker=live,
        today="2026-07-15",
        now_ms=now_ms,
    )
    assert result["companies"] == 1
    assert result["boards"] == 1
    assert result["skippedNoProvider"] == 1
    counters = result["counters"]
    assert counters["found"] == 13
    assert counters["filteredTitle"] == 1
    assert counters["filteredLocation"] == 1
    assert counters["filteredPostingAge"] == 1
    assert counters["filteredSalary"] == 1
    assert counters["filteredContent"] == 1
    assert counters["filteredCooldown"] == 1
    assert counters["filteredBlacklist"] == 1
    assert counters["dupes"] == 1
    assert counters["newAdded"] == 2
    assert [offer["url"] for offer in result["offers"]] == ["https://jobs.acme.com/1", "https://board.example/1"]
    assert [offer["url"] for offer in result["expired"]] == ["https://jobs.acme.com/expired"]
    assert [offer["url"] for offer in result["dropped"]] == ["https://jobs.acme.com/noapply"]
    assert [offer["url"] for offer in result["invalid"]] == ["ftp://bad"]
    pipeline = (tmp_path / "data/pipeline.md").read_text(encoding="utf-8")
    assert "https://jobs.acme.com/1" in pipeline
    assert "https://board.example/1" in pipeline
    history = (tmp_path / "data/scan-history.tsv").read_text(encoding="utf-8")
    assert "skipped_expired" in history
    assert "skipped_no_apply_control" in history
    assert "skipped_invalid_url" in history
    assert "cooldown:CooldownCo:2026-07-31" in history
    runs = (tmp_path / "data/scan-runs.tsv").read_text(encoding="utf-8")
    assert "companies\tboards\tfound" in runs
    assert "\t1\t1\t13\t" in runs


def test_scan_provider_resolution_and_verify_buckets() -> None:
    providers = {
        "explicit": {"id": "explicit", "fetch": lambda _entry, _ctx: []},
        "detected": {"id": "detected", "detect": lambda entry: entry.get("careers_url", "").startswith("https://x"), "fetch": lambda _entry, _ctx: []},
    }
    assert resolve_provider({"provider": "explicit"}, providers)["provider"] == providers["explicit"]
    assert resolve_provider({"provider": "missing"}, providers)["error"] == 'unknown provider "missing"'
    assert resolve_provider({"careers_url": "https://x/jobs"}, providers)["provider"] == providers["detected"]
    assert resolve_provider({"careers_url": "https://y/jobs"}, providers) is None

    offers = [{"url": "active"}, {"url": "gone"}, {"url": "bad"}, {"url": "noapply"}]
    result = verify_offers(
        offers,
        lambda url: {
            "active": {"result": "active", "code": "ok", "reason": ""},
            "gone": {"result": "expired", "code": "http_gone", "reason": ""},
            "bad": {"result": "uncertain", "code": "blocked_host", "reason": ""},
            "noapply": {"result": "uncertain", "code": "no_apply_control", "reason": ""},
        }[url],
    )
    assert [item["url"] for item in result["verified"]] == ["active"]
    assert [item["url"] for item in result["expired"]] == ["gone"]
    assert [item["url"] for item in result["invalid"]] == ["bad"]
    assert [item["url"] for item in result["dropped"]] == ["noapply"]
    merged = merge_provider_plugins({"core": {"id": "core"}, "same": {"id": "same"}}, [{"id": "plugin"}, {"id": "same"}])
    assert list(merged) == ["core", "same", "plugin"]
    assert merged["same"] == {"id": "same"}


def test_scan_loads_python_provider_plugins(tmp_path) -> None:
    plugin_dir = tmp_path / "providers"
    plugin_dir.mkdir()
    (plugin_dir / "_ignored.py").write_text("raise RuntimeError('ignored')\n", encoding="utf-8")
    (plugin_dir / "custom.py").write_text(
        """
provider = {
    "id": "custom",
    "detect": lambda entry: entry.get("careers_url") == "https://custom.example/jobs",
    "fetch": lambda entry, ctx: [{
        "title": "Custom Engineer",
        "url": "https://custom.example/jobs/1",
        "company": entry["name"],
        "location": "Remote",
        "description": "python",
    }],
}
""",
        encoding="utf-8",
    )
    providers = load_provider_plugins([plugin_dir])
    assert list(providers) == ["custom"]
    result = run_scan(
        root=tmp_path,
        config={
            "title_filter": {"positive": ["Engineer"]},
            "tracked_companies": [{"name": "CustomCo", "careers_url": "https://custom.example/jobs"}],
        },
        providers={},
        provider_plugins=providers,
        dry_run=True,
        today="2026-07-15",
    )
    assert result["counters"]["found"] == 1
    assert result["offers"][0]["url"] == "https://custom.example/jobs/1"


def test_scan_builtin_ats_providers_resolve_fetch_and_default_run(tmp_path) -> None:
    assert greenhouse_api_url({"careers_url": "https://job-boards.greenhouse.io/acme"}) == "https://boards-api.greenhouse.io/v1/boards/acme/jobs"
    assert lever_api_url({"careers_url": "https://jobs.eu.lever.co/acme"}) == "https://api.eu.lever.co/v0/postings/acme"
    assert ashby_api_url({"careers_url": "https://jobs.ashbyhq.com/acme"}) == "https://api.ashbyhq.com/posting-api/job-board/acme?includeCompensation=true"
    assert smartrecruiters_api_url({"careers_url": "https://careers.smartrecruiters.com/Acme"}) == "https://api.smartrecruiters.com/v1/companies/Acme/postings?limit=100&offset=0&status=PUBLIC"
    assert workable_feed_url({"careers_url": "https://apply.workable.com/acme/"}) == "https://apply.workable.com/acme/jobs.md"
    assert teamtailor_feed_url({"careers_url": "https://acme.teamtailor.com/jobs"}) == "https://acme.teamtailor.com/jobs.rss"
    assert personio_feed_url({"careers_url": "https://acme.jobs.personio.de/jobs"}) == "https://acme.jobs.personio.de/xml"
    assert recruitee_api_url({"careers_url": "https://acme.recruitee.com/jobs"}) == "https://acme.recruitee.com/api/offers/"
    assert pinpoint_api_url({"careers_url": "https://acme.pinpointhq.com/jobs"}) == "https://acme.pinpointhq.com/postings.json"
    assert bamboohr_api_url({"careers_url": "https://acme.bamboohr.com/careers"}) == "https://acme.bamboohr.com/careers/list"
    comeet_url = "https://www.comeet.co/careers-api/2.0/company/acme/positions?token=secret"
    assert comeet_api_url({"api": comeet_url}) == comeet_url
    csod = csod_config({"careers_url": "https://career-acme.csod.com/ux/ats/careersite/4/home?c=career-acme"})
    assert csod is not None
    assert csod["homeUrl"] == "https://career-acme.csod.com/ux/ats/careersite/4/home?c=career-acme"
    assert csod["searchApi"] == "https://career-acme.csod.com/services/x/career-site/v1/search"
    assert extract_csod_token('{"token":"abc.def_123"}') == "abc.def_123"
    phenom = phenom_config(
        {
            "careers_url": "https://careers.phenompeople.com/search",
            "phenom": {"urlPrefix": "/global/en/", "selectedFields": {"country": ["Germany"]}},
        }
    )
    assert phenom is not None
    assert phenom["widgetsApi"] == "https://careers.phenompeople.com/widgets"
    assert phenom["urlPrefix"] == "global/en"
    assert phenom["selectedFields"] == {"country": ["Germany"]}
    assert phenom_slugify("München AI Engineer") == "Munchen-AI-Engineer"
    sf = successfactors_config({"careers_url": "https://jobs.example.com/search/"})
    assert sf == {
        "origin": "https://jobs.example.com",
        "tileApi": "https://jobs.example.com/tile-search-results/",
        "jobBase": "https://jobs.example.com",
        "jobsApi": "https://jobs.example.com/services/recruiting/v1/jobs",
        "searchPage": "https://jobs.example.com/search/",
    }
    endpoint = workday_endpoint({"careers_url": "https://tenant.wd1.myworkdayjobs.com/en-US/External"})
    assert endpoint is not None
    assert endpoint["api"] == "https://tenant.wd1.myworkdayjobs.com/wday/cxs/tenant/External/jobs"
    assert endpoint["jobBase"] == "https://tenant.wd1.myworkdayjobs.com/External"
    assert workday_location_from_path("/job/Berlin-Germany/Senior-Engineer") == "Berlin Germany"
    assert parse_workday_posted_on("Posted Today", now_ms=2_000_000_000) == 2_000_000_000
    assert parse_workday_posted_on("Posted Yesterday", now_ms=2_000_000_000) == 2_000_000_000 - 86_400_000
    assert parse_workday_posted_on("Posted 5 Days Ago", now_ms=2_000_000_000) == 2_000_000_000 - 5 * 86_400_000
    assert parse_workday_posted_on("Posted 30+ Days Ago", now_ms=2_000_000_000) is None
    parsed_workday = parse_workday_response(
        {"jobPostings": [{"title": "Senior Engineer", "externalPath": "/job/Berlin-Germany/Senior-Engineer", "postedOn": "Posted 5 Days Ago"}]},
        {"name": "WorkdayCo", "careers_url": "https://tenant.wd1.myworkdayjobs.com/en-US/External"},
        now_ms=2_000_000_000,
    )
    assert parsed_workday == [
        {
            "title": "Senior Engineer",
            "url": "https://tenant.wd1.myworkdayjobs.com/External/job/Berlin-Germany/Senior-Engineer",
            "company": "WorkdayCo",
            "location": "Berlin Germany",
            "postedAt": 2_000_000_000 - 5 * 86_400_000,
        }
    ]
    assert workday_page_is_past_window(parsed_workday, 2_000_000_000) is True
    assert parse_smartrecruiters_response(
        {
            "content": [
                {
                    "id": "123",
                    "name": "Senior Engineer",
                    "ref": "https://api.smartrecruiters.com/v1/companies/Acme/postings/123",
                    "location": {"city": "Paris", "country": "France", "remote": True},
                }
            ]
        },
        "Acme",
    ) == [
        {
            "title": "Senior Engineer",
            "url": "https://jobs.smartrecruiters.com/Acme/postings/123",
            "location": "Paris, France, Remote",
            "company": "Acme",
        }
    ]
    workable_feed = (
        "| Title | Department | Location | Type | Salary | Posted | Details |\n"
        "| Senior Engineer | Engineering | Remote | Full-time | | Today | [View](https://apply.workable.com/acme/jobs/view/123.md) |\n"
        "| Bad | Engineering | Remote | Full-time | | Today | [View](https://evil.example/jobs/1.md) |\n"
    )
    assert parse_workable_markdown(workable_feed, "Acme") == [
        {
            "title": "Senior Engineer",
            "url": "https://apply.workable.com/acme/jobs/view/123",
            "company": "Acme",
            "location": "Remote",
        }
    ]
    teamtailor_feed = """
<rss><channel>
  <item>
    <title><![CDATA[Teamtailor Engineer &amp; Builder]]></title>
    <link>https://jobs.example.com/tt/1</link>
    <pubDate>Thu, 01 Jan 1970 00:00:01 GMT</pubDate>
    <tt:city>Brussels</tt:city>
    <tt:country>Belgium</tt:country>
  </item>
  <item>
    <title>Remote Engineer</title>
    <link>https://jobs.example.com/tt/2</link>
    <remoteStatus>fully</remoteStatus>
  </item>
</channel></rss>
"""
    assert parse_teamtailor_feed(teamtailor_feed, "TeamCo") == [
        {
            "title": "Teamtailor Engineer &amp; Builder",
            "company": "TeamCo",
            "location": "Brussels, Belgium",
            "url": "https://jobs.example.com/tt/1",
            "postedAt": 1000,
        },
        {
            "title": "Remote Engineer",
            "company": "TeamCo",
            "location": "Remote",
            "url": "https://jobs.example.com/tt/2",
        },
    ]
    personio_xml = """
<workzag-jobs>
  <position>
    <id>123</id>
    <name>Personio Engineer &amp; Builder</name>
    <office>Berlin</office>
    <additionalOffices><office>Remote</office><office>Berlin</office></additionalOffices>
    <createdAt>1970-01-01T00:00:01Z</createdAt>
    <jobDescriptions><jobDescription><name>Ignore Me</name><value></position></value></jobDescription></jobDescriptions>
  </position>
  <position><id>bad/id</id><name>Bad</name></position>
</workzag-jobs>
"""
    assert parse_personio_xml(personio_xml, "PersonioCo", "acme.jobs.personio.de") == [
        {
            "title": "Personio Engineer & Builder",
            "url": "https://acme.jobs.personio.de/job/123",
            "location": "Berlin, Remote",
            "company": "PersonioCo",
            "postedAt": 1000,
        }
    ]
    assert parse_recruitee_response(
        {"offers": [{"title": "Recruitee Engineer", "careers_url": "https://careers.example.com/o/1", "city": "Ghent", "country": "Belgium", "remote": True}]},
        "RecruitCo",
    ) == [
        {
            "title": "Recruitee Engineer",
            "url": "https://careers.example.com/o/1",
            "location": "Ghent, Belgium, Remote",
            "company": "RecruitCo",
        }
    ]
    assert parse_pinpoint_response(
        {"data": [{"title": " Pinpoint Engineer ", "url": "https://acme.pinpointhq.com/jobs/1", "location": {"city": "Paris", "province": "Ile-de-France"}}]},
        "PinCo",
    ) == [
        {
            "title": "Pinpoint Engineer",
            "url": "https://acme.pinpointhq.com/jobs/1",
            "location": "Paris, Ile-de-France",
            "company": "PinCo",
        }
    ]
    assert parse_bamboohr_response(
        {"result": [{"id": "42", "jobOpeningName": "Bamboo Engineer", "location": {"city": "Brussels", "state": "BE"}, "isRemote": 1}]},
        "BambooCo",
        "https://acme.bamboohr.com",
    ) == [
        {
            "title": "Bamboo Engineer",
            "url": "https://acme.bamboohr.com/careers/42",
            "company": "BambooCo",
            "location": "Brussels, BE, Remote",
        }
    ]
    assert parse_comeet_response(
        [{"name": "Comeet Engineer", "url_active_page": "https://careers.example.com/jobs/1", "location": {"name": "Tel Aviv", "is_remote": True}, "time_updated": "1970-01-01T00:00:01Z"}],
        "ComeetCo",
    ) == [
        {
            "title": "Comeet Engineer",
            "url": "https://careers.example.com/jobs/1",
            "location": "Tel Aviv, Remote",
            "company": "ComeetCo",
            "postedAt": 1000,
        }
    ]
    assert parse_remoteok_response(
        [{"legal": "metadata"}, {"position": "RemoteOK Engineer", "url": "https://remoteok.com/remote-jobs/1", "company": "RemoteCo", "location": "Worldwide"}],
        "RemoteOK",
    ) == [{"title": "RemoteOK Engineer", "url": "https://remoteok.com/remote-jobs/1", "company": "RemoteCo", "location": "Worldwide"}]
    assert parse_remotive_response(
        {"jobs": [{"title": "Remotive Engineer", "url": "https://remotive.com/jobs/1", "company_name": "RemotiveCo", "candidate_required_location": "Europe"}]},
        "Remotive",
    ) == [{"title": "Remotive Engineer", "url": "https://remotive.com/jobs/1", "company": "RemotiveCo", "location": "Europe"}]
    assert clean_csod_locations([{"city": "Bremen", "country": "DE"}, {"city": "Paris", "country": "FR"}]) == "Bremen, DE / Paris, FR"
    assert parse_csod_date("1/1/1970") == 0
    assert parse_csod_date("2/30/2026") is None
    assert parse_csod_requisitions(
        {
            "data": {
                "requisitions": [
                    {
                        "requisitionId": "R1",
                        "displayJobTitle": "<b>CSOD Engineer</b>",
                        "postingEffectiveDate": "1/1/1970",
                        "locations": [{"city": "Bremen", "country": "DE"}],
                    }
                ]
            }
        },
        csod,
    ) == [
        {
            "id": "R1",
            "title": "CSOD Engineer",
            "url": "https://career-acme.csod.com/ux/ats/careersite/4/home/requisition/R1?c=career-acme",
            "location": "Bremen, DE",
            "postedAt": 0,
        }
    ]
    assert parse_phenom_date("1970-01-01T00:00:01Z") == 1000
    assert phenom_job_location({"city": "Munich", "state": "BY", "country": "Germany"}) == "Munich, BY, Germany"
    assert parse_phenom_refine_search(
        {
            "refineSearch": {
                "totalHits": 1,
                "data": {
                    "jobs": [
                        {
                            "jobId": "98098",
                            "title": "<b>Phenom Engineer</b>",
                            "location": "Munich, Germany",
                            "postedDate": "1970-01-01T00:00:01Z",
                        }
                    ]
                },
            }
        },
        phenom,
    ) == {
        "total": 1,
        "rows": [
            {
                "id": "98098",
                "title": "Phenom Engineer",
                "url": "https://careers.phenompeople.com/global/en/job/98098/Phenom-Engineer",
                "location": "Munich, Germany",
                "postedAt": 1000,
            }
        ],
    }
    sf_tile_html = """
<li class="job-tile job-id-42">
  <div data-url="/job/Berlin-Senior-Engineer-123/42/"></div>
  <a class="jobTitle-link">Senior &amp; Engineer</a>
  <div id="x-section-city-value">Berlin</div>
</li>
"""
    assert successfactors_city_from_slug("/job/Munich-Senior-Engineer-123/42/", "Senior Engineer") == "Munich"
    assert parse_successfactors_tiles(sf_tile_html, "https://jobs.example.com") == [
        {
            "id": "42",
            "title": "Senior & Engineer",
            "url": "https://jobs.example.com/job/Berlin-Senior-Engineer-123/42/",
            "location": "Berlin",
        }
    ]
    assert successfactors_extract_locales('<a href="/search/?q=&locale=en_US"></a><a href="/search/?locale=de_DE"></a>') == ["de_DE", "en_US"]
    assert parse_successfactors_csb_date("1/1/1970") == 0
    assert parse_successfactors_csb_date("2.1.1970") == 86400000
    assert parse_successfactors_csb_jobs(
        {
            "jobSearchResult": [
                {
                    "response": {
                        "id": "99",
                        "unifiedStandardTitle": "CSB Engineer",
                        "unifiedUrlTitle": "CSB-Engineer",
                        "jobLocationShort": ["Munich, DE<br/>"],
                        "unifiedStandardStart": "1/1/1970",
                    }
                }
            ]
        },
        sf,
        "en_US",
    ) == [
        {
            "id": "99",
            "title": "CSB Engineer",
            "url": "https://jobs.example.com/job/CSB-Engineer/99-en_US",
            "location": "Munich, DE",
            "postedAt": 0,
        }
    ]

    payloads = {
        "https://boards-api.greenhouse.io/v1/boards/acme/jobs": {
            "jobs": [{"title": "Senior Engineer", "absolute_url": "https://gh/1", "location": {"name": "Remote"}, "first_published": "2026-07-15T00:00:00Z"}]
        },
        "https://api.eu.lever.co/v0/postings/leverco": [
            {"text": "Backend Engineer", "hostedUrl": "https://lever/1", "categories": {"location": "Remote"}, "descriptionPlain": "python", "createdAt": 1}
        ],
        "https://api.ashbyhq.com/posting-api/job-board/ashbyco?includeCompensation=true": {
            "jobs": [
                {
                    "title": "Platform Engineer",
                    "jobUrl": "https://ashby/1",
                    "location": "Remote",
                    "secondaryLocations": [{"location": "Europe", "address": {"postalAddress": {"addressLocality": "Berlin", "addressCountry": "Germany"}}}],
                    "publishedAt": "2026-07-15T00:00:00Z",
                    "compensation": {"interval": "1 YEAR", "minValue": "100000", "maxValue": "120000", "currency": "usd"},
                }
            ]
        },
        "https://api.smartrecruiters.com/v1/companies/SmartCo/postings?limit=100&offset=0&status=PUBLIC": {
            "content": [
                {
                    "id": "1",
                    "name": "Smart Engineer",
                    "ref": "https://api.smartrecruiters.com/v1/companies/SmartCo/postings/1",
                    "location": {"fullLocation": "Remote"},
                }
            ]
        },
        "https://acme.recruitee.com/api/offers/": {
            "offers": [{"title": "Recruitee Engineer", "url": "https://acme.recruitee.com/o/1", "location": "Remote"}]
        },
        "https://acme.pinpointhq.com/postings.json": {
            "data": [{"title": "Pinpoint Engineer", "url": "https://acme.pinpointhq.com/jobs/1", "location": {"name": "Remote"}}]
        },
        "https://acme.bamboohr.com/careers/list": {
            "result": [{"id": 7, "jobOpeningName": "Bamboo Engineer", "location": {"city": "Remote"}}]
        },
        comeet_url: [
            {"name": "Comeet Engineer", "url_active_page": "https://careers.example.com/jobs/1", "location": {"name": "Remote"}}
        ],
        "https://remoteok.com/api": [
            {"last_updated": "metadata"},
            {"position": "RemoteOK Engineer", "url": "https://remoteok.com/remote-jobs/1", "company": "RemoteCo", "location": "Worldwide"},
        ],
        "https://remotive.com/api/remote-jobs": {
            "jobs": [{"title": "Remotive Engineer", "url": "https://remotive.com/jobs/1", "company_name": "RemotiveCo", "candidate_required_location": "Europe"}]
        },
        "https://career-acme.csod.com/services/x/career-site/v1/search": {
            "data": {
                "totalCount": 1,
                "requisitions": [{"requisitionId": "R1", "displayJobTitle": "CSOD Engineer", "locations": [{"city": "Remote"}]}],
            }
        },
        "https://careers.phenompeople.com/widgets": {
            "refineSearch": {
                "totalHits": 1,
                "data": {"jobs": [{"jobId": "P1", "title": "Phenom Engineer", "city": "Munich", "country": "Germany"}]},
            }
        },
        "https://jobs.example.com/services/recruiting/v1/jobs": {
            "totalJobs": 1,
            "jobSearchResult": [{"response": {"id": "99", "unifiedStandardTitle": "CSB Engineer", "unifiedUrlTitle": "CSB-Engineer"}}],
        },
    }

    def fetcher(url, opts=None):
        if url == endpoint["api"]:
            body = json.loads(opts["body"])
            if body["offset"] == 0:
                return {"total": 21, "jobPostings": [{"title": "Workday Engineer", "externalPath": "/job/Remote/Workday-Engineer", "locationsText": "Remote", "postedOn": "Posted Today"}]}
            if body["offset"] == 20:
                return {"total": 21, "jobPostings": [{"title": "Second Workday Engineer", "externalPath": "/job/Paris-France/Second-Workday-Engineer", "postedOn": "Posted 1 Days Ago"}]}
            raise AssertionError(f"unexpected Workday offset {body['offset']}")
        return payloads[url]

    def fetch_text(url, opts=None):
        if url == "https://apply.workable.com/acme/jobs.md":
            assert opts == {"redirect": "error"}
            return workable_feed
        if url == "https://acme.teamtailor.com/jobs.rss":
            assert opts == {"redirect": "error"}
            return teamtailor_feed
        if url == "https://acme.jobs.personio.de/xml":
            assert opts == {"redirect": "error"}
            return personio_xml
        if url == "https://career-acme.csod.com/ux/ats/careersite/4/home?c=career-acme":
            assert opts == {"headers": {"accept": "text/html"}}
            return '{"token":"abc.def_123"}'
        if url == "https://jobs.example.com/tile-search-results/?startrow=0":
            assert opts == {"redirect": "error", "headers": {"accept": "text/html"}}
            return sf_tile_html
        if url == "https://jobs.example.com/tile-search-results/?startrow=1":
            assert opts == {"redirect": "error", "headers": {"accept": "text/html"}}
            return ""
        if url == "https://jobs.example.com/search/":
            assert opts == {"redirect": "error", "headers": {"accept": "text/html"}}
            return '<a href="/search/?locale=en_US"></a>'
        raise AssertionError(f"unexpected text URL {url}")

    providers = builtin_providers(fetcher, fetch_text)
    assert providers["greenhouse"]["detect"]({"careers_url": "https://job-boards.greenhouse.io/acme"}) is True
    assert providers["greenhouse"]["fetch"]({"name": "Acme", "careers_url": "https://job-boards.greenhouse.io/acme"}, {})[0]["url"] == "https://gh/1"
    assert providers["lever"]["fetch"]({"name": "LeverCo", "careers_url": "https://jobs.eu.lever.co/leverco"}, {})[0]["description"] == "python"
    ashby_job = providers["ashby"]["fetch"]({"name": "AshbyCo", "careers_url": "https://jobs.ashbyhq.com/ashbyco"}, {})[0]
    assert ashby_job["salary"] == {"min": 100000.0, "max": 120000.0, "currency": "USD"}
    assert ashby_job["location"] == "Remote · Europe · Berlin · Germany"
    assert providers["workday"]["detect"]({"careers_url": "https://tenant.wd1.myworkdayjobs.com/en-US/External"}) is True
    workday_jobs = providers["workday"]["fetch"]({"name": "WorkdayCo", "careers_url": "https://tenant.wd1.myworkdayjobs.com/en-US/External"}, {"nowMs": 2_000_000_000})
    assert [job["title"] for job in workday_jobs] == ["Workday Engineer", "Second Workday Engineer"]
    assert workday_jobs[1]["location"] == "Paris France"
    assert providers["smartrecruiters"]["detect"]({"careers_url": "https://careers.smartrecruiters.com/SmartCo"}) is True
    smart_job = providers["smartrecruiters"]["fetch"]({"name": "SmartCo", "careers_url": "https://careers.smartrecruiters.com/SmartCo"}, {})[0]
    assert smart_job == {
        "title": "Smart Engineer",
        "url": "https://jobs.smartrecruiters.com/SmartCo/postings/1",
        "location": "Remote",
        "company": "SmartCo",
    }
    assert providers["workable"]["detect"]({"careers_url": "https://apply.workable.com/acme/"}) is True
    assert providers["workable"]["fetch"]({"name": "Acme", "careers_url": "https://apply.workable.com/acme/"}, {})[0]["url"] == "https://apply.workable.com/acme/jobs/view/123"
    assert providers["teamtailor"]["detect"]({"careers_url": "https://acme.teamtailor.com/jobs"}) is True
    assert providers["teamtailor"]["fetch"]({"name": "TeamCo", "careers_url": "https://acme.teamtailor.com/jobs"}, {})[0]["postedAt"] == 1000
    assert providers["personio"]["detect"]({"careers_url": "https://acme.jobs.personio.de/jobs"}) is True
    assert providers["personio"]["fetch"]({"name": "PersonioCo", "careers_url": "https://acme.jobs.personio.de/jobs"}, {})[0]["url"] == "https://acme.jobs.personio.de/job/123"
    assert providers["recruitee"]["detect"]({"careers_url": "https://acme.recruitee.com/jobs"}) is True
    assert providers["recruitee"]["fetch"]({"name": "RecruitCo", "careers_url": "https://acme.recruitee.com/jobs"}, {})[0]["title"] == "Recruitee Engineer"
    assert providers["pinpoint"]["detect"]({"careers_url": "https://acme.pinpointhq.com/jobs"}) is True
    assert providers["pinpoint"]["fetch"]({"name": "PinCo", "careers_url": "https://acme.pinpointhq.com/jobs"}, {})[0]["location"] == "Remote"
    assert providers["bamboohr"]["detect"]({"careers_url": "https://acme.bamboohr.com/careers"}) is True
    assert providers["bamboohr"]["fetch"]({"name": "BambooCo", "careers_url": "https://acme.bamboohr.com/careers"}, {})[0]["url"] == "https://acme.bamboohr.com/careers/7"
    assert providers["comeet"]["detect"]({"api": comeet_url}) is True
    assert providers["comeet"]["fetch"]({"name": "ComeetCo", "api": comeet_url}, {})[0]["title"] == "Comeet Engineer"
    assert providers["remoteok"]["fetch"]({"name": "RemoteOK"}, {})[0]["title"] == "RemoteOK Engineer"
    assert providers["remotive"]["fetch"]({"name": "Remotive"}, {})[0]["title"] == "Remotive Engineer"
    assert providers["csod"]["detect"]({"careers_url": "https://career-acme.csod.com/ux/ats/careersite/4/home?c=career-acme"}) is True
    assert providers["csod"]["fetch"]({"name": "CsodCo", "careers_url": "https://career-acme.csod.com/ux/ats/careersite/4/home?c=career-acme"}, {})[0]["title"] == "CSOD Engineer"
    assert providers["phenom"]["detect"]({"careers_url": "https://careers.phenompeople.com/search"}) is True
    phenom_job = providers["phenom"]["fetch"](
        {
            "name": "PhenomCo",
            "careers_url": "https://careers.phenompeople.com/search",
            "phenom": {"urlPrefix": "global/en", "selectedFields": {"country": ["Germany"]}},
        },
        {},
    )[0]
    assert phenom_job["url"] == "https://careers.phenompeople.com/global/en/job/P1/Phenom-Engineer"
    assert phenom_job["location"] == "Munich, Germany"
    assert providers["successfactors"]["fetch"]({"name": "SfCo", "careers_url": "https://jobs.example.com/search/", "provider": "successfactors"}, {})[0]["title"] == "Senior & Engineer"
    assert providers["successfactors"]["fetch"]({"name": "SfCo", "careers_url": "https://jobs.example.com/search/", "provider": "successfactors", "sfVariant": "csb"}, {})[0]["url"] == "https://jobs.example.com/job/CSB-Engineer/99-en_US"

    (tmp_path / "config").mkdir()
    (tmp_path / "data").mkdir()
    config = {
        "title_filter": {"positive": ["Engineer"]},
        "tracked_companies": [{"name": "Acme", "careers_url": "https://job-boards.greenhouse.io/acme"}],
    }
    result = run_scan(root=tmp_path, config=config, providers=providers, dry_run=True, today="2026-07-15")
    assert result["counters"]["found"] == 1
    assert result["offers"][0]["url"] == "https://gh/1"


def test_scan_ats_full_args_entries_sampling_and_dates() -> None:
    opts = parse_args(["--since", "7", "--ats=greenhouse,lever", "--limit", "10", "--dry-run", "--include-undated"])
    assert opts["sinceDays"] == 7
    assert opts["ats"] == ["greenhouse", "lever"]
    assert opts["limit"] == 10
    assert opts["dryRun"] is True
    assert opts["includeUndated"] is True

    try:
        parse_args(["--bad"])
    except ValueError as error:
        assert "unrecognized" in str(error)
    else:
        raise AssertionError("unknown flag accepted")

    assert entry_on_host("acme", "https://jobs.lever.co/acme", lambda host: host == "jobs.lever.co") == {
        "name": "acme",
        "careers_url": "https://jobs.lever.co/acme",
    }
    assert entry_on_host("acme", "not-a-url", lambda _host: True) is None
    assert source_specs()["greenhouse"].to_entry("good_slug")["careers_url"] == "https://job-boards.greenhouse.io/good_slug"
    assert source_specs()["greenhouse"].to_entry("../bad") is None
    assert workday_entry("tenant|wd1|External")["careers_url"] == "https://tenant.wd1.myworkdayjobs.com/External"
    assert workday_entry("tenant|bad host|External") is None

    assert classify_posting_date({"postedAt": 90}, 100) == "stale"
    assert classify_posting_date({}, 100) == "undated"
    assert classify_posting_date({"postedAt": 120}, 100) == "keep"
    assert sample_companies([1, 2, 3], 2, False) == [1, 2]
    assert sorted(sample_companies([1, 2, 3], 2, True)) in ([1, 2], [1, 3], [2, 3])


def test_scan_ats_full_cache_filters_and_summary(tmp_path) -> None:
    first = load_company_list("greenhouse", "https://dataset", root=tmp_path, now_ms=1_000_000, fetch_json=lambda _url: ["acme"])
    assert first == {"list": ["acme"], "status": "ok"}
    cache_file = tmp_path / "data/cache/ats-companies/greenhouse.json"
    expired_now = int(cache_file.stat().st_mtime * 1000) + 25 * 3_600_000
    stale = load_company_list(
        "greenhouse",
        "https://dataset",
        root=tmp_path,
        now_ms=expired_now,
        fetch_json=lambda _url: (_ for _ in ()).throw(RuntimeError("offline")),
    )
    assert stale == {"list": ["acme"], "status": "stale"}

    offers, dropped = filter_jobs(
        [
            {"url": "u1", "title": "Senior Engineer", "company": "Acme", "location": "Remote", "postedAt": 200},
            {"url": "u2", "title": "Senior Engineer", "company": "Acme", "location": "Remote"},
            {"url": "u3", "title": "Design Intern", "company": "Acme", "location": "Remote", "postedAt": 200},
            {"url": "u1", "title": "Senior Engineer", "company": "Acme", "location": "Remote", "postedAt": 200},
        ],
        cutoff_ms=100,
        include_undated=False,
        title_matches=lambda title: "engineer" in title.lower(),
        location_matches=lambda location: location == "Remote",
        seen_urls=set(),
        source="test",
    )
    assert [offer["url"] for offer in offers] == ["u1"]
    assert dropped == 1

    digest = markdown_digest(offers, scan_date="2026-07-15", since_days=3, liveness=False)
    assert "# Reverse ATS Scan" in digest
    assert "Senior Engineer @ Acme" in digest

    summary = json_summary(
        scan_date="2026-07-15",
        opts={"ats": ["greenhouse"], "sinceDays": 3},
        total_available=2,
        total_scanned=1,
        cap_hit=True,
        dataset_status={"greenhouse": "ok"},
        offers=offers,
        dropped_no_date=1,
        total_errors=0,
        saved=False,
    )
    assert summary["postingsKept"] == 1
    assert summary["offers"][0]["dateStatus"] == "dated"


def test_scan_ats_full_run_reverse_scan_with_injected_provider(tmp_path) -> None:
    (tmp_path / "config").mkdir()
    (tmp_path / "config/portals.yml").write_text(
        """
title_filter:
  positive: [Engineer]
location_filter:
  allow: [Remote]
""",
        encoding="utf-8",
    )

    def fetch_dataset(url):
        assert "greenhouse_companies" in url
        return ["acme", "bad/slug"]

    def fetch_jobs(entry):
        assert entry["careers_url"] == "https://job-boards.greenhouse.io/acme"
        return [
            {"url": "https://jobs.example.com/1", "title": "Senior Engineer", "company": "Acme", "location": "Remote", "postedAt": 200_000},
            {"url": "https://jobs.example.com/2", "title": "Engineer", "company": "Acme", "location": "On-site", "postedAt": 200_000},
        ]

    result = run_reverse_scan(
        root=tmp_path,
        argv=["--ats", "greenhouse", "--since", "1", "--md-out", "digests"],
        provider_fetchers={"greenhouse": fetch_jobs},
        fetch_json=fetch_dataset,
        today="2026-07-15",
        now_ms=200_000,
    )
    assert result["companiesAvailable"] == 2
    assert result["companiesScanned"] == 1
    assert result["postingsKept"] == 1
    assert result["saved"] is True
    assert "https://jobs.example.com/1" in (tmp_path / "data/pipeline.md").read_text(encoding="utf-8")
    assert (tmp_path / "digests/2026-07-15.md").exists()


def test_liveness_core_ordering_and_codes() -> None:
    assert classify_liveness(status=404).code == "http_gone"
    assert classify_liveness(status=403, bodyText="Apply now").code == "access_blocked"
    bot = classify_liveness(status=200, bodyText="Just a moment, checking your browser")
    assert bot.result == "uncertain"
    assert bot.code == "bot_challenge"

    expired = classify_liveness(bodyText="This job is no longer available", applyControls=["Apply"])
    assert expired.result == "expired"
    assert expired.code == "expired_body"

    redirected = classify_liveness(
        requestedUrl="https://jobs.example.com/job/123456",
        finalUrl="https://jobs.example.com/search",
        bodyText="A" * 500,
        applyControls=["Apply"],
    )
    assert redirected.code == "redirected_off_posting"
    assert job_id_token("https://x/jobs/123456") == "123456"

    active = classify_liveness(bodyText="A" * 500, applyControls=["Aplikuj teraz"])
    assert active.result == "active"
    assert has_apply_control(["Wyślij CV"]) is True

    assert classify_liveness(bodyText="tiny").code == "insufficient_content"
    assert classify_liveness(bodyText="A" * 500).code == "no_apply_control"


def test_invite_extractors_and_company_similarity() -> None:
    assert normalize_company_name("Acme Technologies Inc.") == "acme"
    assert normalize_company_name("Acme (Example Group)") == "acme"
    assert normalize_company_name("Acme & Co") == normalize_company_name("Acme and Co")
    once = normalize_company_name("Acme Technologies Inc.")
    assert normalize_company_name(once) == once
    assert normalize_company_name("Northwind Solutions Group") != normalize_company_name("Northwind Technologies Holdings")

    assert company_similarity("acme", "acme") == 1
    assert company_similarity("acme example", "acme") > 0.5
    assert company_similarity("acme", "globex") == 0

    assert extract_company("Company: Example Industries\nRole: Analyst") == "Example Industries"
    assert extract_company("Schedule Your Phone Screen - Acme Opportunity") == "Acme"
    assert extract_company("Looking forward to interviewing with Example Corp for the role.") == "Example Corp"
    assert extract_company("no company signal here at all") is None
    assert extract_date("Interview scheduled for 2026-07-09 at 4pm") == "2026-07-09"
    assert extract_date("See you on July 9, 2026") == "2026-07-09"
    assert extract_req_id("Req ID: R260013984") == "R260013984"
    assert extract_req_id("Job ID: 43683") == "43683"


def test_invite_match_ranking() -> None:
    rows = [
        {"num": 201, "company": "Northwind Traders", "role": "Ops Coordinator", "status": "Applied", "date": "2026-05-01", "notes": ""},
        {"num": 202, "company": "Northwind Traders", "role": "HR Assistant", "status": "Interview", "date": "2026-05-15", "notes": ""},
        {"num": 203, "company": "Northwind Traders", "role": "Analyst", "status": "Rejected", "date": "2026-04-10", "notes": "Rejected 2026-04-20"},
    ]
    result = match_invite({"company": "Northwind Traders", "date": None, "reqId": None}, rows)
    assert len(result) == 3
    assert result[0]["appNumber"] == 202
    assert result[-1]["appNumber"] == 203

    mixed = rows + [{"num": 204, "company": "Northwind", "role": "Coordinator", "status": "Applied", "date": "2026-06-01", "notes": ""}]
    assert match_invite({"company": "Northwind", "date": None, "reqId": None}, mixed)[0]["appNumber"] == 204

    req_rows = [
        {"num": 301, "company": "Fabrikam", "role": "Engineer", "status": "Applied", "date": "2026-05-01", "notes": ""},
        {"num": 302, "company": "Fabrikam", "role": "Engineer II", "status": "Applied", "date": "2026-05-02", "notes": "req R-4821 mentioned"},
    ]
    assert match_invite({"company": "Fabrikam", "date": None, "reqId": "r-4821"}, req_rows)[0]["appNumber"] == 302

    full = analyze_invite("Schedule Your Phone Screen - Northwind Opportunity\nInterview scheduled for 2026-07-09.", rows)
    assert full["signals"]["company"] == "Northwind"
    assert full["signals"]["date"] == "2026-07-09"
    assert full["candidates"][0]["appNumber"] == 202


def test_local_parser_detect_and_security() -> None:
    from scripts.python.scanner.scan import (
        local_parser_detect,
        local_parser_fetch,
        local_parser_resolve_inside_root,
        local_parser_validate_arg,
        local_parser_validate_url,
    )

    assert local_parser_detect({"parser": {"command": "python3", "script": "p.py"}}) is True
    assert local_parser_detect({"parser": {"command": "node", "script": "p.js"}}) is True
    assert local_parser_detect({"parser": {"command": "bash", "script": "p.sh"}}) is True
    assert local_parser_detect({"parser": {"command": "rm", "script": "p.py"}}) is False
    assert local_parser_detect({"parser": {"command": "", "script": "p.py"}}) is False
    assert local_parser_detect({}) is False
    assert local_parser_detect({"parser": {}}) is False

    with pytest.raises(ValueError, match="URL must use http"):
        local_parser_validate_url("ftp://evil.com", "test")
    local_parser_validate_url("https://example.com", "test")

    with pytest.raises(ValueError, match="must not start with '-'"):
        local_parser_validate_arg("--rm", "test")
    local_parser_validate_arg("safe-value", "test")

    from pathlib import Path
    import tempfile
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        (root / "scripts").mkdir()
        (root / "scripts" / "parser.py").touch()
        result = local_parser_resolve_inside_root("scripts/parser.py", root, "test")
        assert result == (root / "scripts" / "parser.py").resolve()
        with pytest.raises(ValueError, match="escapes project root"):
            local_parser_resolve_inside_root("../../etc/passwd", root, "test")


def test_local_parser_fetch_executes_script(tmp_path) -> None:
    from scripts.python.scanner.scan import local_parser_fetch

    script = tmp_path / "parser.py"
    script.write_text(
        'import json, sys\n'
        'print(json.dumps([{"title": "Local Engineer", "url": "https://local.example/1", "company": "TestCo", "location": "Remote"}]))\n',
        encoding="utf-8",
    )
    entry = {"name": "TestCo", "careers_url": "https://testco.example.com/jobs", "parser": {"command": "python3", "script": "parser.py"}}
    jobs = local_parser_fetch(entry, {"root": tmp_path})
    assert len(jobs) == 1
    assert jobs[0]["title"] == "Local Engineer"
    assert jobs[0]["url"] == "https://local.example/1"
    assert jobs[0]["company"] == "TestCo"


def test_local_parser_fetch_handles_jobs_key(tmp_path) -> None:
    from scripts.python.scanner.scan import local_parser_fetch

    script = tmp_path / "parser.js"
    script.write_text(
        'console.log(JSON.stringify({jobs: [{title: "JS Engineer", url: "https://js.example/1", company: "JSCo"}]}))\n',
        encoding="utf-8",
    )
    entry = {"name": "JSCo", "parser": {"command": "node", "script": "parser.js"}}
    jobs = local_parser_fetch(entry, {"root": tmp_path})
    assert len(jobs) == 1
    assert jobs[0]["title"] == "JS Engineer"


def test_local_parser_fetch_interpolates_args(tmp_path) -> None:
    from scripts.python.scanner.scan import local_parser_fetch

    script = tmp_path / "echo.sh"
    script.write_text('#!/bin/sh\necho \'[]\'\n', encoding="utf-8")
    script.chmod(0o755)
    entry = {
        "name": "EchoCo",
        "careers_url": "https://echo.example.com/jobs",
        "parser": {"command": "bash", "script": "echo.sh", "args": ["url={careers_url}", "company={company}"]},
    }
    jobs = local_parser_fetch(entry, {"root": tmp_path})
    assert jobs == []


def test_local_parser_falls_back_to_api_on_failure(tmp_path) -> None:
    from scripts.python.scanner.scan import run_scan

    (tmp_path / "config").mkdir()
    (tmp_path / "data").mkdir()
    config = {
        "title_filter": {"positive": ["Engineer"]},
        "tracked_companies": [
            {"name": "FallbackCo", "careers_url": "https://job-boards.greenhouse.io/fallbackco", "parser": {"command": "python3", "script": "nonexistent.py"}},
        ],
    }

    def fallback_fetch(entry, _ctx):
        return [{"title": "Fallback Engineer", "url": "https://gh.example/1", "company": "FallbackCo", "location": "Remote"}]

    def fallback_detect(entry):
        return "greenhouse" in str(entry.get("careers_url", ""))

    providers = {"greenhouse-fallback": {"id": "greenhouse-fallback", "detect": fallback_detect, "fetch": fallback_fetch}}
    result = run_scan(root=tmp_path, config=config, providers=providers, dry_run=True, today="2026-07-15")
    assert result["counters"]["found"] == 1
    assert result["offers"][0]["url"] == "https://gh.example/1"


def test_run_scan_cross_listing_detection(tmp_path) -> None:
    from scripts.python.scanner.scan import run_scan, fingerprint_text

    (tmp_path / "config").mkdir()
    (tmp_path / "data").mkdir()
    desc = (
        "We are looking for a senior software engineer to join our growing platform team. "
        "The ideal candidate will have extensive experience building distributed systems, "
        "working with cloud infrastructure, and shipping production services at scale. "
        "You will design and implement core platform components that power our product. "
        "Requirements include strong proficiency in Python and Kubernetes, experience with "
        "microservice architectures, and a deep understanding of observability and monitoring. "
        "Nice to have experience with machine learning infrastructure and data pipelines."
    )
    fp = fingerprint_text(desc)
    assert fp, "fingerprint should be non-empty for long descriptions"

    (tmp_path / "data/scan-history.tsv").write_text(
        "url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\tfingerprint\tposted_date\n"
        f"https://old.example\t2026-07-10\tgh-api\tOld Engineer\tOldCo\tadded\tRemote\t{fp}\t2026-07-01\n",
        encoding="utf-8",
    )

    config = {
        "title_filter": {"positive": ["Engineer"]},
        "tracked_companies": [{"name": "NewCo", "provider": "fake", "careers_url": "https://newco.example.com"}],
    }
    now_ms = 2_000_000_000

    def fake_fetch(entry, _ctx):
        return [{"url": "https://newco.example/1", "company": "NewCo", "title": "Senior Engineer", "location": "Remote", "description": desc, "postedAt": now_ms}]

    providers = {"fake": {"id": "fake", "fetch": fake_fetch}}
    result = run_scan(root=tmp_path, config=config, providers=providers, dry_run=True, today="2026-07-15", now_ms=now_ms)
    assert len(result["crossListings"]) == 1
    assert result["crossListings"][0]["company"] == "NewCo"
    assert result["crossListings"][0]["matchedCompany"] == "OldCo"


def test_run_scan_empty_targets_tracked(tmp_path) -> None:
    from scripts.python.scanner.scan import run_scan

    (tmp_path / "config").mkdir()
    (tmp_path / "data").mkdir()
    config = {
        "title_filter": {"positive": ["Engineer"]},
        "tracked_companies": [
            {"name": "EmptyCo", "provider": "empty", "careers_url": "https://empty.example.com"},
            {"name": "FullCo", "provider": "full", "careers_url": "https://full.example.com"},
        ],
    }
    now_ms = 2_000_000_000

    def empty_fetch(entry, _ctx):
        return []

    def full_fetch(entry, _ctx):
        return [{"url": "https://full.example/1", "company": "FullCo", "title": "Full Engineer", "location": "Remote", "postedAt": now_ms}]

    providers = {"empty": {"id": "empty", "fetch": empty_fetch}, "full": {"id": "full", "fetch": full_fetch}}
    result = run_scan(root=tmp_path, config=config, providers=providers, dry_run=True, today="2026-07-15", now_ms=now_ms)
    assert "EmptyCo" in result["emptyTargets"]
    assert "FullCo" not in result["emptyTargets"]


def test_run_scan_json_output_shape(tmp_path) -> None:
    from scripts.python.scanner.scan import run_scan

    (tmp_path / "config").mkdir()
    (tmp_path / "data").mkdir()
    config = {
        "title_filter": {"positive": ["Engineer"]},
        "tracked_companies": [{"name": "JsonCo", "provider": "fake", "careers_url": "https://json.example.com"}],
    }
    now_ms = 2_000_000_000

    def fake_fetch(entry, _ctx):
        return [{"url": "https://json.example/1", "company": "JsonCo", "title": "Json Engineer", "location": "Remote", "postedAt": now_ms}]

    providers = {"fake": {"id": "fake", "fetch": fake_fetch}}
    result = run_scan(root=tmp_path, config=config, providers=providers, dry_run=True, today="2026-07-15", now_ms=now_ms)

    assert "date" in result
    assert "targets" in result
    assert "companies" in result
    assert "boards" in result
    assert "skippedNoProvider" in result
    assert "counters" in result
    assert "offers" in result
    assert "expired" in result
    assert "dropped" in result
    assert "invalid" in result
    assert "cooldown" in result
    assert "crossListings" in result
    assert "errors" in result
    assert "emptyTargets" in result
    assert "dryRun" in result
    assert result["dryRun"] is True
    assert isinstance(result["counters"], dict)
    for key in ["found", "filteredTitle", "filteredTier", "filteredLocation", "filteredPostingAge", "filteredSalary", "filteredContent", "filteredCooldown", "dupes", "newAdded", "errors", "filteredBlacklist", "skippedNoProvider", "trustAnnotated"]:
        assert key in result["counters"]
