#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import yaml

from scripts.python import CONFIG_DIR, PROJECT_ROOT, TEMPLATES_DIR
from scripts.python.tracker.followup_cadence import parse_applied_date
from scripts.python.tracker.parse import parse_tracker_row, resolve_columns
from scripts.python.tracker.utils import load_canonical_states, resolve_canonical_state, resolve_tracker_path


VALID_SOURCES = {"set-status", "correction", "backfill", "manual"}
DAY_MATH_SOURCES = {"set-status", "correction"}
HOPS = [
    {"key": "appliedToResponded", "from": "Applied", "to": "Responded"},
    {"key": "respondedToInterview", "from": "Responded", "to": "Interview"},
    {"key": "interviewToOffer", "from": "Interview", "to": "Offer"},
    {"key": "appliedToRejected", "from": "Applied", "to": "Rejected"},
]
SELECTION_BIAS_NOTE = "targeted applications are expected to beat mass-platform averages — this confirms your filtering works"
BELOW_RANGE_ACTION = "→ check follow-up compliance (followup mode) or review your score threshold (patterns mode)"
CLAIM_MIN_N = 20
HOP_MIN_N = 3


@dataclass(frozen=True)
class StatusObservation:
    num: int
    date: str
    fromState: str | None
    to: str
    source: str
    note: str = ""
    dayMath: bool = False


def parse_iso_date(value: Any) -> date | None:
    text = str(value if value is not None else "").strip()
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", text):
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def days_between(from_str: str, to_str: str) -> int | None:
    first = parse_iso_date(from_str)
    second = parse_iso_date(to_str)
    return None if first is None or second is None else (second - first).days


def parse_status_log(content: str, states: list[Any]) -> dict[str, Any]:
    observations: list[StatusObservation] = []
    unparseable: list[dict[str, Any]] = []
    unknown_sources: list[dict[str, Any]] = []
    for idx, line in enumerate(str(content or "").replace("\r", "").split("\n"), start=1):
        text = line.strip()
        if not text or text.startswith("#"):
            continue
        cells = [cell.strip() for cell in text.split("\t")]
        if len(cells) < 5:
            unparseable.append({"line": idx, "raw": text, "reason": "expected 5+ tab-separated columns"})
            continue
        num_raw, obs_date, from_raw, to_raw, source = cells[:5]
        note = cells[5] if len(cells) > 5 else ""
        try:
            num = int(num_raw)
        except ValueError:
            unparseable.append({"line": idx, "raw": text, "reason": f'bad tracker# "{num_raw}"'})
            continue
        if str(num) != num_raw:
            unparseable.append({"line": idx, "raw": text, "reason": f'bad tracker# "{num_raw}"'})
            continue
        if parse_iso_date(obs_date) is None:
            unparseable.append({"line": idx, "raw": text, "reason": f'bad date "{obs_date}"'})
            continue
        from_state = None if from_raw == "-" else resolve_canonical_state(from_raw, states)
        if from_raw != "-" and not from_state:
            unparseable.append({"line": idx, "raw": text, "reason": f'unknown from-state "{from_raw}"'})
            continue
        to_state = "-" if to_raw == "-" else resolve_canonical_state(to_raw, states)
        if to_raw != "-" and not to_state:
            unparseable.append({"line": idx, "raw": text, "reason": f'unknown to-state "{to_raw}"'})
            continue
        day_math = source in DAY_MATH_SOURCES
        if source not in VALID_SOURCES:
            unknown_sources.append({"line": idx, "num": num, "source": source})
            day_math = False
        observations.append(StatusObservation(num, obs_date, from_state, to_state, source, note, day_math))
    return {"observations": observations, "unparseable": unparseable, "unknownSources": unknown_sources}


def fold_observations(observations: list[StatusObservation]) -> dict[int, list[dict[str, Any]]]:
    by_num: dict[int, list[dict[str, Any]]] = {}
    for obs in observations:
        timeline = by_num.setdefault(obs.num, [])
        if obs.to == "-":
            if timeline:
                timeline.pop()
            continue
        item = {"to": obs.to, "date": obs.date, "source": obs.source, "dayMath": obs.dayMath}
        if obs.source == "correction":
            for pos in range(len(timeline) - 1, -1, -1):
                if timeline[pos]["to"] == obs.to:
                    timeline[pos] = item
                    break
            else:
                timeline.append(item)
        else:
            timeline.append(item)
    for timeline in by_num.values():
        timeline.sort(key=lambda item: item["date"])
    return by_num


def median(nums: list[int]) -> float | int | None:
    if not nums:
        return None
    values = sorted(nums)
    mid = len(values) // 2
    return values[mid] if len(values) % 2 else (values[mid - 1] + values[mid]) / 2


