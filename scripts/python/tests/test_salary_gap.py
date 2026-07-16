from __future__ import annotations

from scripts.python.salary.salary_gap import fold, parse_amount, parse_observations, report_to_observation


REPORT_001 = """# Eval: Acme — ML Eng

## Machine Summary

```yaml
company: "Acme"
role: "ML Eng"
score: 4.2
advertised_comp: "80-90k EUR"
```
"""

REPORT_004 = """# Eval: Umbrella — AI Eng

## Machine Summary

```yaml
company: "Umbrella"
role: "AI Eng"
score: 4.1
advertised_comp: "100k USD"
```
"""

REPORT_005 = """# Eval: Hooli — AI Lead

## Machine Summary

```yaml
company: "Hooli"
role: "AI Lead"
score: 3.8
advertised_comp: "95k"
```
"""


def test_parse_amount_ranges_symbols_and_invalid_values() -> None:
    assert parse_amount("84k").mid == 84000
    assert parse_amount("$80k").mid == 80000
    assert parse_amount("80-90k").mid == 85000
    assert parse_amount("90-80k").min == 80000
    assert parse_amount("450k SEK").mid == 450000
    assert parse_amount("?") is None
    assert parse_amount("competitive") is None
    assert parse_amount("9ok") is None


def test_parse_observations_and_report_to_observation() -> None:
    observations = parse_observations(
        "\n".join(
            [
                "# comment",
                "001\t2026-06-20\tdesired\t95k\tEUR\tuser\tstated",
                "008\t2026-07-01\tactual\t91k\t\toffer-letter\tblank currency",
                "009\t2026-07-01\tignored\t91k\tEUR\tuser\tbad type",
            ]
        )
    )
    assert len(observations) == 2
    assert observations[0].currency == "EUR"
    assert observations[1].currency == "UNKNOWN"

    report = report_to_observation(REPORT_001, "001", "2026-06-20")
    assert report["company"] == "Acme"
    assert report["role"] == "ML Eng"
    assert report["observation"].source == "jd"
    assert report["observation"].currency == "EUR"
    assert report["observation"].parsed.mid == 85000

    json_report = '## Machine Summary\n\n```json\n{"company":"JsonCo","advertised_comp":"100k EUR"}\n```'
    assert report_to_observation(json_report, "010", "2026-06-30") is None


def test_fold_trust_precedence_quality_and_aggregates() -> None:
    observations = parse_observations(
        "\n".join(
            [
                "001\t2026-06-20\tdesired\t95k\tEUR\tuser\tstated",
                "001\t2026-06-28\tactual\t90k\tEUR\trecruiter-verbal\tscreen",
                "001\t2026-07-03\tactual\t84k\tEUR\toffer-letter\t",
                "001\t2026-07-05\tactual\t86k\tEUR\tcontract\tsigned",
                "002\t2026-06-25\tactual\t88k\tEUR\trecruiter-verbal\t",
                "002\t2026-06-29\tactual\t99k\tEUR\trecruiter_verbal\ttypo",
                "002\t2026-06-30\tactual\t120k\tEUR\ttoString\tprototype key",
                "003\t2026-06-26\tactual\t9ok\tUSD\trecruiter-verbal\ttypo",
                "004\t2026-06-30\tactual\t88k\tGBP\toffer-letter\tcross currency",
                "005\t2026-07-01\tactual\t92k\tUNKNOWN\toffer-letter\tcurrency not stated",
                "007\t2026-06-25\tactual\t70k\tEUR\trecruiter-verbal\torphan",
            ]
        )
    )
    reports = [
        report_to_observation(REPORT_001, "001", "2026-06-20")["observation"],
        report_to_observation(
            """## Machine Summary

```yaml
company: "Globex"
role: "Data Eng"
advertised_comp: "100k EUR"
```
""",
            "002",
            "2026-06-25",
        )["observation"],
        report_to_observation(REPORT_004, "004", "2026-06-27")["observation"],
        report_to_observation(REPORT_005, "005", "2026-06-28")["observation"],
    ]
    apps = {
        "001": {"company": "Acme", "role": "ML Eng"},
        "002": {"company": "Globex", "role": "Data Eng"},
        "003": {"company": "Initech", "role": "Platform"},
        "004": {"company": "Umbrella", "role": "AI Eng"},
        "005": {"company": "Hooli", "role": "AI Lead"},
    }

    result = fold([*observations, *reports], apps, {"amount": "90k", "currency": "EUR"})
    by_num = {app["num"]: app for app in result["applications"]}

    assert by_num["001"]["actual"]["source"] == "contract"
    assert by_num["001"]["actual"]["value"] == 86000
    assert by_num["001"]["desired"]["source"] == "user"
    assert round(by_num["001"]["advToActPct"], 2) == 1.18
    assert round(by_num["001"]["desiredToActPct"], 2) == -9.47

    assert by_num["002"]["actual"]["source"] == "recruiter-verbal"
    assert by_num["002"]["desired"]["source"] == "profile"
    assert by_num["004"]["advToActPct"] is None
    assert by_num["005"]["advertised"]["currency"] == "UNKNOWN"
    assert by_num["005"]["advToActPct"] is None

    quality = result["quality"]
    assert quality["orphans"] == [{"num": "007", "count": 1}]
    assert any(item["raw"] == "9ok" for item in quality["unparseable"])
    assert any(item["source"] == "recruiter_verbal" for item in quality["invalidSources"])
    assert any(item["source"] == "toString" for item in quality["invalidSources"])
    assert any(item["num"] == "004" and item["comparison"] == "advertised-vs-actual" for item in quality["currencyMismatches"])
    assert any(item["num"] == "005" and item["currencies"] == ["UNKNOWN", "UNKNOWN"] for item in quality["currencyMismatches"])

    eur = result["aggregates"]["byCurrency"]["EUR"]
    assert eur["confirmed"] == 2
    assert round(eur["meanAdvToActPct"], 2) == -5.41
    assert eur["atOrAboveAdvertised"] == 1
    assert result["aggregates"]["byCompanyRole"]["Acme|ML Eng"]["confirmed"] == 1


def test_fold_legacy_reports_do_not_collapse_null_bucket() -> None:
    observations = parse_observations(
        "\n".join(
            [
                "101\t2026-07-01\tactual\t80k\tEUR\toffer-letter\tlegacy",
                "102\t2026-07-02\tactual\t85k\tEUR\tcontract\tlegacy",
            ]
        )
    )
    result = fold(observations, {"101": {"company": None, "role": None}, "102": {"company": None, "role": None}})

    buckets = result["aggregates"]["byCompanyRole"]
    assert "null|null" not in buckets
    assert buckets["#101"]["company"] == "report #101"
    assert buckets["#102"]["confirmed"] == 1
