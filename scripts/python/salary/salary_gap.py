#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from scripts.python import CONFIG_DIR, DATA_DIR, PROJECT_ROOT, REPORTS_DIR


TRUST: dict[str, dict[str, int]] = {
    "actual": {"contract": 3, "offer-letter": 2, "recruiter-verbal": 1, "user": 0},
    "desired": {"user": 1, "profile": 0},
    "advertised": {"user": 2, "recruiter-verbal": 1, "jd": 0},
}
VALID_TYPES = {"desired", "advertised", "actual"}
FENCE_RE = re.compile(r"##\s*Machine Summary\s*\n+```(?:yaml|yml)?\s*\n([\s\S]*?)\n```", re.IGNORECASE)
REPORT_FILE_RE = re.compile(r"^(\d{3})-.*-(\d{4}-\d{2}-\d{2})\.md$")


@dataclass(frozen=True)
class Amount:
    min: float
    max: float
    mid: float


@dataclass(frozen=True)
class Observation:
    num: str
    date: str
    type: str
    amount: str
    currency: str
    source: str
    note: str = ""
    parsed: Amount | None = None


def parse_amount(raw: Any) -> Amount | None:
    text = str(raw if raw is not None else "").strip()
    if not text or text == "?" or text == "-" or re.match(r"^(n/?a|null)$", text, re.IGNORECASE):
        return None
    text = re.sub(r"^[€$£¥]\s*", "", text)
    text = re.sub(r"\s*[A-Za-z]{3}\s*$", "", text).strip()

    def to_num(num: str, k_flag: str | None) -> float | None:
        try:
            value = float(num.replace(",", ""))
        except ValueError:
            return None
        return value * 1000 if k_flag else value

    range_match = re.match(r"^([\d.,]+)\s*(k)?\s*[-–—]\s*([\d.,]+)\s*(k)?$", text, re.IGNORECASE)
    if range_match:
        lo = to_num(range_match.group(1), range_match.group(2) or range_match.group(4))
        hi = to_num(range_match.group(3), range_match.group(4) or range_match.group(2))
        if lo is None or hi is None:
            return None
        low, high = min(lo, hi), max(lo, hi)
        return Amount(low, high, (low + high) / 2)

    single = re.match(r"^([\d.,]+)\s*(k)?$", text, re.IGNORECASE)
    if single:
        value = to_num(single.group(1), single.group(2))
        return Amount(value, value, value) if value is not None else None
    return None


def parse_observations(content: str) -> list[Observation]:
    observations: list[Observation] = []
    for line in str(content or "").splitlines():
        text = line.strip()
        if not text or text.startswith("#"):
            continue
        cells = [cell.strip() for cell in text.split("\t")]
        if len(cells) < 6:
            continue
        num, date, typ, amount, currency, source = cells[:6]
        note = cells[6] if len(cells) > 6 else ""
        if typ not in VALID_TYPES:
            continue
        normalized_currency = currency.upper() if currency else "UNKNOWN"
        observations.append(Observation(num, date, typ, amount, normalized_currency, source, note, parse_amount(amount)))
    return observations


def yaml_str(body: str, key: str) -> str | None:
    match = re.search(rf"^{re.escape(key)}:\s*(.*)$", body, re.MULTILINE)
    if not match:
        return None
    value = re.sub(r"^[\"']|[\"']$", "", match.group(1).strip())
    return None if value in {"null", ""} else value


def report_to_observation(content: str, num: str, date: str) -> dict[str, Any] | None:
    fence = FENCE_RE.search(str(content or ""))
    if not fence:
        return None
    body = fence.group(1)
    company = yaml_str(body, "company")
    role = yaml_str(body, "role")
    advertised = yaml_str(body, "advertised_comp")
    currency_guess = (re.search(r"\b[A-Z]{3}\b", advertised).group(0) if advertised and re.search(r"\b[A-Z]{3}\b", advertised) else "UNKNOWN") if advertised is not None else None
    return {
        "company": company,
        "role": role,
        "observation": None
        if advertised is None
        else Observation(num, date, "advertised", advertised, currency_guess or "UNKNOWN", "jd", "from report Machine Summary", parse_amount(advertised)),
    }


def pct_delta(from_value: float, to_value: float) -> float:
    return ((to_value - from_value) / from_value) * 100


