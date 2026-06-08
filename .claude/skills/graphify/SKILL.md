# Graphify Skill

Turn any folder into a queryable knowledge graph. Extracts god nodes, community structure, surprising connections, and design rationale. 71x fewer tokens per query than reading raw files.

## Trigger

User types `/graphify` or asks to "build a knowledge graph", "graph the codebase", "run graphify", or "what connects X to Y in the code".

## How to run

```bash
# Build graph (first time or after major changes)
graphify .                          # current directory
graphify . --update                 # re-process only changed files
graphify . --mode deep              # more aggressive inference edges

# Query an existing graph
graphify query "how does X connect to Y?"
graphify path "ComponentA" "ComponentB"
graphify explain "NodeName"
```

## Output files

| File | Use |
|------|-----|
| `graphify-out/GRAPH_REPORT.md` | Read first — god nodes, communities, suggested questions |
| `graphify-out/graph.json` | Full traversable graph — use for targeted queries |
| `graphify-out/graph.html` | Interactive visual — open in browser |

## For the Career-Ops stack

Key god nodes to expect after first run:
- `auto-submit.mjs` — central orchestrator (connects to Playwright, ATS handlers, tracker, sus-db)
- `job-pulse-kanban.html` — UI layer (connects to last-refresh.json, autosubmit gate, grading)
- `portals.yml` — scanner config (connects to scan.mjs, ATS endpoints)
- `SuS gate` — approval logic (connects to sus-db.json, whitelist, Fortune 500 set)
- `modes/_profile.md` — user personalization (connects to all evaluation modes)

## PreToolUse hook

After `graphify claude install`, every Glob/Grep call shows: "graphify: Knowledge graph exists — read GRAPH_REPORT.md before searching raw files." This means architecture questions get answered from the graph, not by grepping through 20+ .mjs files.

## Install (Windows, run once in career-ops folder)

```
pip install graphifyy
graphify install
graphify .
graphify claude install
```
