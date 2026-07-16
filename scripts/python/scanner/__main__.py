"""Allow running: python -m scripts.python.scanner [command] [args...]"""
from __future__ import annotations

import sys

COMMANDS = {
    "scan": "scripts.python.scanner.scan",
    "scan-ats-full": "scripts.python.scanner.scan_ats_full",
    "check-liveness": "scripts.python.scanner.check_liveness",
    "classify-tier": "scripts.python.scanner.classify_tier",
}

DEFAULT = "scan"


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(
            f"Usage: python -m scripts.python.scanner [command]\n\n"
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
