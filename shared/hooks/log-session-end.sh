#!/bin/bash
# Ralph audit logger — Session End
set -e
INPUT=$(cat)

LOG_DIR="/workspace/.ralph/logs"
SESSION_ID=$(cat "$LOG_DIR/.current-session-id" 2>/dev/null || echo "unknown")

TIMESTAMP=$(echo "$INPUT" | jq -r '.timestamp')
REASON=$(echo "$INPUT" | jq -r '.reason // "unknown"')
CWD=$(echo "$INPUT" | jq -r '.cwd')

jq -n -c \
  --arg event "session_end" \
  --arg ts "$TIMESTAMP" \
  --arg session "$SESSION_ID" \
  --arg reason "$REASON" \
  --arg cwd "$CWD" \
  '{event: $event, timestamp: ($ts | tonumber), session: $session, reason: $reason, cwd: $cwd}' \
  >> "$LOG_DIR/audit.jsonl"

echo "[RALPH] Session $SESSION_ID ended (reason=$REASON)" >> "$LOG_DIR/ralph.log"
