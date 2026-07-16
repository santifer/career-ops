"""Allow running: python -m scripts.python.pipeline [command] [args...]"""
from __future__ import annotations

import sys

COMMANDS = {
    "browser-extract": "scripts.python.pipeline.browser_extract",
    "agent-inbox": "scripts.python.pipeline.agent_inbox",
    "liveness-api": "scripts.python.pipeline.liveness_api",
    "liveness-browser": "scripts.python.pipeline.liveness_browser",
}

DEFAULT = "browser-extract"


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(
            f"Usage: python -m scripts.python.pipeline [command]\n\n"
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
