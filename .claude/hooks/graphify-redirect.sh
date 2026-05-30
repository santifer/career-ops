#!/bin/bash
# Intercepts search commands and suggests graphify query instead when graph exists.
CMD=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_input',d).get('command',''))" 2>/dev/null || true)
case "$CMD" in
  *grep*|*rg\ *|*ripgrep*|*find\ *|*fd\ *|*ack\ *|*ag\ *)
    if [ -f graphify-out/graph.json ]; then
      echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"graphify: knowledge graph at graphify-out/. Run `graphify query \"<question>\"` instead of grepping raw files — scoped subgraph, far fewer tokens. Use GRAPH_REPORT.md only for broad architecture review."}}'
    fi
    ;;
esac
