"""Allow running: python -m scripts.python.cv [command] [args...]"""
from __future__ import annotations

import sys

COMMANDS = {
    "generate-pdf": "scripts.python.cv.generate_pdf",
    "generate-latex": "scripts.python.cv.generate_latex",
    "generate-cover-letter": "scripts.python.cv.generate_cover_letter",
    "build-html": "scripts.python.cv.build_html",
    "build-latex": "scripts.python.cv.build_latex",
    "verify-facts": "scripts.python.cv.verify_cv_facts",
    "extract-latex": "scripts.python.cv.extract_latex_content",
    "patch-latex": "scripts.python.cv.patch_latex_content",
    "templates": "scripts.python.cv.templates",
}

DEFAULT = "generate-pdf"


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(
            f"Usage: python -m scripts.python.cv [command]\n\n"
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
