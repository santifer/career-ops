from __future__ import annotations

import subprocess

from scripts.python.admin.manifesto import PAGE, manifesto_message, opener_for_platform
from scripts.python.admin.test_all import discover_pytest_targets, format_result, run_python_suite
from scripts.python.admin.validate_paths import covered, extract_array_from_source, validate_paths_coverage
from scripts.python.export.build_dashboard import build_dashboard, dashboard_output_name
from scripts.python.other.archive_posting import (
    archive_targets,
    dry_run_archive,
    extract_company_from_url,
    extract_pipeline_entries,
    output_names,
    parse_args,
    parse_page_title,
    slugify,
)
from scripts.python.other.openrouter_runner import (
    HttpResponse,
    add_to_pipeline,
    assert_safe_remote_url,
    build_cached_system_message,
    build_system_prompt,
    call_openrouter,
    cmd_apply,
    cmd_evaluate,
    cmd_scan,
    extract_company_slug,
    extract_free_model_ids,
    fetch_job_page,
    html_to_text,
    load_dotenv,
    load_persisted_blacklist,
    mark_pipeline_done,
    parse_portals,
    read_pipeline,
    save_blacklist,
    save_evaluation_outputs,
)


def test_manifesto_message_and_openers(tmp_path) -> None:
    (tmp_path / "MANIFESTO.md").write_text("\n".join(["# Title", "", "a", "b", "first line", "second line"]), encoding="utf-8")
    message = manifesto_message(tmp_path)
    assert "first line" in message
    assert "second line" in message
    assert PAGE in message
    assert opener_for_platform("darwin") == ("open", [PAGE], False)
    assert opener_for_platform("win32") == ("start", [PAGE], True)
    assert opener_for_platform("linux") == ("xdg-open", [PAGE], False)


def test_python_test_all_runner_discovery_filter_and_injection(tmp_path) -> None:
    tests = tmp_path / "scripts/python/tests"
    tests.mkdir(parents=True)
    (tests / "test_alpha.py").write_text("def test_a(): pass\n", encoding="utf-8")
    (tests / "test_beta.py").write_text("def test_b(): pass\n", encoding="utf-8")
    (tests / "helper.py").write_text("", encoding="utf-8")
    assert discover_pytest_targets(tmp_path) == ["scripts/python/tests/test_alpha.py", "scripts/python/tests/test_beta.py"]
    assert discover_pytest_targets(tmp_path, only="beta") == ["scripts/python/tests/test_beta.py"]

    calls = []

    def runner(cmd, cwd, text, capture_output):
        calls.append((cmd, cwd, text, capture_output))
        return subprocess.CompletedProcess(cmd, 0, stdout="ok\n", stderr="")

    result = run_python_suite(root=tmp_path, runner=runner)
    assert result["ok"] is True
    assert calls[0][0][:4] == [__import__("sys").executable, "-m", "compileall", "-q"]
    assert calls[1][0][1:3] == ["-m", "pytest"]
    assert "PASS:" in format_result(result)

    calls.clear()
    quick = run_python_suite(root=tmp_path, quick=True, only="alpha", runner=runner)
    assert quick["targets"] == ["scripts/python/tests/test_alpha.py"]
    assert len(calls) == 1

    missing = run_python_suite(root=tmp_path, only="missing", runner=runner)
    assert missing["ok"] is False
    assert "no Python tests matched" in missing["error"]


def test_validate_paths_extracts_arrays_and_detects_orphans() -> None:
    source = """
const SYSTEM_PATHS = [
  'CLAUDE.md',
  'providers/',
];
const USER_PATHS = [
  '.claude/settings.json',
  '.claude/hooks/',
];
"""
    assert extract_array_from_source(source, "SYSTEM_PATHS") == ["CLAUDE.md", "providers/"]
    all_paths = ["CLAUDE.md", "providers/", ".claude/settings.json", ".claude/hooks/"]
    assert covered(".gitignore", all_paths) is True
    assert covered("providers/justjoin.mjs", all_paths) is True
    assert covered("providers-sibling/justjoin.mjs", all_paths) is False
    assert covered("web/package.json", all_paths) is True
    assert covered("web-dashboard/index.html", all_paths) is False

    result = validate_paths_coverage(source, ["CLAUDE.md", "providers/x.mjs", "orphan.txt"])
    assert result["ok"] is False
    assert result["orphans"] == ["orphan.txt"]

    clean = validate_paths_coverage(source, ["CLAUDE.md", "providers/x.mjs"])
    assert clean["ok"] is True
    assert clean["tracked"] == 2


