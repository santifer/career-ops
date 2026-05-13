@AGENTS.md

# Codex Notes

Treat `/career-ops` as a Codex chat command for this repository. It is not a PowerShell command.

If the user types `/career-ops`, use the Codex skill at `.codex/skills/career-ops/SKILL.md` when available, then route to the matching `modes/*.md` workflow.

Common examples:

```text
/career-ops
/career-ops pipeline
/career-ops scan
/career-ops tracker
/career-ops https://example.com/job
```

For terminal/headless usage:

```powershell
cd path\to\career-ops
codex exec "Use the career-ops skill. Run /career-ops pipeline and process data/pipeline.md."
```