def median(values: list[float]) -> float:
    ordered = sorted(values)
    mid = len(ordered) // 2
    return ordered[mid] if len(ordered) % 2 else (ordered[mid - 1] + ordered[mid]) / 2


def _obs_dict(obs: Observation) -> dict[str, Any]:
    return {
        "num": obs.num,
        "date": obs.date,
        "type": obs.type,
        "amount": obs.amount,
        "currency": obs.currency,
        "source": obs.source,
        "note": obs.note,
        "parsed": None if obs.parsed is None else {"min": obs.parsed.min, "max": obs.parsed.max, "mid": obs.parsed.mid},
    }


def pick_effective(typ: str, candidates: list[Observation]) -> dict[str, Any] | None:
    tiers = TRUST[typ]
    usable = [obs for obs in candidates if obs.type == typ and obs.parsed is not None and obs.source in tiers]
    if not usable:
        return None
    usable.sort(key=lambda obs: (tiers[obs.source], obs.date), reverse=True)
    top = usable[0]
    return {"value": top.parsed.mid, "source": top.source, "date": top.date, "currency": top.currency, "raw": top.amount}


def fold(observations: list[Observation], apps: dict[str, dict[str, Any]], profile_desired: dict[str, str] | None = None) -> dict[str, Any]:
    by_num: dict[str, list[Observation]] = {}
    for obs in observations:
        by_num.setdefault(obs.num, []).append(obs)

    applications: list[dict[str, Any]] = []
    orphans: list[dict[str, Any]] = []
    currency_mismatches: list[dict[str, Any]] = []
    unparseable = [{"num": obs.num, "type": obs.type, "raw": obs.amount} for obs in observations if obs.parsed is None and obs.amount and obs.amount != "?"]
    invalid_sources = [{"num": obs.num, "type": obs.type, "source": obs.source} for obs in observations if obs.type in TRUST and obs.source not in TRUST[obs.type]]

    profile_obs = None
    if profile_desired and profile_desired.get("amount"):
        profile_obs = Observation("*", "0000-00-00", "desired", str(profile_desired["amount"]), str(profile_desired.get("currency") or "UNKNOWN").upper(), "profile", "", parse_amount(profile_desired["amount"]))
        if profile_obs.parsed is None and profile_obs.amount != "?":
            unparseable.append({"num": "*", "type": "desired", "raw": profile_obs.amount, "source": "profile"})

    for num, obs_list in by_num.items():
        if num not in apps:
            orphans.append({"num": num, "count": len(obs_list)})
            continue
        trail = sorted(obs_list, key=lambda obs: obs.date)
        desired = pick_effective("desired", obs_list + ([profile_obs] if profile_obs else []))
        advertised = pick_effective("advertised", obs_list)
        actual = pick_effective("actual", obs_list)
        adv_comparable = bool(advertised and actual and advertised["currency"] == actual["currency"] and advertised["currency"] != "UNKNOWN")
        des_comparable = bool(desired and actual and desired["currency"] == actual["currency"] and desired["currency"] != "UNKNOWN")
        if advertised and actual and not adv_comparable:
            currency_mismatches.append({"num": num, "comparison": "advertised-vs-actual", "currencies": [advertised["currency"], actual["currency"]]})
        if desired and actual and not des_comparable:
            currency_mismatches.append({"num": num, "comparison": "desired-vs-actual", "currencies": [desired["currency"], actual["currency"]]})
        applications.append(
            {
                "num": num,
                "company": apps[num].get("company"),
                "role": apps[num].get("role"),
                "desired": desired,
                "advertised": advertised,
                "actual": actual,
                "trail": [_obs_dict(obs) for obs in trail],
                "advToActPct": pct_delta(advertised["value"], actual["value"]) if adv_comparable else None,
                "desiredToActPct": pct_delta(desired["value"], actual["value"]) if des_comparable else None,
            }
        )

    for num, meta in apps.items():
        if num not in by_num and profile_obs:
            applications.append(
                {
                    "num": num,
                    "company": meta.get("company"),
                    "role": meta.get("role"),
                    "desired": pick_effective("desired", [profile_obs]),
                    "advertised": None,
                    "actual": None,
                    "trail": [],
                    "advToActPct": None,
                    "desiredToActPct": None,
                }
            )
    applications.sort(key=lambda app: app["num"])

    by_currency: dict[str, dict[str, Any]] = {}
    by_company_role: dict[str, dict[str, Any]] = {}
    latest_observation = sorted([trail["date"] for app in applications for trail in app["trail"]])[-1] if any(app["trail"] for app in applications) else None
    for app in applications:
        actual = app["actual"]
        if not actual:
            continue
        currency = actual["currency"] or "UNKNOWN"
        agg = by_currency.setdefault(currency, {"confirmed": 0, "advGaps": [], "atOrAboveAdvertised": 0, "atOrAboveDesired": 0, "newestActual": None})
        agg["confirmed"] += 1
        agg["newestActual"] = max([value for value in [agg["newestActual"], actual["date"]] if value])
        if app["advToActPct"] is not None:
            agg["advGaps"].append(app["advToActPct"])
            if actual["value"] >= app["advertised"]["value"]:
                agg["atOrAboveAdvertised"] += 1
        if app["desiredToActPct"] is not None and actual["value"] >= app["desired"]["value"]:
            agg["atOrAboveDesired"] += 1

        legacy = not app["company"] and not app["role"]
        key = f"#{app['num']}" if legacy else f"{app['company']}|{app['role']}"
        bucket = by_company_role.setdefault(
            key,
            {"company": f"report #{app['num']}" if legacy else app["company"], "role": "(no Machine Summary)" if legacy else app["role"], "confirmed": 0, "advToActPcts": []},
        )
        bucket["confirmed"] += 1
        if app["advToActPct"] is not None:
            bucket["advToActPcts"].append(app["advToActPct"])

    for agg in by_currency.values():
        gaps = agg.pop("advGaps")
        agg["meanAdvToActPct"] = sum(gaps) / len(gaps) if gaps else None
        agg["medianAdvToActPct"] = median(gaps) if gaps else None

    return {
        "applications": applications,
        "aggregates": {"byCurrency": by_currency, "byCompanyRole": by_company_role},
        "quality": {
            "orphans": orphans,
            "unparseable": unparseable,
            "invalidSources": invalid_sources,
            "currencyMismatches": sorted(currency_mismatches, key=lambda item: item["num"]),
            "withoutActual": sum(1 for app in applications if not app["actual"]),
            "latestObservation": latest_observation,
        },
    }


