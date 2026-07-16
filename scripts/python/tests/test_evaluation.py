import math
import json
import subprocess

from scripts.python.evaluation.eval_golden import (
    evaluate_cases,
    fixture_model_id,
    format_report,
    load_cases,
    median,
    parse_summary,
    replay_completion,
)
from scripts.python.evaluation.openai_eval import (
    build_report_content,
    build_system_prompt,
    call_openai_compatible,
    evaluate_job,
    next_report_number,
    parse_score_summary,
    read_file,
    save_report,
    slugify_company,
    strip_score_summary,
    validate_openai_endpoint,
)
from scripts.python.evaluation.openai_tailor import (
    build_tailor_prompt,
    call_tailor_endpoint,
    candidate_name_from_profile,
    clean_tailored_html,
    company_slug_from_report_path,
    output_filename,
    pdf_filename,
    report_num_from_path,
    tailor_cv,
)
from scripts.python.evaluation.ollama_eval import (
    ProbeError,
    build_ollama_payload_options,
    call_ollama,
    evaluate_job as evaluate_ollama_job,
    probe_ollama,
    save_ollama_report,
    validate_ollama_endpoint,
)
from scripts.python.evaluation.gemini_eval import (
    build_gemini_prompt,
    call_gemini,
    evaluate_job as evaluate_gemini_job,
    next_report_number as next_gemini_report_number,
    normalized_tracker_score,
    save_gemini_outputs,
    tsv_safe,
    validate_evaluation_shape,
)


def summary(score="4.2", archetype="AI Platform"):
    return f"""
Report text
---SCORE_SUMMARY---
COMPANY: Acme
ROLE: Engineer
SCORE: {score}
ARCHETYPE: {archetype}
LEGITIMACY: High Confidence
---END_SUMMARY---
"""


def full_gemini_report(score="4.2", archetype="AI Platform"):
    blocks = "\n".join(f"## Block {label}\ncontent" for label in "ABCDEFG")
    return blocks + "\n" + summary(score=score, archetype=archetype)


def test_eval_golden_parse_summary_fixture_id_and_median():
    parsed = parse_summary(summary())
    assert parsed == {"score": 4.2, "archetype": "ai platform"}

    missing = parse_summary("no summary")
    assert math.isnan(missing["score"])
    assert missing["archetype"] == "unknown"

    bad_score = parse_summary(summary(score="n/a"))
    assert math.isnan(bad_score["score"])

    assert fixture_model_id("deepseek/deepseek-chat:free") == "deepseek-deepseek-chat-free"
    assert median([]) == 0
    assert median([3, 1, 2]) == 2
    assert median([1, 4, 2, 3]) == 2.5


def test_eval_golden_load_cases_and_replay(tmp_path):
    golden = tmp_path / "golden"
    fixtures = tmp_path / "fixtures"
    golden.mkdir()
    fixtures.mkdir()
    (golden / "case-a.json").write_text(
        json.dumps({"id": "case-a", "jd": "JD", "label": {"archetype": "AI Platform", "score": 4.0}}),
        encoding="utf-8",
    )
    (fixtures / "case-a__cheap-stub.txt").write_text(summary(score="4.2", archetype="AI Platform"), encoding="utf-8")

    cases = load_cases(golden)
    assert cases[0]["id"] == "case-a"
    assert replay_completion(cases[0], fixture_dir=fixtures, model="cheap-stub").startswith("\nReport text")

    try:
        replay_completion(cases[0], fixture_dir=fixtures, model="missing/model")
    except FileNotFoundError as error:
        assert "missing replay fixture" in str(error)
    else:
        raise AssertionError("missing fixture accepted")


def test_eval_golden_rejects_invalid_or_empty_cases(tmp_path):
    golden = tmp_path / "golden"
    golden.mkdir()
    (golden / "bad.json").write_text(json.dumps({"id": "bad", "jd": "JD", "label": {"score": 4.0}}), encoding="utf-8")
    try:
        load_cases(golden)
    except ValueError as error:
        assert "invalid golden case" in str(error)
    else:
        raise AssertionError("invalid golden case accepted")

    empty = tmp_path / "empty"
    empty.mkdir()
    try:
        load_cases(empty)
    except ValueError as error:
        assert "no golden cases" in str(error)
    else:
        raise AssertionError("empty golden dir accepted")


