#!/bin/bash
# Ralph audit logger — Post-Tool Use
# Logs tool results including success/failure and the LLM-visible output.
set -e
INPUT=$(cat)

LOG_DIR="/workspace/.ralph/logs"
SESSION_ID=$(cat "$LOG_DIR/.current-session-id" 2>/dev/null || echo "unknown")

TIMESTAMP=$(echo "$INPUT" | jq -r '.timestamp')
TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName // "unknown"')
TOOL_ARGS=$(echo "$INPUT" | jq -r '.toolArgs // "{}"')
RESULT_TYPE=$(echo "$INPUT" | jq -r '.toolResult.resultType // "unknown"')
RESULT_TEXT=$(echo "$INPUT" | jq -r '.toolResult.textResultForLlm // ""')

# Truncate very long results to keep the log manageable
if [ ${#RESULT_TEXT} -gt 2000 ]; then
    RESULT_TEXT="${RESULT_TEXT:0:2000}...[truncated]"
fi

jq -n -c \
  --arg event "post_tool" \
  --arg ts "$TIMESTAMP" \
  --arg session "$SESSION_ID" \
  --arg tool "$TOOL_NAME" \
  --arg args "$TOOL_ARGS" \
  --arg resultType "$RESULT_TYPE" \
  --arg resultText "$RESULT_TEXT" \
  '{event: $event, timestamp: ($ts | tonumber), session: $session, tool: $tool, args: $args, resultType: $resultType, resultText: $resultText}' \
  >> "$LOG_DIR/audit.jsonl"

# Log failures to the human-readable log
if [ "$RESULT_TYPE" = "failure" ]; then
    echo "[RALPH] TOOL FAILURE: $TOOL_NAME — $RESULT_TEXT" >> "$LOG_DIR/ralph.log"
fi
