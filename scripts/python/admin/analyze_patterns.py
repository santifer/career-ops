#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import yaml

from scripts.python import PROJECT_ROOT
from scripts.python.tracker.parse import normalize_via, parse_tracker_row, resolve_columns


MACHINE_SUMMARY_FIELDS = {
    "company",
    "role",
    "score",
    "legitimacy_tier",
    "archetype",
    "final_decision",
    "hard_stops",
    "soft_gaps",
    "top_strengths",
    "risk_level",
    "confidence",
    "next_action",
    "domain",
    "seniority",
    "remote",
    "team_size",
    "discard_reasons",
    "advertised_comp",
    "via",
    "company_confidential",
}
ALIASES = {
    "evaluada": "evaluated",
    "condicional": "evaluated",
    "hold": "evaluated",
    "evaluar": "evaluated",
    "verificar": "evaluated",
    "aplicado": "applied",
    "enviada": "applied",
    "aplicada": "applied",
    "applied": "applied",
    "sent": "applied",
    "respondido": "responded",
    "entrevista": "interview",
    "oferta": "offer",
    "rechazado": "rejected",
    "rechazada": "rejected",
    "descartado": "discarded",
    "descartada": "discarded",
    "cerrada": "discarded",
    "cancelada": "discarded",
    "no aplicar": "skip",
    "no_aplicar": "skip",
    "monitor": "skip",
    "geo blocker": "skip",
}
ADVANCED_STATUSES = {"responded", "interview", "offer"}
SUBMITTED_STATUSES = {"applied", "responded", "interview", "offer", "rejected", "discarded"}


def normalize_status(raw: Any) -> str:
    clean = re.sub(r"\*\*", "", str(raw or "")).strip().lower()
    clean = re.sub(r"\s+\d{4}-\d{2}-\d{2}.*$", "", clean).strip()
    return ALIASES.get(clean, clean)


def classify_outcome(status: Any) -> str:
    normalized = normalize_status(status)
    if normalized in {"interview", "offer", "responded", "applied"}:
        return "positive"
    if normalized in {"rejected", "discarded"}:
        return "negative"
    if normalized == "skip":
        return "self_filtered"
    return "pending"


def normalize_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if value in (None, "") or isinstance(value, dict):
        return []
    return [str(value).strip()] if str(value).strip() else []


def normalize_scalar(value: Any) -> str | None:
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, (int, float)):
        return str(value)
    return None


def parse_machine_summary(content: str) -> dict[str, Any] | None:
    match = re.search(r"##\s*Machine Summary\s*\n+```(?:yaml|yml|json)?\s*\n([\s\S]*?)\n```", content or "", flags=re.I)
    if not match:
        return None
    raw = match.group(1).strip()
    if not raw:
        return None
    try:
        parsed = yaml.safe_load(raw)
    except Exception:
        return None
    if not isinstance(parsed, dict):
        return None
    return {key: value for key, value in parsed.items() if key in MACHINE_SUMMARY_FIELDS}


