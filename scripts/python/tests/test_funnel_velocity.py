from __future__ import annotations

from scripts.python import TEMPLATES_DIR
from scripts.python.other.funnel_velocity import (
    BELOW_RANGE_ACTION,
    SELECTION_BIAS_NOTE,
    analyze,
    classify,
    compute_velocity,
    days_between,
    fold_observations,
    load_benchmarks,
    median,
    p75,
    parse_iso_date,
    parse_status_log,
    render_summary,
)
from scripts.python.tracker.utils import load_canonical_states


TODAY = "2026-07-08"


LOG_FIXTURE = "\n".join(
    [
        "1\t2026-06-01\tEvaluated\tApplied\tset-status\t",
        "1\t2026-06-08\tApplied\tResponded\tset-status\t",
        "1\t2026-06-15\tResponded\tInterview\tset-status\t",
        "1\t2026-06-30\tInterview\tOffer\tset-status\t",
        "2\t2026-06-01\t-\tApplied\tset-status\tunknown prior state",
        "2\t2026-06-11\tApplied\tResponded\tset-status\t",
        "2\t2026-06-09\tApplied\tResponded\tcorrection\tthey actually replied on the 9th",
        "3\t2026-06-05\tEvaluated\tApplied\tset-status\t",
        "3\t2026-06-05\tApplied\tResponded\tset-status\tsame-day catch-up",
        "4\t2026-06-20\tEvaluated\tApplied\tset-status\t",
        "5\t2026-06-01\tEvaluated\tApplied\tset-status\t",
        "5\t2026-06-02\tApplied\tInterview\tset-status\tmis-click",
        "5\t2026-06-02\t-\t-\tset-status\tretract the mis-click",
        "6\t2026-06-03\tEvaluated\tApplied\tfuture-import\tunknown source",
        "99\t2026-06-01\tEvaluated\tApplied\tset-status\torphan",
        "x\t2026-06-01\tEvaluated\tApplied\tset-status\tbad num",
        "7\t06/01/2026\tEvaluated\tApplied\tset-status\tbad date",
        "8\t2026-06-01\tEvaluated\tShortlisted\tset-status\tbad state",
    ]
)


def mk_tracker(applied: int, responded: int, interviewed: int = 0) -> str:
    rows = ["| # | Date | Company | Role | Score | Status | PDF | Report | Notes |", "|---|------|---------|------|-------|--------|-----|--------|-------|"]
    num = 1
    for _ in range(applied):
        rows.append(f"| {num} | 2026-06-01 | Co{num} | Role | 4.0/5 | Applied | no | - | |")
        num += 1
    for _ in range(responded):
        rows.append(f"| {num} | 2026-06-01 | Co{num} | Role | 4.0/5 | Responded | no | - | Applied 2026-06-01 |")
        num += 1
    for _ in range(interviewed):
        rows.append(f"| {num} | 2026-06-01 | Co{num} | Role | 4.0/5 | Interview | no | - | Applied 2026-06-01 |")
        num += 1
    return "\n".join(rows)


def test_date_helpers_parse_and_diff() -> None:
    assert parse_iso_date("2026-06-01").isoformat() == "2026-06-01"
    assert parse_iso_date("06/01/2026") is None
    assert days_between("2026-06-01", "2026-06-08") == 7
    assert days_between("bad", "2026-06-08") is None


def test_status_log_parse_fold_and_velocity() -> None:
    states = load_canonical_states()
    parsed = parse_status_log(LOG_FIXTURE, states)

    assert len(parsed["unparseable"]) == 3
    assert any("bad tracker#" in item["reason"] for item in parsed["unparseable"])
    assert parsed["unknownSources"] == [{"line": 14, "num": 6, "source": "future-import"}]
    assert next(obs for obs in parsed["observations"] if obs.source == "future-import").dayMath is False

    timelines = fold_observations(parsed["observations"])
    assert timelines[2][-1]["date"] == "2026-06-09"
    assert timelines[2][-1]["source"] == "correction"
    assert timelines[5] == [{"to": "Applied", "date": "2026-06-01", "source": "set-status", "dayMath": True}]

    velocity = compute_velocity(timelines, TODAY)
    assert velocity["appliedToResponded"]["n"] == 2
    assert velocity["appliedToResponded"]["insufficientData"] is True
    assert velocity["appliedToResponded"]["sameDayExcluded"] == 1
    assert velocity["appliedToResponded"]["censored"] == 3
    assert velocity["appliedToRejected"]["censored"] == 0

    more = parse_status_log(LOG_FIXTURE + "\n4\t2026-06-27\tApplied\tResponded\tset-status\t", states)
    v3 = compute_velocity(fold_observations(more["observations"]), TODAY)
    assert v3["appliedToResponded"]["n"] == 3
    assert v3["appliedToResponded"]["median"] == 7


