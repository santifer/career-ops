#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import platform
import shutil
import sys
from pathlib import Path
from typing import Any

import yaml

from scripts.python import PROJECT_ROOT
from scripts.python.pipeline.browser_extract import resolve_extractor_mode
from scripts.python.plugins.cli import load_plugin_config
from scripts.python.plugins.engine import discover_plugins, plugin_roots, plugin_status


PLAYWRIGHT_MCP_WARNING = "Playwright MCP tools not detected"
PIPELINE_SKELETON = """# Pipeline — Pending URLs

Paste job URLs below as `- [ ] {url}` then run `/career-ops pipeline`.

## Pending

## Processed
"""
USER_LAYER_PREREQS = [
    {
        "path": "cv.md",
        "fix": [
            "Create cv.md in the project root with your CV in markdown",
            "See examples/ for reference CVs",
        ],
    },
    {
        "path": "config/profile.yml",
        "fix": [
            "Run: cp config/profile.example.yml config/profile.yml",
            "Then edit it with your details",
        ],
    },
    {
        "path": "modes/_profile.md",
        "fix": [
            "Run: cp modes/_profile.template.md modes/_profile.md",
            "Then customize your archetypes / targeting narrative",
        ],
    },
    {
        "path": "config/portals.yml",
        "fix": [
            "Run: cp templates/portals.example.yml config/portals.yml",
            "Then customize with your target companies",
        ],
    },
]


def rel_path(root: str | Path, rel: str) -> Path:
    return Path(root).joinpath(*rel.split("/"))


def prereq_present(root: str | Path, path: str) -> bool:
    return rel_path(root, path).exists()


def check_python_version() -> dict[str, Any]:
    version = platform.python_version()
    if sys.version_info >= (3, 12):
        return {"pass": True, "label": f"Python >= 3.12 (v{version})"}
    return {
        "pass": False,
        "label": f"Python >= 3.12 (found v{version})",
        "fix": "Install Python 3.12 or later",
    }


def check_dependencies(root: str | Path) -> dict[str, Any]:
    project = Path(root)
    if (project / "scripts/python/pyproject.toml").exists() or (project / "backend/pyproject.toml").exists():
        return {"pass": True, "label": "Python dependency metadata found"}
    return {
        "warn": True,
        "label": "Python dependency metadata not found",
        "fix": "Install dependencies from scripts/python/pyproject.toml",
    }


def check_playwright(import_check: bool = True) -> dict[str, Any]:
    if not import_check:
        return {"warn": True, "label": "Playwright chromium launch check skipped"}
    try:
        import playwright  # noqa: F401
    except Exception:
        return {
            "warn": True,
            "label": "Playwright Python package not installed",
            "fix": "Install playwright and run: python -m playwright install chromium",
        }
    return {"pass": True, "label": "Playwright Python package importable"}


def playwright_mcp_configured(root: str | Path) -> bool:
    for rel in [".mcp.json", ".claude/settings.json", ".claude/settings.local.json"]:
        file = rel_path(root, rel)
        if not file.exists():
            continue
        try:
            parsed = json.loads(file.read_text(encoding="utf-8"))
        except Exception:
            continue
        servers = parsed.get("mcpServers") if isinstance(parsed, dict) else None
        if isinstance(servers, dict):
            for server in servers.values():
                if "playwright" in json.dumps(server).lower():
                    return True
    return False


def check_playwright_mcp(root: str | Path) -> dict[str, Any]:
    if playwright_mcp_configured(root):
        return {"pass": True, "label": "Playwright MCP server configured"}
    return {
        "warn": True,
        "label": PLAYWRIGHT_MCP_WARNING,
        "fix": [
            "Browser-driven JD fetching and liveness checks need the Playwright MCP server.",
            "No project-level MCP config was detected in `.mcp.json` or `.claude/settings*.json`.",
        ],
    }