def detect_vendor(raw_url: Any) -> str | None:
    if not isinstance(raw_url, str) or not raw_url.strip():
        return None
    parsed = urlparse(raw_url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    host = parsed.hostname.lower()
    if re.search(r"(^|\.)greenhouse\.io$", host):
        return "greenhouse"
    if host == "jobs.lever.co" or host.endswith(".lever.co"):
        return "lever"
    if host == "jobs.ashbyhq.com" or host.endswith(".ashbyhq.com"):
        return "ashby"
    if host.endswith(".myworkdayjobs.com") or host.endswith(".myworkdaysite.com"):
        return "workday"
    return None


def classify_remote(raw: Any) -> str:
    if not raw:
        return "unknown"
    lower = str(raw).lower()
    if re.search(r"\b(us[- ]?only|canada[- ]?only|residents only|usa only|us residents|canada residents)\b", lower):
        return "geo-restricted"
    if re.search(r"\bargentina\s+remote\s+only\b", lower):
        return "geo-restricted"
    if re.search(r"\b(hybrid|on-?site|office|columbus|cape town|relocat)\b", lower):
        return "hybrid/onsite"
    if re.search(r"\b(global|anywhere|worldwide|no restrict|70\+|work from anywhere)\b", lower):
        return "global remote"
    if re.search(r"\b(remote|latam|americas|brazil|fully remote)\b", lower):
        return "regional remote"
    return "unknown"


def classify_company_size(team_size: Any) -> str:
    if not team_size:
        return "unknown"
    lower = str(team_size).lower()
    nums = [int(item.replace(",", "")) for item in re.findall(r"[\d,]+", lower)]
    if nums:
        max_value = max(nums)
        if max_value <= 50:
            return "startup"
        if max_value <= 500:
            return "scaleup"
        return "enterprise"
    if re.search(r"\b(small|elite|tiny|founding)\b", lower):
        return "startup"
    if re.search(r"\b(large|enterprise|global)\b", lower):
        return "enterprise"
    return "unknown"


def extract_blocker_type(gap: dict[str, Any]) -> str | None:
    desc = str(gap.get("description") or "").lower()
    severity = str(gap.get("severity") or "").lower()
    if "nice" in severity or "soft" in severity:
        return None
    if re.search(r"\b(residency|us[- ]only|canada|location|visa|geo|country|region)\b", desc):
        return "geo-restriction"
    if re.search(r"\b(javascript|typescript|python|ruby|java|go|rust|node|react|angular|vue|django|flask|rails)\b", desc):
        return "stack-mismatch"
    if re.search(r"\b(senior|staff|lead|principal|director|manager|head)\b", desc):
        return "seniority-mismatch"
    if re.search(r"\b(hybrid|on-?site|office|relocat)\b", desc):
        return "onsite-requirement"
    return "other"


def build_via_channel_analysis(entries: list[dict[str, Any]], is_advanced, min_sample: int = 8) -> dict[str, Any]:
    def via_of(entry: dict[str, Any]) -> str:
        return str(entry.get("via") or "").strip()

    def is_direct(value: str) -> bool:
        return value in {"—", "-"}

    agency_submitted = [entry for entry in entries if via_of(entry) and not is_direct(via_of(entry))]
    direct_submitted = [entry for entry in entries if is_direct(via_of(entry))]

    def rate(items: list[dict[str, Any]]) -> int:
        return round((len([entry for entry in items if is_advanced(entry)]) / len(items)) * 100) if items else 0

    by_agency: dict[str, dict[str, Any]] = {}
    for entry in agency_submitted:
        raw = via_of(entry)
        key = normalize_via(raw) or raw.casefold()
        if key not in by_agency:
            by_agency[key] = {"agency": raw, "total": 0, "advanced": 0}
        by_agency[key]["total"] += 1
        if is_advanced(entry):
            by_agency[key]["advanced"] += 1
    breakdown = [
        {
            "agency": value["agency"],
            "total": value["total"],
            "advanced": value["advanced"],
            "advanceRate": round((value["advanced"] / value["total"]) * 100) if value["total"] else 0,
            "sufficientSample": value["total"] >= min_sample,
        }
        for value in by_agency.values()
    ]
    breakdown.sort(key=lambda item: item["total"], reverse=True)
    return {
        "minSampleForClaim": min_sample,
        "agencySubmitted": len(agency_submitted),
        "directSubmitted": len(direct_submitted),
        "unknownVia": len(entries) - len(agency_submitted) - len(direct_submitted),
        "agencyAdvanceRate": rate(agency_submitted),
        "directAdvanceRate": rate(direct_submitted),
        "breakdown": breakdown,
    }


def parse_report_content(content: str) -> dict[str, Any]:
    report = {
        "company": None,
        "role": None,
        "url": None,
        "archetype": None,
        "legitimacyTier": None,
        "finalDecision": None,
        "seniority": None,
        "remote": None,
        "teamSize": None,
        "comp": None,
        "domain": None,
        "riskLevel": None,
        "confidence": None,
        "nextAction": None,
        "topStrengths": [],
        "discardReasons": [],
        "scores": {},
        "gaps": [],
    }
    machine = parse_machine_summary(content)
    if machine:
        report["machineSummary"] = machine
        mappings = {
            "company": "company",
            "role": "role",
            "archetype": "archetype",
            "legitimacy_tier": "legitimacyTier",
            "final_decision": "finalDecision",
            "domain": "domain",
            "seniority": "seniority",
            "remote": "remote",
            "team_size": "teamSize",
            "risk_level": "riskLevel",
            "confidence": "confidence",
            "next_action": "nextAction",
        }
        for source, target in mappings.items():
            report[target] = normalize_scalar(machine.get(source)) or report[target]
        report["topStrengths"] = normalize_list(machine.get("top_strengths"))
        report["discardReasons"] = normalize_list(machine.get("discard_reasons"))
        if isinstance(machine.get("score"), (int, float)):
            report["scores"]["global"] = machine["score"]
        for hard_stop in normalize_list(machine.get("hard_stops")):
            report["gaps"].append({"description": hard_stop, "severity": "hard stop", "mitigation": ""})
        for soft_gap in normalize_list(machine.get("soft_gaps")):
            report["gaps"].append({"description": soft_gap, "severity": "soft gap", "mitigation": ""})

    plain = re.sub(r"\*\*", "", content or "")
    url_match = re.search(r"^URL:\s*(https?://\S+)", plain, flags=re.I | re.M)
    if url_match and not report["url"]:
        report["url"] = re.sub(r"[)>\].,]+$", "", url_match.group(1).strip())

    patterns = [
        ("archetype", r"\|\s*(?:Detected\s+)?(?:Archetype|Arquetipo)\s*\|\s*(.*?)\s*\|", r"^(?:Archetype|Arquetipo):\s*(.+?)$"),
        ("seniority", r"\|\s*(?:Seniority|Nivel|Level)\s*\|\s*(.*?)\s*\|", None),
        ("remote", r"\|\s*(?:Remote|Remoto|Location)\s*\|\s*(.*?)\s*\|", None),
        ("teamSize", r"\|\s*(?:Team|Team size|Equipo)\s*\|\s*(.*?)\s*\|", None),
        ("comp", r"\|\s*(?:Comp|Salary|Salario|Listed salary)\s*\|\s*(.*?)\s*\|", None),
        ("domain", r"\|\s*(?:Domain|Dominio|Industry)\s*\|\s*(.*?)\s*\|", None),
    ]
    for key, table_pattern, fallback_pattern in patterns:
        if report[key]:
            continue
        match = re.search(table_pattern, plain, flags=re.I) or (re.search(fallback_pattern, plain, flags=re.I | re.M) if fallback_pattern else None)
        if match:
            report[key] = match.group(1).strip()

    score_patterns = {
        "cvMatch": r"\|\s*(?:CV Match|Match con CV)\s*\|\s*([\d.]+)\/5\s*\|",
        "northStar": r"\|\s*(?:North Star)\s*\|\s*([\d.]+)\/5\s*\|",
        "comp": r"\|\s*(?:Comp)\s*\|\s*([\d.]+)\/5\s*\|",
        "cultural": r"\|\s*(?:Cultural signals|Cultural)\s*\|\s*([\d.]+)\/5\s*\|",
        "redFlags": r"\|\s*(?:Red flags)\s*\|\s*([-+]?[\d.]+)\s*\|",
        "global": r"\|\s*(?:Global)\s*\|\s*([\d.]+)\/5\s*\|",
    }
    for key, pattern in score_patterns.items():
        if key in report["scores"]:
            continue
        match = re.search(pattern, plain, flags=re.I)
        if match:
            report["scores"][key] = float(match.group(1))
    gap_match = re.search(r"\|\s*Gap\s*\|\s*Severity\s*\|.*?\n\|[-|\s]+\n([\s\S]*?)(?:\n\n|\n##|\n\*\*|$)", content or "", flags=re.I)
    if gap_match:
        for row in [line for line in gap_match.group(1).splitlines() if line.startswith("|")]:
            cols = [part.strip() for part in row.split("|") if part.strip()]
            if len(cols) >= 2 and not any(gap["description"].lower() == cols[0].lower() for gap in report["gaps"]):
                report["gaps"].append({"description": cols[0], "severity": cols[1].lower(), "mitigation": cols[2] if len(cols) > 2 else ""})
    return report


def parse_tracker_content(content: str) -> list[Any]:
    lines = content.splitlines()
    colmap = resolve_columns(lines)
    return [row for line in lines if (row := parse_tracker_row(line, colmap))]


def stats(values: list[float]) -> dict[str, Any]:
    if not values:
        return {"avg": 0, "min": 0, "max": 0, "count": 0}
    return {"avg": round(sum(values) / len(values), 2), "min": min(values), "max": max(values), "count": len(values)}


def bucket_breakdown(entries: list[dict[str, Any]], key: str, label: str) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}
    for entry in entries:
        value = entry.get(key) or "Unknown"
        buckets.setdefault(value, {"total": 0, "positive": 0, "negative": 0, "self_filtered": 0, "pending": 0})
        buckets[value]["total"] += 1
        buckets[value][entry["outcome"]] += 1
    result = []
    for value, data in buckets.items():
        result.append({label: value, **data, "conversionRate": round((data["positive"] / data["total"]) * 100) if data["total"] else 0})
    return sorted(result, key=lambda item: item["total"], reverse=True)