def test_build_dashboard_output_names_and_runner_injection(tmp_path) -> None:
    (tmp_path / "dashboard").mkdir()
    assert dashboard_output_name("win32") == "career-dashboard.exe"
    assert dashboard_output_name("linux") == "career-dashboard"

    calls = []

    def ok_runner(cmd, cwd):
        calls.append((cmd, cwd))
        return subprocess.CompletedProcess(cmd, 0)

    ok = build_dashboard(tmp_path, platform="linux", runner=ok_runner)
    assert ok["ok"] is True
    assert ok["output"] == "career-dashboard"
    assert calls[0][0] == ["go", "build", "-o", "career-dashboard", "."]
    assert calls[0][1] == tmp_path / "dashboard"

    def missing_runner(cmd, cwd):
        raise FileNotFoundError

    missing = build_dashboard(tmp_path, runner=missing_runner)
    assert missing["ok"] is False
    assert "Go toolchain not found" in missing["message"]

    def fail_runner(cmd, cwd):
        return subprocess.CompletedProcess(cmd, 7)

    failed = build_dashboard(tmp_path, runner=fail_runner)
    assert failed["code"] == 7
    assert failed["ok"] is False


def test_archive_posting_helpers_and_dry_run(tmp_path) -> None:
    assert slugify("Senior AI Engineer / LLM_Ops!") == "senior-ai-engineer-llm-ops"
    assert parse_page_title("Senior AI Engineer at Anthropic") == {"role": "Senior AI Engineer", "company": "Anthropic"}
    assert parse_page_title("Anthropic | Senior AI Engineer") == {"company": "Anthropic", "role": "Senior AI Engineer"}
    assert parse_page_title("Senior AI Engineer - Anthropic") == {"role": "Senior AI Engineer", "company": "Anthropic"}
    assert parse_page_title("Jobs - Greenhouse") == {"company": None, "role": "Jobs"}
    assert extract_company_from_url("https://boards.greenhouse.io/openai/jobs/456") == "openai"
    assert extract_company_from_url("https://jobs.eu.lever.co/elevenlabs/abc") == "elevenlabs"
    assert extract_company_from_url("https://jobs.ashbyhq.com/anthropic/abc") == "anthropic"
    assert extract_company_from_url("https://example.com/jobs/1") is None

    entries = extract_pipeline_entries(
        "- [ ] https://example.com/job/1 | Acme | Senior PM\n"
        "- [x] https://example.com/done | Done | Role\n"
        "- [ ] https://example.com/job/2\n"
    )
    assert entries == [
        {"url": "https://example.com/job/1", "company": "Acme", "role": "Senior PM"},
        {"url": "https://example.com/job/2", "company": None, "role": None},
    ]
    assert output_names("Acme", "Senior PM", today="2026-07-15") == {
        "filename": "2026-07-15_acme_senior-pm.pdf",
        "reference": "local:jds/2026-07-15_acme_senior-pm.pdf",
        "path": "jds/2026-07-15_acme_senior-pm.pdf",
    }
    assert parse_args(["--dry-run", "--company=Acme", "--role", "Senior PM", "https://x"]) .company == "Acme"

    dry = dry_run_archive(entries, today="2026-07-15")
    assert dry[0]["reference"] == "local:jds/2026-07-15_acme_senior-pm.pdf"
    assert dry[1]["company"] == "unknown"
    assert dry[1]["role"] == "job"

    calls = []

    def renderer(target, output_path):
        calls.append((target, output_path))
        output_path.write_bytes(b"pdf")
        return 3

    rendered = archive_targets([entries[0]], root=tmp_path, today="2026-07-15", renderer=renderer)
    assert rendered[0]["size"] == 3
    assert (tmp_path / "jds/2026-07-15_acme_senior-pm.pdf").read_bytes() == b"pdf"


def test_openrouter_runner_helpers_and_guards(tmp_path) -> None:
    payload = {
        "data": [
            {"id": "z/paid", "pricing": {"prompt": "1", "completion": "0"}},
            {"id": "meta-llama/free", "pricing": {"prompt": "0", "completion": "0"}},
            {"id": "google/free", "pricing": {"prompt": "0", "completion": "0"}},
            {"id": "abc/free", "pricing": {"prompt": "0", "completion": "0"}},
        ]
    }
    assert extract_free_model_ids(payload) == ["google/free", "meta-llama/free", "abc/free"]
    assert build_cached_system_message("SYS")["content"][0]["cache_control"] == {"type": "ephemeral"}
    assert "CV (Markdown)" in build_system_prompt("mode", {"shared": "s", "profileMode": "p", "profile": "y", "cv": "cv"})

    (tmp_path / ".env").write_text("OPENROUTER_API_KEY='secret'\nCAREER_OPS_MODEL= model-x \n", encoding="utf-8")
    env = {}
    load_dotenv(tmp_path, env)
    assert env["OPENROUTER_API_KEY"] == "secret"
    assert env["CAREER_OPS_MODEL"] == "model-x"

    blacklist = tmp_path / "data/model-blacklist.json"
    save_blacklist(blacklist, {"b", "a"})
    assert load_persisted_blacklist(blacklist) == {"a", "b"}

    assert assert_safe_remote_url("https://example.com/jobs").hostname == "example.com"
    for url in ["file:///tmp/x", "http://localhost:3000", "http://10.0.0.1/x", "http://192.168.1.2/x"]:
        try:
            assert_safe_remote_url(url)
        except ValueError as error:
            assert "Refusing" in str(error)
        else:
            raise AssertionError(f"unsafe URL accepted: {url}")

    assert html_to_text("<html><script>x</script><body><h1>Title</h1><footer>f</footer> Body</body></html>") == "Title Body"
    assert fetch_job_page("https://example.com", get_text=lambda _url: HttpResponse(200, "<b>Hello</b>")) == "Hello"