def test_eval_golden_evaluate_cases_pass_and_failures():
    cases = [
        {"id": "a", "jd": "JD", "label": {"archetype": "AI Platform", "score": 4.0}},
        {"id": "b", "jd": "JD", "label": {"archetype": "Backend", "score": 3.0}},
        {"id": "c", "jd": "JD", "label": {"archetype": "Data", "score": 2.0}},
        {"id": "d", "jd": "JD", "label": {"archetype": "Product", "score": 5.0}},
        {"id": "e", "jd": "JD", "label": {"archetype": "Ops", "score": 1.0}},
    ]
    outputs = {
        "a": summary(score="4.1", archetype="AI Platform"),
        "b": summary(score="3.4", archetype="Backend"),
        "c": summary(score="2.6", archetype="Data"),
        "d": summary(score="4.9", archetype="Product"),
        "e": summary(score="1.0", archetype="Other"),
    }
    result = evaluate_cases(cases, model="cheap-stub", completion_provider=lambda case: outputs[case["id"]])

    assert result["summary"]["archetypeAgreement"] == 0.8
    assert result["summary"]["passed"] is True
    assert result["summary"]["scored"] == 5
    assert result["rows"][2]["scoreOk"] is False
    assert result["rows"][4]["archetypeMatch"] is False
    assert "PASS" in format_report(result)

    failed = evaluate_cases(cases[:1], model="cheap-stub", completion_provider=lambda _case: (_ for _ in ()).throw(RuntimeError("boom")))
    assert failed["summary"]["passed"] is False
    assert failed["summary"]["unscored"] == 1
    assert failed["rows"][0]["error"] == "boom"


def test_openai_eval_endpoint_guards_and_prompt(tmp_path):
    assert validate_openai_endpoint("http://localhost:1234/v1")["isLoopback"] is True
    assert validate_openai_endpoint("https://api.example.com/v1", "key")["host"] == "api.example.com"

    for base_url, api_key, expected in [
        ("http://api.example.com/v1", "key", "non-HTTPS"),
        ("https://api.example.com/v1", "", "No API key"),
        ("not-a-url", "", "Invalid"),
    ]:
        try:
            validate_openai_endpoint(base_url, api_key)
        except ValueError as error:
            assert expected in str(error)
        else:
            raise AssertionError(f"endpoint accepted: {base_url}")

    prompt = build_system_prompt(shared_context="shared", oferta_logic="oferta", cv_content="cv")
    assert "SYSTEM CONTEXT" in prompt
    assert "SCORE_SUMMARY" in prompt
    assert read_file(tmp_path / "missing.md", "missing") == "[missing not found — skipping]"


def test_openai_eval_call_and_summary_parsing():
    captured = {}

    def post_json(url, payload, headers, timeout_ms):
        captured["url"] = url
        captured["payload"] = payload
        captured["headers"] = headers
        captured["timeout_ms"] = timeout_ms
        return {"choices": [{"message": {"content": summary(score="3.7", archetype="Backend")}}]}

    text = call_openai_compatible(
        jd_text="JD",
        system_prompt="SYSTEM",
        model="model-x",
        base_url="https://api.example.com/v1",
        api_key="secret",
        timeout_ms=1000,
        post_json=post_json,
    )

    assert "SCORE_SUMMARY" in text
    assert captured["url"] == "https://api.example.com/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer secret"
    assert captured["payload"]["messages"][1]["content"] == "JOB DESCRIPTION TO EVALUATE:\n\nJD"
    assert parse_score_summary(text)["score"] == "3.7"
    assert parse_score_summary("no summary")["company"] == "unknown"
    assert "SCORE_SUMMARY" not in strip_score_summary(text)

    try:
        call_openai_compatible(jd_text="JD", system_prompt="SYSTEM", model="m", base_url="https://x", timeout_ms=0, post_json=post_json)
    except ValueError as error:
        assert "timeout_ms" in str(error)
    else:
        raise AssertionError("invalid timeout accepted")

    try:
        call_openai_compatible(jd_text="JD", system_prompt="SYSTEM", model="m", base_url="https://x", post_json=lambda *_args: {"choices": []})
    except ValueError as error:
        assert "empty response" in str(error)
    else:
        raise AssertionError("empty response accepted")


