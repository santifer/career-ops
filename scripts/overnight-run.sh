#!/bin/bash
# scripts/overnight-run.sh
# Hands the full overnight routine to Claude Code as a single prompt.
# The prompt covers: scan -> pipeline -> merge+verify -> cleanup -> commit+push.
# Called by the GitHub Actions workflow AND runnable locally.
# Requires: @anthropic-ai/claude-code CLI installed and ONE of:
#   - CLAUDE_CODE_OAUTH_TOKEN (Claude.ai Pro/Max subscription, generated via `claude setup-token`)
#   - ANTHROPIC_API_KEY       (Anthropic Console account)

set -u
ERRLOG="data/overnight-errors.log"
mkdir -p data
TS=$(date -u +%Y-%m-%dT%H:%MZ)

log() { echo "[overnight $TS] $*"; }
record_err() { echo "[$(date -u +%Y-%m-%dT%H:%MZ)] $*" >> "$ERRLOG"; }

# Fail fast with a clear message if no auth is present (instead of looping on "Not logged in").
if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  record_err "no auth: set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY"
  echo "ERROR: no Claude auth env var set (CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY)" >&2
  exit 2
fi

log "Handing overnight routine to claude -p"

PROMPT=$(cat <<'EOF'
You are running the career-ops overnight automation for Deepak Mallampati's job search. Execute in this exact order, committing and pushing after each major step.

Context:
- Repo: deepak-glitch/career-ops (main branch)
- Read CLAUDE.md, modes/_profile.md, modes/_shared.md, modes/scan.md, modes/pipeline.md before acting
- Every rule in modes/_profile.md is binding (location in reports, PDF >= 3.0, Times New Roman plain black, output/YYYY-MM-DD/ folders, cleanup-low-scores after every batch, auto-push to main)

Steps:

1. SCAN. Run node scan.mjs. Then run the broader Level 3 WebSearch queries from portals.yml (small-ATS + non-standard titles + aggregators). Append any new URLs to data/pipeline.md under today's ### YYYY-MM-DD subsection and data/scan-history.tsv.

2. PIPELINE. Read data/pipeline.md Pendientes. Take up to 10 URLs (prioritize newest dated section, archetype fit, explicit new-grad). For each:
   - Extract JD (Ashby = GraphQL POST to /api/non-user-graphql; Greenhouse/Lever/BreezyHR/TeamTailor = WebFetch; YC workatastartup = WebFetch + aggregator corroboration)
   - Write report to reports/{NNN}-{slug}-{today}.md with mandatory header (Fecha, Arquetipo, Score, URL, Legitimacy, Location, PDF) plus full A-H blocks per modes/oferta.md
   - Write TSV to batch/tracker-additions/{NNN}-{slug}.tsv (9 tab columns)
   - If score >= 3.0: tailor templates/cv-template.html and run node generate-pdf.mjs /tmp/cv-{slug}.html output/{today}/cv-deepak-mallampati-{slug}-{today}.pdf (mkdir -p first). If < 3.0: set PDF line to "Not generated (score < 3.0)".
   - Move entry from Pendientes to Procesadas under ### {today} with Location column

3. MERGE + VERIFY. node merge-tracker.mjs, node verify-pipeline.mjs. Must be 0 errors / 0 warnings.

4. CLEANUP. node cleanup-low-scores.mjs to archive any score < 3.0 to reports/below-threshold/.

5. (always to main) COMMIT + PUSH. git add -A, commit with message "overnight: {ISO-timestamp} scan+pipeline+cleanup (+N reports, +M PDFs)", git push origin main. Retry push up to 4 times with exponential backoff (2s, 4s, 8s, 16s).

Hard rules:
- NEVER invent metrics or credentials
- NEVER edit cv.md or config/profile.yml
- Always push to main, never sub-branches
- If an URL fails to extract, mark it "- [!] {url} | error: ..." in Pendientes and continue
- On any unrecoverable error: commit whatever succeeded, push, append the error + stack trace to data/overnight-errors.log, exit cleanly

End with a one-line summary: "Processed N URLs, generated M PDFs, archived K low-score, pushed {commit-sha}".
EOF
)

claude -p "$PROMPT" 2>&1 | tee -a "$ERRLOG" || { record_err "claude pipeline step failed"; exit 1; }

log "Done."