def test_openrouter_runner_portals_pipeline_and_model_rotation(tmp_path) -> None:
    raw = """
title_filter:
  positive: [Engineer]
  negative: [Intern]
tracked_companies:
  - name: Acme
    api: https://api.example.com/jobs
  - name: Disabled
    api: https://api.example.com/nope
    enabled: false
  - name: Site Only
    careers_url: https://example.com
"""
    parsed = parse_portals(raw)
    assert parsed["titleMatches"]("Senior Engineer") is True
    assert parsed["titleMatches"]("Engineer Intern") is False
    assert parsed["companies"] == [{"name": "Acme", "api": "https://api.example.com/jobs"}]

    (tmp_path / "data").mkdir()
    (tmp_path / "data/applications.md").write_text("already https://jobs.example.com/old", encoding="utf-8")
    added = add_to_pipeline(
        [
            {"url": "https://jobs.example.com/one", "company": "Acme", "role": "Engineer", "location": "Remote"},
            {"url": "https://jobs.example.com/old", "company": "Acme", "role": "Engineer"},
            {"url": "https://jobs.example.com/one", "company": "Acme", "role": "Engineer"},
        ],
        root=tmp_path,
        today="2026-07-15",
    )
    assert added == 1
    assert read_pipeline(tmp_path)[0]["url"] == "https://jobs.example.com/one"
    mark_pipeline_done("https://jobs.example.com/one", tmp_path)
    assert "- [x] https://jobs.example.com/one" in (tmp_path / "data/pipeline.md").read_text(encoding="utf-8")

    calls = []

    def post_json(_url, payload, _headers, _timeout_ms):
      calls.append(payload["model"])
      if payload["model"] == "bad":
          raise RuntimeError("HTTP 403: denied")
      return {"choices": [{"message": {"content": "ok"}}]}

    blacklist = set()
    text, model = call_openrouter("sys", "user", api_key="k", models=["bad", "good"], blacklist=blacklist, post_json=post_json)
    assert (text, model) == ("ok", "good")
    assert blacklist == {"bad"}
    assert calls == ["bad", "good"]


def test_openrouter_runner_commands_save_outputs(tmp_path) -> None:
    (tmp_path / "config").mkdir()
    (tmp_path / "modes").mkdir()
    (tmp_path / "reports").mkdir()
    (tmp_path / "config/portals.yml").write_text(
        """
title_filter:
  positive: [Engineer]
tracked_companies:
  - name: Acme
    api: https://api.example.com/jobs
""",
        encoding="utf-8",
    )
    (tmp_path / "modes/oferta.md").write_text("oferta", encoding="utf-8")
    (tmp_path / "modes/apply.md").write_text("apply", encoding="utf-8")
    (tmp_path / "modes/_shared.md").write_text("shared", encoding="utf-8")
    (tmp_path / "modes/_profile.md").write_text("profile mode", encoding="utf-8")
    (tmp_path / "config/profile.yml").write_text("name: Candidate", encoding="utf-8")
    (tmp_path / "cv.md").write_text("cv", encoding="utf-8")

    scan = cmd_scan(
        tmp_path,
        today="2026-07-15",
        fetch_json=lambda _url: {
            "jobs": [
                {"title": "Senior Engineer", "absolute_url": "https://jobs.example.com/acme/1", "location": {"name": "Remote"}},
                {"title": "Design Intern", "absolute_url": "https://jobs.example.com/acme/2"},
            ]
        },
    )
    assert scan["matches"] == 1
    assert scan["added"] == 1

    def fake_call(system_prompt, user_message, **kwargs):
        assert "shared" in system_prompt
        assert "Evaluate this job listing" in user_message or "application form answers" in user_message
        return "**Legitimacy:** High Confidence\nScore: 4.2\nCompany: Acme", "model-x"

    evaluated = cmd_evaluate(
        "https://job-boards.greenhouse.io/acme/jobs/1",
        root=tmp_path,
        api_key="k",
        models=["model-x"],
        call_model=fake_call,
        fetch_page=lambda _url: "Company: Acme\nSenior Engineer",
        today="2026-07-15",
    )
    assert evaluated["report"] == "reports/001-acme-2026-07-15.md"
    assert (tmp_path / evaluated["report"]).exists()
    assert (tmp_path / evaluated["trackerAddition"]).read_text(encoding="utf-8").splitlines()[1].startswith("1\t2026-07-15\tAcme")
    assert extract_company_slug("Senior Engineer at MegaCorp") == "megacorp"

    saved = save_evaluation_outputs(
        result="Score: 3",
        input_label="pasted",
        jd_text="Company: Beta",
        root=tmp_path,
        today="2026-07-15",
    )
    assert saved["report"] == "reports/002-beta-2026-07-15.md"

    applied = cmd_apply("001", root=tmp_path, api_key="k", models=["model-x"], call_model=fake_call)
    assert applied["model"] == "model-x"
    assert "Acme" in applied["answers"]
