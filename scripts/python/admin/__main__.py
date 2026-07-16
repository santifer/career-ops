"""Allow running: python -m scripts.python.admin [command] [args...]"""
from __future__ import annotations

import sys

COMMANDS = {
    "doctor": "scripts.python.admin.doctor",
    "update": "scripts.python.admin.update_system",
    "analyze-patterns": "scripts.python.admin.analyze_patterns",
    "upskill": "scripts.python.admin.upskill",
    "stats": "scripts.python.admin.stats",
    "cv-sync-check": "scripts.python.admin.cv_sync_check",
    "validate-portals": "scripts.python.admin.validate_portals",
    "verify-portals": "scripts.python.admin.verify_portals",
    "validate-paths": "scripts.python.admin.validate_paths",
    "manifesto": "scripts.python.admin.manifesto",
    "test-all": "scripts.python.admin.test_all",
}

DEFAULT = "doctor"


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(
            f"Usage: python -m scripts.python.admin [command]\n\n"
            f"Commands:\n" + "\n".join(f"  {k}" for k in COMMANDS)
        )
        return

    cmd = sys.argv[1]
    if cmd not in COMMANDS:
        print(f"Unknown command: {cmd}\nCommands: {', '.join(COMMANDS)}", file=sys.stderr)
        sys.exit(1)

    mod = __import__(COMMANDS[cmd], fromlist=["main"])
    sys.exit(mod.main(sys.argv[2:]))


if __name__ == "__main__":
    main()