def analyze_entries(entries: list[Any], reports: dict[str, str] | None = None, *, min_threshold: int = 5, min_vendor_n: int = 8, today: str | None = None) -> dict[str, Any]:
    reports = reports or {}
    enriched = []
    for row in entries:
        report_content = reports.get(str(row.report))
        report_data = parse_report_content(report_content) if report_content else None
        outcome = classify_outcome(row.status)
        try:
            tracker_score = float(str(row.score).replace("/5", ""))
        except ValueError:
            tracker_score = 0
        score = tracker_score or (report_data or {}).get("scores", {}).get("global", 0)
        enriched.append(
            {
                "num": row.num,
                "date": row.date,
                "company": row.company,
                "role": row.role,
                "score": score,
                "notes": row.notes,
                "via": row.via,
                "normalizedStatus": normalize_status(row.status),
                "outcome": outcome,
                "report": report_data,
                "remoteBucket": classify_remote((report_data or {}).get("remote") or row.notes),
                "companySize": classify_company_size((report_data or {}).get("teamSize")),
                "vendor": detect_vendor((report_data or {}).get("url")),
            }
        )
    beyond = [entry for entry in enriched if entry["normalizedStatus"] != "evaluated"]
    if len(beyond) < min_threshold:
        return {
            "error": f'Not enough data: {len(beyond)}/{min_threshold} applications beyond "Evaluated". Keep applying and come back later.',
            "current": len(beyond),
            "threshold": min_threshold,
        }
    funnel: dict[str, int] = {}
    score_groups = {"positive": [], "negative": [], "self_filtered": [], "pending": []}
    blockers: dict[str, int] = {}
    for entry in enriched:
        funnel[entry["normalizedStatus"]] = funnel.get(entry["normalizedStatus"], 0) + 1
        if entry["score"]:
            score_groups[entry["outcome"]].append(float(entry["score"]))
        for gap in (entry.get("report") or {}).get("gaps", []):
            blocker = extract_blocker_type(gap)
            if blocker:
                blockers[blocker] = blockers.get(blocker, 0) + 1
    submitted = [entry for entry in enriched if entry["normalizedStatus"] in SUBMITTED_STATUSES]
    is_advanced = lambda entry: entry["normalizedStatus"] in ADVANCED_STATUSES
    vendor_buckets: dict[str, dict[str, int]] = {}
    for entry in submitted:
        vendor = entry["vendor"] or "unknown"
        vendor_buckets.setdefault(vendor, {"total": 0, "advanced": 0})
        vendor_buckets[vendor]["total"] += 1
        vendor_buckets[vendor]["advanced"] += 1 if is_advanced(entry) else 0
    identified = len(submitted) - vendor_buckets.get("unknown", {}).get("total", 0)
    vendor_breakdown = [
        {
            "vendor": vendor,
            "total": data["total"],
            "advanced": data["advanced"],
            "advanceRate": round((data["advanced"] / data["total"]) * 100) if data["total"] else 0,
            "sharePct": round((data["total"] / len(submitted)) * 100) if submitted else 0,
            "sufficientSample": data["total"] >= min_vendor_n,
        }
        for vendor, data in vendor_buckets.items()
        if vendor != "unknown"
    ]
    vendor_breakdown.sort(key=lambda item: item["total"], reverse=True)
    dates = sorted(entry["date"] for entry in enriched if entry["date"])
    return {
        "metadata": {
            "total": len(enriched),
            "dateRange": {"from": dates[0] if dates else None, "to": dates[-1] if dates else None},
            "analysisDate": today or date.today().isoformat(),
            "byOutcome": {outcome: len([entry for entry in enriched if entry["outcome"] == outcome]) for outcome in score_groups},
        },
        "funnel": funnel,
        "scoreComparison": {key: stats(values) for key, values in score_groups.items()},
        "archetypeBreakdown": bucket_breakdown([{**entry, "archetype": (entry.get("report") or {}).get("archetype") or "Unknown"} for entry in enriched], "archetype", "archetype"),
        "blockerAnalysis": sorted(
            [{"blocker": key, "frequency": value, "percentage": round((value / len(enriched)) * 100)} for key, value in blockers.items()],
            key=lambda item: item["frequency"],
            reverse=True,
        ),
        "remotePolicy": bucket_breakdown(enriched, "remoteBucket", "policy"),
        "companySizeBreakdown": bucket_breakdown(enriched, "companySize", "size"),
        "vendorAnalysis": {
            "scope": ["greenhouse", "lever", "ashby", "workday"],
            "minSampleForClaim": min_vendor_n,
            "submitted": len(submitted),
            "identified": identified,
            "coveragePct": round((identified / len(submitted)) * 100) if submitted else 0,
            "overallAdvanceRate": round((len([entry for entry in submitted if is_advanced(entry)]) / len(submitted)) * 100) if submitted else 0,
            "breakdown": vendor_breakdown,
            "citation": "Bommasani et al., Algorithmic Monocultures in Hiring, FAccT 2026 (arXiv:2605.27371)",
        },
        "viaChannelAnalysis": build_via_channel_analysis(submitted, is_advanced, min_vendor_n),
    }


