"""Allow running: python -m scripts.python.evaluation [command] [args...]"""
from __future__ import annotations

import sys

COMMANDS = {
    "gemini": "scripts.python.evaluation.gemini_eval",
    "ollama": "scripts.python.evaluation.ollama_eval",
    "openai": "scripts.python.evaluation.openai_eval",
    "openai-tailor": "scripts.python.evaluation.openai_tailor",
    "eval-golden": "scripts.python.evaluation.eval_golden",
    "jd-skill-gap": "scripts.python.evaluation.jd_skill_gap",
}

DEFAULT = "openai"


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(
            f"Usage: python -m scripts.python.evaluation [command]\n\n"
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