def test_percentiles_and_benchmark_classification() -> None:
    benchmarks = load_benchmarks(TEMPLATES_DIR / "benchmarks.yml")["benchmarks"]
    assert median([3, 6, 20]) == 6
    assert median([3, 6]) == 4.5
    assert p75([3, 6, 20]) == 13
    assert classify(1.5, benchmarks["response_rate"])["band"] == "below-range"
    assert classify(6, benchmarks["response_rate"])["band"] == "within-range"
    assert classify(14, benchmarks["response_rate"])["band"] == "above-range"
    assert classify(6, benchmarks["response_rate"])["vsTypical"] == 2


def test_analyze_calibration_gating_and_summary_tone() -> None:
    states = load_canonical_states()
    benchmarks = load_benchmarks(TEMPLATES_DIR / "benchmarks.yml")["benchmarks"]

    small = analyze(tracker_content=mk_tracker(16, 1), log_content="", benchmarks=benchmarks, states=states, today_str=TODAY)
    assert small["calibration"]["smallSample"] is True
    small_summary = render_summary(small, TODAY)
    assert "directional only" in small_summary
    assert "× typical" not in small_summary

    big = analyze(tracker_content=mk_tracker(38, 2), log_content="", benchmarks=benchmarks, states=states, today_str=TODAY)
    assert big["calibration"]["smallSample"] is False
    assert big["calibration"]["responseRate"]["ownPct"] == 5.0
    assert "within the typical band" in render_summary(big, TODAY)

    above = render_summary(analyze(tracker_content=mk_tracker(10, 15), log_content="", benchmarks=benchmarks, states=states, today_str=TODAY), TODAY)
    assert SELECTION_BIAS_NOTE in above
    below = render_summary(analyze(tracker_content=mk_tracker(40, 0), log_content="", benchmarks=benchmarks, states=states, today_str=TODAY), TODAY)
    assert BELOW_RANGE_ACTION in below
    assert "(2025, directional)" in below


def test_waiting_uses_ledger_then_notes_and_never_guesses_eval_date() -> None:
    states = load_canonical_states()
    benchmarks = load_benchmarks(TEMPLATES_DIR / "benchmarks.yml")["benchmarks"]
    tracker = "\n".join(
        [
            "| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
            "|---|------|---------|------|-------|--------|-----|--------|-------|",
            "| 1 | 2026-06-01 | LogCo | Role | 4.0/5 | Applied | no | - | |",
            "| 2 | 2026-06-01 | NotesCo | Role | 4.0/5 | Applied | no | - | Applied 2026-07-01 |",
            "| 3 | 2026-06-01 | UnknownCo | Role | 4.0/5 | Applied | no | - | evaluated only |",
            "| 4 | 2026-06-01 | DoneCo | Role | 4.0/5 | Responded | no | - | Applied 2026-06-01 |",
        ]
    )
    result = analyze(tracker_content=tracker, log_content="1\t2026-06-10\tEvaluated\tApplied\tset-status\t", benchmarks=benchmarks, states=states, today_str=TODAY)
    waiting = result["waiting"]

    assert waiting["inFlight"] == 3
    by_num = {item["num"]: item for item in waiting["items"]}
    assert by_num[1]["dateSource"] == "status-log"
    assert by_num[1]["elapsedDays"] == 28
    assert by_num[1]["beyondTypicalWindow"] is True
    assert by_num[2]["dateSource"] == "tracker-notes"
    assert by_num[2]["elapsedDays"] == 7
    assert by_num[3]["dateSource"] == "unknown"
    assert by_num[3]["appliedDate"] is None
    assert 4 not in by_num


def test_data_quality_and_interview_offer_benchmark_are_gated() -> None:
    states = load_canonical_states()
    benchmarks = load_benchmarks(TEMPLATES_DIR / "benchmarks.yml")["benchmarks"]
    result = analyze(tracker_content=mk_tracker(2, 0), log_content=LOG_FIXTURE, benchmarks=benchmarks, states=states, today_str=TODAY)
    assert 99 in result["dataQuality"]["orphans"]
    assert len(result["dataQuality"]["unparseable"]) == 3
    assert result["dataQuality"]["newestObservation"] == "2026-06-30"
    assert "benchmark" not in result["velocity"]["interviewToOffer"]

    io_log = "\n".join(
        [
            "1\t2026-05-01\tResponded\tInterview\tset-status\t",
            "1\t2026-05-22\tInterview\tOffer\tset-status\t",
            "2\t2026-05-01\tResponded\tInterview\tset-status\t",
            "2\t2026-05-26\tInterview\tOffer\tset-status\t",
            "3\t2026-05-01\tResponded\tInterview\tset-status\t",
            "3\t2026-05-31\tInterview\tOffer\tset-status\t",
        ]
    )
    io_result = analyze(tracker_content=mk_tracker(3, 0), log_content=io_log, benchmarks=benchmarks, states=states, today_str=TODAY)
    assert io_result["velocity"]["interviewToOffer"]["n"] == 3
    assert io_result["velocity"]["interviewToOffer"]["median"] == 25
    assert io_result["velocity"]["interviewToOffer"]["benchmark"]["rangeDays"] == [20, 28]
    assert "vs 20–28d typical (2019, directional)" in render_summary(io_result, TODAY)
