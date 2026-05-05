#!/usr/bin/env python3
"""
analyze_patterns.py — Rejection Pattern Detector for career-ops (Python port)

Parses applications.md + all linked evaluation reports, extracts dimensions
(archetype, seniority, remote policy, gaps, scores), classifies outcomes, and
outputs structured JSON with actionable patterns.

Python port of analyze-patterns.mjs. Stdlib only — no external dependencies.

Usage:
    python analyze_patterns.py               # JSON to stdout
    python analyze_patterns.py --summary     # human-readable table
    python analyze_patterns.py --min-threshold 3
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

CAREER_OPS = Path(__file__).resolve().parent
APPS_FILE = (
    CAREER_OPS / "data" / "applications.md"
    if (CAREER_OPS / "data" / "applications.md").exists()
    else CAREER_OPS / "applications.md"
)
REPORTS_DIR = CAREER_OPS / "reports"

# ---------------------------------------------------------------------------
# Status normalisation (mirrors verify-pipeline.mjs)
# ---------------------------------------------------------------------------

ALIASES: dict[str, str] = {
    "evaluada": "evaluated", "condicional": "evaluated", "hold": "evaluated",
    "evaluar": "evaluated", "verificar": "evaluated",
    "aplicado": "applied", "enviada": "applied", "aplicada": "applied",
    "applied": "applied", "sent": "applied",
    "respondido": "responded",
    "entrevista": "interview",
    "oferta": "offer",
    "rechazado": "rejected", "rechazada": "rejected",
    "descartado": "discarded", "descartada": "discarded",
    "cerrada": "discarded", "cancelada": "discarded",
    "no aplicar": "skip", "no_aplicar": "skip", "monitor": "skip",
    "geo blocker": "skip",
}


def normalize_status(raw: str) -> str:
    clean = re.sub(r"\*\*", "", raw).strip().lower()
    clean = re.sub(r"\s+\d{4}-\d{2}-\d{2}.*$", "", clean).strip()
    return ALIASES.get(clean, clean)


def classify_outcome(status: str) -> str:
    s = normalize_status(status)
    if s in {"interview", "offer", "responded", "applied"}:
        return "positive"
    if s in {"rejected", "discarded"}:
        return "negative"
    if s == "skip":
        return "self_filtered"
    return "pending"


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class Gap:
    description: str
    severity: str
    mitigation: str


@dataclass
class ReportData:
    archetype: str | None = None
    seniority: str | None = None
    remote: str | None = None
    team_size: str | None = None
    comp: str | None = None
    domain: str | None = None
    scores: dict[str, float] = field(default_factory=dict)
    gaps: list[Gap] = field(default_factory=list)


@dataclass
class TrackerEntry:
    num: int
    date: str
    company: str
    role: str
    score_raw: str
    status: str
    pdf: str
    report_link: str
    notes: str


# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------

def parse_tracker() -> list[TrackerEntry]:
    if not APPS_FILE.exists():
        return []
    entries: list[TrackerEntry] = []
    for line in APPS_FILE.read_text(encoding="utf-8").splitlines():
        if not line.startswith("|"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 9:
            continue
        try:
            num = int(parts[1])
        except ValueError:
            continue
        entries.append(TrackerEntry(
            num=num,
            date=parts[2],
            company=parts[3],
            role=parts[4],
            score_raw=parts[5],
            status=parts[6],
            pdf=parts[7],
            report_link=parts[8],
            notes=parts[9] if len(parts) > 9 else "",
        ))
    return entries


def _find(pattern: str, text: str, group: int = 1) -> str | None:
    m = re.search(pattern, text, re.IGNORECASE)
    return m.group(group).strip() if m else None


def parse_report(report_path: Path) -> ReportData | None:
    if not report_path.exists():
        return None
    content = report_path.read_text(encoding="utf-8")
    plain = content.replace("**", "")
    r = ReportData()

    r.archetype = _find(r"\|\s*(?:Archetype|Arquetipo)\s*\|\s*(.*?)\s*\|", plain)
    r.seniority = _find(r"\|\s*(?:Seniority|Nivel|Level)\s*\|\s*(.*?)\s*\|", plain)
    r.remote    = _find(r"\|\s*(?:Remote|Remoto|Location)\s*\|\s*(.*?)\s*\|", plain)
    r.team_size = _find(r"\|\s*(?:Team|Team size|Equipo)\s*\|\s*(.*?)\s*\|", plain)
    r.comp      = _find(r"\|\s*(?:Comp|Salary|Salario|Listed salary)\s*\|\s*(.*?)\s*\|", plain)
    r.domain    = _find(r"\|\s*(?:Domain|Dominio|Industry)\s*\|\s*(.*?)\s*\|", plain)

    score_patterns = {
        "cvMatch":   r"\|\s*(?:CV Match|Match con CV)\s*\|\s*([\d.]+)/5\s*\|",
        "northStar": r"\|\s*North Star\s*\|\s*([\d.]+)/5\s*\|",
        "comp":      r"\|\s*Comp\s*\|\s*([\d.]+)/5\s*\|",
        "cultural":  r"\|\s*(?:Cultural signals|Cultural)\s*\|\s*([\d.]+)/5\s*\|",
        "redFlags":  r"\|\s*Red flags\s*\|\s*([-+]?[\d.]+)\s*\|",
        "global":    r"\|\s*Global\s*\|\s*([\d.]+)/5\s*\|",
    }
    for key, pat in score_patterns.items():
        val = _find(pat, plain)
        if val is not None:
            try:
                r.scores[key] = float(val)
            except ValueError:
                pass

    gap_table = re.search(
        r"\|\s*Gap\s*\|\s*Severity\s*\|.*?\n\|[-|\s]+\n([\s\S]*?)(?:\n\n|\n##|\n\*\*|$)",
        content, re.IGNORECASE,
    )
    if gap_table:
        for row in gap_table.group(1).splitlines():
            if not row.startswith("|"):
                continue
            cols = [c.strip() for c in row.split("|") if c.strip()]
            if len(cols) >= 2:
                r.gaps.append(Gap(
                    description=cols[0],
                    severity=cols[1].lower(),
                    mitigation=cols[2] if len(cols) > 2 else "",
                ))
    return r


# ---------------------------------------------------------------------------
# Classifiers
# ---------------------------------------------------------------------------

def classify_remote(raw: str | None) -> str:
    if not raw:
        return "unknown"
    lo = raw.lower()
    if re.search(r"\b(us[- ]?only|canada[- ]?only|residents only|usa only|us residents|canada residents)\b", lo):
        return "geo-restricted"
    if re.search(r"\bargentina\s+remote\s+only\b", lo):
        return "geo-restricted"
    if re.search(r"\b(hybrid|on-?site|office|columbus|cape town|relocat)\b", lo):
        return "hybrid/onsite"
    if re.search(r"\b(global|anywhere|worldwide|no restrict|70\+|work from anywhere)\b", lo):
        return "global remote"
    if re.search(r"\b(remote|latam|americas|brazil|fully remote)\b", lo):
        return "regional remote"
    return "unknown"


def classify_company_size(team_size: str | None) -> str:
    if not team_size:
        return "unknown"
    lo = team_size.lower()
    nums = [int(n.replace(",", "")) for n in re.findall(r"[\d,]+", lo) if n.replace(",", "")]
    if nums:
        mx = max(nums)
        if mx <= 50:
            return "startup"
        if mx <= 500:
            return "scaleup"
        return "enterprise"
    if re.search(r"\b(small|elite|tiny|founding)\b", lo):
        return "startup"
    if re.search(r"\b(large|enterprise|global)\b", lo):
        return "enterprise"
    return "unknown"


def extract_blocker_type(gap: Gap) -> str | None:
    desc = gap.description.lower()
    sev  = gap.severity.lower()
    if "nice" in sev or "soft" in sev:
        return None
    if re.search(r"\b(residency|us[- ]?only|canada|location|visa|geo|country|region)\b", desc):
        return "geo-restriction"
    if re.search(r"\b(javascript|typescript|python|ruby|java|go|rust|node|react|angular|vue|django|flask|rails)\b", desc):
        return "stack-mismatch"
    if re.search(r"\b(senior|staff|lead|principal|director|manager|head)\b", desc):
        return "seniority-mismatch"
    if re.search(r"\b(hybrid|on-?site|office|relocat)\b", desc):
        return "onsite-requirement"
    return "other"


# ---------------------------------------------------------------------------
# Stats helpers
# ---------------------------------------------------------------------------

def score_stats(scores: list[float]) -> dict[str, Any]:
    if not scores:
        return {"avg": 0, "min": 0, "max": 0, "count": 0}
    avg = sum(scores) / len(scores)
    return {
        "avg": round(avg, 2),
        "min": min(scores),
        "max": max(scores),
        "count": len(scores),
    }


def breakdown_map(items: list[dict]) -> list[dict]:
    return sorted(items, key=lambda x: -x["total"])


# ---------------------------------------------------------------------------
# Main analysis
# ---------------------------------------------------------------------------

def analyze(min_threshold: int = 5) -> dict[str, Any]:
    entries = parse_tracker()
    if not entries:
        return {"error": "No applications found in tracker."}

    enriched: list[dict] = []
    for e in entries:
        report_match = re.search(r"\]\(([^)]+)\)", e.report_link)
        report_path  = CAREER_OPS / report_match.group(1) if report_match else None
        report_data  = parse_report(report_path) if report_path else None
        outcome      = classify_outcome(e.status)
        try:
            score = float(re.search(r"[\d.]+", e.score_raw).group()) if e.score_raw else 0.0
        except (AttributeError, ValueError):
            score = 0.0

        remote_source = (report_data.remote if report_data else None) or e.notes or ""
        team_source   = (report_data.team_size if report_data else None) or ""

        enriched.append({
            "num":              e.num,
            "date":             e.date,
            "company":          e.company,
            "role":             e.role,
            "normalizedStatus": normalize_status(e.status),
            "outcome":          outcome,
            "score":            score,
            "report":           report_data,
            "remoteBucket":     classify_remote(remote_source),
            "companySize":      classify_company_size(team_source),
        })

    beyond = [e for e in enriched if e["normalizedStatus"] != "evaluated"]
    if len(beyond) < min_threshold:
        return {
            "error": (
                f"Not enough data: {len(beyond)}/{min_threshold} applications beyond "
                f"\"Evaluated\". Keep applying and come back later."
            ),
            "current":   len(beyond),
            "threshold": min_threshold,
        }

    # --- Funnel ---
    funnel: dict[str, int] = {}
    for e in enriched:
        funnel[e["normalizedStatus"]] = funnel.get(e["normalizedStatus"], 0) + 1

    # --- Scores by outcome ---
    scores_by_outcome: dict[str, list[float]] = {
        "positive": [], "negative": [], "self_filtered": [], "pending": []
    }
    for e in enriched:
        if e["score"] > 0:
            scores_by_outcome[e["outcome"]].append(e["score"])
    score_comparison = {k: score_stats(v) for k, v in scores_by_outcome.items()}

    # --- Archetype breakdown ---
    arch_map: dict[str, dict] = {}
    for e in enriched:
        arch = (e["report"].archetype if e["report"] else None) or "Unknown"
        if arch not in arch_map:
            arch_map[arch] = {"total": 0, "positive": 0, "negative": 0, "self_filtered": 0, "pending": 0}
        arch_map[arch]["total"] += 1
        arch_map[arch][e["outcome"]] += 1
    archetype_breakdown = breakdown_map([
        {
            "archetype":      arch,
            **data,
            "conversionRate": round(data["positive"] / data["total"] * 100) if data["total"] else 0,
        }
        for arch, data in arch_map.items()
    ])

    # --- Blocker analysis ---
    blocker_counts: dict[str, int] = {}
    for e in enriched:
        if not e["report"]:
            continue
        for gap in e["report"].gaps:
            btype = extract_blocker_type(gap)
            if btype:
                blocker_counts[btype] = blocker_counts.get(btype, 0) + 1
    blocker_analysis = sorted(
        [
            {
                "blocker":    b,
                "frequency":  f,
                "percentage": round(f / len(enriched) * 100),
            }
            for b, f in blocker_counts.items()
        ],
        key=lambda x: -x["frequency"],
    )

    # --- Remote policy ---
    remote_map: dict[str, dict] = {}
    for e in enriched:
        policy = e["remoteBucket"]
        if policy not in remote_map:
            remote_map[policy] = {"total": 0, "positive": 0, "negative": 0, "self_filtered": 0, "pending": 0}
        remote_map[policy]["total"] += 1
        remote_map[policy][e["outcome"]] += 1
    remote_policy = breakdown_map([
        {
            "policy":         policy,
            **data,
            "conversionRate": round(data["positive"] / data["total"] * 100) if data["total"] else 0,
        }
        for policy, data in remote_map.items()
    ])

    # --- Company size breakdown ---
    size_map: dict[str, dict] = {}
    for e in enriched:
        size = e["companySize"]
        if size not in size_map:
            size_map[size] = {"total": 0, "positive": 0, "negative": 0, "self_filtered": 0, "pending": 0}
        size_map[size]["total"] += 1
        size_map[size][e["outcome"]] += 1
    company_size_breakdown = breakdown_map([
        {
            "size":           size,
            **data,
            "conversionRate": round(data["positive"] / data["total"] * 100) if data["total"] else 0,
        }
        for size, data in size_map.items()
    ])

    # --- Score threshold ---
    positive_scores = [s for s in scores_by_outcome["positive"] if s > 0]
    min_positive    = min(positive_scores) if positive_scores else 0.0
    score_threshold = {
        "recommended": round(min_positive * 10) / 10 if min_positive > 0 else 3.5,
        "reasoning": (
            f"Lowest score among positive outcomes is {min_positive}. "
            "No applications below this score led to progress."
            if positive_scores else
            "Not enough positive outcome data to determine threshold."
        ),
        "positiveRange": (
            f"{min(positive_scores)} - {max(positive_scores)}" if positive_scores else "N/A"
        ),
    }

    # --- Tech stack gaps ---
    TECH_PATTERN = re.compile(
        r"\b(JavaScript|TypeScript|Python|Ruby|Java|Go|Rust|Node\.?js|React|Angular|"
        r"Vue\.?js|Django|Flask|Rails|PHP|Laravel|Symfony|Kotlin|Swift|C\+\+|C#|\.NET|"
        r"MongoDB|MySQL|PostgreSQL|Redis|GraphQL|REST|AWS|GCP|Azure|Docker|Kubernetes|"
        r"Terraform|Supabase|Inngest|React Native)\b",
        re.IGNORECASE,
    )
    stack_gap_counts: dict[str, int] = {}
    for e in enriched:
        if e["outcome"] not in {"negative", "self_filtered"} or not e["report"]:
            continue
        for gap in e["report"].gaps:
            for tech in TECH_PATTERN.findall(gap.description):
                normalized = tech[0].upper() + tech[1:]
                stack_gap_counts[normalized] = stack_gap_counts.get(normalized, 0) + 1
    tech_stack_gaps = sorted(
        [{"skill": k, "frequency": v} for k, v in stack_gap_counts.items()],
        key=lambda x: -x["frequency"],
    )[:15]

    # --- Recommendations ---
    recommendations: list[dict] = []

    geo_blocker = next((b for b in blocker_analysis if b["blocker"] == "geo-restriction"), None)
    if geo_blocker and geo_blocker["percentage"] >= 20:
        recommendations.append({
            "action": (
                f"Tighten location filters in portals.yml — {geo_blocker['percentage']}% "
                "of applications hit a geo-restriction blocker"
            ),
            "reasoning": (
                f"{geo_blocker['frequency']} of {len(enriched)} offers are location-restricted "
                "(US/Canada-only). These are wasted evaluation effort."
            ),
            "impact": "high",
        })

    stack_blocker = next((b for b in blocker_analysis if b["blocker"] == "stack-mismatch"), None)
    if stack_blocker and stack_blocker["percentage"] >= 15:
        top_gaps = ", ".join(g["skill"] for g in tech_stack_gaps[:3])
        recommendations.append({
            "action": (
                f"Filter out roles requiring {top_gaps} as primary stack — "
                f"{stack_blocker['percentage']}% hit stack mismatch"
            ),
            "reasoning": (
                f"Core stack gaps ({top_gaps}) are the most common technical blockers "
                "in negative outcomes."
            ),
            "impact": "high",
        })

    if min_positive > 3.0:
        recommendations.append({
            "action": f"Set minimum score threshold at {score_threshold['recommended']}/5 before generating PDFs",
            "reasoning": f"No positive outcomes below {min_positive}/5. Scores below this are wasted effort.",
            "impact": "medium",
        })

    best_arch = next(
        (a for a in sorted(archetype_breakdown, key=lambda x: -x["conversionRate"]) if a["total"] >= 2 and a["conversionRate"] > 0),
        None,
    )
    if best_arch:
        recommendations.append({
            "action": f"Double down on \"{best_arch['archetype']}\" roles ({best_arch['conversionRate']}% conversion rate)",
            "reasoning": f"{best_arch['positive']} of {best_arch['total']} applications in this archetype led to positive outcomes.",
            "impact": "medium",
        })

    worst_remote = next(
        (r for r in remote_policy if r["total"] >= 2 and r["conversionRate"] == 0),
        None,
    )
    if worst_remote:
        recommendations.append({
            "action": f"Avoid \"{worst_remote['policy']}\" roles (0% conversion across {worst_remote['total']} applications)",
            "reasoning": f"None of the {worst_remote['total']} applications with this policy led to progress.",
            "impact": "medium",
        })

    dates = sorted(e["date"] for e in enriched if e["date"])

    return {
        "metadata": {
            "total":       len(enriched),
            "dateRange":   {"from": dates[0] if dates else None, "to": dates[-1] if dates else None},
            "analysisDate": __import__("datetime").date.today().isoformat(),
            "byOutcome": {
                "positive":     sum(1 for e in enriched if e["outcome"] == "positive"),
                "negative":     sum(1 for e in enriched if e["outcome"] == "negative"),
                "self_filtered": sum(1 for e in enriched if e["outcome"] == "self_filtered"),
                "pending":      sum(1 for e in enriched if e["outcome"] == "pending"),
            },
        },
        "funnel":               funnel,
        "scoreComparison":      score_comparison,
        "archetypeBreakdown":   archetype_breakdown,
        "blockerAnalysis":      blocker_analysis,
        "remotePolicy":         remote_policy,
        "companySizeBreakdown": company_size_breakdown,
        "scoreThreshold":       score_threshold,
        "techStackGaps":        tech_stack_gaps,
        "recommendations":      recommendations,
    }


# ---------------------------------------------------------------------------
# Summary (human-readable)
# ---------------------------------------------------------------------------

def print_summary(result: dict[str, Any]) -> None:
    if "error" in result:
        print(f"\n{result['error']}\n")
        return

    meta   = result["metadata"]
    funnel = result["funnel"]

    print(f"\n{'=' * 60}")
    print(f"  Pattern Analysis — {meta['analysisDate']}")
    print(f"  {meta['total']} applications ({meta['dateRange']['from']} to {meta['dateRange']['to']})")
    print(f"{'=' * 60}\n")

    print("CONVERSION FUNNEL")
    print("-" * 40)
    for status in ["evaluated", "applied", "responded", "interview", "offer", "rejected", "discarded", "skip"]:
        if status in funnel:
            pct = round(funnel[status] / meta["total"] * 100)
            print(f"  {status:<15} {funnel[status]:>3} ({pct}%)")

    print("\nSCORE BY OUTCOME")
    print("-" * 40)
    for group, stats in result["scoreComparison"].items():
        if stats["count"] > 0:
            print(f"  {group:<15} avg {stats['avg']}/5  ({stats['count']} entries, range {stats['min']}-{stats['max']})")

    if result["blockerAnalysis"]:
        print("\nTOP BLOCKERS")
        print("-" * 40)
        for b in result["blockerAnalysis"]:
            print(f"  {b['blocker']:<20} {b['frequency']:>2}x ({b['percentage']}% of all)")

    print("\nREMOTE POLICY")
    print("-" * 40)
    for r in result["remotePolicy"]:
        print(f"  {r['policy']:<20} {r['total']:>2} total, {r['positive']} positive ({r['conversionRate']}%)")

    if result["techStackGaps"]:
        print("\nTOP TECH STACK GAPS (negative outcomes)")
        print("-" * 40)
        for g in result["techStackGaps"][:10]:
            print(f"  {g['skill']:<20} {g['frequency']}x")

    st = result["scoreThreshold"]
    print(f"\nSCORE THRESHOLD: {st['recommended']}/5")
    print(f"  {st['reasoning']}")

    if result["recommendations"]:
        print("\nRECOMMENDATIONS")
        print("=" * 60)
        for i, r in enumerate(result["recommendations"], 1):
            print(f"  {i}. [{r['impact'].upper()}] {r['action']}")
            print(f"     {r['reasoning']}")

    print()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Rejection pattern detector for career-ops.")
    parser.add_argument("--summary",       action="store_true", help="Human-readable output instead of JSON")
    parser.add_argument("--min-threshold", type=int, default=5, metavar="N",
                        help="Minimum applied/beyond-evaluated entries before analysis runs (default: 5)")
    args = parser.parse_args()

    result = analyze(min_threshold=args.min_threshold)

    if args.summary:
        print_summary(result)
    else:
        print(json.dumps(result, indent=2, default=str))

    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
