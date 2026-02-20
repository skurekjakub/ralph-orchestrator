#!/bin/bash
# Ralph audit logger — Post-Tool Use
# Logs tool results including success/failure and the LLM-visible output.
#
# Performance: optimized for the hot path.
# - Single jq call for field extraction
# - Truncation via bash substring
# - Single jq call for audit JSONL
set -e
INPUT=$(cat)

LOG_DIR="/workspace/.ralph/logs"
SESSION_ID=$(cat "$LOG_DIR/.current-session-id" 2>/dev/null || echo "unknown")

# Single jq call: extract all scalar fields at once (was 5 separate jq forks).
read -r TIMESTAMP TOOL_NAME RESULT_TYPE <<< "$(echo "$INPUT" | jq -r '[.timestamp, (.toolName // "unknown"), (.toolResult.resultType // "unknown")] | @tsv')"
TOOL_ARGS=$(echo "$INPUT" | jq -r '.toolArgs // "{}"')
RESULT_TEXT=$(echo "$INPUT" | jq -r '.toolResult.textResultForLlm // ""')

# Write full untruncated tool output to a separate readable log.
TS_HUMAN=$(date -d "@${TIMESTAMP%.*}" "+%H:%M:%S" 2>/dev/null || date "+%H:%M:%S")
{
    echo "── ${TS_HUMAN} ${TOOL_NAME} (${RESULT_TYPE}) ──"
    echo "args: ${TOOL_ARGS}"
    echo "${RESULT_TEXT}"
    echo ""
} >> "$LOG_DIR/tool-output.log"

# Truncate via bash substring (no jq fork needed).
AUDIT_TEXT="$RESULT_TEXT"
if [ ${#AUDIT_TEXT} -gt 2000 ]; then
    AUDIT_TEXT="${AUDIT_TEXT:0:2000}...[truncated]"
fi

jq -n -c \
  --arg event "post_tool" \
  --arg ts "$TIMESTAMP" \
  --arg session "$SESSION_ID" \
  --arg tool "$TOOL_NAME" \
  --arg args "$TOOL_ARGS" \
  --arg resultType "$RESULT_TYPE" \
  --arg resultText "$AUDIT_TEXT" \
  '{event: $event, timestamp: ($ts | tonumber), session: $session, tool: $tool, args: $args, resultType: $resultType, resultText: $resultText}' \
  >> "$LOG_DIR/audit.jsonl"

# Log failures to the human-readable log
if [ "$RESULT_TYPE" = "failure" ]; then
    echo "[RALPH] TOOL FAILURE: $TOOL_NAME — $RESULT_TEXT" >> "$LOG_DIR/ralph.log"
fi