def check_scan_extractor(root: str | Path) -> dict[str, Any]:
    mode = resolve_extractor_mode(rel_path(root, "config/profile.yml"))
    if mode == "cli":
        if rel_path(root, "scripts/python/pipeline/browser_extract.py").exists() or rel_path(root, "browser-extract.mjs").exists():
            return {"pass": True, "label": "Scan extractor: cli"}
        return {
            "warn": True,
            "label": "Scan extractor: cli set, but browser extractor is missing — falls back to MCP",
            "fix": ["Restore browser-extract, or set `scan.extractor: mcp` in config/profile.yml."],
        }
    return {"pass": True, "label": "Scan extractor: mcp (default)"}


def check_prereq(root: str | Path, prereq: dict[str, Any]) -> dict[str, Any]:
    path = prereq["path"]
    if prereq_present(root, path):
        return {"pass": True, "label": f"{path} found"}
    return {"pass": False, "label": f"{path} not found", "fix": prereq["fix"]}


def check_fonts(root: str | Path) -> dict[str, Any]:
    fonts = Path(root) / "fonts"
    if not fonts.exists():
        return {
            "pass": False,
            "label": "fonts/ directory not found",
            "fix": "The fonts/ directory is required for PDF generation",
        }
    try:
        if not any(fonts.iterdir()):
            return {
                "pass": False,
                "label": "fonts/ directory is empty",
                "fix": "The fonts/ directory must contain font files for PDF generation",
            }
    except Exception:
        return {
            "pass": False,
            "label": "fonts/ directory not readable",
            "fix": "Check permissions on the fonts/ directory",
        }
    return {"pass": True, "label": "Fonts directory ready"}


def check_auto_dir(root: str | Path, name: str) -> dict[str, Any]:
    directory = Path(root) / name
    if directory.exists():
        return {"pass": True, "label": f"{name}/ directory ready"}
    try:
        directory.mkdir(parents=True, exist_ok=True)
        return {"pass": True, "label": f"{name}/ directory ready (auto-created)"}
    except Exception:
        return {"pass": False, "label": f"{name}/ directory could not be created", "fix": f"Run: mkdir {name}"}


def check_pipeline_file(root: str | Path) -> dict[str, Any]:
    file = Path(root) / "data" / "pipeline.md"
    if file.exists():
        return {"pass": True, "label": "data/pipeline.md ready"}
    try:
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(PIPELINE_SKELETON, encoding="utf-8")
        return {"pass": True, "label": "data/pipeline.md ready (auto-created)"}
    except Exception:
        return {
            "pass": False,
            "label": "data/pipeline.md could not be created",
            "fix": "Run: mkdir -p data && touch data/pipeline.md",
        }


def check_plugins(root: str | Path, env: dict[str, str] | None = None) -> dict[str, Any]:
    try:
        manifests = discover_plugins(plugin_roots(root))
    except Exception:
        return {"pass": True, "label": "Plugins: none"}
    if not manifests:
        return {"pass": True, "label": "Plugins: none installed"}
    cfg = load_plugin_config(root)
    lines: list[str] = []
    fixes: list[str] = []
    for manifest in manifests:
        status = plugin_status(manifest, cfg, env=env)
        if status["enabled"]:
            state = "enabled"
        elif status["configured"]:
            state = "missing " + ", ".join(status["missingEnv"])
        else:
            state = "off"
        lines.append(f"{manifest['id']} ({state})")
        if status["configured"] and status["missingEnv"]:
            fixes.append(f"{manifest['id']}: add {', '.join(status['missingEnv'])} to .env")
    label = "Plugins: " + ", ".join(lines)
    return {"warn": True, "label": label, "fix": fixes} if fixes else {"pass": True, "label": label}


def check_portal_slugs(root: str | Path) -> dict[str, Any]:
    from scripts.python.admin.verify_portals import verify_portals_file

    portals = rel_path(root, "config/portals.yml")
    if not portals.exists():
        return {"pass": True, "label": "ATS slugs: no config/portals.yml yet (skipped)"}
    try:
        result = verify_portals_file(portals)
    except Exception as error:
        return {"warn": True, "label": f"ATS slug check skipped: {error}"}
    unresolved = [item for item in result["results"] if item.get("status") == "missing"]
    if not unresolved:
        return {"pass": True, "label": "All ATS slugs in config/portals.yml resolve"}
    fixes = []
    for item in unresolved:
        line = f"{item.get('name')}: {item.get('ats', '?')}/{item.get('slug', '?')} — {item.get('reason', 'unresolved')}"
        if item.get("suggested"):
            line += f" -> try {item['suggested']['ats']}/{item['suggested']['slug']}"
        fixes.append(line)
    fixes.append('Probe variants with: python -m scripts.python.admin.verify_portals --add "<company>"')
    return {
        "pass": False,
        "label": f"{len(unresolved)} ATS slug(s) in config/portals.yml do not resolve",
        "fix": fixes,
    }