def collect_sources(reports_dir: str | Path = REPORTS_DIR, observations_path: str | Path = DATA_DIR / "salary-observations.tsv") -> dict[str, Any]:
    apps: dict[str, dict[str, Any]] = {}
    observations: list[Observation] = []
    reports_path = Path(reports_dir)
    if reports_path.exists():
        for path in reports_path.iterdir():
            match = REPORT_FILE_RE.match(path.name)
            if not match:
                continue
            num, date = match.groups()
            result = report_to_observation(path.read_text(encoding="utf-8"), num, date)
            if result:
                apps[num] = {"company": result["company"], "role": result["role"]}
                if result["observation"]:
                    observations.append(result["observation"])
            else:
                apps[num] = {"company": None, "role": None}
    obs_path = Path(observations_path)
    if obs_path.exists():
        observations.extend(parse_observations(obs_path.read_text(encoding="utf-8")))
    return {"apps": apps, "observations": observations}


def load_profile_desired(profile_path: str | Path = CONFIG_DIR / "profile.yml") -> dict[str, str] | None:
    path = Path(profile_path)
    if not path.exists():
        return None
    try:
        profile = yaml.safe_load(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    comp = profile.get("compensation") if isinstance(profile, dict) else None
    if not isinstance(comp, dict) or not comp.get("target_range"):
        return None
    return {"amount": str(comp["target_range"]), "currency": str(comp.get("currency")) if comp.get("currency") else "UNKNOWN"}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Analyze desired vs advertised vs actual compensation gaps.")
    parser.add_argument("--reports", default=str(REPORTS_DIR))
    parser.add_argument("--observations", default=str(DATA_DIR / "salary-observations.tsv"))
    parser.add_argument("--profile", default=str(CONFIG_DIR / "profile.yml"))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    sources = collect_sources(args.reports, args.observations)
    result = fold(sources["observations"], sources["apps"], load_profile_desired(args.profile))
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
