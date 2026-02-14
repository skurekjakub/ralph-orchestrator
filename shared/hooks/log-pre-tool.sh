#!/bin/bash
# Ralph audit logger — Pre-Tool Use
# Logs every tool invocation with args. Does NOT deny anything.
set -e
INPUT=$(cat)

LOG_DIR="/workspace/.ralph/logs"
SESSION_ID=$(cat "$LOG_DIR/.current-session-id" 2>/dev/null || echo "unknown")

TIMESTAMP=$(echo "$INPUT" | jq -r '.timestamp')
TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName // "unknown"')
TOOL_ARGS=$(echo "$INPUT" | jq -r '.toolArgs // "{}"')

jq -n -c \
  --arg event "pre_tool" \
  --arg ts "$TIMESTAMP" \
  --arg session "$SESSION_ID" \
  --arg tool "$TOOL_NAME" \
  --arg args "$TOOL_ARGS" \
  '{event: $event, timestamp: ($ts | tonumber), session: $session, tool: $tool, args: $args}' \
  >> "$LOG_DIR/audit.jsonl"
