#!/bin/bash
# Ralph audit logger — Error Occurred
set -e
INPUT=$(cat)

LOG_DIR="/workspace/.ralph/logs"
SESSION_ID=$(cat "$LOG_DIR/.current-session-id" 2>/dev/null || echo "unknown")

# Single jq call: extract all fields at once.
read -r TIMESTAMP ERROR_NAME <<< "$(echo "$INPUT" | jq -r '[.timestamp, (.error.name // "UnknownError")] | @tsv')"
ERROR_MSG=$(echo "$INPUT" | jq -r '.error.message // ""')
ERROR_STACK=$(echo "$INPUT" | jq -r '.error.stack // ""')

jq -n -c \
  --arg event "error" \
  --arg ts "$TIMESTAMP" \
  --arg session "$SESSION_ID" \
  --arg errorName "$ERROR_NAME" \
  --arg errorMsg "$ERROR_MSG" \
  --arg errorStack "$ERROR_STACK" \
  '{event: $event, timestamp: ($ts | tonumber), session: $session, errorName: $errorName, errorMsg: $errorMsg, errorStack: $errorStack}' \
  >> "$LOG_DIR/audit.jsonl"

echo "[RALPH] ERROR [$ERROR_NAME]: $ERROR_MSG" >> "$LOG_DIR/ralph.log"
