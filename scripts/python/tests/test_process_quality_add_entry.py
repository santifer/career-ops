from __future__ import annotations

import json

from scripts.python.tracker.add_entry import (
    apply_add,
    article_digest_has_entry,
    cv_has_entry,
    insert_into_cv_section,
    normalize_key,
)
from scripts.python.tracker.process_quality import (
    aggregate_process_quality,
    extract_friction,
    main as process_quality_main,
    parse_active_interviews,
)


def table(rows: list[str]) -> str:
    return "\n".join(
        [
            "| Company | Role | Round | Date/Time | Interviewer | Status | Notes |",
            "|---------|------|-------|-----------|-------------|--------|-------|",
            *rows,
        ]
    )


def test_parse_active_interviews_validation_and_scope() -> None:
    assert parse_active_interviews(None) == []
    assert parse_active_interviews("") == []
    assert parse_active_interviews("# no table") == []

    markdown = (
        "# Active Interviews\n\n"
        + table(
            [
                "| Acme | Backend Engineer | Prescreen | 2026-06-01 | Jane | Scheduled | ok |",
                "| Too | Few | Cells |",
                "| Beta | Coordinator | Round 1 | 2026-06-08 | HM | Scheduled | ok 2 |",
            ]
        )
        + "\n\nOther table\n\n| Foo | Bar |\n|-----|-----|\n| unrelated | table |"
    )
    rows = parse_active_interviews(markdown)
    assert len(rows) == 2
    assert rows[0]["Company"] == "Acme"
    assert "Foo" not in rows[0]


def test_extract_and_aggregate_process_friction() -> None:
    assert extract_friction(None) == {"hasFriction": False, "reason": ""}
    assert extract_friction({"notes": "[PROCESS-FRICTION: padded reason ]"}) == {
        "hasFriction": True,
        "reason": "padded reason",
    }

    rows = [
        {"Company": "Acme", "Notes": "fine"},
        {"Company": "acme", "Notes": "[process-friction: reason A]"},
        {"Company": "Beta", "Notes": "[process-friction]"},
        {"Company": "", "Notes": "[process-friction]"},
    ]
    signals = aggregate_process_quality(rows, 1)
    acme = next(signal for signal in signals if signal["company"] == "Acme")
    beta = next(signal for signal in signals if signal["company"] == "Beta")
    assert acme["totalInterviews"] == 2
    assert acme["frictionCount"] == 1
    assert acme["frictionRate"] == 0.5
    assert acme["reasons"] == ["reason A"]
    assert beta["frictionRate"] == 1
    assert aggregate_process_quality(rows, 2) == [acme]


def test_process_quality_cli_json(tmp_path, capsys) -> None:
    active = tmp_path / "active-interviews.md"
    active.write_text(table(["| Acme | Role | Round | Date | Jane | Scheduled | [process-friction] |"]), encoding="utf-8")

    code = process_quality_main(["--file", str(active)])
    captured = capsys.readouterr()
    payload = json.loads(captured.out)

    assert code == 0
    assert payload["metadata"]["totalRows"] == 1
    assert payload["signals"][0]["company"] == "Acme"


def test_add_entry_cv_helpers() -> None:
    cv = "# CV\n\n## Projects\n\n- **FraudShield** (Open Source) -- detection\n"
    assert normalize_key("Fraud-Shield") == "fraudshield"
    assert cv_has_entry(cv, "Projects", "Fraud Shield")
    assert not cv_has_entry(cv, "Experience", "Fraud Shield")

    updated = insert_into_cv_section("# CV\n", "Projects", "- **NewThing** -- built X")
    assert "## Projects\n\n- **NewThing** -- built X" in updated

    appended = insert_into_cv_section(cv, "Projects", "- **Other** -- built Y")
    assert "- **FraudShield**" in appended
    assert "- **Other** -- built Y" in appended


def test_add_entry_article_digest_helpers() -> None:
    digest = "# Article Digest\n\n## FraudShield -- Detection\n\nBody\n"
    assert article_digest_has_entry(digest, "FraudShield")
    assert article_digest_has_entry(digest, "Fraud")
    assert not article_digest_has_entry(digest, "Shield")


def test_apply_add_cv_and_article_idempotency() -> None:
    payload = {
        "cv": {
            "section": "Projects",
            "dedupKey": "FraudShield",
            "entry": "- **FraudShield** -- Real-time fraud detection",
        },
        "articleDigest": {
            "dedupKey": "FraudShield",
            "entry": "## FraudShield -- Real-Time Fraud Detection\n\n**Hero metrics:** x",
        },
    }
    out = apply_add(payload, cv_text="# CV\n\n## Projects\n\n", article_text=None)
    assert out["result"]["cv"] == {"status": "added", "section": "Projects"}
    assert out["result"]["articleDigest"] == {"status": "created"}
    assert "- **FraudShield**" in out["cv"]
    assert "## FraudShield -- Real-Time Fraud Detection" in out["articleDigest"]

    duplicate = apply_add(payload, cv_text=out["cv"], article_text=out["articleDigest"])
    assert duplicate["result"]["cv"]["status"] == "duplicate"
    assert duplicate["result"]["articleDigest"]["status"] == "duplicate"


def test_apply_add_validation() -> None:
    for payload in [{}, {"cv": {"section": "Projects", "entry": "- **X**"}}]:
        try:
            apply_add(payload, cv_text="# CV\n", article_text="")
        except ValueError:
            pass
        else:
            raise AssertionError("expected validation failure")