def test_openai_eval_save_report_and_evaluate_job(tmp_path):
    (tmp_path / "modes").mkdir()
    (tmp_path / "modes/_shared.md").write_text("shared", encoding="utf-8")
    (tmp_path / "modes/oferta.md").write_text("oferta", encoding="utf-8")
    (tmp_path / "cv.md").write_text("cv", encoding="utf-8")
    (tmp_path / "reports").mkdir()
    (tmp_path / "reports/009-old.md").write_text("old", encoding="utf-8")

    assert next_report_number(tmp_path / "reports") == "010"
    assert slugify_company("Acme, Inc!") == "acme-inc"
    parsed = parse_score_summary(summary(score="4.0", archetype="AI"))
    content = build_report_content(parsed, summary(score="4.0", archetype="AI"), model="m", endpoint_host="host", today="2026-07-15")
    assert "**Tool:** OpenAI-compatible (m @ host)" in content

    saved = save_report(summary(score="4.0", archetype="AI"), root=tmp_path, model="m", endpoint_host="host", today="2026-07-15")
    assert saved["num"] == "010"
    assert saved["filename"] == "010-acme-2026-07-15.md"
    assert "| 010 | 2026-07-15 | Acme | Engineer | 4.0/5 |" in saved["trackerRow"]

    def post_json(_url, _payload, _headers, _timeout_ms):
        return {"choices": [{"message": {"content": summary(score="4.5", archetype="Platform")}}]}

    result = evaluate_job(
        "JD",
        root=tmp_path,
        base_url="http://localhost:1234/v1",
        model="local",
        save=True,
        post_json=post_json,
        today="2026-07-16",
    )

    assert result["endpointHost"] == "localhost"
    assert result["summary"]["archetype"] == "Platform"
    assert result["report"]["filename"] == "011-acme-2026-07-16.md"


def test_openai_tailor_helpers_and_endpoint():
    assert company_slug_from_report_path("reports/042-acme-inc-2026-07-15.md") == "acme-inc"
    assert company_slug_from_report_path("bad.md") == "unknown-company"
    assert report_num_from_path("042-acme.md") == "042"
    assert report_num_from_path("bad.md") == "001"
    assert clean_tailored_html("```html\n<!DOCTYPE html>\n</html>\n```") == "<!DOCTYPE html>\n</html>"
    assert candidate_name_from_profile("name: Ada Lovelace\n") == "ada-lovelace"
    assert candidate_name_from_profile("full_name: Grace Hopper\n") == "grace-hopper"
    assert candidate_name_from_profile("bad: [") == "candidate"
    assert output_filename("ada", "acme") == "cv-ada-acme.html"
    assert pdf_filename("ada", "acme", "2026-07-15") == "cv-ada-acme-2026-07-15.pdf"

    prompt = build_tailor_prompt(
        shared_context="shared",
        pdf_mode_logic="pdf",
        cv_content="cv",
        profile_content="profile",
        template_html="{{NAME}}",
    )
    assert "NEVER invent skills" in prompt
    assert "{{PLACEHOLDERS}}" in prompt

    captured = {}

    def post_json(url, payload, headers, timeout_ms):
        captured["url"] = url
        captured["payload"] = payload
        captured["headers"] = headers
        captured["timeout_ms"] = timeout_ms
        return {"choices": [{"message": {"content": "```html\n<!DOCTYPE html><html></html>\n```"}}]}

    html = call_tailor_endpoint(
        jd_text="JD",
        report_text="REPORT",
        system_prompt="PROMPT",
        model="gpt",
        base_url="https://api.example.com/v1",
        api_key="key",
        post_json=post_json,
    )

    assert html == "<!DOCTYPE html><html></html>"
    assert captured["url"] == "https://api.example.com/v1/chat/completions"
    assert captured["payload"]["temperature"] == 0.2
    assert "EVALUATION REPORT" in captured["payload"]["messages"][1]["content"]
    assert captured["headers"]["Authorization"] == "Bearer key"


