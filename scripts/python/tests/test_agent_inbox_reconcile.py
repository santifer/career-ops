from __future__ import annotations

from datetime import datetime

from scripts.python.pipeline.agent_inbox import add_request, list_items, parse_items, resolve_item
from scripts.python.tracker.reconcile_pipeline import (
    parse_batch_state,
    reconcile_pipeline,
    reconcile_pipeline_content,
)


def test_agent_inbox_add_list_resolve_pending_numbering(tmp_path) -> None:
    inbox = tmp_path / "agent-inbox.md"
    add_request("first\nrequest", inbox, now=datetime(2026, 7, 15, 10, 30))
    add_request("second request", inbox, now=datetime(2026, 7, 15, 10, 31))

    assert len(parse_items(inbox)) == 2
    assert list_items(inbox)[0]["text"] == "2026-07-15 10:30 — first request"
    assert "first request" in inbox.read_text(encoding="utf-8")

    resolved = resolve_item(1, inbox, result="done\nwith newline")
    assert "first request" in resolved["text"]

    pending = list_items(inbox)
    all_items = list_items(inbox, all_items=True)
    assert len(pending) == 1
    assert "second request" in pending[0]["text"]
    assert len(all_items) == 2
    content = inbox.read_text(encoding="utf-8")
    assert "- [x] 2026-07-15 10:30 — first request -> result: done with newline" in content


def test_agent_inbox_validation(tmp_path) -> None:
    try:
        add_request("   ", tmp_path / "agent-inbox.md")
    except ValueError:
        pass
    else:
        raise AssertionError("expected blank request failure")

    try:
        resolve_item(1, tmp_path / "missing.md")
    except ValueError as exc:
        assert "0 pending" in str(exc)
    else:
        raise AssertionError("expected missing pending failure")


def test_parse_batch_state() -> None:
    state = "\n".join(
        [
            "id\turl\tstatus\tstarted_at\tcompleted_at\treport_num\tscore\terror\tretries",
            "1\thttps://a/jobs/1\tcompleted\t-\t-\t7\t4.2\t\t0",
            "2\thttps://a/jobs/2\tskipped\t-\t-\t8\t\tbelow\t0",
            "3\thttps://a/jobs/3\tfailed\t-\t-\t9\t\tboom\t1",
        ]
    )
    done = parse_batch_state(state)
    assert set(done) == {"https://a/jobs/1", "https://a/jobs/2"}
    assert done["https://a/jobs/1"] == {"reportNum": "7", "score": "4.2"}


def test_reconcile_pipeline_content_moves_to_existing_processed(tmp_path) -> None:
    reports = tmp_path / "reports"
    reports.mkdir()
    (reports / "007-acme-2026-07-15.md").write_text("**Score:** 4.2/5\n**PDF:** generated\n", encoding="utf-8")
    pipeline = """# Pipeline

## Pendientes

- [ ] https://a/jobs/1 | Acme | Backend Engineer
- [ ] https://a/jobs/2 | Beta | Data Engineer

## Procesadas

"""
    result = reconcile_pipeline_content(
        pipeline,
        {"https://a/jobs/1": {"reportNum": "7", "score": "4.2"}},
        report_files=["007-acme-2026-07-15.md"],
        reports_dir=reports,
        pipeline_file=tmp_path / "data/pipeline.md",
        repo_root=tmp_path,
    )

    assert result.changed is True
    assert result.pendingCount == 1
    assert "- [ ] https://a/jobs/2 | Beta | Data Engineer" in result.newContent
    assert "- [x] [7](../reports/007-acme-2026-07-15.md) | https://a/jobs/1 | Acme | Backend Engineer | 4.2/5 | PDF yes" in result.newContent


def test_reconcile_pipeline_content_creates_processed_and_skips_missing_report(tmp_path) -> None:
    pipeline = """# Pipeline

## Pending

- [ ] https://a/jobs/1 | Acme | Backend Engineer
- [ ] https://a/jobs/2 | Beta | Data Engineer
"""
    result = reconcile_pipeline_content(
        pipeline,
        {
            "https://a/jobs/1": {"reportNum": "7", "score": "4.2"},
            "https://a/jobs/2": {"reportNum": "8", "score": ""},
        },
        report_files=["007-acme.md"],
        reports_dir=tmp_path,
        pipeline_file=tmp_path / "pipeline.md",
        repo_root=tmp_path,
    )
    assert result.changed is True
    assert "## Processed" in result.newContent
    assert result.skippedNoReport == [{"url": "https://a/jobs/2", "reportNum": "8"}]
    assert "- [ ] https://a/jobs/2 | Beta | Data Engineer" in result.newContent


def test_reconcile_pipeline_writes_backup_and_is_idempotent(tmp_path) -> None:
    reports = tmp_path / "reports"
    reports.mkdir()
    (reports / "007-acme.md").write_text("**Score:** N/A\n**PDF:** not generated\n", encoding="utf-8")
    pipeline = tmp_path / "pipeline.md"
    state = tmp_path / "batch-state.tsv"
    pipeline.write_text("# Pipeline\n\n## Pending\n\n- [ ] https://a/jobs/1 | Acme | Role\n", encoding="utf-8")
    state.write_text("id\turl\tstatus\tstarted_at\tcompleted_at\treport_num\tscore\n1\thttps://a/jobs/1\tcompleted\t-\t-\t7\t\n", encoding="utf-8")

    first = reconcile_pipeline(pipeline, state, reports_dir=reports, repo_root=tmp_path)
    second = reconcile_pipeline(pipeline, state, reports_dir=reports, repo_root=tmp_path)

    assert first.changed is True
    assert (tmp_path / "pipeline.md.pre-reconcile.bak").exists()
    assert "PDF no" in pipeline.read_text(encoding="utf-8")
    assert second.changed is False

