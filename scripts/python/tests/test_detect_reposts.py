from __future__ import annotations

import json

from scripts.python.tracker.detect_reposts import detect_reposts, main, parse_date, parse_scan_history


def row(url: str, date: str, title: str, company: str = "Acme", status: str = "added"):
    return {
        "url": url,
        "date": parse_date(date),
        "dateStr": date,
        "portal": "greenhouse",
        "title": title,
        "company": company,
        "status": status,
        "location": "",
    }


def test_parse_scan_history_header_and_headerless() -> None:
    header = "url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\nhttps://a\t2024-01-10\tgh\tSRE\tAcme\tadded\tRemote"
    headerless = "https://b\t2024-01-11\tlever\tBackend Engineer\tBeta"

    assert parse_scan_history(header)[0].company == "Acme"
    assert parse_scan_history(headerless)[0].status == "added"
    assert parse_scan_history("https://bad\tnot-a-date\tgh\tRole\tAcme") == []


def test_detect_reposts_flags_distinct_urls_within_window() -> None:
    rows = [
        row("https://acme/jobs/sre-1", "2024-01-10", "Senior Site Reliability Engineer"),
        row("https://acme/jobs/sre-2", "2024-03-01", "Senior Site Reliability Engineer"),
        row("https://acme/jobs/sre-1", "2024-03-20", "Senior Site Reliability Engineer"),
        row("https://acme/jobs/mgr", "2024-02-15", "Engineering Manager Platform"),
        row("https://acme/jobs/sre-3", "2024-12-01", "Senior Site Reliability Engineer"),
        row("https://acme/jobs/sre-4", "2024-02-01", "Senior Site Reliability Engineer", status="skipped_expired"),
    ]
    clusters = detect_reposts(rows, 90)

    assert len(clusters) == 1
    cluster = clusters[0]
    assert cluster["company"] == "Acme"
    assert cluster["repostCount"] == 2
    assert {item["url"] for item in cluster["appearances"]} == {
        "https://acme/jobs/sre-1",
        "https://acme/jobs/sre-2",
    }
    assert not any("mgr" in item["url"] for item in cluster["appearances"])


def test_detect_reposts_sliding_window_and_company_grouping() -> None:
    rows = [
        row("https://a/1", "2024-01-01", "Backend Platform Engineer"),
        row("https://a/2", "2024-03-15", "Backend Platform Engineer"),
        row("https://a/3", "2024-06-10", "Backend Platform Engineer"),
        row("https://b/1", "2024-03-16", "Backend Platform Engineer", company="Beta"),
    ]
    clusters = detect_reposts(rows, 90)

    assert len(clusters) == 2
    assert all(cluster["company"] == "Acme" for cluster in clusters)
    assert any({"https://a/1", "https://a/2"} == {item["url"] for item in cluster["appearances"]} for cluster in clusters)
    assert any({"https://a/2", "https://a/3"} == {item["url"] for item in cluster["appearances"]} for cluster in clusters)


def test_detect_reposts_cli_json(tmp_path, capsys) -> None:
    scan = tmp_path / "scan-history.tsv"
    scan.write_text(
        "\n".join(
            [
                "url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation",
                "https://a/1\t2024-01-01\tgh\tBackend Platform Engineer\tAcme\tadded\t",
                "https://a/2\t2024-02-01\tgh\tBackend Platform Engineer\tAcme\tadded\t",
            ]
        ),
        encoding="utf-8",
    )
    code = main(["--file", str(scan)])
    payload = json.loads(capsys.readouterr().out)

    assert code == 0
    assert payload["metadata"]["clusters"] == 1