def test_openai_tailor_end_to_end_saves_html(tmp_path):
    (tmp_path / "modes").mkdir()
    (tmp_path / "config").mkdir()
    (tmp_path / "templates").mkdir()
    (tmp_path / "jds").mkdir()
    (tmp_path / "reports").mkdir()
    (tmp_path / "modes/_shared.md").write_text("shared", encoding="utf-8")
    (tmp_path / "modes/pdf.md").write_text("pdf", encoding="utf-8")
    (tmp_path / "cv.md").write_text("cv", encoding="utf-8")
    (tmp_path / "config/profile.yml").write_text("name: Ada Lovelace\n", encoding="utf-8")
    (tmp_path / "templates/cv-template.html").write_text("{{NAME}}", encoding="utf-8")
    jd = tmp_path / "jds/job.txt"
    report = tmp_path / "reports/042-acme-inc-2026-07-15.md"
    jd.write_text("JD", encoding="utf-8")
    report.write_text("REPORT", encoding="utf-8")

    def post_json(_url, _payload, _headers, _timeout_ms):
        return {"choices": [{"message": {"content": "<!DOCTYPE html><html>Ada</html>"}}]}

    result = tailor_cv(
        jd_path=jd,
        report_path=report,
        root=tmp_path,
        base_url="http://localhost:1234/v1",
        model="local",
        post_json=post_json,
        today="2026-07-16",
    )

    assert result["filename"] == "cv-ada-lovelace-acme-inc.html"
    assert result["reportNum"] == "042"
    assert result["nextPdf"] == "output/cv-ada-lovelace-acme-inc-2026-07-16.pdf"
    assert (tmp_path / "output/cv-ada-lovelace-acme-inc.html").read_text(encoding="utf-8") == "<!DOCTYPE html><html>Ada</html>"

    try:
        tailor_cv(jd_path=tmp_path / "missing.txt", report_path=report, root=tmp_path, base_url="http://localhost:1234/v1", post_json=post_json)
    except FileNotFoundError as error:
        assert "JD file not found" in str(error)
    else:
        raise AssertionError("missing JD accepted")


def test_ollama_eval_endpoint_probe_and_payload():
    assert validate_ollama_endpoint("http://localhost:11434")["isLoopback"] is True
    try:
        validate_ollama_endpoint("http://remote.example:11434")
    except ValueError as error:
        assert "Remote Ollama endpoint" in str(error)
    else:
        raise AssertionError("remote ollama endpoint accepted")
    assert validate_ollama_endpoint("http://remote.example:11434", allow_remote=True)["host"] == "remote.example"

    probe_ollama("http://localhost:11434", get=lambda url, timeout: (200, '{"models":[]}'))
    try:
        probe_ollama("http://localhost:11434", get=lambda url, timeout: (500, "bad"))
    except ProbeError as error:
        assert "HTTP 500" in str(error)
    else:
        raise AssertionError("failed probe accepted")

    assert build_ollama_payload_options() == {"num_ctx": 32768}

    captured = {}

    def post_json(url, payload, headers, timeout_ms):
        captured["url"] = url
        captured["payload"] = payload
        captured["headers"] = headers
        captured["timeout_ms"] = timeout_ms
        return {"choices": [{"message": {"content": summary(score="3.0", archetype="Local")}}]}

    text = call_ollama(
        jd_text="JD",
        system_prompt="SYSTEM",
        model="llama",
        base_url="http://localhost:11434/v1",
        post_json=post_json,
    )
    assert "SCORE_SUMMARY" in text
    assert captured["url"] == "http://localhost:11434/v1/chat/completions"
    assert captured["payload"]["options"] == {"num_ctx": 32768}
    assert "Authorization" not in captured["headers"]