def p75(nums: list[int]) -> float | int | None:
    if not nums:
        return None
    values = sorted(nums)
    if len(values) == 1:
        return values[0]
    rank = 0.75 * (len(values) - 1)
    lo = int(rank)
    hi = lo if rank == lo else lo + 1
    return values[lo] + (values[hi] - values[lo]) * (rank - lo)


def compute_velocity(timelines: dict[int, list[dict[str, Any]]], today_str: str) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for hop in HOPS:
        days: list[int] = []
        same_day_excluded = 0
        censored = 0
        for timeline in timelines.values():
            from_idx = next((idx for idx, obs in enumerate(timeline) if obs["to"] == hop["from"] and obs["dayMath"]), -1)
            if from_idx == -1:
                continue
            next_obs = next((obs for obs in timeline[from_idx + 1 :] if obs["to"] == hop["to"] and obs["dayMath"]), None)
            if next_obs:
                delta = days_between(timeline[from_idx]["date"], next_obs["date"])
                if delta is None or delta < 0:
                    continue
                if delta == 0:
                    same_day_excluded += 1
                else:
                    days.append(delta)
            elif from_idx == len(timeline) - 1 and hop["to"] != "Rejected":
                censored += 1
        enough = len(days) >= HOP_MIN_N
        result[hop["key"]] = {
            "from": hop["from"],
            "to": hop["to"],
            "n": len(days),
            "median": median(days) if enough else None,
            "p75": p75(days) if enough else None,
            "insufficientData": not enough,
            "sameDayExcluded": same_day_excluded,
            "censored": censored,
        }
    return result


def load_benchmarks(explicit_path: str | Path | None = None) -> dict[str, Any]:
    path = Path(explicit_path) if explicit_path else (CONFIG_DIR / "benchmarks.yml" if (CONFIG_DIR / "benchmarks.yml").exists() else TEMPLATES_DIR / "benchmarks.yml")
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(doc, dict) or not isinstance(doc.get("benchmarks"), dict):
        raise ValueError(f'Malformed benchmarks file at {path}: expected a top-level "benchmarks" map')
    return {"benchmarks": doc["benchmarks"], "path": str(path)}


def classify(own_pct: float | int | None, metric: dict[str, Any] | None) -> dict[str, Any] | None:
    if own_pct is None or not isinstance(metric, dict) or not isinstance(metric.get("range_pct"), list):
        return None
    low, high = metric["range_pct"]
    band = "below-range" if own_pct < low else "above-range" if own_pct > high else "within-range"
    typical = metric.get("typical_pct")
    return {
        "band": band,
        "ownPct": own_pct,
        "rangePct": [low, high],
        "typicalPct": typical if typical is not None else None,
        "vsTypical": round((own_pct / typical) * 10) / 10 if typical else None,
        "source": metric.get("source"),
        "year": metric.get("year"),
        "caveat": metric.get("caveat"),
    }


def parse_tracker_rows(content: str) -> list[dict[str, Any]]:
    lines = str(content or "").replace("\r", "").split("\n")
    colmap = resolve_columns(lines)
    return [asdict(row) for line in lines if (row := parse_tracker_row(line, colmap))]


def compute_funnel(rows: list[dict[str, Any]]) -> dict[str, Any]:
    applied_states = {"Applied", "Responded", "Interview", "Offer", "Rejected", "Hired"}
    response_states = {"Responded", "Interview", "Offer", "Rejected", "Hired"}
    interview_states = {"Interview", "Offer", "Hired"}
    ever_applied = sum(1 for row in rows if row.get("status") in applied_states)
    ever_responded = sum(1 for row in rows if row.get("status") in response_states)
    ever_interviewed = sum(1 for row in rows if row.get("status") in interview_states)
    return {
        "everApplied": ever_applied,
        "everResponded": ever_responded,
        "everInterviewed": ever_interviewed,
        "responseRate": round((ever_responded / ever_applied) * 100, 1) if ever_applied else 0,
        "interviewRate": round((ever_interviewed / ever_applied) * 100, 1) if ever_applied else 0,
    }


def compute_calibration(funnel: dict[str, Any], benchmarks: dict[str, Any]) -> dict[str, Any]:
    ever_applied = funnel["everApplied"]
    return {
        "everApplied": ever_applied,
        "smallSample": ever_applied < CLAIM_MIN_N,
        "claimMinN": CLAIM_MIN_N,
        "responseRate": classify(funnel["responseRate"] if ever_applied else None, benchmarks.get("response_rate")),
        "interviewRate": classify(funnel["interviewRate"] if ever_applied else None, benchmarks.get("application_to_interview")),
    }


