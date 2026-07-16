#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any, Callable

from scripts.python import PROJECT_ROOT


GOLDEN_DIR = PROJECT_ROOT / "evals" / "golden"
SCORE_TOLERANCE = 0.5
MIN_ARCHETYPE_AGREEMENT = 0.8
COST_PER_RUN_USD: dict[str, float] = {}


def fixture_model_id(model: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", model)


def parse_summary(text: str) -> dict[str, Any]:
    block = re.search(r"---SCORE_SUMMARY---\s*([\s\S]*?)---END_SUMMARY---", text)

    def field(key: str) -> str:
        if not block:
            return ""
        match = re.search(rf"{re.escape(key)}:\s*(.+)", block.group(1))
        return match.group(1).strip() if match else ""

    try:
        score = float(field("SCORE"))
    except ValueError:
        score = math.nan
    return {"score": score, "archetype": (field("ARCHETYPE") or "unknown").lower()}


def median(values: list[float]) -> float:
    if not values:
        return 0
    sorted_values = sorted(values)
    mid = len(sorted_values) // 2
    return sorted_values[mid] if len(sorted_values) % 2 else (sorted_values[mid - 1] + sorted_values[mid]) / 2


def load_cases(golden_dir: str | Path) -> list[dict[str, Any]]:
    directory = Path(golden_dir)
    if not directory.exists():
        raise FileNotFoundError(f"golden-set directory not found: {directory}")
    cases: list[dict[str, Any]] = []
    for path in sorted(directory.glob("*.json")):
        parsed = json.loads(path.read_text(encoding="utf-8"))
        label = parsed.get("label") if isinstance(parsed.get("label"), dict) else {}
        if not isinstance(parsed.get("id"), str) or not isinstance(parsed.get("jd"), str) or not isinstance(label.get("archetype"), str) or not isinstance(label.get("score"), (int, float)):
            raise ValueError(f"invalid golden case {path.name}: need string id/jd and label.{{archetype:string, score:number}}")
        cases.append(parsed)
    if not cases:
        raise ValueError(f"no golden cases (*.json) in {directory}")
    return cases


def replay_completion(test_case: dict[str, Any], *, fixture_dir: str | Path, model: str) -> str:
    fixture = Path(fixture_dir) / f"{test_case['id']}__{fixture_model_id(model)}.txt"
    if not fixture.exists():
        raise FileNotFoundError(f"missing replay fixture: {fixture} — record it or run --live")
    return fixture.read_text(encoding="utf-8")


def live_completion(test_case: dict[str, Any], *, model: str, root: str | Path = PROJECT_ROOT) -> str:
    with tempfile.TemporaryDirectory(prefix="eval-golden-") as directory:
        jd_file = Path(directory) / "jd.txt"
        jd_file.write_text(test_case["jd"], encoding="utf-8")
        result = subprocess.run(
            [
                "python",
                "-m",
                "scripts.python.evaluation.openai_eval",
                "--file",
                str(jd_file),
                "--model",
                model,
                "--no-save",
            ],
            cwd=Path(root),
            capture_output=True,
            text=True,
            timeout=360,
        )
        if result.returncode != 0:
            raise RuntimeError(f"openai_eval exited {result.returncode}: {(result.stderr or result.stdout)[:200]}")
        return result.stdout


def evaluate_cases(
    cases: list[dict[str, Any]],
    *,
    model: str,
    mode: str = "replay",
    fixture_dir: str | Path | None = None,
    completion_provider: Callable[[dict[str, Any]], str] | None = None,
) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    archetype_hits = 0
    deltas: list[float] = []
    latencies: list[float] = []
    for case in cases:
        start = time.perf_counter()
        try:
            if completion_provider:
                raw = completion_provider(case)
            elif mode == "replay":
                if fixture_dir is None:
                    raise ValueError("fixture_dir is required in replay mode")
                raw = replay_completion(case, fixture_dir=fixture_dir, model=model)
            else:
                raw = live_completion(case, model=model)
            parsed = parse_summary(raw)
            latency_ms = round((time.perf_counter() - start) * 1000)
            latencies.append(latency_ms)
            expected_archetype = str(case["label"]["archetype"]).lower()
            archetype_match = parsed["archetype"] == expected_archetype
            delta = abs(parsed["score"] - float(case["label"]["score"]))
            score_ok = math.isfinite(delta) and delta <= SCORE_TOLERANCE
            if archetype_match:
                archetype_hits += 1
            deltas.append(delta)
            rows.append(
                {
                    "id": case["id"],
                    "ok": archetype_match and score_ok,
                    "archetype": parsed["archetype"],
                    "expectedArchetype": expected_archetype,
                    "archetypeMatch": archetype_match,
                    "score": parsed["score"],
                    "expectedScore": float(case["label"]["score"]),
                    "delta": delta,
                    "scoreOk": score_ok,
                    "latencyMs": latency_ms,
                }
            )
        except Exception as error:
            deltas.append(math.nan)
            rows.append({"id": case["id"], "ok": False, "error": str(error), "delta": math.nan})
    agreement = archetype_hits / len(cases)
    finite_deltas = [delta for delta in deltas if math.isfinite(delta)]
    mean_delta = sum(finite_deltas) / len(finite_deltas) if finite_deltas else math.nan
    passed = agreement >= MIN_ARCHETYPE_AGREEMENT
    return {
        "model": model,
        "mode": mode,
        "rows": rows,
        "summary": {
            "archetypeAgreement": agreement,
            "meanScoreDelta": mean_delta,
            "scored": len(finite_deltas),
            "total": len(cases),
            "unscored": len(cases) - len(finite_deltas),
            "medianLatencyMs": median(latencies),
            "costPerRunUsd": COST_PER_RUN_USD.get(model),
            "passed": passed,
        },
    }


def format_report(result: dict[str, Any]) -> str:
    lines = [f'\ngolden-set eval — model "{result["model"]}" ({result["mode"]}), {len(result["rows"])} case(s)', ""]
    for row in result["rows"]:
        if row.get("error"):
            lines.append(f"  FAIL {row['id']}: {row['error']}")
            continue
        delta = row["delta"]
        lines.append(
            f"  {'OK' if row['ok'] else 'FAIL'} {row['id']}: "
            f"archetype {row['archetype']} vs {row['expectedArchetype']} "
            f"({'match' if row['archetypeMatch'] else 'MISS'}); "
            f"score {row['score']} vs {row['expectedScore']} "
            f"(delta {delta:.2f} if finite)"
        )
    summary = result["summary"]
    mean_delta = summary["meanScoreDelta"]
    lines.extend(
        [
            "",
            "  -- summary --",
            f"  archetype agreement : {summary['archetypeAgreement'] * 100:.0f}%  (gate >= {MIN_ARCHETYPE_AGREEMENT * 100:.0f}%)",
            f"  mean |delta score|  : {mean_delta:.2f}" if math.isfinite(mean_delta) else "  mean |delta score|  : n/a",
            f"  scored              : {summary['scored']}/{summary['total']} ({summary['unscored']} unscored)",
            f"  {'PASS' if summary['passed'] else 'FAIL'}",
        ]
    )
    return "\n".join(lines) + "\n"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Golden-set eval harness for cheap-model routing.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--replay", action="store_true")
    mode.add_argument("--live", action="store_true")
    parser.add_argument("--model", default="cheap-stub")
    parser.add_argument("--golden", default=str(GOLDEN_DIR))
    parser.add_argument("--fixtures")
    parser.add_argument("--json", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    mode = "live" if args.live else "replay"
    fixture_dir = args.fixtures or str(Path(args.golden).parent / "fixtures")
    try:
        cases = load_cases(args.golden)
        result = evaluate_cases(cases, model=args.model, mode=mode, fixture_dir=fixture_dir)
    except Exception as error:
        print(json.dumps({"error": str(error)}, indent=2) if args.json else f"ERROR: {error}")
        return 1
    print(json.dumps(result, indent=2) if args.json else format_report(result))
    return 0 if result["summary"]["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