def test_ollama_eval_save_report_and_evaluate_job(tmp_path):
    (tmp_path / "modes").mkdir()
    (tmp_path / "modes/_shared.md").write_text("shared", encoding="utf-8")
    (tmp_path / "modes/oferta.md").write_text("oferta", encoding="utf-8")
    (tmp_path / "cv.md").write_text("cv", encoding="utf-8")

    saved = save_ollama_report(summary(score="4.1", archetype="Local"), root=tmp_path, model="llama", today="2026-07-15")
    assert saved["filename"] == "001-acme-2026-07-15.md"
    assert "**Tool:** Ollama (llama)" in (tmp_path / "reports" / saved["filename"]).read_text(encoding="utf-8")

    captured = {}

    def post_json(url, payload, headers, timeout_ms):
        captured["url"] = url
        captured["payload"] = payload
        return {"choices": [{"message": {"content": summary(score="4.2", archetype="Local")}}]}

    result = evaluate_ollama_job(
        "JD",
        root=tmp_path,
        base_url="http://localhost:11434",
        model="llama",
        get=lambda _url, _timeout: (200, "{}"),
        post_json=post_json,
        today="2026-07-16",
    )

    assert captured["url"] == "http://localhost:11434/v1/chat/completions"
    assert result["endpointHost"] == "localhost"
    assert result["summary"]["score"] == "4.2"
    assert result["report"]["filename"] == "002-acme-2026-07-16.md"


def test_gemini_eval_shape_validation_and_helpers(tmp_path):
    assert validate_evaluation_shape(full_gemini_report()) == []
    issues = validate_evaluation_shape("## Block A\n---SCORE_SUMMARY---\nCOMPANY: X\nROLE: unknown\nSCORE: 6\nARCHETYPE: unknown\nLEGITIMACY: unknown\n---END_SUMMARY---")
    assert "missing Block B" in issues
    assert "SCORE_SUMMARY ROLE is required" in issues
    assert "SCORE_SUMMARY ARCHETYPE is required" in issues
    assert "SCORE_SUMMARY score must be a number between 0 and 5" in issues
    assert validate_evaluation_shape("no summary")[-1] == "missing SCORE_SUMMARY block"

    assert tsv_safe("A\tB\nC") == "A B C"
    assert normalized_tracker_score("?") == "N/A"
    assert normalized_tracker_score("4.2") == "4.2/5"
    assert normalized_tracker_score("4.2/5") == "4.2/5"

    reports = tmp_path / "reports"
    reports.mkdir()
    (reports / "010-acme.md").write_text("x", encoding="utf-8")
    assert next_gemini_report_number(reports) == "011"


def test_gemini_eval_prompt_call_and_save(tmp_path):
    (tmp_path / "modes").mkdir()
    (tmp_path / "config").mkdir()
    (tmp_path / "modes/_shared.md").write_text("shared", encoding="utf-8")
    (tmp_path / "modes/oferta.md").write_text("oferta", encoding="utf-8")
    (tmp_path / "modes/_profile.md").write_text("profile md", encoding="utf-8")
    (tmp_path / "config/profile.yml").write_text("profile: yml", encoding="utf-8")
    (tmp_path / "cv.md").write_text("cv", encoding="utf-8")

    prompt = build_gemini_prompt(tmp_path)
    assert "profile: yml" in prompt
    assert "profile md" in prompt

    captured = {}

    def generate_content(api_key, model, parts):
        captured["api_key"] = api_key
        captured["model"] = model
        captured["parts"] = parts
        return full_gemini_report(score="4.4", archetype="AI")

    text = call_gemini(jd_text="JD", system_prompt="PROMPT", api_key="key", model="gemini", generate_content=generate_content)
    assert "SCORE_SUMMARY" in text
    assert captured["parts"][1] == "\n\nJOB DESCRIPTION TO EVALUATE:\n\nJD"

    try:
        call_gemini(jd_text="JD", system_prompt="PROMPT", api_key="", generate_content=generate_content)
    except ValueError as error:
        assert "GEMINI_API_KEY" in str(error)
    else:
        raise AssertionError("missing Gemini key accepted")

    saved = save_gemini_outputs(full_gemini_report(score="4.4", archetype="AI"), root=tmp_path, model="gemini", today="2026-07-15")
    assert saved["reportFilename"] == "001-acme-2026-07-15.md"
    assert (tmp_path / "reports/001-acme-2026-07-15.md").exists()
    tracker = (tmp_path / "batch/tracker-additions/001-acme.tsv").read_text(encoding="utf-8")
    assert "Gemini evaluation" in tracker
    assert "\t4.4/5\t" in tracker

    result = evaluate_gemini_job(
        "JD",
        root=tmp_path,
        api_key="key",
        model="gemini",
        generate_content=generate_content,
        today="2026-07-16",
    )
    assert result["summary"]["score"] == "4.4"
    assert result["saved"]["reportFilename"] == "002-acme-2026-07-16.md"

    try:
        call_gemini(jd_text="JD", system_prompt="PROMPT", api_key="key", generate_content=lambda *_args: "bad")
    except ValueError as error:
        assert "invalid career-ops report" in str(error)
    else:
        raise AssertionError("invalid Gemini output accepted")


