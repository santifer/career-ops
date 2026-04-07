#!/usr/bin/env bash
set -euo pipefail

# Example adapter for runtimes that are not built in to the runner.
# Contract:
#   agent-adapter.example.sh <resolved-system-prompt-file> <user-prompt>
#
# The batch runner exports:
#   CAREER_OPS_PROJECT_DIR
#   CAREER_OPS_BATCH_DIR
#   CAREER_OPS_AGENT
#   CAREER_OPS_BATCH_ID
#   CAREER_OPS_REPORT_NUM
#   CAREER_OPS_TARGET_URL
#
# Replace the echo below with your known-good Gemini/OpenAI/other CLI invocation.
# This repository intentionally does not guess third-party flags it cannot verify.

SYSTEM_PROMPT_FILE="${1:?missing system prompt file}"
USER_PROMPT="${2:?missing user prompt}"

echo "Implement your runtime invocation here."
echo "System prompt file: ${SYSTEM_PROMPT_FILE}"
echo "User prompt: ${USER_PROMPT}"
exit 1