def auto_copy_user_templates(root: str | Path) -> list[str]:
    copied: list[str] = []
    templates = [
        {"target": "modes/_profile.md", "template": "modes/_profile.template.md"},
        {"target": "modes/_custom.md", "template": "modes/_custom.template.md"},
    ]
    for item in templates:
        target = rel_path(root, item["target"])
        template = rel_path(root, item["template"])
        if not target.exists() and template.exists():
            try:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(template, target)
                copied.append(item["target"])
            except Exception:
                pass
    return copied


def onboarding_state(root: str | Path) -> dict[str, Any]:
    copied = auto_copy_user_templates(root)
    missing = [item["path"] for item in USER_LAYER_PREREQS if not prereq_present(root, item["path"])]
    warnings = [] if playwright_mcp_configured(root) else [PLAYWRIGHT_MCP_WARNING]
    plugins: list[dict[str, Any]] = []
    try:
        cfg = load_plugin_config(root)
        for manifest in discover_plugins(plugin_roots(root)):
            status = plugin_status(manifest, cfg)
            plugins.append(
                {
                    "id": manifest["id"],
                    "hooks": manifest["hooks"],
                    "enabled": status["enabled"],
                    "missingEnv": status["missingEnv"],
                }
            )
    except Exception:
        plugins = []
    return {
        "onboardingNeeded": bool(missing),
        "missing": missing,
        "warnings": warnings,
        "autoCopied": copied,
        "plugins": plugins,
    }


def run_checks(root: str | Path, *, strict: bool = False, env: dict[str, str] | None = None) -> list[dict[str, Any]]:
    checks = [
        check_python_version(),
        check_dependencies(root),
        check_playwright(),
        check_playwright_mcp(root),
        check_scan_extractor(root),
        *[check_prereq(root, item) for item in USER_LAYER_PREREQS],
        check_fonts(root),
        check_auto_dir(root, "data"),
        check_pipeline_file(root),
        check_auto_dir(root, "output"),
        check_auto_dir(root, "reports"),
        check_plugins(root, env=env),
    ]
    if strict:
        checks.append(check_portal_slugs(root))
    return checks


def format_checks(checks: list[dict[str, Any]]) -> str:
    lines = ["", "career-ops doctor", "================", ""]
    failures = 0
    warnings = 0
    for result in checks:
        fixes = result.get("fix") if isinstance(result.get("fix"), list) else [result["fix"]] if result.get("fix") else []
        if result.get("warn"):
            warnings += 1
            lines.append(f"! {result['label']}")
            lines.extend(f"  -> {hint}" for hint in fixes)
        elif result.get("pass"):
            lines.append(f"✓ {result['label']}")
        else:
            failures += 1
            lines.append(f"✗ {result['label']}")
            lines.extend(f"  -> {hint}" for hint in fixes)
    lines.append("")
    if failures:
        plural = "" if failures == 1 else "s"
        lines.append(f"Result: {failures} issue{plural} found. Fix them and run doctor again.")
    else:
        note = f" ({warnings} warning{'s' if warnings != 1 else ''} — see above)" if warnings else ""
        lines.append(f"Result: All checks passed{note}.")
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Setup validation for career-ops.")
    parser.add_argument("--target", "--root", dest="root", default=str(PROJECT_ROOT))
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--strict", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    root = Path(args.root)
    if args.json:
        print(json.dumps(onboarding_state(root)))
        return 0
    checks = run_checks(root, strict=args.strict)
    print(format_checks(checks))
    return 1 if any(not item.get("pass") and not item.get("warn") for item in checks) else 0


if __name__ == "__main__":
    raise SystemExit(main())