def test_read_jd_from_args_file_and_inline(tmp_path):
    from argparse import Namespace
    from scripts.python.evaluation.openai_eval import read_jd_from_args

    jd_file = tmp_path / "jd.txt"
    jd_file.write_text("Job Title at Big Corp\nRequirements: Python", encoding="utf-8")

    args_file = Namespace(file=str(jd_file), jd=None)
    assert read_jd_from_args(args_file) == "Job Title at Big Corp\nRequirements: Python"

    args_inline = Namespace(file=None, jd=["Hello", "World"])
    assert read_jd_from_args(args_inline) == "Hello\nWorld"

    args_empty = Namespace(file=None, jd=None)
    assert read_jd_from_args(args_empty) == ""

    bad_file = Namespace(file=str(tmp_path / "nonexistent.txt"), jd=None)
    try:
        read_jd_from_args(bad_file)
    except FileNotFoundError as e:
        assert "not found" in str(e)
    else:
        raise AssertionError("should have raised FileNotFoundError")


def test_load_tailor_context_reads_all_files(tmp_path):
    from scripts.python.evaluation.openai_tailor import load_tailor_context

    (tmp_path / "modes").mkdir()
    (tmp_path / "modes" / "_shared.md").write_text("shared ctx", encoding="utf-8")
    (tmp_path / "modes" / "pdf.md").write_text("pdf logic", encoding="utf-8")
    (tmp_path / "config").mkdir()
    (tmp_path / "config" / "profile.yml").write_text("name: Test", encoding="utf-8")
    (tmp_path / "cv.md").write_text("# CV", encoding="utf-8")
    (tmp_path / "templates").mkdir()
    (tmp_path / "templates" / "cv-template.html").write_text("<html></html>", encoding="utf-8")

    ctx = load_tailor_context(tmp_path)
    assert ctx["shared_context"] == "shared ctx"
    assert ctx["pdf_mode_logic"] == "pdf logic"
    assert ctx["cv_content"] == "# CV"
    assert ctx["profile_content"] == "name: Test"
    assert ctx["template_html"] == "<html></html>"


def test_merge_tracker_calls_runner(tmp_path):
    from scripts.python.evaluation.gemini_eval import merge_tracker

    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        return subprocess.CompletedProcess(cmd, 0, stdout="ok", stderr="")

    result = merge_tracker(root=tmp_path, runner=fake_run)
    assert result["ok"] is True
    assert result["stdout"] == "ok"
    assert calls[0] == ["python", "-m", "scripts.python.tracker.merge_tracker"]

    def failing_run(cmd, **kwargs):
        return subprocess.CompletedProcess(cmd, 1, stdout="", stderr="err")

    result_fail = merge_tracker(root=tmp_path, runner=failing_run)
    assert result_fail["ok"] is False
    assert result_fail["stderr"] == "err"
