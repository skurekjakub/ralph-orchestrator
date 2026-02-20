#!/bin/bash
# Ralph audit logger — Session End
set -e
INPUT=$(cat)

LOG_DIR="/workspace/.ralph/logs"
SESSION_ID=$(cat "$LOG_DIR/.current-session-id" 2>/dev/null || echo "unknown")

# Single jq call: extract all fields at once.
read -r TIMESTAMP REASON CWD <<< "$(echo "$INPUT" | jq -r '[.timestamp, (.reason // "unknown"), .cwd] | @tsv')"

jq -n -c \
  --arg event "session_end" \
  --arg ts "$TIMESTAMP" \
  --arg session "$SESSION_ID" \
  --arg reason "$REASON" \
  --arg cwd "$CWD" \
  '{event: $event, timestamp: ($ts | tonumber), session: $session, reason: $reason, cwd: $cwd}' \
  >> "$LOG_DIR/audit.jsonl"

echo "[RALPH] Session $SESSION_ID ended (reason=$REASON)" >> "$LOG_DIR/ralph.log"
