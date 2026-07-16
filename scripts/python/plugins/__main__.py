"""Allow running: python -m scripts.python.plugins [command] [args...]"""
from __future__ import annotations

import sys

COMMANDS = {
    "cli": "scripts.python.plugins.cli",
    "audit": "scripts.python.plugins.audit",
    "install": "scripts.python.plugins.install",
    "validate-registry": "scripts.python.plugins.validate_registry",
}

DEFAULT = "cli"


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(
            f"Usage: python -m scripts.python.plugins [command]\n\n"
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
