"""Allow running: python -m scripts.python.other [command] [args...]"""
from __future__ import annotations

import sys

COMMANDS = {
    "openrouter-runner": "scripts.python.other.openrouter_runner",
    "archive-posting": "scripts.python.other.archive_posting",
    "prepare-application": "scripts.python.other.prepare_application",
    "img-to-pdf": "scripts.python.other.img_to_pdf",
    "application-answers": "scripts.python.other.application_answers",
    "assessment-log": "scripts.python.other.assessment_log",
    "funnel-velocity": "scripts.python.other.funnel_velocity",
}

DEFAULT = "openrouter-runner"


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(
            f"Usage: python -m scripts.python.other [command]\n\n"
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
