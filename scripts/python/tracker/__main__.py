"""Allow running: python -m scripts.python.tracker [command] [args...]"""
from __future__ import annotations

import sys

COMMANDS = {
    "merge": "scripts.python.tracker.merge_tracker",
    "dedup": "scripts.python.tracker.dedup_tracker",
    "verify": "scripts.python.tracker.verify_pipeline",
    "normalize": "scripts.python.tracker.normalize_statuses",
    "add-entry": "scripts.python.tracker.add_entry",
    "find": "scripts.python.tracker.find",
    "detect-reposts": "scripts.python.tracker.detect_reposts",
    "invite-match": "scripts.python.tracker.invite_match",
    "followup-cadence": "scripts.python.tracker.followup_cadence",
    "followup-seed": "scripts.python.tracker.followup_seed",
    "process-quality": "scripts.python.tracker.process_quality",
    "reconcile-pipeline": "scripts.python.tracker.reconcile_pipeline",
    "reserve-report-num": "scripts.python.tracker.reserve_report_num",
    "set-status": "scripts.python.tracker.set_status",
}

DEFAULT = "merge"


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(
            f"Usage: python -m scripts.python.tracker [command]\n\n"
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