def analyze(root: str | Path = PROJECT_ROOT, *, min_threshold: int = 5, min_vendor_n: int = 8) -> dict[str, Any]:
    project = Path(root)
    tracker = project / "data/applications.md"
    if not tracker.exists():
        tracker = project / "applications.md"
    if not tracker.exists():
        return {"error": "No applications found in tracker."}
    entries = parse_tracker_content(tracker.read_text(encoding="utf-8"))
    reports: dict[str, str] = {}
    for row in entries:
        match = re.search(r"\]\(([^)]+)\)", row.report)
        if not match:
            continue
        candidate = tracker.parent / match.group(1)
        if not candidate.exists():
            candidate = project / match.group(1)
        try:
            rel = candidate.relative_to(project)
        except ValueError:
            continue
        if str(rel).startswith("reports/") and candidate.exists():
            reports[row.report] = candidate.read_text(encoding="utf-8")
    return analyze_entries(entries, reports, min_threshold=min_threshold, min_vendor_n=min_vendor_n)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Analyze application patterns.")
    parser.add_argument("--min-threshold", type=int, default=5)
    parser.add_argument("--min-vendor-n", type=int, default=8)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    print(json.dumps(analyze(min_threshold=args.min_threshold, min_vendor_n=max(1, args.min_vendor_n)), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