def compute_waiting(rows: list[dict[str, Any]], timelines: dict[int, list[dict[str, Any]]], benchmarks: dict[str, Any], today_str: str) -> dict[str, Any]:
    window_days = benchmarks.get("days_first_response", {}).get("range_days", [5, 14])
    items: list[dict[str, Any]] = []
    unknown_dates = 0
    for row in rows:
        if row.get("status") != "Applied":
            continue
        timeline = timelines.get(row["num"], [])
        applied_events = [obs for obs in timeline if obs["to"] == "Applied" and obs["dayMath"]]
        ledger_applied = applied_events[-1] if applied_events else None
        applied_date = ledger_applied["date"] if ledger_applied else parse_applied_date(row.get("notes"))
        if not applied_date:
            unknown_dates += 1
            items.append({"num": row["num"], "company": row["company"], "appliedDate": None, "elapsedDays": None, "beyondTypicalWindow": False, "dateSource": "unknown"})
            continue
        elapsed = days_between(applied_date, today_str)
        items.append(
            {
                "num": row["num"],
                "company": row["company"],
                "appliedDate": applied_date,
                "elapsedDays": elapsed,
                "beyondTypicalWindow": elapsed is not None and elapsed > window_days[1],
                "dateSource": "status-log" if ledger_applied else "tracker-notes",
            }
        )
    source = benchmarks.get("days_first_response")
    return {
        "windowDays": window_days,
        "windowSource": {"source": source.get("source"), "year": source.get("year")} if isinstance(source, dict) else None,
        "inFlight": len(items),
        "unknownDates": unknown_dates,
        "items": sorted(items, key=lambda item: item["elapsedDays"] if item["elapsedDays"] is not None else -1, reverse=True),
    }


def analyze(*, tracker_content: str, log_content: str, benchmarks: dict[str, Any], states: list[Any], today_str: str) -> dict[str, Any]:
    rows = parse_tracker_rows(tracker_content)
    funnel = compute_funnel(rows)
    parsed = parse_status_log(log_content, states)
    observations: list[StatusObservation] = parsed["observations"]
    timelines = fold_observations(observations)
    tracker_nums = {row["num"] for row in rows}
    velocity = compute_velocity(timelines, today_str)
    io = benchmarks.get("days_interview_to_offer")
    if isinstance(io, dict) and isinstance(io.get("range_days"), list) and velocity["interviewToOffer"]["median"] is not None:
        velocity["interviewToOffer"]["benchmark"] = {
            "rangeDays": io["range_days"],
            "typicalDays": io.get("typical_days"),
            "source": io.get("source"),
            "year": io.get("year"),
        }
    return {
        "calibration": compute_calibration(funnel, benchmarks),
        "waiting": compute_waiting(rows, timelines, benchmarks, today_str),
        "velocity": velocity,
        "dataQuality": {
            "trackerRows": len(rows),
            "coveredRows": len([num for num in timelines if num in tracker_nums]),
            "observations": len(observations),
            "orphans": [num for num in timelines if num not in tracker_nums],
            "unparseable": parsed["unparseable"],
            "unknownSources": parsed["unknownSources"],
            "newestObservation": max([obs.date for obs in observations], default=None),
        },
    }


def _fmt_calibration_line(label: str, c: dict[str, Any] | None, small_sample: bool, n: int) -> str:
    if not c or c.get("ownPct") is None:
        return f"  {label}: no data yet"
    line = f"  {label}: {c['ownPct']}% vs {c['rangePct'][0]}–{c['rangePct'][1]}% typical band ({c.get('year') or 'n/a'}, directional)"
    if small_sample:
        return f"{line} — small sample (n={n}) — directional only"
    if c["band"] == "above-range":
        return f"{line} — above the typical band{f', {c['vsTypical']}× typical' if c.get('vsTypical') else ''} ({SELECTION_BIAS_NOTE})"
    if c["band"] == "below-range":
        return f"{line} — below the typical band {BELOW_RANGE_ACTION}"
    return f"{line} — within the typical band"


