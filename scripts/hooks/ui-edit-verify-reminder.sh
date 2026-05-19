#!/usr/bin/env bash
# scripts/hooks/ui-edit-verify-reminder.sh
#
# PostToolUse hook fired by .claude/settings.json after Edit / Write /
# MultiEdit. Reads the tool input from stdin (JSON), checks whether the
# affected file is a UI-affecting file, and prints a verification reminder
# banner to stderr if so.
#
# Exit codes: always 0 (this is a soft reminder, not a blocker).
#
# Established 2026-05-19 after the role-column-collapse incident.
# See CLAUDE.md / AGENTS.md "UI-Change Verification" section for full
# rule + rationale.

# Read JSON from stdin. The harness passes the tool input on stdin.
input="$(cat 2>/dev/null || echo '{}')"

# Extract file_path from the JSON. Fall back to empty string if unparseable.
# Use python because jq is not guaranteed.
file_path=$(printf '%s' "$input" | python3 -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
    tool_input = d.get('tool_input', {}) or {}
    # Edit/Write/MultiEdit all use file_path
    path = tool_input.get('file_path', '') or ''
    print(path)
except Exception:
    print('')
" 2>/dev/null || echo "")

# Quick exit if no file path
[ -z "$file_path" ] && exit 0

# Pattern match against UI-affecting paths.
# These are the files whose edits demand Chrome MCP verification.
UI_PATTERNS=(
    'scripts/build-dashboard.mjs'
    'dashboard-server.mjs'
    '/dashboard/'
    '/lib/'
    '.html'
    '.css'
)

is_ui_file=0
for pat in "${UI_PATTERNS[@]}"; do
    case "$file_path" in
        *"$pat"*) is_ui_file=1; break ;;
    esac
done

[ "$is_ui_file" -eq 0 ] && exit 0

# Emit the reminder to stderr (stdout is reserved for hook output the
# harness might surface to the model differently).
cat >&2 <<'REMINDER'

╔══════════════════════════════════════════════════════════════════════════╗
║  ⚠  UI-CHANGE VERIFICATION REQUIRED — Chrome MCP screenshot mandatory   ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║  You just edited a UI-affecting file. Before claiming done or committing ║
║  this change, you MUST run the verification sequence:                    ║
║                                                                          ║
║    1. node scripts/build-dashboard.mjs                                   ║
║    2. launchctl kickstart -k gui/$(id -u)/com.mitchell.career-ops.dashboard-server
║    3. Chrome MCP: navigate to https://dashboard.careers-ops.com/         ║
║       (CF Access token in .env)  OR                                      ║
║       https://staging-dashboard.careers-ops.com/  (no auth)              ║
║    4. Screenshot at 1440x900 AND ≤900px widths                           ║
║    5. For table/layout CSS: javascript_tool query                        ║
║       getBoundingClientRect() + getComputedStyle() on affected elements  ║
║    6. ONLY THEN commit and report done                                   ║
║                                                                          ║
║  See CLAUDE.md / AGENTS.md "UI-Change Verification" section for full     ║
║  rule + rationale (2026-05-19 role-column-collapse incident).            ║
║                                                                          ║
║  Skip this only if Chrome MCP is genuinely unavailable in your context — ║
║  fall back to: curl -s https://staging-dashboard.careers-ops.com/ |     ║
║  grep <expected> — and document the fallback in your report.            ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝

REMINDER

exit 0
