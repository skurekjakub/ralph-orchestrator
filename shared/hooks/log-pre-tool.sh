#!/bin/bash
# Ralph audit logger — Pre-Tool Use
# Logs every tool invocation to pre-tool.log and audit.jsonl.
#
# Performance: optimized for the hot path (~200-500 calls/task).
# - Single jq call to extract input fields
# - Single jq call to build JSONL + bash string replacement for audit
set -e
INPUT=$(cat)

LOG_DIR="/workspace/.ralph/logs"
SESSION_ID=$(cat "$LOG_DIR/.current-session-id" 2>/dev/null || echo "unknown")

# Timestamp and toolName are tab-separated on one line; toolArgs extracted separately
# because it can contain tabs/newlines.
read -r TIMESTAMP TOOL_NAME <<< "$(echo "$INPUT" | jq -r '[.timestamp, (.toolName // "unknown")] | @tsv')"
TOOL_ARGS=$(echo "$INPUT" | jq -r '.toolArgs // "{}"')

# Build JSONL once, write to both log files.
# pre-tool.log uses "ts" key; audit.jsonl uses "timestamp" key.
# Bash parameter substitution handles the key rename (no extra jq fork).
PRE_TOOL=$(jq -n -c \
  --arg ts "$TIMESTAMP" \
  --arg session "$SESSION_ID" \
  --arg tool "$TOOL_NAME" \
  --arg args "$TOOL_ARGS" \
  '{event: "pre_tool", ts: ($ts | tonumber), session: $session, tool: $tool, args: $args}')
echo "$PRE_TOOL" >> "$LOG_DIR/pre-tool.log"
echo "${PRE_TOOL/\"ts\":/\"timestamp\":}" >> "$LOG_DIR/audit.jsonl"