def render_summary(result: dict[str, Any], today_str: str) -> str:
    cal = result["calibration"]
    waiting = result["waiting"]
    velocity = result["velocity"]
    dq = result["dataQuality"]
    out = ["━" * 46, f"Funnel Calibration — {today_str}", "━" * 46, "", "Calibration (your funnel vs market):"]
    if cal["everApplied"] == 0:
        out.append("  no applications sent yet — calibration starts at your first Applied row")
    else:
        out.append(_fmt_calibration_line("Response rate", cal["responseRate"], cal["smallSample"], cal["everApplied"]))
        out.append(_fmt_calibration_line("Interview rate", cal["interviewRate"], cal["smallSample"], cal["everApplied"]))
        if cal["smallSample"]:
            out.append(f"  (comparative claims need n≥{cal['claimMinN']} applied; you have {cal['everApplied']})")
    out.extend(["", "Waiting (in-flight applications):"])
    if not waiting["inFlight"]:
        out.append("  none in Applied right now")
    else:
        source_year = waiting.get("windowSource", {}).get("year") if waiting.get("windowSource") else "n/a"
        out.append(f"  {waiting['inFlight']} in flight. Typical first-response window: {waiting['windowDays'][0]}–{waiting['windowDays'][1]} days ({source_year}, directional; many applications never get a response — silence is common, not a verdict).")
        for item in waiting["items"]:
            if item["appliedDate"] is None:
                out.append(f"  #{item['num']} {item['company']} — applied date unknown (no dated Applied observation; add \"Applied YYYY-MM-DD\" to its notes or use set-status)")
            else:
                flag = f", beyond typical {waiting['windowDays'][0]}–{waiting['windowDays'][1]}d window → consider followup mode" if item["beyondTypicalWindow"] else ""
                out.append(f"  #{item['num']} {item['company']} — applied {item['appliedDate']} ({item['elapsedDays']}d{flag})")
    out.extend(["", "Velocity (days per stage, from the transition ledger):"])
    if not any(not hop["insufficientData"] for hop in velocity.values()) and dq["observations"] == 0:
        out.append("  ledger is empty — velocity accrues as statuses change through set-status.mjs")
    for hop in velocity.values():
        extras = []
        if hop["censored"]:
            extras.append(f"{hop['censored']} still waiting, excluded")
        if hop["sameDayExcluded"]:
            extras.append(f"{hop['sameDayExcluded']} same-day catch-up {'entry' if hop['sameDayExcluded'] == 1 else 'entries'} excluded")
        extra = f"; {'; '.join(extras)}" if extras else ""
        if hop["insufficientData"]:
            out.append(f"  {hop['from']}→{hop['to']}: insufficient data (n={hop['n']}{extra})")
        else:
            bm = hop.get("benchmark")
            bm_text = f" vs {bm['rangeDays'][0]}–{bm['rangeDays'][1]}d typical ({bm.get('year') or 'n/a'}, directional)" if bm else ""
            out.append(f"  {hop['from']}→{hop['to']}: median {hop['median']}d, p75 {hop['p75']}d{bm_text} (n={hop['n']} completed{extra} — median reflects answered applications only)")
    out.extend(["", "Data quality:", f"  velocity data for {dq['coveredRows']} of {dq['trackerRows']} tracker rows (rows predating the log or edited outside set-status have no dated transitions)"])
    out.append(f"  unparseable ledger lines: {len(dq['unparseable'])}" if dq["unparseable"] else "  unparseable ledger lines: none")
    out.append(f"  unrecognized sources: {len(dq['unknownSources'])}" if dq["unknownSources"] else "  unrecognized sources: none")
    out.append(f"  orphaned ledger entries: {', '.join('#' + str(n) for n in dq['orphans'])}" if dq["orphans"] else "  orphaned ledger entries: none")
    if dq["newestObservation"]:
        out.append(f"  newest observation: {dq['newestObservation']}")
    out.append("")
    return "\n".join(out)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Funnel calibration and stage velocity analyzer.")
    parser.add_argument("--tracker")
    parser.add_argument("--log")
    parser.add_argument("--benchmarks")
    parser.add_argument("--summary", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    tracker_path = Path(args.tracker) if args.tracker else resolve_tracker_path()
    log_path = Path(args.log) if args.log else tracker_path.parent / "status-log.tsv"
    if not tracker_path.exists():
        result = {"calibration": None, "waiting": None, "velocity": None, "dataQuality": {"trackerRows": 0, "note": f"no tracker at {tracker_path}"}}
        print(json.dumps(result, indent=2))
        return 0
    states = load_canonical_states()
    benchmarks = load_benchmarks(args.benchmarks)["benchmarks"]
    today = datetime.now(UTC).date().isoformat()
    result = analyze(
        tracker_content=tracker_path.read_text(encoding="utf-8"),
        log_content=log_path.read_text(encoding="utf-8") if log_path.exists() else "",
        benchmarks=benchmarks,
        states=states,
        today_str=today,
    )
    if args.summary:
        print(render_summary(result, today))
    else:
        print(json.dumps({**result, "generatedAt": today}, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
